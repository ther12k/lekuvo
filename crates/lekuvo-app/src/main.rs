//! lekuvo — a notch bar for Linux, rendered natively by VelquView.
//!
//! The process owns four pieces: the X11 overlay window (lekuvo-host),
//! the VelquView document (`app/`), the MPRIS media worker
//! (lekuvo-media), and the Lekuvo mascot (lekuvo-mascot) whose baked
//! frames are composited onto the rendered frame. External state flows
//! into the document through `VelquView::write_state` (ADR 0025); user
//! events flow back through `take_events` Click ids and reactive
//! `@click` handlers.

use std::path::{Path, PathBuf};
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
/// Keep-above re-assert cadence (the Layzee-proven value).
const ABOVE_TICK: Duration = Duration::from_secs(2);
/// Clock refresh cadence.
const CLOCK_TICK: Duration = Duration::from_secs(1);
/// Collapse the card after this idle time.
const COLLAPSE_AFTER: Duration = Duration::from_secs(8);
/// Collapse the card this long after the pointer leaves the overlay.
const HOVER_COLLAPSE_AFTER: Duration = Duration::from_millis(1500);
/// Tuck the pill after this idle time (unless media is playing).
const TUCK_AFTER: Duration = Duration::from_secs(12);
/// Drag threshold before a press becomes a window drag.
const DRAG_THRESHOLD: f32 = 5.0;
/// Cap on poll sleep so channels and timers stay responsive.
const POLL_CAP: Duration = Duration::from_millis(100);
/// Pomodoro session / break lengths.
const FOCUS_SECONDS: u64 = 25 * 60;
const BREAK_SECONDS: u64 = 5 * 60;
/// How often the compact pill rotates between live activities.
const LIVE_ROTATE: Duration = Duration::from_millis(3800);
/// A toast shows for this long before auto-dismissing.
const TOAST_LINGER: Duration = Duration::from_secs(6);
/// Water reminder cadence while the pill is visible (demo-nudge).
const WATER_EVERY: Duration = Duration::from_secs(45 * 60);

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
    /// Color theme: `classic` | `meadow` | `sunset` | `dusk`.
    theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            island_pos: "tc".to_owned(),
            island_x: None,
            island_y: None,
            island_sticky: true,
            auto_hide: false,
            theme: "classic".to_owned(),
        }
    }
}

/// Theme names in picker order.
const THEMES: [&str; 4] = ["classic", "meadow", "sunset", "dusk"];

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
        theme: object
            .and_then(|o| o.get("theme"))
            .and_then(|v| v.as_str())
            .filter(|name| THEMES.contains(&name))
            .unwrap_or("classic")
            .to_owned(),
    }
}

fn save_settings(settings: &Settings) {
    let json = serde_json::json!({
        "island_pos": settings.island_pos,
        "island_x": settings.island_x,
        "island_y": settings.island_y,
        "island_sticky": settings.island_sticky,
        "auto_hide": settings.auto_hide,
        "theme": settings.theme,
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

fn resolve_dir(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.exists()).cloned()
}

/// Resource roots, in priority order:
/// 1. `LEKUVO_APP` / `LEKUVO_MASCOT` environment overrides.
/// 2. An installed data dir: `$XDG_DATA_HOME/lekuvo` or
///    `~/.local/share/lekuvo` (relative to the executable for
///    system-wide installs: `<exe>/../share/lekuvo`).
/// 3. The development checkout, relative to the executable or cwd.
fn discover_resources() -> (PathBuf, PathBuf) {
    let exe = std::env::current_exe().ok();
    let mut app_candidates: Vec<PathBuf> = Vec::new();
    let mut mascot_candidates: Vec<PathBuf> = Vec::new();

    if let Some(dir) = std::env::var_os("LEKUVO_APP") {
        app_candidates.push(PathBuf::from(dir));
    }
    if let Some(dir) = std::env::var_os("LEKUVO_MASCOT") {
        mascot_candidates.push(PathBuf::from(dir));
    }

    // Installed layout: <prefix>/bin/lekuvo + <prefix>/share/lekuvo/{app,assets}
    let xdg_data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".local/share")
        });
    let installed = xdg_data.join("lekuvo");
    app_candidates.push(installed.join("app"));
    mascot_candidates.push(installed.join("assets/mascot"));
    if let Some(exe) = exe.as_deref() {
        let exe = exe.to_path_buf();
        if let Some(bin) = exe.parent()
            && let Some(prefix) = bin.parent()
        {
            let share = prefix.join("share/lekuvo");
            app_candidates.push(share.join("app"));
            mascot_candidates.push(share.join("assets/mascot"));
            // Development checkout: <repo>/target/(debug|release)/lekuvo
            if let Some(target) = bin.parent()
                && let Some(repo) = target.parent()
            {
                app_candidates.push(repo.join("app"));
                mascot_candidates.push(repo.join("assets/mascot"));
            }
        }
    }
    // Last resort: cwd-relative (cargo run from the crate).
    app_candidates.push(PathBuf::from("app"));
    mascot_candidates.push(PathBuf::from("assets/mascot"));

    let app = resolve_dir(&app_candidates)
        .unwrap_or_else(|| panic!(
            "cannot find the lekuvo app/ document directory; set LEKUVO_APP or install with `./install.sh`"
        ));
    // The mascot is optional (the notch runs without it); pick the first
    // existing candidate or the last one for the warning message.
    let mascot = resolve_dir(&mascot_candidates)
        .unwrap_or_else(|| mascot_candidates.last().cloned().unwrap_or_default());
    (app, mascot)
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

// ---------------------------------------------------------------------------
// Focus timer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct FocusTimer {
    /// Remaining seconds in the current phase.
    left: u64,
    /// Phase length in seconds (25 min focus / 5 min break).
    total: u64,
    running: bool,
    /// `true` during focus, `false` during a break.
    mode_focus: bool,
    /// Completed focus sessions today.
    sessions: u32,
}

impl Default for FocusTimer {
    fn default() -> Self {
        Self { left: FOCUS_SECONDS, total: FOCUS_SECONDS, running: false, mode_focus: true, sessions: 0 }
    }
}

impl FocusTimer {
    fn clock(&self) -> String {
        format!("{:02}:{:02}", self.left / 60, self.left % 60)
    }

    fn pct(&self) -> u64 {
        if self.total == 0 {
            return 0;
        }
        // Progress fills as time elapses.
        ((self.total - self.left) * 100 / self.total).min(100)
    }

    fn reset(&mut self) {
        self.total = if self.mode_focus { FOCUS_SECONDS } else { BREAK_SECONDS };
        self.left = self.total;
        self.running = false;
    }

    fn tick(&mut self) -> Option<FocusPhase> {
        if !self.running || self.left == 0 {
            return None;
        }
        self.left -= 1;
        if self.left == 0 {
            // Phase finished: auto-switch, pause, and report.
            let finished = if self.mode_focus {
                self.sessions += 1;
                self.mode_focus = false;
                FocusPhase::FocusDone
            } else {
                self.mode_focus = true;
                FocusPhase::BreakDone
            };
            self.total = if self.mode_focus { FOCUS_SECONDS } else { BREAK_SECONDS };
            self.left = self.total;
            self.running = false;
            return Some(finished);
        }
        None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FocusPhase {
    FocusDone,
    BreakDone,
}

/// Push the whole focus sub-state into the document in one write.
fn write_focus(view: &mut VelquView, focus: &FocusTimer) {
    let _ = view.write_state(
        "focus",
        ReactiveValue::Object(vec![
            ("clock".to_owned(), ReactiveValue::String(focus.clock())),
            ("pct".to_owned(), ReactiveValue::Number(focus.pct() as f64)),
            ("running".to_owned(), ReactiveValue::Bool(focus.running)),
            (
                "mode".to_owned(),
                ReactiveValue::String(
                    if focus.mode_focus { "focus" } else { "break" }.to_owned(),
                ),
            ),
            ("sessions".to_owned(), ReactiveValue::Number(focus.sessions as f64)),
        ]),
    );
}

/// Show a toast with the given copy; resets the linger deadline.
fn show_toast(view: &mut VelquView, title: &str, sub: &str) {
    let _ = view.write_state(
        "toast",
        ReactiveValue::Object(vec![
            ("visible".to_owned(), ReactiveValue::Bool(true)),
            ("title".to_owned(), ReactiveValue::String(title.to_owned())),
            ("sub".to_owned(), ReactiveValue::String(sub.to_owned())),
        ]),
    );
}

fn hide_toast(view: &mut VelquView) {
    let _ = view.write_state("toast.visible", ReactiveValue::Bool(false));
}

/// Registers the bundled UI fonts (SIL OFL 1.1, see app/fonts/). Outfit
/// carries display text (clock, titles, timers); Nunito is the body face.
/// Missing files or bad data are non-fatal: the renderer falls back to its
/// bundled DejaVu faces per family lookup.
fn register_fonts(view: &mut VelquView, app_dir: &Path) {
    let load = |name: &str| -> Option<Vec<u8>> {
        std::fs::read(app_dir.join("fonts").join(format!("{name}.ttf"))).ok()
    };
    let register = |view: &mut VelquView, family: &str, regular: &str, bold: &str| {
        let (Some(regular), Some(bold)) = (load(regular), load(bold)) else {
            eprintln!("lekuvo: fonts missing; {family} falls back to DejaVu");
            return;
        };
        if let Err(error) = view.register_font(family, regular, Some(bold)) {
            eprintln!("lekuvo: font {family}: {error}");
        }
    };
    register(view, "Outfit", "Outfit-400", "Outfit-700");
    register(view, "Nunito", "Nunito-400", "Nunito-800");
}

/// Applies the settings' color theme end to end: swaps the `theme`
/// stylesheet (VelquView replaces a sheet by id and re-layouts), tells
/// the document (picker selection ring), and re-tints the mascot.
fn apply_theme(
    view: &mut VelquView,
    sprites: &mut Option<SpriteStore>,
    app_dir: &Path,
    settings: &Settings,
) {
    let name = settings.theme.as_str();
    let css = std::fs::read_to_string(app_dir.join(format!("theme-{name}.css")))
        .unwrap_or_else(|_| format!("/* missing theme-{name}.css; classic values persist */"));
    if let Err(error) = view.load_stylesheet(StylesheetSource::new("theme", css)) {
        eprintln!("lekuvo: theme stylesheet: {error}");
    }
    let _ = view.write_state("theme", ReactiveValue::String(name.to_owned()));
    if let Some(sprites) = sprites.as_mut() {
        sprites.set_skin(lekuvo_mascot::Skin::parse(name));
    }
}

fn main() {
    let (app_dir, mascot_dir) = discover_resources();
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
        // theme-*.css are swapped at runtime by `apply_theme`; never
        // batch-loaded, or alphabetical order would pin the last theme.
        .filter(|path| !path.file_name().is_some_and(|name| name.to_string_lossy().starts_with("theme-")))
        .collect();
    stylesheets.sort();
    for path in &stylesheets {
        let css = std::fs::read_to_string(path).unwrap_or_default();
        let _ = view.load_stylesheet(StylesheetSource::new(
            path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            css,
        ));
    }
    for diagnostic in view.css_diagnostics() {
        eprintln!("lekuvo: css: {diagnostic}");
    }
    for diagnostic in view.tailwind_diagnostics() {
        eprintln!("lekuvo: tailwind: {diagnostic}");
    }
    for diagnostic in view.reactive_diagnostics() {
        eprintln!("lekuvo: reactive: {diagnostic}");
    }

    register_fonts(&mut view, &app_dir);

    let sprites = SpriteStore::load(&mascot_dir)
        .map_err(|e| eprintln!("lekuvo: {e}"))
        .ok();
    if sprites.is_none() {
        eprintln!("lekuvo: mascot sprites not found; running without the chameleon");
    }
    let mut sprites = sprites;

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
    // PROBE: theme disabled
    // apply_theme(&mut view, &mut sprites, &app_dir, &settings);
    if std::env::var_os("LEKUVO_DEBUG").is_some() {
        let _ = view.render(viewport);
        if let Some(state) = view.reactive_state() {
            for path in ["todos[0].done", "todos[1].done", "todos[2].done", "tab", "live"] {
                eprintln!("lekuvo: state {path} = {:?}", state.get_path(path));
            }
        }
        if let Ok(facts) = view.layout_facts(viewport) {
            for fact in &facts.nodes {
                eprintln!(
                    "lekuvo: fact {} {} at ({:.0},{:.0}) {}x{}",
                    fact.fixture_id, fact.tag, fact.x, fact.y, fact.width, fact.height
                );
            }
            if let Some(pill) = facts.nodes.iter().find(|f| f.fixture_id == "pill") {
                let gx = pill.x + pill.width - 14.0;
                let hy = pill.y + pill.height / 2.0;
                for dx in [-4.0, 0.0, 4.0] {
                    let hit = view.hit_test(viewport, gx + dx, hy)
                        .and_then(|t| t.element_id)
                        .unwrap_or_else(|| "-".into());
                    eprintln!("lekuvo: grip probe ({:.0},{:.0}) -> {hit}", gx + dx, hy);
                }
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
    // Hover-expansion (reference behavior): the pill expands while the
    // pointer is over it; leaving the overlay schedules a collapse.
    // `pinned` (pill click) overrides the leave-collapse.
    let mut pinned = false;
    let mut hover_deadline: Option<Instant> = None;
    let mut pill_rect: Option<Rectangle> = None;
    let mut overlay_rects: Vec<Rectangle> = Vec::new();
    let mut last_activity = Instant::now();
    let mut last_above = Instant::now() - ABOVE_TICK;
    let mut last_clock = Instant::now() - CLOCK_TICK;
    let mut last_anim_step = Instant::now();
    let mut last_present = Instant::now() - Duration::from_millis(1000);
    // Controller clock: ms since launch, NEVER reset — reaction deadlines
    // depend on it staying monotonic.
    let launched_at = Instant::now();
    // Playback clock: restarts when the visible mood changes so each
    // animation starts from its first frame.
    let mut mascot_playback = Instant::now();
    let mut media_playing = false;
    // Playback position interpolation base: the snapshot's position and
    // the instant it arrived; display position advances by rate * elapsed
    // while playing and freezes otherwise.
    let mut media_pos_us: i64 = 0;
    let mut media_dur_us: i64 = 0;
    let mut media_rate: f64 = 1.0;
    let mut media_stamped = Instant::now();
    let mut has_media_state = false;
    let mut running = true;
    let mut focus = FocusTimer::default();
    let mut toast_deadline: Option<Instant> = None;
    let mut last_live_rotate = Instant::now();
    let mut live_tick: usize = 0;
    let mut live: &'static str = "idle";
    let mut last_water_nudge = Instant::now();
    write_focus(&mut view, &focus);
    let debug_mode = std::env::var_os("LEKUVO_DEBUG").is_some();
    let mut debug_events: Vec<String> = Vec::new();

    while running {
        let now = Instant::now();

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
                    if let Some((axr, ayr, _, _)) = press_anchor
                        && !dragging
                        && (rx - axr).abs() + (ry - ayr).abs() > DRAG_THRESHOLD
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
                        // Hover-expand: entering the pill opens the card.
                        let over_pill = pill_rect
                            .is_some_and(|r| rect_contains(r, x, y, INPUT_PAD as f32 + 4.0));
                        if over_pill {
                            let tucked = view
                                .reactive_state()
                                .map(|st| st.get_path("tucked").truthy())
                                .unwrap_or(false);
                            let expanded = view
                                .reactive_state()
                                .map(|st| st.get_path("expanded").truthy())
                                .unwrap_or(false);
                            if !expanded && !tucked && !dragging {
                                let _ = view.write_state("expanded", ReactiveValue::Bool(true));
                                hover_deadline = None;
                                dirty = true;
                            }
                        }
                        // Leaving every overlay rect schedules a collapse;
                        // entering any of them cancels it.
                        let over_any = overlay_rects
                            .iter()
                            .any(|r| rect_contains(*r, x, y, INPUT_PAD as f32 + 4.0));
                        if over_any {
                            hover_deadline = None;
                        } else if hover_deadline.is_none() {
                            hover_deadline = Some(now + HOVER_COLLAPSE_AFTER);
                        }
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
                        if hover_deadline.is_none() {
                            hover_deadline = Some(now + HOVER_COLLAPSE_AFTER);
                        }
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
                    media_pos_us = snapshot.pos_us;
                    media_dur_us = snapshot.dur_us;
                    media_rate = if snapshot.playing && snapshot.rate > 0.0 { snapshot.rate } else { 1.0 };
                    media_stamped = now;
                    let (pos, left, pct) = playback_display(media_pos_us, media_dur_us, snapshot.playing, media_rate, media_stamped, now);
                    let _ = view.write_state(
                        "media",
                        ReactiveValue::Object(vec![
                            ("playing".to_owned(), ReactiveValue::Bool(snapshot.playing)),
                            ("title".to_owned(), ReactiveValue::String(title)),
                            ("artist".to_owned(), ReactiveValue::String(artist)),
                            ("pos".to_owned(), ReactiveValue::String(pos)),
                            ("left".to_owned(), ReactiveValue::String(left)),
                            ("pct".to_owned(), ReactiveValue::Number(pct)),
                            ("dur".to_owned(), ReactiveValue::Number(media_dur_us as f64)),
                        ]),
                    );
                    let _ = view.write_state("hasMedia", ReactiveValue::Bool(true));
                    has_media_state = true;
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
                    // Full empty state: title/artist/playing must not keep
                    // stale values from the closed player.
                    media_pos_us = 0;
                    media_dur_us = 0;
                    let _ = view.write_state(
                        "media",
                        ReactiveValue::Object(vec![
                            ("playing".to_owned(), ReactiveValue::Bool(false)),
                            ("title".to_owned(), ReactiveValue::String("Nothing playing".to_owned())),
                            ("artist".to_owned(), ReactiveValue::String(String::new())),
                            ("pos".to_owned(), ReactiveValue::String("0:00".to_owned())),
                            ("left".to_owned(), ReactiveValue::String("-0:00".to_owned())),
                            ("pct".to_owned(), ReactiveValue::Number(0.0)),
                            ("dur".to_owned(), ReactiveValue::Number(0.0)),
                        ]),
                    );
                    let _ = view.write_state("hasMedia", ReactiveValue::Bool(false));
                    has_media_state = false;
                    if media_playing {
                        media_playing = false;
                        moods.trigger(lekuvo_mascot::AppEvent::MediaPause);
                    }
                    dirty = true;
                }
            }
        }

        // Clock + focus tick.
        if now.duration_since(last_clock) >= CLOCK_TICK {
            last_clock = now;
            let _ = view.write_state("clock", ReactiveValue::String(local_hhmm()));
            if debug_mode {
                let anims = view.active_animations_debug();
                eprintln!("lekuvo: active anims: {anims:?}");
            }
            dirty = true;
            if let Some(phase) = focus.tick() {
                let (title, sub) = match phase {
                    FocusPhase::FocusDone => (
                        "Session done! Take 5 🎉",
                        "Lekuvo says: stretch those legs.",
                    ),
                    FocusPhase::BreakDone => {
                        ("Break over. Ready for round 2?", "Press Start when you are.")
                    }
                };
                show_toast(&mut view, title, sub);
                toast_deadline = Some(now + TOAST_LINGER);
                moods.trigger(lekuvo_mascot::AppEvent::PointerWave);
            }
            write_focus(&mut view, &focus);
            // Advancing playback position (1 Hz re-stamp of the media
            // interpolation base into the document).
            if has_media_state {
                let (pos, left, pct) = playback_display(
                    media_pos_us,
                    media_dur_us,
                    media_playing,
                    media_rate,
                    media_stamped,
                    now,
                );
                let _ = view.write_state("media.pos", ReactiveValue::String(pos));
                let _ = view.write_state("media.left", ReactiveValue::String(left));
                let _ = view.write_state("media.pct", ReactiveValue::Number(pct));
                if live == "music" || media_playing {
                    dirty = true;
                }
            }
            if debug_mode {
                eprintln!(
                    "lekuvo: frames={} events={} tail={:?}",
                    view.frames_rendered(),
                    debug_events.len(),
                    debug_events.iter().rev().take(4).collect::<Vec<_>>()
                );
                debug_events.clear();
            }
        }

        // Live-activity rotation: alternate music/focus in the pill when
        // several activities compete for attention.
        if now.duration_since(last_live_rotate) >= LIVE_ROTATE {
            last_live_rotate = now;
            let activities: &[&str] = if media_playing && focus.running {
                &["music", "focus"]
            } else if media_playing {
                &["music"]
            } else if focus.running {
                &["focus"]
            } else {
                &["idle"]
            };
            live_tick = live_tick.wrapping_add(1);
            let next = activities[live_tick % activities.len()];
            if next != live {
                live = next;
                let _ = view.write_state("live", ReactiveValue::String(live.to_owned()));
                dirty = true;
            }
        }

        // Toast lifecycle.
        if let Some(deadline) = toast_deadline
            && now >= deadline
        {
            toast_deadline = None;
            hide_toast(&mut view);
            dirty = true;
        }

        // Water nudge: a periodic hydration reminder (demo toast source).
        if now.duration_since(last_water_nudge) >= WATER_EVERY {
            last_water_nudge = now;
            if toast_deadline.is_none() {
                show_toast(&mut view, "Drink water!", "Stay hydrated — Lekuvo cares.");
                toast_deadline = Some(now + TOAST_LINGER);
                moods.trigger(lekuvo_mascot::AppEvent::PointerWave);
                dirty = true;
            }
        }

        // Auto-hide: collapse the card, then tuck the pill.
        let state = view.reactive_state();
        let expanded = state
            .map(|s| s.get_path("expanded").truthy())
            .unwrap_or(false);
        let tucked = state.map(|s| s.get_path("tucked").truthy()).unwrap_or(false);
        let pinned_now = pinned
            || view
                .reactive_state()
                .map(|st| st.get_path("pinned").truthy())
                .unwrap_or(false);
        if hover_deadline.is_some_and(|deadline| now >= deadline) && !pinned_now {
            hover_deadline = None;
            let _ = view.write_state("expanded", ReactiveValue::Bool(false));
            dirty = true;
        }
        if expanded && !pinned_now && now.duration_since(last_activity) >= COLLAPSE_AFTER {
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
                    Some("btn-focus-toggle") => {
                        focus.running = !focus.running;
                        if focus.running && focus.left == 0 {
                            focus.reset();
                        }
                        write_focus(&mut view, &focus);
                        moods.trigger(if focus.running {
                            lekuvo_mascot::AppEvent::FocusStart
                        } else {
                            lekuvo_mascot::AppEvent::FocusEnd
                        });
                        dirty = true;
                    }
                    Some("btn-focus-reset") => {
                        focus.reset();
                        write_focus(&mut view, &focus);
                        dirty = true;
                    }
                    Some(id) if id.starts_with("theme-") => {
                        let name = id.trim_start_matches("theme-");
                        if THEMES.contains(&name) && settings.theme != name {
                            settings.theme = name.to_owned();
                            // PROBE: theme disabled
    // apply_theme(&mut view, &mut sprites, &app_dir, &settings);
                            save_settings(&settings);
                            dirty = true;
                        }
                    }
                    Some(id) if id.starts_with("todo-") => {
                        // Toggle a to-do item: rewrite the whole array so
                        // every list binding re-evaluates atomically.
                        if let Ok(index) = id.trim_start_matches("todo-").parse::<usize>()
                            && let Some(state) = view.reactive_state()
                            && let velqu_view::ReactiveValue::Array(items) = state.get_path("todos")
                            && index < items.len()
                        {
                            let mut next = items.to_vec();
                            if let ReactiveValue::Object(fields) = &mut next[index] {
                                for (key, value) in fields.iter_mut() {
                                    if key == "done" {
                                        *value = ReactiveValue::Bool(!value.truthy());
                                    }
                                }
                            }
                            let _ = view.write_state("todos", ReactiveValue::Array(next));
                            dirty = true;
                        }
                    }
                    Some("toast") => {
                        // Clicking a toast dismisses it.
                        toast_deadline = None;
                        hide_toast(&mut view);
                        dirty = true;
                    }
                    Some("pill") => {
                        // Pin toggle: a pinned card ignores hover-leave
                        // and the idle collapse until closed.
                        pinned = !pinned;
                        let _ = view.write_state("pinned", ReactiveValue::Bool(pinned));
                        moods.trigger(lekuvo_mascot::AppEvent::PointerWave);
                    }
                    _ => {}
                }
            }
        }
        view.pump_reactive(&batch);

        // Controller clock (monotonic, never reset): expire reactions.
        moods.tick(now.duration_since(launched_at).as_millis() as u64);
        // A resolved-mood change restarts visual playback from frame 0
        // and requests an immediate repaint.
        if moods.changed {
            moods.changed = false;
            mascot_playback = now;
            dirty = true;
        }

        // Render decision: dirty UI, active document transitions, or an
        // upcoming mascot frame in ANY visible variant (compact pill
        // mascot and/or the full card mascot).
        let is_tucked = view
            .reactive_state()
            .map(|s| s.get_path("tucked").truthy())
            .unwrap_or(false);
        let mascot_elapsed = now.duration_since(mascot_playback).as_millis() as u64;
        let mascot_frame_due = sprites.is_some() && !is_tucked && {
            let expanded = view
                .reactive_state()
                .map(|s| s.get_path("expanded").truthy())
                .unwrap_or(false);
            // Both variants animate while expanded; only compact otherwise.
            let variants: &[&str] = if expanded {
                &["compact", "full"]
            } else {
                &["compact"]
            };
            let next = sprites
                .as_ref()
                .map(|s| s.ms_to_next_frame(moods.mood(), variants, mascot_elapsed))
                .unwrap_or(u64::MAX);
            next != u64::MAX && next <= now.duration_since(last_present).as_millis() as u64 + 1
        };
        if dirty || view.has_active_animations() || mascot_frame_due {
            let dt = now.duration_since(last_anim_step);
            last_anim_step = now;
            view.step_animations_by(dt);
            if let Ok(result) = view.render(viewport) {
                frame_buffer.clear();
                frame_buffer.extend_from_slice(result.frame.pixels());
                if let Some(sprites) = sprites.as_ref()
                    && !is_tucked
                {
                    if let Ok(facts) = view.layout_facts(viewport) {
                        for fact in &facts.nodes {
                            let variant = match fact.fixture_id.as_str() {
                                "mascot-compact" | "mascot-toast" => "compact",
                                "mascot-full" => "full",
                                _ => continue,
                            };
                            if let Some((rgba, sw, sh)) =
                                sprites.frame(moods.mood(), variant, mascot_elapsed)
                            {
                                composite(
                                    &mut frame_buffer,
                                    WIN_W as u32,
                                    (fact.x as u32, fact.y as u32, fact.width as u32, fact.height as u32),
                                    rgba,
                                    sw,
                                    sh,
                                );
                            }
                        }
                    }
                }
                // Debug escape hatch: dump the fully composited frame
                // (document + mascot sprites) to PNG. A path ending in
                // `/` writes numbered frames (frame_0000.png, ...) so
                // animation motion can be diffed across renders.
                if let Some(path) = std::env::var_os("LEKUVO_SNAPSHOT") {
                    let path = std::path::PathBuf::from(path);
                    if path.is_dir() {
                        let file = path.join(format!("frame_{:04}.png", view.frames_rendered()));
                        let _ = image::save_buffer(
                            &file,
                            &frame_buffer,
                            WIN_W as u32,
                            WIN_H as u32,
                            image::ColorType::Rgba8,
                        );
                    } else {
                        let _ = image::save_buffer(
                            &path,
                            &frame_buffer,
                            WIN_W as u32,
                            WIN_H as u32,
                            image::ColorType::Rgba8,
                        );
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
            // Cache the overlay geometry for hover decisions (cheap
            // point-in-rect on Motion; no layout pass per mouse move).
            if let Ok(facts) = view.layout_facts(viewport) {
                let fact_rect = |fixture: &str| {
                    facts.nodes.iter().find(|f| f.fixture_id == fixture).map(|f| Rectangle {
                        x: f.x as i16,
                        y: f.y as i16,
                        width: f.width as u16,
                        height: f.height as u16,
                    })
                };
                pill_rect = fact_rect("pill");
                overlay_rects = ["pill", "card", "toast"]
                    .iter()
                    .filter_map(|name| fact_rect(name))
                    .collect();
            }
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
    // Hidden `vx-show` elements leave no layout facts, so the toast only
    // contributes a rectangle while it is actually visible.
    let toast_rect = fact_rect("toast");
    match mode {
        InputMode::Expanded => {
            let mut rects = Vec::new();
            if let Some(card) = fact_rect("card") {
                rects.push(card);
            }
            if let Some(pill) = fact_rect("pill") {
                rects.push(pill);
            }
            rects.extend(toast_rect);
            rects
        }
        InputMode::Collapsed => fact_rect("pill").into_iter().chain(toast_rect).collect(),
        // The tucked pill keeps opacity (it is display-laid-out, merely
        // transparent), so the sensor strip is the pill's own rect.
        InputMode::Tucked => fact_rect("pill").into_iter().collect(),
    }
}

/// Whether the window-relative point sits inside `rect` grown by
/// `pad` on every side.
fn rect_contains(rect: Rectangle, x: f32, y: f32, pad: f32) -> bool {
    let (rx, ry, rw, rh) = (
        rect.x as f32,
        rect.y as f32,
        rect.width as f32,
        rect.height as f32,
    );
    x >= rx - pad && x <= rx + rw + pad && y >= ry - pad && y <= ry + rh + pad
}

/// Formats microseconds as `m:ss`.
fn fmt_us(us: i64) -> String {
    let secs = (us / 1_000_000).max(0);
    format!("{}:{:02}", secs / 60, secs % 60)
}

/// Current playback display triple: `(elapsed "m:ss", remaining "-m:ss",
/// progress percent)`. While playing, the snapshot position advances by
/// `rate * elapsed-since-stamp`, clamped to the duration.
fn playback_display(
    pos_us: i64,
    dur_us: i64,
    playing: bool,
    rate: f64,
    stamped: Instant,
    now: Instant,
) -> (String, String, f64) {
    let mut pos = pos_us;
    if playing && rate > 0.0 {
        pos += (now.duration_since(stamped).as_secs_f64() * rate * 1_000_000.0) as i64;
    }
    if dur_us > 0 {
        pos = pos.clamp(0, dur_us);
    } else {
        pos = pos.max(0);
    }
    let pct = if dur_us > 0 { (pos as f64 / dur_us as f64 * 100.0).min(100.0) } else { 0.0 };
    let left = if dur_us > 0 { dur_us - pos } else { 0 };
    (fmt_us(pos), format!("-{}", fmt_us(left)), pct)
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_owned();
    }
    let cut: String = text.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{cut}\u{2026}")
}

