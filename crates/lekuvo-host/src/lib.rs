//! lekuvo-host — the X11 overlay window for the Lekuvo notch.
//!
//! VelquView is window-agnostic (`render(viewport) -> Frame` RGBA8), so
//! this crate owns everything `velqu-shell` cannot do for a notch bar:
//! a depth-32 ARGB window with per-pixel transparency, no decorations,
//! always-on-top, XShape input regions for click-through, and a
//! low-CPU poll loop that waits on the X socket instead of spinning.
//!
//! The overlay lessons come from the Layzee GTK port: a
//! `_NET_WM_WINDOW_TYPE_NOTIFICATION` window is exempt from Mutter's
//! workarea/maximize heuristic (which silently denies client restacks
//! for maximized windows), and a periodic re-assert of
//! `_NET_WM_STATE_ABOVE` recovers the top position from later-raised
//! keep-above windows.

use std::os::unix::io::AsRawFd;

use x11rb::connection::Connection;
use x11rb::errors::ReplyOrIdError;
use x11rb::protocol::shape::ConnectionExt as _;
use x11rb::protocol::shm::ConnectionExt as _;
use x11rb::protocol::xproto::{
    AtomEnum, ClientMessageEvent, ConfigureWindowAux, ConnectionExt as XProtoExt,
    CreateGCAux, CreateWindowAux, EventMask, PropMode, VisualClass, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

x11rb::atom_manager! {
    /// EWMH atoms the notch sets or reads.
    pub Atoms: AtomCookies {
        WM_NAME,
        UTF8_STRING,
        _NET_WM_NAME,
        _NET_WM_WINDOW_TYPE,
        _NET_WM_WINDOW_TYPE_NOTIFICATION,
        _NET_WM_STATE,
        _NET_WM_STATE_ABOVE,
        _NET_WM_STATE_SKIP_TASKBAR,
        _NET_WM_STATE_SKIP_PAGER,
        _NET_WORKAREA,
    }
}

/// Errors surfaced by the host window.
#[derive(Debug, thiserror::Error)]
pub enum HostError {
    /// No X server connection could be established.
    #[error("cannot connect to the X server: {0}")]
    Connect(String),
    /// The X protocol rejected a request.
    #[error("X request failed: {0}")]
    X11(String),
    /// The frame does not match the window size.
    #[error("frame of {given} bytes does not match the {expected}-byte window")]
    FrameSize {
        /// Actual byte count.
        given: usize,
        /// Expected byte count for the current window size.
        expected: usize,
    },
}

impl From<ReplyOrIdError> for HostError {
    fn from(error: ReplyOrIdError) -> Self {
        HostError::X11(error.to_string())
    }
}

impl From<x11rb::errors::ConnectionError> for HostError {
    fn from(error: x11rb::errors::ConnectionError) -> Self {
        HostError::X11(error.to_string())
    }
}

impl From<x11rb::errors::ReplyError> for HostError {
    fn from(error: x11rb::errors::ReplyError) -> Self {
        HostError::X11(error.to_string())
    }
}

/// Window geometry in root coordinates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Geometry {
    /// Root-relative x.
    pub x: i16,
    /// Root-relative y.
    pub y: i16,
    /// Width in pixels.
    pub width: u16,
    /// Height in pixels.
    pub height: u16,
}

/// Events the host surfaces to the app. Coordinates are window-relative
/// physical pixels, matching `VelquView`'s pointer input space.
#[derive(Debug, Clone, PartialEq)]
pub enum HostEvent {
    /// Pointer moved over the window.
    Motion {
        /// Window-relative x.
        x: f32,
        /// Window-relative y.
        y: f32,
        /// Root x (drag math must use this: window-relative coordinates
        /// lag behind the window's own moves).
        rx: f32,
        /// Root y.
        ry: f32,
    },
    /// Left button pressed.
    LeftPress {
        /// Window-relative x.
        x: f32,
        /// Window-relative y.
        y: f32,
        /// Root x at press.
        rx: f32,
        /// Root y at press.
        ry: f32,
    },
    /// Left button released.
    LeftRelease {
        /// Window-relative x.
        x: f32,
        /// Window-relative y.
        y: f32,
    },
    /// Vertical wheel scroll (positive = content moves down).
    Wheel {
        /// Window-relative x.
        x: f32,
        /// Window-relative y.
        y: f32,
        /// Browser-signed delta in device pixels.
        dy: f32,
    },
    /// Pointer entered the window.
    Enter {
        /// Window-relative x.
        x: f32,
        /// Window-relative y.
        y: f32,
    },
    /// Pointer left the window.
    Leave,
    /// The window (or a region of it) needs repainting.
    Expose,
    /// The window's geometry changed.
    Configure(Box<Geometry>),
    /// The window was destroyed.
    Destroyed,
}

/// Configuration for the overlay window.
#[derive(Debug, Clone)]
pub struct HostConfig {
    /// Initial width in pixels.
    pub width: u16,
    /// Initial height in pixels.
    pub height: u16,
    /// Initial root x position.
    pub x: i16,
    /// Initial root y position.
    pub y: i16,
}

/// One live shared-memory segment used for frame presentation.
struct ShmState {
    shmid: i32,
    /// Mapped memory, `width * height * 4` bytes, main-thread only.
    addr: *mut u32,
    seg: u32,
}

// The mapping is only touched from the main thread and never shared;
// the pointer never leaves this struct.
unsafe impl Send for ShmState {}

impl Drop for ShmState {
    fn drop(&mut self) {
        unsafe {
            libc::shmdt(self.addr.cast_const().cast());
            // IPC_RMID now that the X server has attached: the segment
            // dies with the last detach instead of leaking.
            libc::shmctl(self.shmid, libc::IPC_RMID, std::ptr::null_mut());
        }
    }
}

/// The notch overlay window.
pub struct NotchWindow {
    conn: RustConnection,
    screen: usize,
    wid: u32,
    gc: u32,
    width: u16,
    height: u16,
    atoms: Atoms,
    shm: Option<ShmState>,
    /// Whether the visual carries per-pixel alpha (depth 32).
    pub has_alpha: bool,
}

impl NotchWindow {
    /// Connects, creates the ARGB overlay window, and maps it.
    pub fn create(config: &HostConfig) -> Result<Self, HostError> {
        let (conn, screen) =
            x11rb::connect(None).map_err(|error| HostError::Connect(error.to_string()))?;
        let setup = conn.setup();
        let root = setup.roots[screen].root;
        let atoms = Atoms::new(&conn)?.reply()?;

        // A depth-32 TrueColor visual gives per-pixel alpha on any
        // composited desktop (GNOME, XWayland). Fall back to the
        // default visual with a warning rather than refusing to run.
        let mut chosen: Option<(u8, u32)> = None;
        for depth in setup.roots[screen].allowed_depths.iter() {
            if depth.depth != 32 {
                continue;
            }
            for visual in depth.visuals.iter() {
                if visual.class == VisualClass::TRUE_COLOR {
                    chosen = Some((32, visual.visual_id));
                }
            }
        }
        let has_alpha = chosen.is_some();
        if !has_alpha {
            chosen = Some((
                setup.roots[screen].root_depth,
                setup.roots[screen].root_visual,
            ));
            eprintln!("lekuvo: no 32-bit TrueColor visual; running without per-pixel alpha");
        }
        let (depth, visual_id) = chosen.expect("default visual always exists");

        let colormap = conn.generate_id()?;
        conn.create_colormap(
            x11rb::protocol::xproto::ColormapAlloc::NONE,
            colormap,
            root,
            visual_id,
        )?
        .check()?;

        let wid = conn.generate_id()?;
        conn.create_window(
            depth,
            wid,
            root,
            config.x,
            config.y,
            config.width,
            config.height,
            0,
            WindowClass::INPUT_OUTPUT,
            visual_id,
            &CreateWindowAux::new()
                .background_pixel(0)
                .border_pixel(0)
                .colormap(colormap)
                .event_mask(
                    EventMask::EXPOSURE
                        | EventMask::STRUCTURE_NOTIFY
                        | EventMask::POINTER_MOTION
                        | EventMask::BUTTON_PRESS
                        | EventMask::BUTTON_RELEASE
                        | EventMask::ENTER_WINDOW
                        | EventMask::LEAVE_WINDOW,
                ),
        )?
        .check()?;

        let gc = conn.generate_id()?;
        conn.create_gc(gc, wid, &CreateGCAux::new().graphics_exposures(0))?
            .check()?;

        let mut window = Self {
            shm: None,
            conn,
            screen,
            wid,
            gc,
            width: config.width,
            height: config.height,
            atoms,
            has_alpha,
        };
        window.apply_wm_properties();
        window.attach_shm();
        window.conn.map_window(window.wid)?.check()?;
        window.conn.flush()?;
        Ok(window)
    }

    /// EWMH identity: a notification-type, keep-above window that never
    /// appears in the taskbar or pager.
    fn apply_wm_properties(&mut self) {
        let a = &self.atoms;
        if let Ok(cookie) =
                self.conn
            .change_property8(
                PropMode::REPLACE,
                self.wid,
                a.WM_NAME,
                AtomEnum::STRING,
                b"Lekuvo",
            )
                {
                let _ = cookie.check();
            }
        if let Ok(cookie) =
                self.conn
            .change_property8(
                PropMode::REPLACE,
                self.wid,
                a._NET_WM_NAME,
                a.UTF8_STRING,
                b"Lekuvo",
            )
                {
                let _ = cookie.check();
            }
        if let Ok(cookie) =
                self.conn
            .change_property32(
                PropMode::REPLACE,
                self.wid,
                a._NET_WM_WINDOW_TYPE,
                AtomEnum::ATOM,
                &[a._NET_WM_WINDOW_TYPE_NOTIFICATION],
            )
                {
                let _ = cookie.check();
            }
        if let Ok(cookie) =
                self.conn
            .change_property32(
                PropMode::REPLACE,
                self.wid,
                a._NET_WM_STATE,
                AtomEnum::ATOM,
                &[
                    a._NET_WM_STATE_ABOVE,
                    a._NET_WM_STATE_SKIP_TASKBAR,
                    a._NET_WM_STATE_SKIP_PAGER,
                ],
            )
                {
                let _ = cookie.check();
            }
        let _ = self.conn.flush();
    }

    /// Best-effort SHM segment; presentation falls back to `PutImage`
    /// over the socket when any step fails.
    fn attach_shm(&mut self) {
        let len = self.width as usize * self.height as usize * 4;
        let shmid = unsafe { libc::shmget(libc::IPC_PRIVATE, len, libc::IPC_CREAT | 0o600) };
        if shmid < 0 {
            eprintln!("lekuvo: shmget failed; falling back to PutImage");
            return;
        }
        let addr = unsafe { libc::shmat(shmid, std::ptr::null::<libc::c_void>(), 0) };
        if addr as isize == -1 {
            unsafe { libc::shmctl(shmid, libc::IPC_RMID, std::ptr::null_mut()) };
            eprintln!("lekuvo: shmat failed; falling back to PutImage");
            return;
        }
        let seg = match self.conn.generate_id() {
            Ok(seg) => seg,
            Err(_) => {
                unsafe {
                    libc::shmdt(addr.cast_const().cast());
                    libc::shmctl(shmid, libc::IPC_RMID, std::ptr::null_mut());
                }
                eprintln!("lekuvo: no X id for the shm segment; falling back to PutImage");
                return;
            }
        };
        let attached = self
            .conn
            .shm_attach(seg, shmid as u32, true)
            .map(|cookie| cookie.check());
        if let Err(error) = attached {
            unsafe {
                libc::shmdt(addr.cast_const().cast());
                libc::shmctl(shmid, libc::IPC_RMID, std::ptr::null_mut());
            }
            eprintln!("lekuvo: XShm attach failed ({error}); falling back to PutImage");
            return;
        }
        self.shm = Some(ShmState {
            shmid,
            addr: addr.cast(),
            seg,
        });
    }

    fn root(&self) -> u32 {
        self.conn.setup().roots[self.screen].root
    }

    /// The window id (for diagnostics and tests).
    pub fn window_id(&self) -> u32 {
        self.wid
    }

    /// Current window size.
    pub fn size(&self) -> (u16, u16) {
        (self.width, self.height)
    }

    /// Presents one RGBA8 frame (tightly packed, `width * 4` stride).
    /// The alpha channel reaches the screen through the depth-32
    /// visual; transparent pixels let the desktop show through.
    pub fn present(&mut self, frame: &[u8]) -> Result<(), HostError> {
        let expected = self.width as usize * self.height as usize * 4;
        if frame.len() != expected {
            return Err(HostError::FrameSize {
                given: frame.len(),
                expected,
            });
        }
        if let Some(shm) = self.shm.as_mut() {
            // RGBA8 bytes -> native-endian ARGB32 as the visual expects.
            for (dst, px) in
                unsafe { std::slice::from_raw_parts_mut(shm.addr, expected / 4) }
                    .iter_mut()
                    .zip(frame.chunks_exact(4))
            {
                *dst = (px[3] as u32) << 24
                    | (px[0] as u32) << 16
                    | (px[1] as u32) << 8
                    | (px[2] as u32);
            }
            self.conn.shm_put_image(
                    self.wid,
                    self.gc,
                    self.width,
                    self.height,
                    0,
                    0,
                    self.width,
                    self.height,
                    0,
                    0,
                    32,
                    x11rb::protocol::xproto::ImageFormat::Z_PIXMAP.into(),
                    false,
                    shm.seg,
                    0,
                )?
                .check()?;
        } else {
            let mut pixels = Vec::with_capacity(expected);
            for px in frame.chunks_exact(4) {
                let argb: u32 = (px[3] as u32) << 24
                    | (px[0] as u32) << 16
                    | (px[1] as u32) << 8
                    | (px[2] as u32);
                pixels.extend_from_slice(&argb.to_ne_bytes());
            }
            self.conn.put_image(
                x11rb::protocol::xproto::ImageFormat::Z_PIXMAP,
                self.wid,
                self.gc,
                self.width,
                self.height,
                0,
                0,
                0,
                32,
                &pixels,
            )?;
        }
        self.conn.flush()?;
        Ok(())
    }

    /// Sets the click-through mask: only the given rectangles (in
    /// window coordinates) receive pointer input; everything else
    /// falls through to the windows below. An empty list makes the
    /// whole window click-through.
    pub fn set_input_region(&mut self, rects: &[Rectangle]) -> Result<(), HostError> {
        self.conn
            .shape_rectangles(
                x11rb::protocol::shape::SO::SET,
                x11rb::protocol::shape::SK::INPUT,
                x11rb::protocol::xproto::ClipOrdering::UNSORTED,
                self.wid,
                0,
                0,
                rects,
            )?
            .check()?;
        self.conn.flush()?;
        Ok(())
    }

    /// Moves the window without resizing.
    pub fn move_window(&mut self, x: i16, y: i16) -> Result<(), HostError> {
        self.conn
            .configure_window(self.wid, &ConfigureWindowAux::new().x(x as i32).y(y as i32))?
            .check()?;
        self.conn.flush()?;
        Ok(())
    }

    /// Re-asserts keep-above: an EWMH state-add client message plus a
    /// direct restack. Called periodically (and skipped while dragging)
    /// so windows raised later cannot cover the notch for long.
    pub fn reassert_above(&mut self) -> Result<(), HostError> {
        let root = self.root();
        let words: [u32; 4] = [
            1, // _NET_WM_STATE_ADD
            self.atoms._NET_WM_STATE_ABOVE,
            0,
            1, // source indication: application
        ];
        let mut data = [0u8; 20];
        for (slot, word) in data.chunks_exact_mut(4).zip(words) {
            slot.copy_from_slice(&word.to_ne_bytes());
        }
        let message = ClientMessageEvent::new(32, self.wid, self.atoms._NET_WM_STATE, data);
        self.conn.send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            message,
        )?;
        self.conn
            .configure_window(
                self.wid,
                &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE),
            )?
            .check()?;
        self.conn.flush()?;
        Ok(())
    }

    /// The primary monitor's `_NET_WORKAREA` (usable region below
    /// panels and docks). Falls back to the full screen when the
    /// property is absent.
    pub fn workarea(&self) -> Geometry {
        let screen = &self.conn.setup().roots[self.screen];
        let fallback = Geometry {
            x: 0,
            y: 0,
            width: screen.width_in_pixels,
            height: screen.height_in_pixels,
        };
        let Ok(cookie) = self.conn.get_property(
            false,
            screen.root,
            self.atoms._NET_WORKAREA,
            AtomEnum::CARDINAL,
            0,
            4,
        ) else {
            return fallback;
        };
        let Ok(reply) = cookie.reply() else {
            return fallback;
        };
        let Some(mut words) = reply.value32() else {
            return fallback;
        };
        match (words.next(), words.next(), words.next(), words.next()) {
            (Some(x), Some(y), Some(w), Some(h)) => Geometry {
                x: x as i16,
                y: y as i16,
                width: w as u16,
                height: h as u16,
            },
            _ => fallback,
        }
    }

    /// Waits up to `timeout_ms` for the X socket to become readable,
    /// then drains and translates pending events. A negative timeout
    /// waits indefinitely; zero never waits. Returns events in order.
    pub fn poll_events(&mut self, timeout_ms: i32) -> Result<Vec<HostEvent>, HostError> {
        let debug = std::env::var_os("LEKUVO_DEBUG").is_some();
        let mut drained: Vec<HostEvent> = Vec::new();
        while let Some(event) = self.conn.poll_for_event()? {
            if debug {
                eprintln!("lekuvo-host: raw event {event:?}");
            }
            let destroyed = matches!(event, Event::DestroyNotify(_));
            drained.extend(translate(event));
            if destroyed {
                return Ok(drained);
            }
        }
        if drained.is_empty() && timeout_ms != 0 {
            self.conn.flush()?;
            let fd = self.conn.stream().as_raw_fd();
            let mut pollfd = libc::pollfd {
                fd,
                events: libc::POLLIN,
                revents: 0,
            };
            let ready = unsafe { libc::poll(&mut pollfd, 1, timeout_ms) };
            if std::env::var_os("LEKUVO_DEBUG").is_some() && ready > 0 {
                eprintln!("lekuvo-host: poll ready={ready} revents={:#x} timeout={timeout_ms}", pollfd.revents);
            }
            if ready > 0 {
                while let Some(event) = self.conn.poll_for_event()? {
                    let destroyed = matches!(event, Event::DestroyNotify(_));
                    drained.extend(translate(event));
                    if destroyed {
                        break;
                    }
                }
            }
        }
        Ok(drained)
    }
}

fn translate(event: Event) -> Vec<HostEvent> {
    match event {
        Event::MotionNotify(e) => vec![HostEvent::Motion {
            x: e.event_x as f32,
            y: e.event_y as f32,
            rx: e.root_x as f32,
            ry: e.root_y as f32,
        }],
        Event::ButtonPress(e) => match e.detail {
            1 => vec![HostEvent::LeftPress {
                x: e.event_x as f32,
                y: e.event_y as f32,
                rx: e.root_x as f32,
                ry: e.root_y as f32,
            }],
            // Buttons 4/5 are wheel up/down; X delivers them as presses.
            4 => vec![HostEvent::Wheel {
                x: e.event_x as f32,
                y: e.event_y as f32,
                dy: -40.0,
            }],
            5 => vec![HostEvent::Wheel {
                x: e.event_x as f32,
                y: e.event_y as f32,
                dy: 40.0,
            }],
            _ => Vec::new(),
        },
        Event::ButtonRelease(e) if e.detail == 1 => vec![HostEvent::LeftRelease {
            x: e.event_x as f32,
            y: e.event_y as f32,
        }],
        Event::EnterNotify(e) => vec![HostEvent::Enter {
            x: e.event_x as f32,
            y: e.event_y as f32,
        }],
        Event::LeaveNotify(_) => vec![HostEvent::Leave],
        Event::Expose(_) => vec![HostEvent::Expose],
        Event::ConfigureNotify(e) => vec![HostEvent::Configure(Box::new(Geometry {
            x: e.x,
            y: e.y,
            width: e.width,
            height: e.height,
        }))],
        Event::DestroyNotify(_) => vec![HostEvent::Destroyed],
        _ => Vec::new(),
    }
}

/// Convenience alias for callers building input rectangles.
pub use x11rb::protocol::xproto::Rectangle;

use x11rb::protocol::xproto::StackMode;
