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
#[derive(Debug, Clone, PartialEq, Default)]
pub struct MediaSnapshot {
    /// Whether `PlaybackStatus` is `Playing`.
    pub playing: bool,
    /// `xesam:title`, or a placeholder when metadata is empty.
    pub title: String,
    /// `xesam:artist`, joined with " / " when multiple artists exist.
    pub artist: String,
    /// `Position` in microseconds at snapshot time.
    pub pos_us: i64,
    /// Track `Length` in microseconds (0 = unknown; no progress shown).
    pub dur_us: i64,
    /// `Rate` (playback speed; 1.0 = normal).
    pub rate: f64,
    /// `mpris:artUrl` (file:// or https://), empty when absent.
    pub art_url: String,
}

/// Transport commands the app sends to the active player.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MediaCommand {
    /// Toggle play/pause.
    PlayPause,
    /// Next track.
    Next,
    /// Previous track.
    Previous,
    /// Seek to `fraction` (0.0..1.0) of the current track's duration.
    Seek(f64),
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

/// Identity for change detection: everything EXCEPT the advancing
/// position (position updates resend on the poll cadence while playing).
fn identity(snapshot: &MediaSnapshot) -> (bool, String, String, i64, f64, String) {
    (
        snapshot.playing,
        snapshot.title.clone(),
        snapshot.artist.clone(),
        snapshot.dur_us,
        snapshot.rate,
        snapshot.art_url.clone(),
    )
}

fn worker(updates: Sender<Option<MediaSnapshot>>, commands: Receiver<MediaCommand>) {
    // Synthetic mode for demos and headless verification: no DBus, a
    // track whose position advances once per second.
    if std::env::var_os("LEKUVO_FAKE_MEDIA").is_some() {
        fake_worker(updates);
        return;
    }
    let connection = match Connection::session() {
        Ok(connection) => connection,
        Err(error) => {
            eprintln!("lekuvo-media: session bus unavailable: {error}");
            let _ = updates.send(None);
            return;
        }
    };
    // (player name, snapshot identity) of the last announced track.
    type LastSeen = (String, (bool, String, String, i64, f64, String));
    let mut last: Option<LastSeen> = None;
    let mut current_player: Option<String> = None;
    let poll_interval = Duration::from_secs(2);
    let mut next_poll = std::time::Instant::now();

    loop {
        let now = std::time::Instant::now();
        if now >= next_poll {
            match poll_players(&connection) {
                Some((name, snapshot)) => {
                    let id = identity(&snapshot);
                    let changed = last
                        .as_ref()
                        .is_none_or(|(last_name, last_id)| last_name != &name || last_id != &id);
                    // While playing, resend on every poll so the app can
                    // re-stamp the interpolation base (drift correction).
                    let resend = changed || snapshot.playing;
                    current_player = Some(name.clone());
                    if resend {
                        let _ = updates.send(Some(snapshot.clone()));
                        last = Some((name, id));
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

/// Demo/verification worker: an eternal "playing" track whose position
/// advances once per second (no DBus involved).
fn fake_worker(updates: Sender<Option<MediaSnapshot>>) {
    let dur_us: i64 = 4 * 60 * 1_000_000;
    let mut pos_us: i64 = 41_000_000;
    loop {
        let snapshot = MediaSnapshot {
            playing: true,
            title: "Midnight City".to_owned(),
            artist: "M83".to_owned(),
            pos_us,
            dur_us,
            rate: 1.0,
            art_url: String::new(),
        };
        let _ = updates.send(Some(snapshot));
        std::thread::sleep(Duration::from_secs(1));
        pos_us = (pos_us + 1_000_000).min(dur_us);
        if pos_us >= dur_us {
            pos_us = 0;
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
        .and_then(|value| extract_str(value))
        .is_some_and(|status| status == "Playing");
    let mut title = String::new();
    let mut artist = String::new();
    let mut dur_us: i64 = 0;
    let mut art_url = String::new();
    if let Some(metadata) = all.get("Metadata")
        && let Value::Dict(dict) = unwrap_value(metadata)
    {
        let (t, a) = parse_metadata_dict(dict);
        title = t;
        artist = a;
        for (k, v) in dict.iter() {
            match extract_str(k) {
                Some("mpris:length") => {
                    if let Value::I64(len) = unwrap_value(v) {
                        dur_us = *len;
                    }
                }
                Some("mpris:artUrl") => {
                    if let Some(url) = extract_str(v) {
                        art_url = url.to_owned();
                    }
                }
                _ => {}
            }
        }
    }
    let pos_us = all
        .get("Position")
        .and_then(|value| match unwrap_value(value) {
            Value::I64(pos) => Some(*pos),
            _ => None,
        })
        .unwrap_or(0);
    let rate = all
        .get("Rate")
        .and_then(|value| match unwrap_value(value) {
            Value::F64(rate) => Some(*rate),
            Value::I64(rate) => Some(*rate as f64),
            _ => None,
        })
        .filter(|rate| *rate > 0.0)
        .unwrap_or(1.0);
    if title.is_empty() {
        return Some(MediaSnapshot {
            playing,
            title: if playing { "Playing" } else { "Paused" }.to_owned(),
            artist: String::new(),
            pos_us,
            dur_us,
            rate,
            art_url,
        });
    }
    Some(MediaSnapshot {
        playing,
        title,
        artist,
        pos_us,
        dur_us,
        rate,
        art_url,
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
    match command {
        MediaCommand::PlayPause => {
            if let Err(error) = player.call::<_, _, ()>("PlayPause", &()) {
                eprintln!("lekuvo-media: PlayPause on {name} failed: {error}");
            }
        }
        MediaCommand::Next => {
            if let Err(error) = player.call::<_, _, ()>("Next", &()) {
                eprintln!("lekuvo-media: Next on {name} failed: {error}");
            }
        }
        MediaCommand::Previous => {
            if let Err(error) = player.call::<_, _, ()>("Previous", &()) {
                eprintln!("lekuvo-media: Previous on {name} failed: {error}");
            }
        }
        MediaCommand::Seek(fraction) => {
            // SetPosition(trackid, position_us) — args as a tuple.
            let position = (fraction.clamp(0.0, 1.0) * current_duration(connection, name) as f64) as i64;
            let trackid = current_trackid(connection, name);
            if let Err(error) = player.call::<_, _, ()>("SetPosition", &(&trackid, &position)) {
                eprintln!("lekuvo-media: SetPosition on {name} failed: {error}");
            }
        }
    }
}

use zbus::zvariant::ObjectPath;

/// The current track duration in microseconds (0 when unknown).
fn current_duration(connection: &Connection, name: &str) -> i64 {
    snapshot_of(connection, name).map(|s| s.dur_us).unwrap_or(0)
}

/// The current track id (`mpris:trackid`), defaulting to `/org/mpris/MediaPlayer2/TrackList/NoTrack`.
fn current_trackid(connection: &Connection, name: &str) -> zbus::zvariant::ObjectPath<'static> {
    let fallback =
        ObjectPath::try_from("/org/mpris/MediaPlayer2/TrackList/NoTrack").expect("valid path");
    let properties = match zbus::blocking::fdo::PropertiesProxy::new(
        connection,
        name,
        "/org/mpris/MediaPlayer2",
    ) {
        Ok(properties) => properties,
        Err(_) => return fallback,
    };
    let interface =
        zbus::names::InterfaceName::from_static_str("org.mpris.MediaPlayer2.Player")
            .expect("valid interface");
    let Ok(all) = properties.get_all(interface) else {
        return fallback;
    };
    let Some(metadata) = all.get("Metadata") else {
        return fallback;
    };
    let Value::Dict(dict) = unwrap_value(metadata) else {
        return fallback;
    };
    for (k, v) in dict.iter() {
        if extract_str(k) == Some("mpris:trackid")
            && let Some(path) = extract_str(v)
            && let Ok(path) = ObjectPath::try_from(path.to_owned())
        {
            return path;
        }
    }
    fallback
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
