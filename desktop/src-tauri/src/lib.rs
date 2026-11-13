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

/// Places the overlay window flush to the top edge, centered horizontally
/// on whatever monitor it currently occupies.
fn pin_to_top_center(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let screen = monitor.size();
    let win = window.outer_size().unwrap_or_default();
    let x = screen.width.saturating_sub(win.width) / 2;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, 0));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OverlayState::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_rect,
            media_state,
            media_control,
            mixer_state,
            mixer_set
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                pin_to_top_center(&window);
            }
            spawn_hit_tester(app.handle().clone());
            spawn_media(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running lekuvo desktop");
}
