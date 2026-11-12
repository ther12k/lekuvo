//! lekuvo-media — MPRIS2 media monitoring and control.
//!
//! A worker thread owns a blocking session-bus connection and polls
//! `org.mpris.MediaPlayer2.*` players every two seconds. Commands sent from
//! the application wake the worker immediately through a timed wait, so
//! clicks on transport controls execute with sub-millisecond latency.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Duration;

use zbus::blocking::Connection;
use zbus::zvariant::Value;

/// One observed player state. `None`-valued snapshots never leave this
/// crate: the channel carries `Option` where `None` means "no player".
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MediaSnapshot {
    /// Whether `PlaybackStatus` is `Playing`.
    pub playing: bool,
    /// `xesam:title`, or a placeholder when metadata is empty.
    pub title: String,
    /// `xesam:artist`, joined with " / " when multiple artists exist.
    pub artist: String,
}

/// Transport commands the app sends to the active player.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaCommand {
    /// Toggle play/pause.
    PlayPause,
    /// Next track.
    Next,
    /// Previous track.
    Previous,
}

/// Handles to the media worker.
pub struct MediaHandle {
    /// Snapshots on change (never duplicates).
    pub updates: Receiver<Option<MediaSnapshot>>,
    /// Transport commands; dropped commands (no player) are ignored.
    pub commands: Sender<MediaCommand>,
}

/// Spawns the MPRIS worker thread.
pub fn spawn() -> MediaHandle {
    let (update_tx, update_rx) = channel();
    let (command_tx, command_rx) = channel();
    std::thread::Builder::new()
        .name("lekuvo-media".into())
        .spawn(move || worker(update_tx, command_rx))
        .expect("spawn media thread");
    MediaHandle {
        updates: update_rx,
        commands: command_tx,
    }
}

fn worker(updates: Sender<Option<MediaSnapshot>>, commands: Receiver<MediaCommand>) {
    let connection = match Connection::session() {
        Ok(connection) => connection,
        Err(error) => {
            eprintln!("lekuvo-media: session bus unavailable: {error}");
            let _ = updates.send(None);
            return;
        }
    };
    let mut last: Option<(String, MediaSnapshot)> = None;
    let mut current_player: Option<String> = None;
    let poll_interval = Duration::from_secs(2);
    let mut next_poll = std::time::Instant::now();

    loop {
        let now = std::time::Instant::now();
        if now >= next_poll {
            match poll_players(&connection) {
                Some((name, snapshot)) => {
                    let changed = last
                        .as_ref()
                        .is_none_or(|(last_name, last)| last_name != &name || last != &snapshot);
                    current_player = Some(name.clone());
                    if changed {
                        let _ = updates.send(Some(snapshot.clone()));
                        last = Some((name, snapshot));
                    }
                }
                None => {
                    current_player = None;
                    if last.is_some() {
                        let _ = updates.send(None);
                        last = None;
                    }
                }
            }
            next_poll = now + poll_interval;
        }

        let timeout = next_poll.saturating_duration_since(std::time::Instant::now());
        match commands.recv_timeout(timeout) {
            Ok(command) => {
                if let Some(name) = &current_player {
                    apply_command(&connection, name, command);
                    // Schedule poll soon to reflect playback status changes promptly
                    next_poll = std::time::Instant::now() + Duration::from_millis(150);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // Loop continues to poll
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                break;
            }
        }
    }
}

/// Finds the most interesting MPRIS player: a playing one wins, else
/// the first by name.
fn poll_players(connection: &Connection) -> Option<(String, MediaSnapshot)> {
    let names = list_mpris_names(connection)?;
    let mut best: Option<(String, MediaSnapshot)> = None;
    for name in names {
        let Some(snapshot) = snapshot_of(connection, &name) else {
            continue;
        };
        match &best {
            None => best = Some((name, snapshot)),
            Some((_, existing)) => {
                if snapshot.playing && !existing.playing {
                    best = Some((name, snapshot));
                }
            }
        }
    }
    best
}

fn list_mpris_names(connection: &Connection) -> Option<Vec<String>> {
    let dbus = zbus::blocking::fdo::DBusProxy::new(connection).ok()?;
    let names = dbus.list_names().ok()?;
    Some(
        names
            .iter()
            .map(|name| name.to_string())
            .filter(|name| {
                name.starts_with("org.mpris.MediaPlayer2.")
                    && !name.contains("lekuvo")
                    && !name.contains("layzee")
            })
            .collect(),
    )
}

/// Unwraps any nested `Value::Value(inner)` layers resulting from D-Bus variant packaging.
pub fn unwrap_value<'a>(mut val: &'a Value<'a>) -> &'a Value<'a> {
    while let Value::Value(inner) = val {
        val = inner;
    }
    val
}

/// Extracts a string reference, unwrapping any variant layers.
pub fn extract_str<'a>(val: &'a Value<'a>) -> Option<&'a str> {
    match unwrap_value(val) {
        Value::Str(s) => Some(s.as_str()),
        _ => None,
    }
}

/// Extracts a list of strings from either an array of variants/strings or a single string.
pub fn extract_str_list<'a>(val: &'a Value<'a>) -> Vec<String> {
    match unwrap_value(val) {
        Value::Array(arr) => arr
            .iter()
            .filter_map(|item| extract_str(item).map(str::to_owned))
            .collect(),
        Value::Str(s) => vec![s.to_string()],
        _ => Vec::new(),
    }
}

/// Parses title and artist from an MPRIS metadata dictionary, safely unwrapping variant layers.
pub fn parse_metadata_dict(dict: &zbus::zvariant::Dict) -> (String, String) {
    let mut title = String::new();
    let mut artist = String::new();
    for (k, v) in dict.iter() {
        if let Some(key_str) = extract_str(k) {
            match key_str {
                "xesam:title" => {
                    if let Some(t) = extract_str(v) {
                        title = t.to_string();
                    }
                }
                "xesam:artist" => {
                    let artists = extract_str_list(v);
                    if !artists.is_empty() {
                        artist = artists.join(" / ");
                    }
                }
                _ => {}
            }
        }
    }
    (title, artist)
}

fn snapshot_of(connection: &Connection, name: &str) -> Option<MediaSnapshot> {
    let properties = zbus::blocking::fdo::PropertiesProxy::new(
        connection,
        name,
        "/org/mpris/MediaPlayer2",
    )
    .ok()?;
    let interface = zbus::names::InterfaceName::from_static_str("org.mpris.MediaPlayer2.Player")
        .expect("valid interface name");
    let Ok(all) = properties.get_all(interface) else {
        return None;
    };
    let playing = all
        .get("PlaybackStatus")
        .and_then(|value| extract_str(&**value))
        .is_some_and(|status| status == "Playing");
    let mut title = String::new();
    let mut artist = String::new();
    if let Some(metadata) = all.get("Metadata") {
        if let Value::Dict(dict) = unwrap_value(&**metadata) {
            let (t, a) = parse_metadata_dict(dict);
            title = t;
            artist = a;
        }
    }
    if title.is_empty() {
        return Some(MediaSnapshot {
            playing,
            title: if playing { "Playing" } else { "Paused" }.to_owned(),
            artist: String::new(),
        });
    }
    Some(MediaSnapshot {
        playing,
        title,
        artist,
    })
}

fn apply_command(connection: &Connection, name: &str, command: MediaCommand) {
    let Ok(player) = zbus::blocking::Proxy::new(
        connection,
        name,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    ) else {
        return;
    };
    let method = match command {
        MediaCommand::PlayPause => "PlayPause",
        MediaCommand::Next => "Next",
        MediaCommand::Previous => "Previous",
    };
    if let Err(error) = player.call::<_, _, ()>(method, &()) {
        eprintln!("lekuvo-media: {method} on {name} failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zbus::zvariant::{Array, Dict, Signature};

    fn make_dict() -> Dict<'static, 'static> {
        static SIG_S: std::sync::LazyLock<Signature> = std::sync::LazyLock::new(|| Signature::try_from("s").unwrap());
        static SIG_V: std::sync::LazyLock<Signature> = std::sync::LazyLock::new(|| Signature::try_from("v").unwrap());
        Dict::new(&SIG_S, &SIG_V)
    }

    #[test]
    fn parses_title_and_single_artist_in_variant() {
        let mut dict = make_dict();
        dict.append(
            Value::Str("xesam:title".into()),
            Value::Value(Box::new(Value::Str("Blue Sky".into()))),
        )
        .unwrap();
        dict.append(
            Value::Str("xesam:artist".into()),
            Value::Value(Box::new(Value::Array(
                Array::from(vec![Value::Value(Box::new(Value::Str("Lekuvo Band".into())))]),
            ))),
        )
        .unwrap();

        let (title, artist) = parse_metadata_dict(&dict);
        assert_eq!(title, "Blue Sky");
        assert_eq!(artist, "Lekuvo Band");
    }

    #[test]
    fn parses_multiple_artists_joined() {
        let mut dict = make_dict();
        dict.append(
            Value::Str("xesam:title".into()),
            Value::Value(Box::new(Value::Str("Collaboration".into()))),
        )
        .unwrap();
        dict.append(
            Value::Str("xesam:artist".into()),
            Value::Value(Box::new(Value::Array(
                Array::from(vec![
                    Value::Value(Box::new(Value::Str("Artist A".into()))),
                    Value::Value(Box::new(Value::Str("Artist B".into()))),
                ]),
            ))),
        )
        .unwrap();

        let (title, artist) = parse_metadata_dict(&dict);
        assert_eq!(title, "Collaboration");
        assert_eq!(artist, "Artist A / Artist B");
    }

    #[test]
    fn handles_missing_title_or_artist() {
        let dict = make_dict();
        let (title, artist) = parse_metadata_dict(&dict);
        assert_eq!(title, "");
        assert_eq!(artist, "");
    }

    #[test]
    fn handles_wire_format_serialized_deserialized_roundtrip() {
        let mut dict = make_dict();
        dict.append(
            Value::Str("xesam:title".into()),
            Value::Value(Box::new(Value::Str("Wire Track".into()))),
        )
        .unwrap();
        dict.append(
            Value::Str("xesam:artist".into()),
            Value::Value(Box::new(Value::Array(
                Array::from(vec![Value::Str("Wire Artist".into())]),
            ))),
        )
        .unwrap();

        let val = Value::Dict(dict);
        let ctxt = zbus::zvariant::serialized::Context::new_dbus(
            zbus::zvariant::Endian::Little,
            0,
        );
        let encoded = zbus::zvariant::to_bytes(ctxt, &val).expect("serialization");
        let (decoded, _): (Value, _) = encoded.deserialize().expect("deserialization");

        let (title, artist) = if let Value::Dict(dict) = unwrap_value(&decoded) {
            parse_metadata_dict(dict)
        } else {
            panic!("expected Dict");
        };
        assert_eq!(title, "Wire Track");
        assert_eq!(artist, "Wire Artist");
    }
}
