//! lekuvo — a notch bar for Linux, rendered natively by VelquView.
//!
//! The process owns four pieces: the X11 overlay window (lekuvo-host),
//! the VelquView document (`app/`), the MPRIS media worker
//! (lekuvo-media), and the Lekuvo mascot (lekuvo-mascot) whose baked
//! frames are composited onto the rendered frame. External state flows
//! into the document through `VelquView::write_state` (ADR 0025); user
//! events flow back through `take_events` Click ids and reactive
//! `@click` handlers.

use std::path::PathBuf;
use std::rc::Rc;
use std::time::{Duration, Instant};

use velqu_view::{
    Asset, AssetRequest, AssetResolver, DocumentSource, ReactiveValue, StylesheetSource,
    VelquView, Viewport,
};

use lekuvo_host::{Geometry, HostConfig, HostEvent, NotchWindow, Rectangle};
use lekuvo_mascot::{MoodController, SpriteStore, composite};

/// Window size: the pill plus the fully expanded card, so expanding
/// never resizes the window (presenting stays a fixed-size blit).
const WIN_W: u16 = 560;
const WIN_H: u16 = 372;
/// Input rectangles grow by this much so edges are not hairline targets.
const INPUT_PAD: i16 = 6;
/// Mascot playback.
const MASCOT_FPS: u32 = 10;
/// Keep-above re-assert cadence (the Layzee-proven value).
const ABOVE_TICK: Duration = Duration::from_secs(2);
/// Clock refresh cadence.
const CLOCK_TICK: Duration = Duration::from_secs(1);
/// Collapse the card after this idle time.
const COLLAPSE_AFTER: Duration = Duration::from_secs(8);
/// Tuck the pill after this idle time (unless media is playing).
const TUCK_AFTER: Duration = Duration::from_secs(12);
/// Drag threshold before a press becomes a window drag.
const DRAG_THRESHOLD: f32 = 5.0;
/// Cap on poll sleep so channels and timers stay responsive.
const POLL_CAP: Duration = Duration::from_millis(100);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Settings {
    /// One of the nine zones (`tl`..`br`) or `free`.
    island_pos: String,
    /// Free-placement window x (root coordinates).
    island_x: Option<i32>,
    /// Free-placement window y (root coordinates).
    island_y: Option<i32>,
    /// Whether drops snap to zones (true) or stay where released.
    island_sticky: bool,
    /// Whether the pill automatically tucks/hides when idle.
    auto_hide: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            island_pos: "tc".to_owned(),
            island_x: None,
            island_y: None,
            island_sticky: true,
            auto_hide: false,
        }
    }
}

fn settings_path() -> PathBuf {
    let mut path = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"));
    path.push("lekuvo");
    std::fs::create_dir_all(&path).ok();
    path.join("settings.json")
}

fn load_settings() -> Settings {
    let Ok(raw) = std::fs::read_to_string(settings_path()) else {
        return Settings::default();
    };
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    let object = value.as_object();
    Settings {
        island_pos: object
            .and_then(|o| o.get("island_pos"))
            .and_then(|v| v.as_str())
            .unwrap_or("tc")
            .to_owned(),
        island_x: object
            .and_then(|o| o.get("island_x"))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32),
        island_y: object
            .and_then(|o| o.get("island_y"))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32),
        island_sticky: object
            .and_then(|o| o.get("island_sticky"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        auto_hide: object
            .and_then(|o| o.get("auto_hide"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    }
}

fn save_settings(settings: &Settings) {
    let json = serde_json::json!({
        "island_pos": settings.island_pos,
        "island_x": settings.island_x,
        "island_y": settings.island_y,
        "island_sticky": settings.island_sticky,
        "auto_hide": settings.auto_hide,
    });
    if let Err(error) = std::fs::write(settings_path(), serde_json::to_string_pretty(&json).unwrap()) {
        eprintln!("lekuvo: cannot save settings: {error}");
    }
}

// ---------------------------------------------------------------------------
// App assets
// ---------------------------------------------------------------------------

/// Sandboxed file resolver for the app directory (the velqu-lab pattern).
struct DirAssets {
    root: PathBuf,
}

impl AssetResolver for DirAssets {
    fn resolve(&self, request: AssetRequest<'_>) -> Option<Asset> {
        let rel = request.path.trim_start_matches("./");
        if rel.starts_with('/') || rel.split(['/', '\\']).any(|segment| segment == "..") {
            return None;
        }
        let bytes = std::fs::read(self.root.join(rel)).ok()?;
        Some(Asset {
            id: velqu_view::SourceId::new(rel),
            bytes,
        })
    }
}

fn resolve_dir(candidates: &[&str]) -> Option<PathBuf> {
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|path| path.exists())
}

// ---------------------------------------------------------------------------
// Zone placement
// ---------------------------------------------------------------------------

/// Root coordinates for the window given a zone and the workarea.
fn zone_geometry(zone: &str, workarea: Geometry) -> (i16, i16) {
    let margin = 8i16;
    let mut chars = zone.chars();
    let vertical = chars.next().unwrap_or('t');
    let horizontal = chars.next().unwrap_or('c');
    let x = match horizontal {
        'l' => workarea.x + margin,
        'r' => workarea.x + workarea.width.saturating_sub(WIN_W) as i16 - margin,
        _ => workarea.x + (workarea.width.saturating_sub(WIN_W) / 2) as i16,
    };
    let y = match vertical {
        // Middle zones center the pill row (40px), not the window, so
        // the card still has room to open downward inside the window.
        'm' => workarea.y + (workarea.height.saturating_sub(40) / 2) as i16,
        'b' => workarea.y + workarea.height.saturating_sub(WIN_H) as i16 - margin,
        _ => workarea.y + margin,
    };
    (x.max(workarea.x), y.max(workarea.y))
}

/// The zone a window dropped at `x,y` belongs to (thirds of the workarea).
fn zone_of(x: i16, y: i16, workarea: Geometry) -> String {
    let cx = x as i32 + WIN_W as i32 / 2;
    let cy = y as i32 + WIN_H as i32 / 2;
    let third_x = workarea.width as i32 / 3;
    let third_y = workarea.height as i32 / 3;
    let wx = (cx - workarea.x as i32).clamp(0, workarea.width as i32 - 1);
    let wy = (cy - workarea.y as i32).clamp(0, workarea.height as i32 - 1);
    let vertical = ['t', 'm', 'b'][(wy / third_y).clamp(0, 2) as usize];
    let horizontal = ['l', 'c', 'r'][(wx / third_x).clamp(0, 2) as usize];
    format!("{vertical}{horizontal}")
}

fn clamp_free(x: i16, y: i16, workarea: Geometry) -> (i16, i16) {
    let max_x = workarea.x + workarea.width.saturating_sub(WIN_W) as i16;
    let max_y = workarea.y + workarea.height.saturating_sub(WIN_H) as i16;
    (
        x.clamp(workarea.x, max_x.max(workarea.x)),
        y.clamp(workarea.y, max_y.max(workarea.y)),
    )
}

// ---------------------------------------------------------------------------
// Clock (local time via libc; no chrono dependency)
// ---------------------------------------------------------------------------

fn local_hhmm() -> String {
    unsafe {
        let now = libc::time(std::ptr::null_mut());
        let mut tm: libc::tm = std::mem::zeroed();
        libc::localtime_r(&now, &mut tm);
        format!("{:02}:{:02}", tm.tm_hour, tm.tm_min)
    }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InputMode {
    Collapsed,
    Expanded,
    Tucked,
}

fn main() {
    let app_dir = resolve_dir(&["app", "../app", "../../app"])
        .or_else(|| std::env::var_os("LEKUVO_APP").map(PathBuf::from))
        .unwrap_or_else(|| panic!("cannot find the app/ document directory"));
    let mascot_dir = resolve_dir(&["assets/mascot", "../assets/mascot", "../../assets/mascot"]);
    let mut settings = load_settings();

    // --- VelquView document ------------------------------------------------
    let mut view = VelquView::new();
    view.enable_tailwind();
    view.enable_reactive();
    view.set_asset_resolver(Rc::new(DirAssets { root: app_dir.clone() }));
    let html = std::fs::read_to_string(app_dir.join("index.html"))
        .unwrap_or_else(|error| panic!("read {}: {error}", app_dir.join("index.html").display()));
    view.load_document(
        DocumentSource::new("lekuvo", html).with_base(app_dir.to_string_lossy().to_string()),
    )
    .expect("document loads");
    let mut stylesheets: Vec<PathBuf> = std::fs::read_dir(&app_dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "css"))
        .collect();
    stylesheets.sort();
    for path in &stylesheets {
        let css = std::fs::read_to_string(path).unwrap_or_default();
        let _ = view.load_stylesheet(StylesheetSource::new(
            path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            css,
        ));
    }
    for diagnostic in view.tailwind_diagnostics() {
        eprintln!("lekuvo: tailwind: {diagnostic}");
    }
    for diagnostic in view.reactive_diagnostics() {
        eprintln!("lekuvo: reactive: {diagnostic}");
    }

    let sprites = mascot_dir
        .as_deref()
        .and_then(|dir| SpriteStore::load(dir).map_err(|e| eprintln!("lekuvo: {e}")).ok());
    if sprites.is_none() {
        eprintln!("lekuvo: mascot sprites not found; running without the chameleon");
    }

    let viewport = Viewport::try_new(WIN_W as u32, WIN_H as u32, 1.0).expect("viewport");
    view.render(viewport).expect("first render");
    view.pump_reactive(&[]);

    // --- Media + mascot ----------------------------------------------------
    let media = lekuvo_media::spawn();
    let mut moods = MoodController::new();
    moods.trigger(lekuvo_mascot::AppEvent::PointerWave);

    // --- Window ------------------------------------------------------------
    let mut win = NotchWindow::create(&HostConfig {
        width: WIN_W,
        height: WIN_H,
        x: 0,
        y: 0,
    })
    .expect("X11 overlay window");
    let workarea = win.workarea();
    let (start_x, start_y) = if settings.island_pos == "free" {
        clamp_free(
            settings.island_x.unwrap_or(workarea.x as i32) as i16,
            settings.island_y.unwrap_or(workarea.y as i32) as i16,
            workarea,
        )
    } else {
        zone_geometry(&settings.island_pos, workarea)
    };
    win.move_window(start_x, start_y).expect("place window");

    // Initial host-owned state: clock, zone alignment, media placeholder.
    let _ = view.write_state("clock", ReactiveValue::String(local_hhmm()));
    if std::env::var_os("LEKUVO_DEBUG").is_some() {
        let _ = view.render(viewport);
        if let Ok(facts) = view.layout_facts(viewport) {
            for fact in &facts.nodes {
                eprintln!(
                    "lekuvo: fact {} {} at ({:.0},{:.0}) {}x{}",
                    fact.fixture_id, fact.tag, fact.x, fact.y, fact.width, fact.height
                );
            }
            for (hx, hy) in [(210.0, 25.0), (230.0, 25.0), (280.0, 25.0), (330.0, 25.0), (345.0, 25.0), (355.0, 25.0)] {
                let hit = view.hit_test(viewport, hx, hy)
                    .and_then(|t| t.element_id)
                    .unwrap_or_else(|| "-".into());
                eprintln!("lekuvo: hit ({hx:.0},{hy:.0}) -> {hit}");
            }
        }
    }
    let startup_zone = if settings.island_pos == "free" {
        zone_of(start_x, start_y, workarea)
    } else {
        settings.island_pos.clone()
    };
    let _ = view.write_state("zone", ReactiveValue::String(startup_zone));
    let mut window_at = (start_x, start_y);

    // --- Loop state --------------------------------------------------------
    let mut dirty = true;
    let mut input_key_applied: Option<Vec<(i16, i16, u16, u16)>> = None;
    let mut frame_buffer: Vec<u8> = Vec::new();
    let mut press_anchor: Option<(f32, f32, i16, i16)> = None; // (px, py, win_x, win_y)
    let mut dragging = false;
    let mut last_activity = Instant::now();
    let mut last_above = Instant::now() - ABOVE_TICK;
    let mut last_clock = Instant::now() - CLOCK_TICK;
    let mut last_anim_step = Instant::now();
    let mut last_present = Instant::now() - Duration::from_millis(1000);
    let mut mascot_epoch = Instant::now();
    let mut media_playing = false;
    let mut running = true;
    let mut loop_count: u64 = 0;
    let mut debug_events: Vec<String> = Vec::new();

    while running {
        let now = Instant::now();
        loop_count += 1;

        // Poll deadline: the nearest future timer, capped for channel
        // latency. Elapsed timers saturate to zero and must be skipped,
        // or the poll spins at 100% CPU.
        let mut deadline = POLL_CAP;
        for timer in [
            CLOCK_TICK.saturating_sub(now.duration_since(last_clock)),
            ABOVE_TICK.saturating_sub(now.duration_since(last_above)),
            COLLAPSE_AFTER.saturating_sub(now.duration_since(last_activity)),
            TUCK_AFTER.saturating_sub(now.duration_since(last_activity)),
        ] {
            if !timer.is_zero() {
                deadline = deadline.min(timer);
            }
        }
        if view.has_active_animations() {
            deadline = deadline.min(Duration::from_millis(16));
        }
        // Sub-millisecond deadlines must not truncate to zero: a
        // zero-timeout poll returns immediately and spins the loop.
        let timeout_ms = deadline.as_millis().clamp(1, i32::MAX as u128) as i32;

        let polled = win.poll_events(timeout_ms);
        let events = match polled {
            Ok(events) => events,
            Err(error) => {
                // A dead connection must not become a silent zombie:
                // log it and exit so the failure is visible.
                eprintln!("lekuvo: X connection error: {error}");
                save_settings(&settings);
                std::process::exit(1);
            }
        };
        for event in events {
            debug_events.push(format!("{:?}", event));
            match event {
                HostEvent::Motion { x, y, rx, ry } => {
                    if let Some((_, _, axr, ayr)) = press_anchor
                        && !dragging
                        && (rx - axr as f32).abs() + (ry - ayr as f32).abs() > DRAG_THRESHOLD
                    {
                        dragging = true;
                    }
                    if let (true, Some((axr, ayr, wx, wy))) = (dragging, press_anchor) {
                        // Root-coordinate math: window-relative coordinates
                        // lag the window's own configure requests.
                        let nx = wx + (rx - axr as f32) as i16;
                        let ny = wy + (ry - ayr as f32) as i16;
                        let _ = win.move_window(nx, ny);
                        window_at = (nx, ny);
                    } else {
                        let changed = view.pointer_move(viewport, x, y);
                        dirty |= changed;
                        wake(&mut view, &mut last_activity, now);
                    }
                }
                HostEvent::Enter { x, y } => {
                    let changed = view.pointer_move(viewport, x, y);
                    dirty |= changed;
                    wake(&mut view, &mut last_activity, now);
                }
                HostEvent::Leave => {
                    if !dragging {
                        view.pointer_exit();
                        dirty = true;
                    }
                }
                HostEvent::LeftPress { x, y, rx, ry } => {
                    last_activity = now;
                    let hit = view.hit_test(viewport, x, y);
                    if std::env::var_os("LEKUVO_DEBUG").is_some() {
                        eprintln!(
                            "lekuvo: press at ({x:.0},{y:.0}) -> {:?}",
                            hit.as_ref().and_then(|t| t.element_id.clone())
                        );
                    }
                    let grip = hit
                        .is_some_and(|target| target.element_id.as_deref() == Some("grip"));
                    if grip {
                        press_anchor = Some((rx, ry, window_at.0, window_at.1));
                    } else {
                        press_anchor = None;
                        dirty |= view.pointer_press(viewport, x, y);
                    }
                }
                HostEvent::LeftRelease { x, y } => {
                    last_activity = now;
                    if std::env::var_os("LEKUVO_DEBUG").is_some() {
                        eprintln!("lekuvo: release at ({x:.0},{y:.0}) dragging={dragging} anchor={}", press_anchor.is_some());
                    }
                    if dragging {
                        dragging = false;
                        press_anchor = None;
                        // Snap (or clamp) and adopt the final position so
                        // the echo ConfigureNotify is not treated as drift.
                        if let Some(snapped) =
                            drop_to_zone(&mut win, &mut view, &mut settings, window_at)
                        {
                            window_at = snapped;
                        }
                    } else if press_anchor.is_some() {
                        // A grip click that never crossed the drag
                        // threshold: synthesize the pair so the pill's
                        // @click still toggles the card.
                        dirty |= view.pointer_press(viewport, x, y);
                        dirty |= view.pointer_release(viewport, x, y);
                        press_anchor = None;
                    } else {
                        dirty |= view.pointer_release(viewport, x, y);
                    }
                }
                HostEvent::Wheel { x, y, dy } => {
                    dirty = true;
                    view.wheel(viewport, x, y, 0.0, dy);
                }
                HostEvent::Expose => dirty = true,
                HostEvent::Configure(geometry) => {
                    // Geometry drift guard: a hostile WM move is undone.
                    if (geometry.x, geometry.y) != window_at && !dragging {
                        if std::env::var_os("LEKUVO_DEBUG").is_some() {
                            eprintln!(
                                "lekuvo: drift guard restore {:?} -> {:?}",
                                (geometry.x, geometry.y),
                                window_at
                            );
                        }
                        let _ = win.move_window(window_at.0, window_at.1);
                    }
                    dirty = true;
                }
                HostEvent::Destroyed => running = false,
            }
        }

        // Media updates: push into the document, notify the mascot.
        while let Ok(update) = media.updates.try_recv() {
            match update {
                Some(snapshot) => {
                    let title = truncate(&snapshot.title, 34);
                    let artist = truncate(&snapshot.artist, 40);
                    let _ = view.write_state(
                        "media",
                        ReactiveValue::Object(vec![
                            ("playing".to_owned(), ReactiveValue::Bool(snapshot.playing)),
                            ("title".to_owned(), ReactiveValue::String(title)),
                            ("artist".to_owned(), ReactiveValue::String(artist)),
                        ]),
                    );
                    let _ = view.write_state("hasMedia", ReactiveValue::Bool(true));
                    if snapshot.playing != media_playing {
                        media_playing = snapshot.playing;
                        moods.trigger(if media_playing {
                            lekuvo_mascot::AppEvent::MediaPlay
                        } else {
                            lekuvo_mascot::AppEvent::MediaPause
                        });
                    }
                    dirty = true;
                }
                None => {
                    let _ = view.write_state("hasMedia", ReactiveValue::Bool(false));
                    if media_playing {
                        media_playing = false;
                        moods.trigger(lekuvo_mascot::AppEvent::MediaPause);
                    }
                    dirty = true;
                }
            }
        }

        // Clock tick.
        if now.duration_since(last_clock) >= CLOCK_TICK {
            last_clock = now;
            let _ = view.write_state("clock", ReactiveValue::String(local_hhmm()));
            dirty = true;
            if std::env::var_os("LEKUVO_DEBUG").is_some() {
                eprintln!(
                    "lekuvo: frames={} loops={} events={} tail={:?}",
                    view.frames_rendered(),
                    loop_count,
                    debug_events.len(),
                    debug_events.iter().rev().take(4).collect::<Vec<_>>()
                );
                debug_events.clear();
            }
        }

        // Auto-hide: collapse the card, then tuck the pill.
        let state = view.reactive_state();
        let expanded = state
            .map(|s| s.get_path("expanded").truthy())
            .unwrap_or(false);
        let tucked = state.map(|s| s.get_path("tucked").truthy()).unwrap_or(false);
        if expanded && now.duration_since(last_activity) >= COLLAPSE_AFTER {
            let _ = view.write_state("expanded", ReactiveValue::Bool(false));
            dirty = true;
        }
        if settings.auto_hide
            && !expanded
            && !tucked
            && !media_playing
            && now.duration_since(last_activity) >= TUCK_AFTER
        {
            let _ = view.write_state("tucked", ReactiveValue::Bool(true));
            dirty = true;
        }

        // Keep-above heartbeat (skipped while dragging).
        if !dragging && now.duration_since(last_above) >= ABOVE_TICK {
            last_above = now;
            let _ = win.reassert_above();
        }

        // Reactive events: host actions by element id, then the pump.
        let batch = view.take_events();
        for event in &batch {
            if let velqu_view::Event::Click { target } = event {
                match target.id.as_deref() {
                    Some("btn-play") => {
                        let _ = media.commands.send(lekuvo_media::MediaCommand::PlayPause);
                    }
                    Some("btn-next") => {
                        let _ = media.commands.send(lekuvo_media::MediaCommand::Next);
                    }
                    Some("btn-prev") => {
                        let _ = media.commands.send(lekuvo_media::MediaCommand::Previous);
                    }
                    Some("pill") => {
                        moods.trigger(lekuvo_mascot::AppEvent::PointerWave);
                        mascot_epoch = Instant::now();
                    }
                    _ => {}
                }
            }
        }
        view.pump_reactive(&batch);

        // Mascot clock: expire temporary reactions.
        moods.tick(now.duration_since(mascot_epoch).as_millis() as u64);

        // Render decision.
        let mascot_live = sprites.is_some()
            && !view
                .reactive_state()
                .map(|s| s.get_path("tucked").truthy())
                .unwrap_or(false)
            && sprites
                .as_ref()
                .is_some_and(|s| s.is_animated(moods.mood(), "compact"));
        let due_present = now.duration_since(last_present) >= Duration::from_millis(100);
        if dirty || view.has_active_animations() || (mascot_live && due_present) {
            let dt = now.duration_since(last_anim_step);
            last_anim_step = now;
            view.step_animations_by(dt);
            if let Ok(result) = view.render(viewport) {
                frame_buffer.clear();
                frame_buffer.extend_from_slice(result.frame.pixels());
                if let Some(sprites) = sprites.as_ref() {
                    let is_tucked = view
                        .reactive_state()
                        .map(|s| s.get_path("tucked").truthy())
                        .unwrap_or(false);
                    if !is_tucked {
                        let elapsed = now.duration_since(mascot_epoch).as_millis() as u64;
                        if let Ok(facts) = view.layout_facts(viewport) {
                            for fact in &facts.nodes {
                                if fact.fixture_id == "mascot-compact" {
                                    if let Some((rgba, sw, sh)) = sprites.frame(moods.mood(), "compact", elapsed, MASCOT_FPS) {
                                        composite(&mut frame_buffer, WIN_W as u32, (fact.x as u32, fact.y as u32, fact.width as u32, fact.height as u32), rgba, sw, sh);
                                    }
                                } else if fact.fixture_id == "mascot-full" {
                                    if let Some((rgba, sw, sh)) = sprites.frame(moods.mood(), "full", elapsed, MASCOT_FPS) {
                                        composite(&mut frame_buffer, WIN_W as u32, (fact.x as u32, fact.y as u32, fact.width as u32, fact.height as u32), rgba, sw, sh);
                                    }
                                }
                            }
                        }
                    }
                }
                if win.present(&frame_buffer).is_err() {
                    running = false;
                }
                last_present = now;
            }
            dirty = false;

            // Input region follows live layout facts, so zone flips that
            // move the pill inside the window are picked up too.
            let state = view.reactive_state();
            let expanded = state.map(|s| s.get_path("expanded").truthy()).unwrap_or(false);
            let tucked = state.map(|s| s.get_path("tucked").truthy()).unwrap_or(false);
            let mode = if tucked {
                InputMode::Tucked
            } else if expanded {
                InputMode::Expanded
            } else {
                InputMode::Collapsed
            };
            let rects = input_rects(&mut view, viewport, mode);
            let key: Vec<(i16, i16, u16, u16)> = rects
                .iter()
                .map(|r| (r.x, r.y, r.width, r.height))
                .collect();
            if input_key_applied.as_ref() != Some(&key) {
                input_key_applied = Some(key);
                let _ = win.set_input_region(&rects);
            }
        }
    }

    save_settings(&settings);
}

fn wake(view: &mut VelquView, last_activity: &mut Instant, now: Instant) {
    *last_activity = now;
    let tucked = view
        .reactive_state()
        .map(|s| s.get_path("tucked").truthy())
        .unwrap_or(false);
    if tucked {
        let _ = view.write_state("tucked", ReactiveValue::Bool(false));
    }
}

fn drop_to_zone(
    win: &mut NotchWindow,
    view: &mut VelquView,
    settings: &mut Settings,
    window_at: (i16, i16),
) -> Option<(i16, i16)> {
    let workarea = win.workarea();
    let (x, y, zone) = if settings.island_sticky {
        let zone = zone_of(window_at.0, window_at.1, workarea);
        let (x, y) = zone_geometry(&zone, workarea);
        (x, y, zone)
    } else {
        let (x, y) = clamp_free(window_at.0, window_at.1, workarea);
        (x, y, zone_of(x, y, workarea))
    };
    if std::env::var_os("LEKUVO_DEBUG").is_some() {
        eprintln!("lekuvo: drop snap {zone} -> ({x},{y})");
    }
    let _ = win.move_window(x, y);
    let _ = view.write_state("zone", ReactiveValue::String(zone.clone()));
    if settings.island_sticky {
        settings.island_pos = zone;
    } else {
        settings.island_pos = "free".to_owned();
        settings.island_x = Some(x as i32);
        settings.island_y = Some(y as i32);
    }
    save_settings(settings);
    Some((x, y))
}


/// Click-through rectangles for each visibility mode, from live layout
/// facts (hidden `vx-show` elements leave no facts, so tucked mode uses
/// the pill's last-known rect via the always-laid-out pill row).
fn input_rects(view: &mut VelquView, viewport: Viewport, mode: InputMode) -> Vec<Rectangle> {
    let Ok(facts) = view.layout_facts(viewport) else {
        return Vec::new();
    };
    let pad = INPUT_PAD;
    let fact_rect = |fixture: &str| -> Option<Rectangle> {
        facts
            .nodes
            .iter()
            .find(|fact| fact.fixture_id == fixture)
            .map(|fact| Rectangle {
                x: fact.x as i16 - pad,
                y: fact.y as i16 - pad,
                width: fact.width as u16 + (pad as u16) * 2,
                height: fact.height as u16 + (pad as u16) * 2,
            })
    };
    match mode {
        InputMode::Expanded => {
            let mut rects = Vec::new();
            if let Some(card) = fact_rect("card") {
                rects.push(card);
            }
            if let Some(pill) = fact_rect("pill") {
                rects.push(pill);
            }
            rects
        }
        InputMode::Collapsed => fact_rect("pill").into_iter().collect(),
        // The tucked pill keeps opacity (it is display-laid-out, merely
        // transparent), so the sensor strip is the pill's own rect.
        InputMode::Tucked => fact_rect("pill").into_iter().collect(),
    }
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_owned();
    }
    let cut: String = text.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{cut}\u{2026}")
}

