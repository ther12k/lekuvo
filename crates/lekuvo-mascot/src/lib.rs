//! lekuvo-mascot — the Lekuvo chameleon: mood state machine and baked
//! sprite player.
//!
//! The controller is a faithful port of the mascot kit's
//! `state-machine.js` (deterministic, DOM-independent): persistent
//! activity channels with priorities, one expiring temporary reaction,
//! and priority-aware resolution. The kit's JS timers become a `tick`
//! the host drives from its own monotonic clock (never reset).
//!
//! The artwork itself is baked at build time from the kit's original
//! SVG (`tools/mascot-bake`) into per-mood PNG frame strips; this crate
//! decodes them once and composites frames onto the rendered notch
//! frame with source-over blending. Each strip carries its authored
//! cycle duration so native playback preserves the original pacing.

use std::collections::HashMap;
use std::path::Path;

/// The twelve moods, named exactly as the kit defines them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Mood {
    /// Relaxed default with sleepy eyes.
    Lazy,
    /// Available and attentive.
    Awake,
    /// A short greeting or acknowledgement.
    Wave,
    /// A listening activity is active.
    Listening,
    /// Media is playing.
    Dance,
    /// An explicit sleep state.
    Sleep,
    /// An unexpected event or error.
    Surprised,
    /// A playful reaction.
    Dizzy,
    /// A focus session is active.
    Focus,
    /// A task is running.
    Thinking,
    /// A task completed successfully.
    Success,
    /// A reminder needs attention.
    Alert,
}

impl Mood {
    /// The kit's mood names (`lazy`, `dance`, ...).
    pub fn as_str(self) -> &'static str {
        match self {
            Mood::Lazy => "lazy",
            Mood::Awake => "awake",
            Mood::Wave => "wave",
            Mood::Listening => "listening",
            Mood::Dance => "dance",
            Mood::Sleep => "sleep",
            Mood::Surprised => "surprised",
            Mood::Dizzy => "dizzy",
            Mood::Focus => "focus",
            Mood::Thinking => "thinking",
            Mood::Success => "success",
            Mood::Alert => "alert",
        }
    }

    /// Parses a kit mood name; unknown names fall back to `Lazy`
    /// (mirroring the component's invalid-attribute behavior).
    pub fn parse(name: &str) -> Mood {
        match name {
            "awake" => Mood::Awake,
            "wave" => Mood::Wave,
            "listening" => Mood::Listening,
            "dance" => Mood::Dance,
            "sleep" => Mood::Sleep,
            "surprised" => Mood::Surprised,
            "dizzy" => Mood::Dizzy,
            "focus" => Mood::Focus,
            "thinking" => Mood::Thinking,
            "success" => Mood::Success,
            "alert" => Mood::Alert,
            _ => Mood::Lazy,
        }
    }

    /// All moods in the kit's canonical order.
    pub const ALL: [Mood; 12] = [
        Mood::Lazy,
        Mood::Awake,
        Mood::Wave,
        Mood::Listening,
        Mood::Dance,
        Mood::Sleep,
        Mood::Surprised,
        Mood::Dizzy,
        Mood::Focus,
        Mood::Thinking,
        Mood::Success,
        Mood::Alert,
    ];
}

/// The seventeen application events the kit defines.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEvent {
    /// Set the fallback to `lazy`.
    Idle,
    /// Set the fallback to `awake`.
    Active,
    /// Start the persistent `focus` activity.
    FocusStart,
    /// End the persistent `focus` activity.
    FocusEnd,
    /// Start the persistent `listening` activity.
    ListeningStart,
    /// End the persistent `listening` activity.
    ListeningEnd,
    /// Start the persistent `dance` (media) activity.
    MediaPlay,
    /// End the persistent `dance` activity.
    MediaPause,
    /// Start the persistent `thinking` activity.
    Busy,
    /// End the persistent `thinking` activity.
    Ready,
    /// Enter persistent `sleep` and clear the temporary reaction.
    Sleep,
    /// Leave sleep, wave briefly, then resolve remaining activities.
    Wake,
    /// Temporary `wave` (priority 80).
    PointerWave,
    /// Temporary `success` (priority 80).
    TaskCompleted,
    /// Temporary `alert` (priority 85).
    ReminderDue,
    /// Temporary `surprised` (priority 90, higher than a reminder).
    Error,
    /// Temporary `dizzy` (priority 80).
    Dizzy,
}

/// Default durations (ms) per reaction, mirroring the kit.
const DURATIONS: &[(AppEvent, u64)] = &[
    (AppEvent::PointerWave, 1500),
    (AppEvent::TaskCompleted, 1800),
    (AppEvent::ReminderDue, 2600),
    (AppEvent::Error, 1600),
    (AppEvent::Dizzy, 1800),
];

fn default_duration(event: AppEvent) -> u64 {
    DURATIONS
        .iter()
        .find(|(e, _)| *e == event)
        .map(|(_, d)| *d)
        .unwrap_or(1500)
}

/// Default priorities per reaction, mirroring the kit exactly:
/// wave/success/dizzy = 80, reminder = 85, error = 90.
fn default_priority(event: AppEvent) -> u32 {
    match event {
        AppEvent::ReminderDue => 85,
        AppEvent::Error => 90,
        _ => 80,
    }
}

#[derive(Debug, Clone, Copy)]
struct Entry {
    mood: Mood,
    priority: u32,
    sequence: u64,
}

#[derive(Debug, Clone, Copy)]
struct Temporary {
    entry: Entry,
    /// Deadline on the controller clock, in milliseconds.
    deadline_ms: u64,
}

/// Priority-aware activity resolver, ported from the kit's
/// `MoodController`.
#[derive(Debug, Clone)]
pub struct MoodController {
    base: Mood,
    channels: Vec<(&'static str, Entry)>,
    temporary: Option<Temporary>,
    sequence: u64,
    current: Mood,
    /// Monotonic controller clock in ms; the host MUST advance it with
    /// an always-increasing value and never reset it.
    clock_ms: u64,
    /// Set when the resolved mood changed; the host clears it.
    pub changed: bool,
}

impl Default for MoodController {
    fn default() -> Self {
        Self::new()
    }
}

impl MoodController {
    /// A controller resting in `lazy`.
    pub fn new() -> Self {
        Self {
            base: Mood::Lazy,
            channels: Vec::new(),
            temporary: None,
            sequence: 0,
            current: Mood::Lazy,
            clock_ms: 0,
            changed: false,
        }
    }

    /// The currently resolved mood.
    pub fn mood(&self) -> Mood {
        self.current
    }

    /// The controller clock (ms since launch).
    pub fn clock_ms(&self) -> u64 {
        self.clock_ms
    }

    fn resolve(&self) -> Entry {
        let mut result = Entry {
            mood: self.base,
            priority: 0,
            sequence: 0,
        };
        for (_, candidate) in &self.channels {
            if candidate.priority > result.priority
                || (candidate.priority == result.priority
                    && candidate.sequence > result.sequence)
            {
                result = *candidate;
            }
        }
        if let Some(temp) = &self.temporary
            && (temp.entry.priority > result.priority
                || (temp.entry.priority == result.priority
                    && temp.entry.sequence > result.sequence))
        {
            result = temp.entry;
        }
        result
    }

    fn publish(&mut self) {
        let next = self.resolve().mood;
        if next != self.current {
            self.current = next;
            self.changed = true;
        }
    }

    /// Changes only the fallback mood; channels and the temporary
    /// reaction stay intact.
    pub fn set_base(&mut self, mood: Mood) {
        self.base = mood;
        self.publish();
    }

    /// A manual selection. Without a duration it clears channels and
    /// the temporary and keeps `mood`; with a duration it is a
    /// priority-aware temporary reaction at the given priority.
    /// Returns whether a temporary request was accepted.
    pub fn set_mood_with(&mut self, mood: Mood, duration_ms: u64, priority: u32) -> bool {
        if priority < self.resolve().priority {
            return false;
        }
        self.sequence += 1;
        self.temporary = Some(Temporary {
            entry: Entry {
                mood,
                priority,
                sequence: self.sequence,
            },
            deadline_ms: self.clock_ms.saturating_add(duration_ms),
        });
        self.publish();
        true
    }

    /// A manual selection without a duration: clears all activity and
    /// keeps `mood` as the base.
    pub fn set_mood(&mut self, mood: Mood) {
        self.temporary = None;
        self.channels.clear();
        self.base = mood;
        self.publish();
    }

    fn channel(&mut self, key: &'static str, mood: Mood, priority: u32) {
        self.sequence += 1;
        let entry = Entry {
            mood,
            priority,
            sequence: self.sequence,
        };
        match self.channels.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = entry,
            None => self.channels.push((key, entry)),
        }
        self.publish();
    }

    fn remove_channel(&mut self, key: &str) {
        self.channels.retain(|(k, _)| *k != key);
        self.publish();
    }

    /// Handles one application event. The controller clock must be
    /// advanced (via [`tick`](Self::tick)) before events so deadlines
    /// are computed against the current time.
    pub fn trigger(&mut self, event: AppEvent) -> bool {
        match event {
            AppEvent::Idle => self.set_base(Mood::Lazy),
            AppEvent::Active => self.set_base(Mood::Awake),
            AppEvent::FocusStart => self.channel("focus", Mood::Focus, 35),
            AppEvent::FocusEnd => self.remove_channel("focus"),
            AppEvent::ListeningStart => self.channel("listening", Mood::Listening, 70),
            AppEvent::ListeningEnd => self.remove_channel("listening"),
            AppEvent::MediaPlay => self.channel("media", Mood::Dance, 30),
            AppEvent::MediaPause => self.remove_channel("media"),
            AppEvent::Busy => self.channel("busy", Mood::Thinking, 45),
            AppEvent::Ready => self.remove_channel("busy"),
            AppEvent::Sleep => {
                self.temporary = None;
                self.channel("sleep", Mood::Sleep, 100);
            }
            AppEvent::Wake => {
                self.channels.retain(|(k, _)| *k != "sleep");
                self.base = Mood::Awake;
                self.set_mood_with(Mood::Wave, 1500, 80);
                self.publish();
            }
            // Temporary reactions: kit-priority-aware, expiring.
            AppEvent::PointerWave
            | AppEvent::TaskCompleted
            | AppEvent::ReminderDue
            | AppEvent::Error
            | AppEvent::Dizzy => {
                let mood = match event {
                    AppEvent::PointerWave => Mood::Wave,
                    AppEvent::TaskCompleted => Mood::Success,
                    AppEvent::ReminderDue => Mood::Alert,
                    AppEvent::Error => Mood::Surprised,
                    _ => Mood::Dizzy,
                };
                self.set_mood_with(mood, default_duration(event), default_priority(event));
            }
        }
        true
    }

    /// Advances the controller clock (an absolute, always-increasing
    /// millisecond counter the host owns, e.g. time since launch) and
    /// expires the temporary reaction when its deadline passes — the
    /// Rust form of the kit's `setTimeout`. Never reset this value.
    pub fn tick(&mut self, now_ms: u64) {
        // Defensive monotonic clamp: a host bug must not extend
        // deadlines by rewinding the clock.
        self.clock_ms = self.clock_ms.max(now_ms);
        if let Some(temp) = &self.temporary
            && self.clock_ms >= temp.deadline_ms
        {
            self.temporary = None;
            self.publish();
        }
    }

    /// Clears all activity and returns to `lazy`.
    pub fn reset(&mut self) {
        self.temporary = None;
        self.channels.clear();
        self.base = Mood::Lazy;
        self.publish();
    }
}

// ---------------------------------------------------------------------------
// Sprite store: baked PNG frames + source-over compositing.
// ---------------------------------------------------------------------------

/// One mood variant's animation strip: decoded RGBA frames plus the
/// authored cycle duration (ms) and whether the animation loops.
struct Strip {
    width: u32,
    height: u32,
    frames: Vec<Vec<u8>>,
    duration_ms: u64,
    looping: bool,
}

impl Strip {
    /// Duration of one frame in the cycle.
    fn frame_ms(&self) -> u64 {
        if self.frames.is_empty() {
            return u64::MAX;
        }
        (self.duration_ms / self.frames.len() as u64).max(1)
    }

    fn frame_index(&self, elapsed_ms: u64) -> usize {
        if self.frames.len() <= 1 {
            return 0;
        }
        if !self.looping && elapsed_ms >= self.duration_ms {
            return self.frames.len() - 1;
        }
        ((elapsed_ms / self.frame_ms()) % self.frames.len() as u64) as usize
    }

    /// Milliseconds until the next frame boundary from `elapsed_ms`
    /// (used for redraw scheduling).
    fn ms_to_next_frame(&self, elapsed_ms: u64) -> u64 {
        let frame_ms = self.frame_ms();
        if frame_ms == u64::MAX {
            return u64::MAX;
        }
        frame_ms - (elapsed_ms % frame_ms)
    }
}

/// The decoded `assets/mascot` directory.
pub struct SpriteStore {
    strips: HashMap<(Mood, &'static str), Strip>,
}

#[derive(serde::Deserialize)]
struct ManifestEntry {
    frames: u32,
    #[serde(default = "default_duration_ms")]
    duration_ms: u64,
    #[serde(default = "default_looping", rename = "loop")]
    loops: bool,
}

fn default_duration_ms() -> u64 {
    1800
}

fn default_looping() -> bool {
    true
}

#[derive(serde::Deserialize)]
struct Manifest {
    /// `"dance": {"full": {frames, duration_ms, loop}, ...}`.
    moods: HashMap<String, HashMap<String, ManifestEntry>>,
}

impl SpriteStore {
    /// Loads every strip described by `manifest.json` in `dir`.
    /// Files are named `{mood}-{variant}-{NN}.png`.
    pub fn load(dir: &Path) -> Result<Self, String> {
        let manifest_path = dir.join("manifest.json");
        let manifest: Manifest = serde_json::from_str(
            &std::fs::read_to_string(&manifest_path)
                .map_err(|e| format!("read {}: {e}", manifest_path.display()))?,
        )
        .map_err(|e| format!("parse {}: {e}", manifest_path.display()))?;
        let mut strips = HashMap::new();
        for (mood_name, variants) in &manifest.moods {
            let mood = Mood::parse(mood_name);
            for (variant, entry) in variants {
                let variant_key: &'static str = match variant.as_str() {
                    "full" => "full",
                    "compact" => "compact",
                    _ => continue,
                };
                let mut frames = Vec::with_capacity(entry.frames as usize);
                let (mut width, mut height) = (0u32, 0u32);
                for index in 0..entry.frames {
                    let path = dir.join(format!("{mood_name}-{variant}-{index:02}.png"));
                    let decoded = image::open(&path)
                        .map_err(|e| format!("decode {}: {e}", path.display()))?
                        .to_rgba8();
                    width = decoded.width();
                    height = decoded.height();
                    frames.push(decoded.into_raw());
                }
                if !frames.is_empty() {
                    strips.insert(
                        (mood, variant_key),
                        Strip {
                            width,
                            height,
                            frames,
                            duration_ms: entry.duration_ms,
                            looping: entry.loops,
                        },
                    );
                }
            }
        }
        Ok(Self { strips })
    }

    fn strip(&self, mood: Mood, variant: &str) -> Option<&Strip> {
        self.strips.get(&(mood, match variant {
            "full" => "full",
            _ => "compact",
        }))
    }

    /// The frame for `mood`/`variant` at `elapsed_ms` of the animation
    /// playback clock, honoring the authored cycle duration. One-shot
    /// strips hold their final frame. Returns `(rgba, width, height)`.
    pub fn frame(&self, mood: Mood, variant: &str, elapsed_ms: u64) -> Option<(&[u8], u32, u32)> {
        let strip = self.strip(mood, variant)?;
        let index = strip.frame_index(elapsed_ms);
        Some((strip.frames[index].as_slice(), strip.width, strip.height))
    }

    /// Whether the mood has more than one frame in this variant.
    pub fn is_animated(&self, mood: Mood, variant: &str) -> bool {
        self.strip(mood, variant).is_some_and(|s| s.frames.len() > 1)
    }

    /// Milliseconds until the next frame change across the given
    /// variants, for redraw scheduling. Returns `u64::MAX` when no
    /// visible variant animates.
    pub fn ms_to_next_frame(&self, mood: Mood, variants: &[&str], elapsed_ms: u64) -> u64 {
        variants
            .iter()
            .filter_map(|v| self.strip(mood, v))
            .filter(|s| s.frames.len() > 1)
            .map(|s| s.ms_to_next_frame(elapsed_ms))
            .min()
            .unwrap_or(u64::MAX)
    }
}

/// Composites one RGBA sprite onto an RGBA destination buffer
/// (source-over), scaling to `rect` with nearest-neighbor sampling.
pub fn composite(
    dst: &mut [u8],
    dst_width: u32,
    rect: (u32, u32, u32, u32),
    sprite: &[u8],
    sprite_width: u32,
    sprite_height: u32,
) {
    let (rx, ry, rw, rh) = rect;
    if rw == 0 || rh == 0 || sprite_width == 0 || sprite_height == 0 {
        return;
    }
    let dst_h = (dst.len() / (dst_width as usize * 4)) as u32;
    for y in 0..rh {
        let dy = ry + y;
        if dy >= dst_h {
            break;
        }
        let sy = y * sprite_height / rh;
        for x in 0..rw {
            let dx = rx + x;
            if dx >= dst_width {
                break;
            }
            let sx = x * sprite_width / rw;
            let s = (sy * sprite_width + sx) as usize * 4;
            let Some(sr) = sprite.get(s..s + 4) else {
                continue;
            };
            let d = (dy * dst_width + dx) as usize * 4;
            let Some(dr) = dst.get_mut(d..d + 4) else {
                continue;
            };
            let sa = sr[3] as u32;
            if sa == 0 {
                continue;
            }
            if sa == 255 {
                dr.copy_from_slice(sr);
                continue;
            }
            let da = dr[3] as u32;
            let out_a = sa + da * (255 - sa) / 255;
            for c in 0..3 {
                let sc = sr[c] as u32 * sa;
                let dc = dr[c] as u32 * da * (255 - sa) / 255;
                dr[c] = if out_a == 0 {
                    0
                } else {
                    ((sc + dc) / out_a).min(255) as u8
                };
            }
            dr[3] = out_a.min(255) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_channels_and_temporary_reactions_resolve() {
        let mut moods = MoodController::new();
        moods.tick(0);
        moods.trigger(AppEvent::MediaPlay);
        assert_eq!(moods.mood(), Mood::Dance);
        moods.trigger(AppEvent::TaskCompleted);
        assert_eq!(moods.mood(), Mood::Success, "temporary outranks media");
        moods.tick(1800);
        assert_eq!(moods.mood(), Mood::Dance, "expired reaction returns to media");
        moods.trigger(AppEvent::MediaPause);
        assert_eq!(moods.mood(), Mood::Lazy);
    }

    #[test]
    fn listening_outranks_music_and_focus() {
        let mut moods = MoodController::new();
        moods.tick(0);
        moods.trigger(AppEvent::FocusStart);
        assert_eq!(moods.mood(), Mood::Focus);
        moods.trigger(AppEvent::MediaPlay);
        assert_eq!(moods.mood(), Mood::Focus, "focus (35) outranks media (30)");
        moods.trigger(AppEvent::ListeningStart);
        assert_eq!(moods.mood(), Mood::Listening);
        moods.trigger(AppEvent::ListeningEnd);
        assert_eq!(moods.mood(), Mood::Focus);
    }

    #[test]
    fn sleep_wins_and_wake_waves() {
        let mut moods = MoodController::new();
        moods.tick(0);
        moods.trigger(AppEvent::MediaPlay);
        moods.trigger(AppEvent::Sleep);
        assert_eq!(moods.mood(), Mood::Sleep);
        moods.trigger(AppEvent::Wake);
        assert_eq!(moods.mood(), Mood::Wave);
        moods.tick(1500);
        assert_eq!(moods.mood(), Mood::Dance, "media survives the wake wave");
    }

    #[test]
    fn error_outranks_wave_and_reminder() {
        // Kit contract: error (90) > reminder (85) > wave/success (80).
        let mut moods = MoodController::new();
        moods.tick(0);
        moods.trigger(AppEvent::Error);
        assert_eq!(moods.mood(), Mood::Surprised);
        moods.trigger(AppEvent::PointerWave);
        assert_eq!(
            moods.mood(),
            Mood::Surprised,
            "a later wave (80) cannot replace an error (90)"
        );
        moods.trigger(AppEvent::ReminderDue);
        assert_eq!(
            moods.mood(),
            Mood::Surprised,
            "a reminder (85) cannot replace an error (90)"
        );

        let mut reminder = MoodController::new();
        reminder.tick(0);
        reminder.trigger(AppEvent::ReminderDue);
        assert_eq!(reminder.mood(), Mood::Alert);
        reminder.trigger(AppEvent::TaskCompleted);
        assert_eq!(
            reminder.mood(),
            Mood::Alert,
            "a success reaction (80) cannot replace a reminder (85)"
        );
    }

    #[test]
    fn reaction_expires_correctly_after_long_uptime() {
        // Regression: a host that resets the animation clock must not
        // extend reaction deadlines (the controller clock never resets).
        let mut moods = MoodController::new();
        moods.tick(60_000);
        moods.trigger(AppEvent::PointerWave);
        assert_eq!(moods.mood(), Mood::Wave);
        // Host resets its *playback* clock; controller keeps its own.
        moods.tick(1_000);
        assert_eq!(
            moods.mood(),
            Mood::Wave,
            "controller clock is monotonic, not reset"
        );
        moods.tick(61_499);
        assert_eq!(moods.mood(), Mood::Wave);
        moods.tick(61_500);
        assert_eq!(moods.mood(), Mood::Lazy, "wave expires at its deadline");
    }

    #[test]
    fn frame_selection_honors_authored_duration() {
        // lazy: 8 frames over 9000ms => 1125ms per frame.
        let store = SpriteStore {
            strips: HashMap::from([(
                (Mood::Lazy, "compact"),
                Strip {
                    width: 28,
                    height: 28,
                    frames: vec![vec![0; 28 * 28 * 4]; 8],
                    duration_ms: 9000,
                    looping: true,
                },
            )]),
        };
        let (frame, _, _) = store.frame(Mood::Lazy, "compact", 0).unwrap();
        assert_eq!(frame.len(), 28 * 28 * 4);
        // At 1124ms still frame 0; at 1125ms frame 1; at 9000ms frame 0 (loop).
        assert_eq!(index_for(&store, Mood::Lazy, "compact", 1124), 0);
        assert_eq!(index_for(&store, Mood::Lazy, "compact", 1125), 1);
        assert_eq!(index_for(&store, Mood::Lazy, "compact", 9000), 0);
    }

    fn index_for(store: &SpriteStore, mood: Mood, variant: &str, elapsed: u64) -> usize {
        let strip = store.strip(mood, variant).unwrap();
        strip.frame_index(elapsed)
    }

    #[test]
    fn one_shot_strips_hold_final_frame() {
        let store = SpriteStore {
            strips: HashMap::from([(
                (Mood::Surprised, "compact"),
                Strip {
                    width: 28,
                    height: 28,
                    frames: vec![vec![0; 28 * 28 * 4]; 4],
                    duration_ms: 480,
                    looping: false,
                },
            )]),
        };
        assert_eq!(index_for(&store, Mood::Surprised, "compact", 100), 0);
        assert_eq!(index_for(&store, Mood::Surprised, "compact", 470), 3);
        // After the one-shot completes, hold the last frame.
        assert_eq!(index_for(&store, Mood::Surprised, "compact", 10_000), 3);
    }

    #[test]
    fn compositing_blends_and_replaces() {
        // 2x2 red dst, 1x1 half-transparent blue sprite scaled to 2x2.
        let mut dst = [255u8, 0, 0, 255].repeat(4);
        let sprite = vec![0u8, 0, 255, 128];
        composite(&mut dst, 2, (0, 0, 2, 2), &sprite, 1, 1);
        // All pixels: blend of red over blue at 50% -> (128,0,127,255)-ish.
        assert_eq!(dst[3], 255);
        assert!((dst[0] as i32 - 128).abs() <= 1);
        let opaque = vec![0u8, 0, 255, 255];
        composite(&mut dst, 2, (0, 0, 2, 2), &opaque, 1, 1);
        assert_eq!(&dst[0..4], &[0, 0, 255, 255]);
    }
}
