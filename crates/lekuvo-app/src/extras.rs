//! Album-art + synced-lyrics fetchers.
//!
//! Both run on throwaway threads and talk to the main loop over channels:
//! art bytes arrive as raw PNG/JPEG payloads; lyrics arrive parsed into
//! `(time_us, text)` lines. Network access goes through `curl` (present
//! on every supported system) so the app keeps zero new dependencies.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};

/// One synced-lyrics line: display time + text.
pub type LyricLine = (i64, String);

/// What a lyrics fetch resolves to.
#[derive(Debug, Clone, Default)]
pub struct Lyrics {
    /// Synced lines sorted by time (empty when none found).
    pub lines: Vec<LyricLine>,
}

/// Spawns the art fetch loop. `requests` carries `(track key, url)`; a
/// `url` of `""` clears the slot. Results carry the same key so stale
/// responses for an older track are dropped by the caller.
pub fn spawn_art() -> (Sender<(String, String)>, Receiver<(String, Vec<u8>)>) {
    let (tx, rx) = channel::<(String, String)>();
    let (out_tx, out_rx) = channel::<(String, Vec<u8>)>();
    std::thread::Builder::new()
        .name("lekuvo-art".into())
        .spawn(move || {
            let mut last_url: HashMap<String, String> = HashMap::new();
            for (key, url) in rx {
                let previous = last_url.get(&key);
                if url.is_empty() {
                    let _ = out_tx.send((key.clone(), Vec::new()));
                    last_url.remove(&key);
                    continue;
                }
                if previous == Some(&url) {
                    continue; // same cover, nothing to do
                }
                match fetch_bytes(&url) {
                    Some(bytes) if !bytes.is_empty() => {
                        last_url.insert(key.clone(), url.clone());
                        let _ = out_tx.send((key, bytes));
                    }
                    _ => {
                        last_url.insert(key.clone(), url.clone());
                        let _ = out_tx.send((key, Vec::new()));
                    }
                }
            }
        })
        .expect("spawn art thread");
    (tx, out_rx)
}

/// Spawns the lyrics fetch loop keyed by track.
pub fn spawn_lyrics() -> (Sender<(String, String, String)>, Receiver<(String, Lyrics)>) {
    let (tx, rx) = channel::<(String, String, String)>();
    let (out_tx, out_rx) = channel::<(String, Lyrics)>();
    let cache: Arc<Mutex<HashMap<String, Lyrics>>> = Arc::new(Mutex::new(HashMap::new()));
    std::thread::Builder::new()
        .name("lekuvo-lyrics".into())
        .spawn(move || {
            for (key, title, artist) in rx {
                if let Ok(cached) = cache.lock() {
                    if let Some(lyrics) = cached.get(&key) {
                        let _ = out_tx.send((key, lyrics.clone()));
                        continue;
                    }
                }
                let lyrics = fetch_lyrics(&title, &artist);
                if let Ok(mut cache) = cache.lock() {
                    cache.insert(key.clone(), lyrics.clone());
                }
                let _ = out_tx.send((key, lyrics));
            }
        })
        .expect("spawn lyrics thread");
    (tx, out_rx)
}

/// Fetches bytes for `url`: `file://` reads directly; http(s) goes
/// through curl (10s timeout, follows redirects).
fn fetch_bytes(url: &str) -> Option<Vec<u8>> {
    if let Some(path) = url.strip_prefix("file://") {
        return std::fs::read(path).ok();
    }
    let output = std::process::Command::new("curl")
        .args(["-sL", "--max-time", "10", "-A", UA, url])
        .output()
        .ok()?;
    let bytes = output.stdout;
    if bytes.is_empty() {
        None
    } else {
        Some(bytes)
    }
}

const UA: &str = "Lekuvo/0.1 (+https://github.com/ther12k/lekuvo)";

/// Fetches synced lyrics from LRCLIB for `title` / `artist`.
fn fetch_lyrics(title: &str, artist: &str) -> Lyrics {
    if title.is_empty() {
        return Lyrics::default();
    }
    let query = format!(
        "https://lrclib.net/api/search?track_name={}&artist_name={}",
        url_encode(title),
        url_encode(artist)
    );
    let Ok(output) = std::process::Command::new("curl")
        .args(["-sL", "--max-time", "10", "-A", UA, &query])
        .output()
    else {
        return Lyrics::default();
    };
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return Lyrics::default();
    };
    let Some(results) = json.as_array() else {
        return Lyrics::default();
    };
    // First result with non-empty synced lyrics wins.
    for result in results {
        let Some(synced) = result.get("syncedLyrics").and_then(|v| v.as_str()) else {
            continue;
        };
        if synced.trim().is_empty() {
            continue;
        }
        let lines = parse_lrc(synced);
        if !lines.is_empty() {
            return Lyrics { lines };
        }
    }
    Lyrics::default()
}

/// Parses an LRC payload: `[mm:ss.xx] text` (also `[mm:ss.xxx]` and
/// multi-tag lines take their first timestamp).
fn parse_lrc(payload: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw in payload.lines() {
        let Some(close) = raw.find(']') else {
            continue;
        };
        let stamp = &raw[1..close];
        let text = raw[close + 1..].trim();
        if text.is_empty() {
            continue;
        }
        let Some((mins, rest)) = stamp.split_once(':') else {
            continue;
        };
        let Ok(mins) = mins.trim().parse::<i64>() else {
            continue;
        };
        let (secs, frac) = match rest.split_once('.') {
            Some((s, f)) => {
                let fraction = format!("{f:0<2}");
                (
                    s.parse::<i64>().unwrap_or(0),
                    fraction.parse::<i64>().unwrap_or(0) * 10_000,
                )
            }
            None => (rest.parse::<i64>().unwrap_or(0), 0),
        };
        let time_us = (mins * 60 + secs) * 1_000_000 + frac;
        lines.push((time_us, text.to_owned()));
    }
    lines.sort_by_key(|(time, _)| *time);
    lines
}

/// Minimal percent-encoding for query values.
fn url_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => encoded.push('+'),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}
