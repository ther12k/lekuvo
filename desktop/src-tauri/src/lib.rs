use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

/// The notch's interactive bounds in window coordinates (logical px),
/// reported by the frontend whenever the pill/toast/surface morphs.
#[derive(Clone, Copy, Debug, Default)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
struct OverlayState(Mutex<HitRect>);

#[tauri::command]
fn set_hit_rect(x: f64, y: f64, w: f64, h: f64, state: State<OverlayState>) {
    *state.0.lock().unwrap() = HitRect { x, y, w, h };
}

/* ───────────────────────── placement ───────────────────────── */

/// Usable screen area (excludes the GNOME shell bar) in physical px.
#[derive(Clone, Copy, Debug)]
struct Workarea {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

fn read_workarea() -> Option<Workarea> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    let (conn, screen_num) = x11rb::rust_connection::RustConnection::connect(None).ok()?;
    let screen = &conn.setup().roots[screen_num];
    let root = screen.root;
    let atom = |name: &str| -> Option<u32> {
        Some(
            conn.intern_atom(false, name.as_bytes())
                .ok()?
                .reply()
                .ok()?
                .atom,
        )
    };
    let idx = conn
        .get_property(false, root, atom("_NET_CURRENT_DESKTOP")?, AtomEnum::CARDINAL, 0, 1)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .collect::<Vec<u32>>()[0] as usize;
    let values = conn
        .get_property(false, root, atom("_NET_WORKAREA")?, AtomEnum::CARDINAL, 0, 64)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .collect::<Vec<u32>>();
    let i = idx * 4;
    if values.len() < i + 4 {
        return None;
    }
    Some(Workarea {
        x: values[i] as i32,
        y: values[i + 1] as i32,
        w: values[i + 2] as i32,
        h: values[i + 3] as i32,
    })
}

/// Which of the 8 snap zones the window (by center) is closest to.
fn zone_for(x: i32, y: i32, w: i32, h: i32, wa: Workarea) -> &'static str {
    let fx = (x as f64 + w as f64 / 2.0 - wa.x as f64) / wa.w as f64;
    let fy = (y as f64 + h as f64 / 2.0 - wa.y as f64) / wa.h as f64;
    let col = if fx < 0.33 { 0 } else if fx > 0.67 { 2 } else { 1 };
    let row = if fy < 0.33 { 0 } else if fy > 0.67 { 2 } else { 1 };
    match (row, col) {
        (0, 0) => "tl",
        (0, 1) | (1, 1) => "t",
        (0, 2) => "tr",
        (1, 0) => "l",
        (1, 2) => "r",
        (2, 0) => "bl",
        (2, 1) => "b",
        (2, 2) => "br",
        _ => "t",
    }
}

/// Aligns the window to a zone, clamped inside the workarea so the notch
/// never sits on top of the system bar or off-screen.
fn place_zone(window: &tauri::WebviewWindow, zone: &str, wa: Workarea) {
    let Ok(ws) = window.outer_size() else { return };
    let (w, h) = (ws.width as i32, ws.height as i32);
    let x = if zone.ends_with('l') {
        wa.x
    } else if zone.ends_with('r') {
        wa.x + wa.w - w
    } else {
        wa.x + (wa.w - w) / 2
    };
    let y = if zone.starts_with('b') {
        wa.y + wa.h - h
    } else if zone.starts_with('t') {
        wa.y
    } else {
        wa.y + (wa.h - h) / 2
    };
    let x = x.clamp(wa.x, (wa.x + wa.w - w).max(wa.x));
    let y = y.clamp(wa.y, (wa.y + wa.h - h).max(wa.y));
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

#[derive(Default)]
struct DragWatch(Mutex<Option<std::time::Instant>>);

fn zone_file() -> std::path::PathBuf {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("HOME").unwrap_or_default();
            std::path::PathBuf::from(home).join(".config")
        });
    base.join("lekuvo-desktop").join("zone")
}

fn save_zone(zone: &str) {
    if let Some(dir) = zone_file().parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(zone_file(), zone);
}

fn load_zone() -> Option<&'static str> {
    let z = std::fs::read_to_string(zone_file()).ok()?;
    match z.trim() {
        "tl" => Some("tl"),
        "t" => Some("t"),
        "tr" => Some("tr"),
        "l" => Some("l"),
        "r" => Some("r"),
        "bl" => Some("bl"),
        "b" => Some("b"),
        "br" => Some("br"),
        _ => None,
    }
}

/// After a drag ends (window stops moving for ~280ms), snap to the nearest
/// zone and tell the frontend which zone it now lives in.
fn spawn_snap_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(80));
        let due = {
            let st = app.state::<DragWatch>();
            let mut watch = st.0.lock().unwrap();
            match *watch {
                Some(at) if at.elapsed() >= Duration::from_millis(280) => {
                    *watch = None;
                    true
                }
                _ => false,
            }
        };
        if !due {
            continue;
        }
        let Some(win) = app.get_webview_window("main") else { continue };
        let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { continue };
        let Some(wa) = read_workarea() else { continue };
        let zone = zone_for(pos.x, pos.y, size.width as i32, size.height as i32, wa);
        place_zone(&win, zone, wa);
        save_zone(zone);
        let _ = app.emit("zone-changed", zone);
    });
}

/// Click-through poller: the window ignores the pointer everywhere except
/// the notch bounds reported by the frontend, so the invisible parts of the
/// overlay let clicks reach the desktop behind them.
fn spawn_hit_tester(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_pass_through: Option<bool> = None;
        loop {
            std::thread::sleep(Duration::from_millis(40));
            let Some(win) = app.get_webview_window("main") else { continue };
            let Ok(cursor) = app.cursor_position() else { continue };
            let Ok(win_pos) = win.outer_position() else { continue };
            let rect = *app.state::<OverlayState>().0.lock().unwrap();
            let scale = win.scale_factor().unwrap_or(1.0);
            let x0 = win_pos.x as f64 + rect.x * scale;
            let y0 = win_pos.y as f64 + rect.y * scale;
            let x1 = x0 + rect.w * scale;
            let y1 = y0 + rect.h * scale;
            let inside =
                cursor.x >= x0 && cursor.x <= x1 && cursor.y >= y0 && cursor.y <= y1;
            let pass_through = !inside;
            if last_pass_through != Some(pass_through) {
                if win.set_ignore_cursor_events(pass_through).is_ok() {
                    last_pass_through = Some(pass_through);
                }
            }
        }
    });
}

/* ───────────────────────── MPRIS media ───────────────────────── */

/// JSON mirror of lekuvo_media::MediaSnapshot for the frontend.
#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct MediaJson {
    playing: bool,
    title: String,
    artist: String,
    position_sec: f64,
    length_sec: f64,
    art_url: String,
}

impl From<&lekuvo_media::MediaSnapshot> for MediaJson {
    fn from(s: &lekuvo_media::MediaSnapshot) -> Self {
        MediaJson {
            playing: s.playing,
            title: s.title.clone(),
            artist: s.artist.clone(),
            position_sec: s.pos_us as f64 / 1_000_000.0,
            length_sec: s.dur_us as f64 / 1_000_000.0,
            art_url: s.art_url.clone(),
        }
    }
}

struct MediaBridge {
    snapshot: Mutex<Option<MediaJson>>,
    commands: std::sync::mpsc::Sender<lekuvo_media::MediaCommand>,
}

/// Spawns the lekuvo-media worker and forwards its snapshots into managed
/// state + a `media-update` event the frontend listens to.
fn spawn_media(app: AppHandle) {
    let handle = lekuvo_media::spawn();
    let commands = handle.commands.clone();
    app.manage(MediaBridge {
        snapshot: Mutex::new(None),
        commands,
    });
    std::thread::spawn(move || {
        while let Ok(update) = handle.updates.recv() {
            let json = update.as_ref().map(MediaJson::from);
            if let Some(bridge) = app.try_state::<MediaBridge>() {
                *bridge.snapshot.lock().unwrap() = json.clone();
            }
            let _ = app.emit("media-update", json);
        }
    });
}

#[tauri::command]
fn media_state(state: State<'_, MediaBridge>) -> Option<MediaJson> {
    state.snapshot.lock().unwrap().clone()
}

#[tauri::command]
fn media_control(action: String, fraction: Option<f64>, state: State<'_, MediaBridge>) -> Result<(), String> {
    use lekuvo_media::MediaCommand;
    let cmd = match action.as_str() {
        "playpause" => MediaCommand::PlayPause,
        "next" => MediaCommand::Next,
        "prev" => MediaCommand::Previous,
        "seek" => MediaCommand::Seek(fraction.unwrap_or(0.0).clamp(0.0, 1.0)),
        other => return Err(format!("unknown action {other:?}")),
    };
    state.commands.send(cmd).map_err(|e| e.to_string())
}

/* ───────────────────────── PulseAudio mixer ───────────────────────── */

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SinkApp {
    index: u32,
    name: String,
    vol: u32,
    mute: bool,
}

#[tauri::command]
fn mixer_state() -> Result<Vec<SinkApp>, String> {
    // LC_ALL=C: with other locales pactl emits "0,00" decimals, which is
    // not valid JSON.
    let out = std::process::Command::new("pactl")
        .env("LC_ALL", "C")
        .args(["-f", "json", "list", "sink-inputs"])
        .output()
        .map_err(|e| format!("pactl: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("pactl json: {e}"))?;
    let Some(items) = json.as_array() else { return Ok(Vec::new()) };
    Ok(items
        .iter()
        .filter_map(|it| {
            let index = it.get("index")?.as_u64()? as u32;
            let mute = it.get("mute").and_then(|m| m.as_bool()).unwrap_or(false);
            // channel volumes are raw pulse units (65536 = 100%)
            let vol = it
                .get("volume")
                .and_then(|v| v.as_object())
                .map(|chs| {
                    let vals: Vec<f64> = chs
                        .values()
                        .filter_map(|c| c.get("value").and_then(|v| v.as_f64()))
                        .collect();
                    let n = vals.len().max(1) as f64;
                    (vals.iter().sum::<f64>() / n / 655.36).round().clamp(0.0, 100.0) as u32
                })
                .unwrap_or(0);
            let name = it
                .get("properties")
                .and_then(|p| p.get("application.name"))
                .and_then(|n| n.as_str())
                .unwrap_or("Audio")
                .to_string();
            Some(SinkApp { index, name, vol, mute })
        })
        .collect())
}

#[tauri::command]
fn mixer_set(index: u32, vol: Option<u32>, mute: Option<bool>) -> Result<(), String> {
    let run = |args: &[&str]| -> Result<(), String> {
        std::process::Command::new("pactl")
            .env("LC_ALL", "C")
            .args(args)
            .output()
            .map_err(|e| format!("pactl: {e}"))?;
        Ok(())
    };
    if let Some(v) = vol {
        run(&["set-sink-input-volume", &index.to_string(), &format!("{v}%")])?;
    }
    if let Some(m) = mute {
        run(&["set-sink-input-mute", &index.to_string(), if m { "1" } else { "0" }])?;
    }
    Ok(())
}

/* ───────────────────────── system status ───────────────────────── */

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SysStatus {
    vol: u32,
    mute: bool,
    wifi: bool,
    battery_pct: Option<u32>,
    charging: bool,
    dnd: bool,
    brightness: Option<u32>,
    dark: bool,
    clock24: bool,
}

fn run_cmd(cmd: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new(cmd)
        .env("LC_ALL", "C")
        .args(args)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[tauri::command]
fn sys_status() -> SysStatus {
    // default output sink volume + mute
    let vol = run_cmd("pactl", &["-f", "json", "get-sink-volume", "@DEFAULT_SINK@"])
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| {
            let vals: Vec<f64> = v
                .get("volume")?
                .as_object()?
                .values()
                .filter_map(|c| c.get("value").and_then(|x| x.as_f64()))
                .collect();
            let n = vals.len().max(1) as f64;
            Some((vals.iter().sum::<f64>() / n / 655.36).round().clamp(0.0, 100.0) as u32)
        })
        .unwrap_or(100);
    let mute = run_cmd("pactl", &["get-sink-mute", "@DEFAULT_SINK@"])
        .map(|s| s.contains("yes"))
        .unwrap_or(false);
    let wifi = run_cmd("nmcli", &["-t", "-f", "TYPE,STATE", "device"])
        .map(|s| s.lines().any(|l| l.starts_with("wifi:") && l.contains("connected")))
        .unwrap_or(false);
    let battery = std::fs::read_dir("/sys/class/power_supply")
        .ok()
        .and_then(|d| {
            d.filter_map(|e| e.ok())
                .map(|e| e.path())
                .find(|p| {
                    p.file_name()
                        .is_some_and(|n| n.to_string_lossy().starts_with("BAT"))
                })
        })
        .map(|b| {
            let pct = std::fs::read_to_string(b.join("capacity"))
                .ok()
                .and_then(|s| s.trim().parse::<u32>().ok());
            let charging = std::fs::read_to_string(b.join("status"))
                .map(|s| s.trim() == "Charging")
                .unwrap_or(false);
            (pct, charging)
        });
    let dnd = run_cmd(
        "gsettings",
        &["get", "org.gnome.desktop.notifications", "show-banners"],
    )
    .map(|s| s.trim() == "false")
    .unwrap_or(false);
    let brightness = run_cmd(
        "gdbus",
        &[
            "call", "--session", "--dest", "org.gnome.SettingsDaemon.Power",
            "--object-path", "/org/gnome/SettingsDaemon/Power",
            "--method", "org.freedesktop.DBus.Properties.Get",
            "org.gnome.SettingsDaemon.Power.Screen", "Brightness",
        ],
    )
    .and_then(|s| {
        s.split(|c: char| !c.is_ascii_digit())
            .find(|p| !p.is_empty())
            .and_then(|d| d.parse::<u32>().ok())
    });
    let dark = run_cmd(
        "gsettings",
        &["get", "org.gnome.desktop.interface", "color-scheme"],
    )
    .map(|s| s.contains("prefer-dark"))
    .unwrap_or(false);
    let clock24 = run_cmd(
        "gsettings",
        &["get", "org.gnome.desktop.interface", "clock-format"],
    )
    .map(|s| s.trim().contains("24h"))
    .unwrap_or(false);
    SysStatus {
        vol,
        mute,
        wifi,
        battery_pct: battery.map(|(p, _)| p).flatten(),
        charging: battery.map(|(_, c)| c).unwrap_or(false),
        dnd,
        brightness,
        dark,
        clock24,
    }
}

#[tauri::command]
fn sys_set(
    vol: Option<u32>,
    mute: Option<bool>,
    dnd: Option<bool>,
    brightness: Option<u32>,
    dark: Option<bool>,
) -> Result<(), String> {
    if let Some(v) = vol {
        run_cmd(
            "pactl",
            &["set-sink-volume", "@DEFAULT_SINK@", &format!("{v}%")],
        )
        .ok_or_else(|| "pactl set-sink-volume failed".to_string())?;
    }
    if let Some(m) = mute {
        run_cmd(
            "pactl",
            &["set-sink-mute", "@DEFAULT_SINK@", if m { "1" } else { "0" }],
        )
        .ok_or_else(|| "pactl set-sink-mute failed".to_string())?;
    }
    if let Some(d) = dnd {
        run_cmd(
            "gsettings",
            &[
                "set",
                "org.gnome.desktop.notifications",
                "show-banners",
                if d { "false" } else { "true" },
            ],
        )
        .ok_or_else(|| "gsettings failed".to_string())?;
    }
    if let Some(b) = brightness {
        run_cmd(
            "gdbus",
            &[
                "call", "--session", "--dest", "org.gnome.SettingsDaemon.Power",
                "--object-path", "/org/gnome/SettingsDaemon/Power",
                "--method", "org.freedesktop.DBus.Properties.Set",
                "org.gnome.SettingsDaemon.Power.Screen", "Brightness",
                &format!("<uint32 {b}>"),
            ],
        )
        .ok_or_else(|| "brightness set failed".to_string())?;
    }
    if let Some(d) = dark {
        run_cmd(
            "gsettings",
            &[
                "set",
                "org.gnome.desktop.interface",
                "color-scheme",
                if d { "prefer-dark" } else { "default" },
            ],
        )
        .ok_or_else(|| "gsettings color-scheme failed".to_string())?;
    }
    Ok(())
}

/* ───────────────────────── Wi-Fi + Bluetooth ───────────────────────── */

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WifiNet {
    ssid: String,
    signal: u32,
    secure: bool,
    connected: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BtDev {
    mac: String,
    name: String,
    connected: bool,
}

#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct NetStatus {
    wifi_radio: bool,
    networks: Vec<WifiNet>,
    wifi_error: Option<String>,
    bt_available: bool,
    bt_powered: bool,
    devices: Vec<BtDev>,
}

/// Splits one `-t --escape yes` nmcli line into fields, unescaping `\:`.
fn nmcli_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut cur = String::new();
    let mut escaped = false;
    for c in line.chars() {
        if escaped {
            cur.push(c);
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == ':' {
            fields.push(cur.clone());
            cur.clear();
        } else {
            cur.push(c);
        }
    }
    fields.push(cur);
    fields
}

#[tauri::command]
fn net_status() -> NetStatus {
    let mut st = NetStatus::default();
    st.wifi_radio = run_cmd("nmcli", &["radio", "wifi"])
        .map(|s| s.trim() == "enabled")
        .unwrap_or(false);
    if st.wifi_radio {
        let mut nets: Vec<WifiNet> = run_cmd(
            "nmcli",
            &["-t", "-f", "IN-USE,SIGNAL,SECURITY,SSID", "--escape", "yes", "device", "wifi", "list"],
        )
        .map(|s| {
            s.lines()
                .filter_map(|l| {
                    let f = nmcli_fields(l);
                    if f.len() < 4 {
                        return None;
                    }
                    Some(WifiNet {
                        ssid: f[3].clone(),
                        signal: f[1].parse().unwrap_or(0),
                        secure: !f[2].is_empty(),
                        connected: f[0] == "*",
                    })
                })
                .collect()
        })
        .unwrap_or_default();
        // strongest copy of each ssid, sorted by signal
        nets.sort_by(|a, b| b.signal.cmp(&a.signal));
        let mut seen = std::collections::HashSet::new();
        nets.retain(|n| n.ssid.is_empty() == false && seen.insert(n.ssid.clone()));
        st.networks = nets;
    } else {
        st.wifi_error = Some("Wi-Fi radio is off".into());
    }
    let show = run_cmd("bluetoothctl", &["show"]).unwrap_or_default();
    st.bt_available = show.contains("Controller");
    if st.bt_available {
        st.bt_powered = show.contains("Powered: yes");
        let mut devices: Vec<BtDev> = run_cmd("bluetoothctl", &["devices"])
            .map(|s| {
                s.lines()
                    .filter_map(|l| {
                        let rest = l.strip_prefix("Device ")?;
                        let (mac, name) = rest.split_once(' ')?;
                        Some(BtDev {
                            mac: mac.to_string(),
                            name: name.to_string(),
                            connected: false,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        for d in devices.iter_mut() {
            d.connected = run_cmd("bluetoothctl", &["info", &d.mac])
                .map(|s| s.contains("Connected: yes"))
                .unwrap_or(false);
        }
        devices.sort_by_key(|d| !d.connected);
        st.devices = devices;
    }
    st
}

#[tauri::command]
fn wifi_radio(on: bool) -> Result<(), String> {
    run_cmd("nmcli", &["radio", "wifi", if on { "on" } else { "off" }])
        .ok_or_else(|| "nmcli radio failed".to_string())
        .map(|_| ())
}

#[tauri::command]
fn wifi_connect(ssid: String, password: Option<String>) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["device", "wifi", "connect", &ssid];
    let pw = password.unwrap_or_default();
    if !pw.is_empty() {
        args.extend(["password", &pw]);
    }
    let out = std::process::Command::new("nmcli")
        .env("LC_ALL", "C")
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn bt_powered() -> bool {
    run_cmd("bluetoothctl", &["show"])
        .map(|s| s.contains("Powered: yes"))
        .unwrap_or(false)
}

#[tauri::command]
fn bt_power(on: bool) -> Result<(), String> {
    // rfkill soft-block makes bluez answer "Busy"; clear it first
    let _ = run_cmd("rfkill", &["unblock", "bluetooth"]);
    let verb = if on { "on" } else { "off" };
    let out = std::process::Command::new("bluetoothctl")
        .env("LC_ALL", "C")
        .args(["power", verb])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    // bluetoothctl exits 0 even on failure — the message is the only truth
    if text.contains("Failed") {
        return Err(text
            .lines()
            .find(|l| l.contains("Failed"))
            .unwrap_or("bluetoothctl failed")
            .trim()
            .to_string());
    }
    if on {
        // verify the adapter actually stays up (some adapters flap)
        std::thread::sleep(Duration::from_millis(600));
        if !bt_powered() {
            return Err("adapter powered on, then dropped again (rfkill/driver?)".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn bt_device(mac: String, connect: bool) -> Result<(), String> {
    let out = std::process::Command::new("bluetoothctl")
        .env("LC_ALL", "C")
        .args([if connect { "connect" } else { "disconnect" }, &mac])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if text.contains("Failed") {
        return Err(text
            .lines()
            .find(|l| l.contains("Failed"))
            .unwrap_or("bluetoothctl failed")
            .trim()
            .to_string());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(OverlayState::default())
        .manage(DragWatch::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_rect,
            media_state,
            media_control,
            mixer_state,
            mixer_set,
            sys_status,
            sys_set,
            net_status,
            wifi_radio,
            wifi_connect,
            bt_power,
            bt_device
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // restore the last zone (or top-center), below the system
                // bar, inside the workarea
                let zone = load_zone().unwrap_or("t");
                let wa = read_workarea();
                if let Some(wa) = wa {
                    place_zone(&window, zone, wa);
                } else {
                    let Ok(Some(monitor)) = window.current_monitor() else {
                        return Ok(());
                    };
                    let screen = monitor.size();
                    let win = window.outer_size().unwrap_or_default();
                    let x = screen.width.saturating_sub(win.width) / 2;
                    let _ = window.set_position(tauri::PhysicalPosition::new(x, 32));
                }
                // remember drags so the snap watcher can finish them
                let app2 = app.handle().clone();
                window.on_window_event(move |ev| {
                    if let tauri::WindowEvent::Moved(_) = ev {
                        *app2.state::<DragWatch>().0.lock().unwrap() =
                            Some(std::time::Instant::now());
                    }
                });
            }
            spawn_hit_tester(app.handle().clone());
            spawn_media(app.handle().clone());
            spawn_snap_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running lekuvo desktop");
}
