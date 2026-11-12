//! lekuvo-media — MPRIS2 media monitoring and control.
//!
//! A worker thread owns a blocking session-bus connection and polls the
//! `org.mpris.MediaPlayer2.*` players every two seconds (the same
//! cadence the Layzee port used). Snapshots flow to the app through a
//! channel; transport commands flow back the other way. The poll model
//! is deliberately boring: no signal subscriptions to race, one
//! deterministic source of truth.

use std::sync::mpsc::{Receiver, Sender, channel};
use std::time::Duration;

use zbus::blocking::Connection;


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
    loop {
        // Drain commands non-blocking; apply to the freshest player.
        while let Ok(command) = commands.try_recv() {
            if let Some(name) = current_player.clone() {
                apply_command(&connection, &name, command);
            }
        }

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
        std::thread::sleep(Duration::from_secs(2));
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
        .and_then(|value| String::try_from(&**value).ok())
        .is_some_and(|status| status == "Playing");
    let mut title = String::new();
    let mut artist = String::new();
    use zbus::zvariant::Value;
    if let Some(metadata) = all.get("Metadata")
        && let Value::Dict(dict) = &**metadata
    {
        for (key, value) in dict.iter() {
            match (key, value) {
                (Value::Str(name), Value::Str(text)) if name == "xesam:title" => {
                    title = text.to_string();
                }
                (Value::Str(name), Value::Array(artists)) if name == "xesam:artist" => {
                    let names: Vec<String> = artists
                        .iter()
                        .filter_map(|item| {
                            if let Value::Str(artist) = item {
                                Some(artist.to_string())
                            } else {
                                None
                            }
                        })
                        .collect();
                    if !names.is_empty() {
                        artist = names.join(" / ");
                    }
                }
                _ => {}
            }
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
