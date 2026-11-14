# Lekuvo (🦎) — Dynamic Notch Bar for Linux

A lightweight, native macOS-style dynamic notch bar for Linux desktops (X11 / GNOME), built on **VelquView** — the pure-Rust HTML + Tailwind CSS native UI renderer — featuring **Lekuvo**, an animated chameleon companion.

```
       [ 🦎  11:03  ⠿ ]
```

---

## Highlights

- **Native VelquView UI**: Authored in plain HTML + Tailwind CSS utilities with reactive directives (`vx-state`, `@click`, `vx-show`, `vx-transition`). Rendered by VelquView using Taffy layout and software rasterization — **no Chromium, WebKit, or Electron runtime**.
- **Lekuvo Mascot**: Live blue-and-yellow chameleon companion with 12 moods (`lazy`, `awake`, `wave`, `listening`, `dance`, `sleep`, `surprised`, `dizzy`, `focus`, `thinking`, `success`, `alert`). Automatically dances to music, waves on greeting, and reacts to user activity.
- **Micro Footprint**: **~0.03% idle CPU** and **~51 MB RSS memory** (compared to ~230 MB for WebKitGTK / ~800 MB for Chromium/Electron).
- **MPRIS2 Media Controls**: Real-time track metadata (title, artist, play/pause status) and transport controls (Play/Pause, Next, Previous) synchronized with Spotify, Chrome, VLC, and other desktop media players via DBus.
- **Free Placement with Edge-Aware Styling**: Drag by the grip handle to put the bar anywhere — it stays exactly where dropped (no zone snapping), and the pill's layout orientation (top- or bottom-flush styling) follows the dropped position's screen edge.
- **Click-Through Transparency**: Fully transparent window background with dynamic XShape input masking — transparent screen areas around the notch let all clicks pass through to your apps and desktop.
- **Mutter-Safe Always-On-Top**: Uses `_NET_WM_WINDOW_TYPE_DOCK` (visible through GNOME's show-desktop, no strut space reserved) and a periodic keep-above heartbeat to ensure the notch always stays above maximized and fullscreen windows without Mutter WM stacking glitches.

---

## Architecture & Workspace

```
lekuvo/
├── Cargo.toml                  # Cargo workspace definition
├── rust-toolchain.toml         # Pinned Rust 1.96.0 toolchain
├── lekuvo.desktop              # Desktop launcher entry
├── lekuvo.png                  # Application icon (256x256)
├── app/                        # VelquView UI document
│   ├── index.html              # Pill, expanded card, reactive state & transitions
│   └── 01-notch.css            # Author stylesheet (transparency & hover states)
├── assets/mascot/              # Baked chameleon animation sprites (PNG + manifest)
├── tools/mascot-bake/          # Automated sprite baking harness
├── vendor/lekuvo-svg-kit/      # Original layered SVG source & state machine
└── crates/
    ├── lekuvo-host/            # X11 ARGB overlay window (x11rb, XShape, SHM, EWMH)
    ├── lekuvo-mascot/          # Chameleon mood controller & sprite compositing
    ├── lekuvo-media/           # MPRIS2 player discovery & control worker (zbus)
    └── lekuvo-app/             # Main application binary wiring VelquView & host
```

### Host State-Write Seam (VelquView ADR 0025)

Lekuvo pushes live desktop state (clock, media metadata, zone placement) directly into VelquView via `VelquView::write_state(path, value)`:
- Executes as a bounded, transactional reactive turn.
- Diffed mutations apply atomically with `vx-transition` animations supported.
- Clock updates run at 1 Hz with sub-millisecond execution time and zero document reloads.

---

## Building & Running

### Prerequisites

- Linux with X11 / XWayland (Ubuntu 22.04+ / GNOME tested)
- Rust 1.87+ (stable or 1.96 toolchain)
- Development libraries: `libx11-dev`, `libxext-dev`

### Build

```bash
# Clone the repository
git clone https://github.com/ther12k/lekuvo.git
cd lekuvo

# Build release binary
cargo build --release
```

### Run

```bash
./target/release/lekuvo
```

### Install Desktop Launcher

```bash
cp lekuvo.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications/
```

Search for **Lekuvo** in GNOME Shell Dash or pin it to your Ubuntu Dock.

---

## Configuration

Settings are stored in `~/.config/lekuvo/settings.json`:

```json
{
  "island_x": 344,
  "island_y": 0,
  "auto_hide": false
}
```

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `island_x` | `integer` | top-center | Window x (root coordinates) the bar was dropped at, restored exactly at startup. |
| `island_y` | `integer` | top-center | Window y (root coordinates) the bar was dropped at, restored exactly at startup. |
| `auto_hide` | `boolean` | `false` | Automatically tuck the pill after idle timeout. |

Legacy `island_pos`/`island_sticky` keys from older builds are read once (the zone converts to a position) and replaced by exact coordinates on the next save.

---

## License

MIT © [Rizky Zulkarnaen](https://github.com/ther12k)
