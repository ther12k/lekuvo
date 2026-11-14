//! Sidecar collectors for the AI-quota and Google Home / Home Assistant
//! panels — the same self-contained python scripts gnome-notch uses
//! (`python3 -I app/collectors/{ai,ghome}-collector.py`), reading
//! `~/.config/ai-usage-monitor` and `~/.config/google-home-panel`.
//!
//! The scripts are invoked on a worker thread; the main loop sends
//! commands and polls results over channels, so a slow collector never
//! blocks rendering. Missing scripts disable the worker permanently
//! (`has_collectors() == false`) instead of erroring on every poll.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};

/// One request to a collector script.
#[derive(Debug, Clone)]
pub enum CollectorCmd {
    /// AI quota status (`ai-collector.py`).
    Ai,
    /// Google Home status or device action (`ghome-collector.py`).
    /// `action`: None = status, "toggle"/"on"/"off" (with device id).
    Ghome { action: Option<String>, id: Option<String> },
}

/// One collector result.
#[derive(Debug, Clone)]
pub enum CollectorMsg {
    Ai(Result<serde_json::Value, String>),
    Ghome(Result<serde_json::Value, String>),
}

pub struct Collectors {
    pub cmd_tx: Sender<CollectorCmd>,
    pub msg_rx: Receiver<CollectorMsg>,
    /// False when neither script exists next to the app dir.
    pub available: bool,
}

/// Where the collector scripts live: `app/collectors/<script>`.
fn collector_path(app_dir: &Path, script: &str) -> PathBuf {
    app_dir.join("collectors").join(script)
}

/// Spawns the collector worker thread.
pub fn spawn(app_dir: &Path) -> Collectors {
    let ai = collector_path(app_dir, "ai-collector.py");
    let ghome = collector_path(app_dir, "ghome-collector.py");
    let available = ai.exists() && ghome.exists();
    let (cmd_tx, cmd_rx) = channel::<CollectorCmd>();
    let (msg_tx, msg_rx) = channel::<CollectorMsg>();
    if !available {
        return Collectors { cmd_tx, msg_rx, available: false };
    }
    let ai_path = ai.clone();
    let ghome_path = ghome.clone();
    std::thread::Builder::new()
        .name("lekuvo-collectors".into())
        .spawn(move || {
            while let Ok(cmd) = cmd_rx.recv() {
                let result = match cmd {
                    CollectorCmd::Ai => CollectorMsg::Ai(run_python(&ai_path, &[])),
                    CollectorCmd::Ghome { action, id } => {
                        let mut args: Vec<String> = Vec::new();
                        match action.as_deref() {
                            None => {}
                            Some("launch") => args.push("--launch".into()),
                            Some(a @ ("toggle" | "on" | "off")) => match id.as_deref() {
                                Some(device) => {
                                    args.push(format!("--{a}"));
                                    args.push(device.to_owned());
                                }
                                None => {
                                    let _ = msg_tx.send(CollectorMsg::Ghome(Err(format!(
                                        "{a} needs a device id"
                                    ))));
                                    continue;
                                }
                            },
                            Some(other) => {
                                let _ = msg_tx.send(CollectorMsg::Ghome(Err(format!(
                                    "unknown ghome action {other:?}"
                                ))));
                                continue;
                            }
                        }
                        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
                        CollectorMsg::Ghome(run_python(&ghome_path, &refs))
                    }
                };
                if msg_tx.send(result).is_err() {
                    break;
                }
            }
        })
        .expect("spawn collectors thread");
    Collectors { cmd_tx, msg_rx, available: true }
}

/// Runs one collector script with `python3 -I` and parses its JSON stdout.
fn run_python(script: &Path, args: &[&str]) -> Result<serde_json::Value, String> {
    let out = std::process::Command::new("python3")
        .arg("-I")
        .arg(script)
        .args(args)
        .output()
        .map_err(|e| format!("python3: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "{} failed: {}",
            script.file_name().unwrap_or_default().to_string_lossy(),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("collector json: {e}"))
}

/// Maps a used percentage to the reference quota color: mint below 80,
/// butter approaching the limit, pink in the exhaust band.
pub fn used_color(pct: f64) -> &'static str {
    if pct >= 95.0 {
        "#FF9EC4"
    } else if pct >= 80.0 {
        "#F8D77B"
    } else {
        "#86E3C3"
    }
}

/// Formats the collector's reset window: `resets in 2h 14m` / `resets in 9m`.
pub fn reset_in(ms: f64) -> Option<String> {
    if ms <= 0.0 {
        return None;
    }
    let hours = (ms / 3_600_000.0).floor() as i64;
    let minutes = ((ms % 3_600_000.0) / 60_000.0).floor() as i64;
    Some(if hours > 0 {
        format!("resets in {hours}h {minutes}m")
    } else {
        format!("resets in {minutes}m")
    })
}

/// One AI quota row for the document (panel accounts, or the glm
/// fallback chain — mirrors develop's `panelAccounts`).
#[derive(Debug, Clone)]
pub struct AiAccount {
    pub name: String,
    pub short: String,
    pub used_pct: f64,
    pub reset: Option<String>,
}

/// Extracts the AI account rows from a collector payload.
pub fn ai_accounts(raw: &serde_json::Value) -> Vec<AiAccount> {
    let panel = raw
        .pointer("/summary/panel_accounts")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if !panel.is_empty() {
        return panel
            .iter()
            .map(|a| {
                let name = a
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("account")
                    .to_owned();
                let short = a
                    .get("short")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned)
                    .unwrap_or_else(|| short_of(&name));
                AiAccount {
                    name,
                    short,
                    used_pct: a.get("used_pct").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    reset: a.get("reset_ms").and_then(|v| v.as_f64()).and_then(reset_in),
                }
            })
            .collect();
    }
    raw.pointer("/glm/accounts")
        .and_then(|v| v.as_array())
        .map(|accounts| {
            accounts
                .iter()
                .filter(|a| {
                    a.get("status").and_then(|v| v.as_str()) == Some("ok")
                        && a.pointer("/token_quota/used_pct").and_then(|v| v.as_f64()).is_some()
                })
                .map(|a| {
                    let name = a
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("glm")
                        .to_owned();
                    let short = a
                        .get("short")
                        .and_then(|v| v.as_str())
                        .map(str::to_owned)
                        .unwrap_or_else(|| short_of(&name));
                    AiAccount {
                        name,
                        short,
                        used_pct: a
                            .pointer("/token_quota/used_pct")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0),
                        reset: a
                            .pointer("/token_quota/reset_ms")
                            .and_then(|v| v.as_f64())
                            .and_then(reset_in),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The AI panel's summary line.
pub fn ai_summary(raw: &serde_json::Value) -> String {
    raw.pointer("/summary/text")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_owned()
}

/// One Google Home device row for the document.
#[derive(Debug, Clone)]
pub struct GhomeDevice {
    pub id: String,
    pub name: String,
    pub room: String,
    pub kind: String,
    /// `true` when state == "on".
    pub on: bool,
    /// `true` when state == "offline" (rows render dimmed, no toggling).
    pub offline: bool,
}

/// The ghome status payload flattened into display rows, grouped by room
/// in the collector's room order.
pub struct GhomeStatus {
    pub live: bool,
    pub active: u32,
    pub total: u32,
    pub devices: Vec<GhomeDevice>,
}

/// Flattens `{ rooms: { room: [device] }, summary, live }` into rows.
pub fn ghome_status(raw: &serde_json::Value) -> GhomeStatus {
    let live = raw.get("live").and_then(|v| v.as_bool()).unwrap_or(false);
    let summary = raw.get("summary");
    let active = summary
        .and_then(|s| s.get("active_count"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let total = summary
        .and_then(|s| s.get("total_count"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let mut devices = Vec::new();
    let rooms = raw
        .get("rooms")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    for (room, list) in rooms {
        for device in list.as_array().cloned().unwrap_or_default() {
            let state = device
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("off")
                .to_owned();
            devices.push(GhomeDevice {
                id: device
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_owned(),
                name: device
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("device")
                    .to_owned(),
                room: room.clone(),
                kind: device
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("switch")
                    .to_owned(),
                on: state == "on",
                offline: state == "offline",
            });
        }
    }
    GhomeStatus { live, active, total, devices }
}

/// A stable two-letter badge for an account row.
fn short_of(name: &str) -> String {
    let chars: Vec<char> = name.chars().filter(|c| c.is_alphanumeric()).collect();
    if chars.len() >= 2 {
        chars[..2].iter().collect::<String>().to_uppercase()
    } else {
        name.chars().take(2).collect::<String>().to_uppercase()
    }
}
