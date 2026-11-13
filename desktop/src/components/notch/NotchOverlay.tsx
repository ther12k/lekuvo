import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMedia, useMixerApps } from "../../hooks/useMedia";
import { useSysStatus } from "../../hooks/useSysStatus";
import { AnimatePresence, motion } from "framer-motion";
import {
  BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Bell, BellOff,
  GripHorizontal, MousePointer2, Move, Pin,
  Volume2, VolumeX, Wifi, WifiOff, X,
} from "lucide-react";
import Lekuvo from "../Lekuvo";
import SystemPanel from "./SystemPanel";
import type { LekuvoMood, SkinId } from "../Lekuvo";
import { useNoise } from "../../hooks/useNoise";
import { useTheme } from "../../theme";
import type { NoiseKey } from "../../hooks/useNoise";
import { BREAK_SECONDS, FOCUS_SECONDS, POSITIONS, TABS, TIPS, fmt } from "./data";
import type { NoiseState, PosId, Song, TabId, Todo } from "./data";
import { BoardPanel, FocusPanel, MirrorPanel, MixerPanel, MusicPanel, NoisePanel, TodoPanel } from "./panels";

/* ───────── types ───────── */
type Toast =
  | { kind: "water" } | { kind: "todo"; text: string } | { kind: "prayer" } | { kind: "stretch" }
  | { kind: "update" } | { kind: "updating" } | { kind: "updated" } | { kind: "dictate" }
  | { kind: "pasted"; words: number } | { kind: "shot" } | { kind: "cheer"; msg: string; mood: LekuvoMood };
type Live = "music" | "focus" | "idle";
interface Action { label: string; primary?: boolean; run: () => void }
interface Described { mood: LekuvoMood; title: string; sub: string; actions?: Action[]; busy?: boolean; wave?: boolean }

const NOTCH = "var(--color-notch)";
const TASKBAR = 0; // overlay: no fake taskbar
const SH = 14; // size of the concave "shoulders" where the notch meets the screen edge
const SPRING = { type: "spring" as const, stiffness: 340, damping: 30 };
const HANG_W = 94; // hanging Lekuvo width → his hands sit 100/160 of the way down
const canHover = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;

function Eq({ color, active = true }: { color: string; active?: boolean }) {
  return (
    <div className="flex items-end gap-[2.5px] h-3.5 shrink-0">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={`w-[3px] h-full rounded-full ${active ? "wave-bar" : ""}`} style={{ background: color, animationDelay: `${i * 0.13}s`, animationDuration: `${0.6 + i * 0.1}s` }} />
      ))}
    </div>
  );
}

/* ───────── component ───────── */
export default function NotchOverlay() {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = true;
  const [size, setSize] = useState({ w: 760, h: 520 });

  // chrome / layout
  const mode = "notch" as const; // overlay: always notch style
  // live zone: the Rust side snaps the window after a drag and reports it
  const [pos, setPos] = useState<PosId>("t");
  useEffect(() => {
    const un = listen<PosId>("zone-changed", e => setPos(e.payload));
    return () => { un.then(f => f()); };
  }, []);
      const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [tab, setTab] = useState<TabId>("music");
  const [toast, setToast] = useState<Toast | null>(null);
  const [clock, setClock] = useState(() => new Date());

  /* window dragging: grab any notch surface to move the overlay, but only
     after real movement so plain clicks (open/pin) still land, and never
     from interactive controls inside the expanded panel */
  const drag = useRef<{ x: number; y: number; armed: boolean } | null>(null);
  const onDragDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, a, [role='slider']")) return;
    drag.current = { x: e.clientX, y: e.clientY, armed: true };
  };
  const onDragMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d?.armed) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
      d.armed = false;
      getCurrentWindow().startDragging().catch(err => console.error("lekuvo: startDragging failed:", err));
    }
  };
  const onDragEnd = () => { drag.current = null; };
  /* dedicated grip: grabs the window immediately, no movement threshold */
  const onHandleDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startDragging().catch(err => console.error("lekuvo: startDragging failed:", err));
  };

  // media + mixer + system status: real system state
  const media = useMedia();
  const mixer = useMixerApps();
  const sys = useSysStatus();
  const [volOpen, setVolOpen] = useState(false);
  const [volDrag, setVolDrag] = useState<number | null>(null);
  // focus (starts at 24:58, just like the character sheet)
  const [focusMode, setFocusMode] = useState<"focus" | "break">("focus");
  const [focusLeft, setFocusLeft] = useState(24 * 60 + 58);
  const [focusRun, setFocusRun] = useState(true);
  const [sessions, setSessions] = useState(2);
  // data — to-dos persist locally, start real (empty), not demo rows
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("lekuvo.todos") ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { localStorage.setItem("lekuvo.todos", JSON.stringify(todos)); } catch { /* private mode */ }
  }, [todos]);
  const [noise, setNoise] = useState<NoiseState>({
    rain: { on: false, vol: 55 }, forest: { on: false, vol: 50 }, waves: { on: false, vol: 50 }, kalimba: { on: false, vol: 45 },
    fire: { on: false, vol: 50 }, wind: { on: false, vol: 45 }, night: { on: false, vol: 45 }, deep: { on: false, vol: 40 },
  });
  const [water, setWater] = useState(3);
  const [liveTick, setLiveTick] = useState(0);

  const engine = useNoise();
  const touched = useRef(false);
  const timers = useRef<number[]>([]);
  const leaveTimer = useRef<number | null>(null);

  const theme = useTheme();
  const skin: SkinId = theme as SkinId;

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => {
    timers.current.forEach(id => window.clearTimeout(id));
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  }, []);

  /* measure stage */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* clock */
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  /* real music state derived from MPRIS */
  const playing = !!media.info?.playing;
  const artSrc = (media.info?.artUrl ?? "").length > 0
    ? media.info!.artUrl.startsWith("file://")
      ? convertFileSrc(media.info!.artUrl.replace(/^file:\/\//, ""))
      : media.info!.artUrl
    : undefined;
  const song: Song = media.info
    ? {
        title: media.info.title || "Unknown track",
        artist: media.info.artist || "Unknown artist",
        colors: ["#9DB2FF", "#4C5FD7"],
        dur: Math.max(1, media.info.lengthSec),
        lyrics: ["♪", "♫", media.info.title || "…"],
        source: "MPRIS",
        art: artSrc,
      }
    : { title: "Nothing playing", artist: "open your music player", colors: ["#9DB2FF", "#4C5FD7"], dur: 1, lyrics: ["♪"], source: "idle" };
  const t = Math.min(media.positionSec, song.dur);

  /* focus tick */
  useEffect(() => {
    if (!focusRun) return;
    const id = window.setInterval(() => setFocusLeft(l => Math.max(0, l - 1)), 1000);
    return () => window.clearInterval(id);
  }, [focusRun]);
  useEffect(() => {
    if (!focusRun || focusLeft > 0) return;
    if (focusMode === "focus") {
      setSessions(s => Math.min(4, s + 1));
      setFocusMode("break");
      setFocusLeft(BREAK_SECONDS);
      setToast({ kind: "cheer", msg: "Session done! Take 5 🎉", mood: "wow" });
    } else {
      setFocusMode("focus");
      setFocusLeft(FOCUS_SECONDS);
      setFocusRun(false);
      setToast({ kind: "cheer", msg: "Break over. Ready for round 2?", mood: "hello" });
    }
  }, [focusLeft, focusRun, focusMode]);

  /* live activity rotation in the compact pill */
  const lives = useMemo<Live[]>(() => {
    const a: Live[] = [];
    if (playing) a.push("music");
    if (focusRun) a.push("focus");
    return a.length ? a : ["idle"];
  }, [playing, focusRun]);
  useEffect(() => {
    if (lives.length < 2) return;
    const id = window.setInterval(() => setLiveTick(n => n + 1), 3800);
    return () => window.clearInterval(id);
  }, [lives.length]);
  const live = lives[liveTick % lives.length];

  /* toast auto-dismiss */
  useEffect(() => {
    if (!toast || hover) return;
    if (toast.kind === "dictate" || toast.kind === "updating") return;
    const short = toast.kind === "pasted" || toast.kind === "cheer" || toast.kind === "updated" || toast.kind === "shot";
    const id = window.setTimeout(() => setToast(null), short ? 2800 : 6500);
    return () => window.clearTimeout(id);
  }, [toast, hover]);

  /* friendly intro: Lekuvo pokes you once the demo is visible */
  useEffect(() => {
    if (!inView) return;
    const id = window.setTimeout(() => { if (!touched.current) setToast({ kind: "water" }); }, 2200);
    return () => window.clearTimeout(id);
  }, [inView]);

  /* ───────── actions ───────── */
  const fire = (next: Toast) => {
    touched.current = true;
    clearTimers();
    setPinned(false);
    setToast(next);
  };
  const runUpdate = () => {
    clearTimers();
    setToast({ kind: "updating" });
    schedule(() => setToast({ kind: "updated" }), 1900);
  };

  const toggleNoise = (k: NoiseKey) => {
    const cur = noise[k];
    if (cur.on) engine.stop(k);
    else engine.start(k, (cur.vol / 100) * 0.8);
    setNoise(n => ({ ...n, [k]: { ...n[k], on: !cur.on } }));
  };
  const volNoise = (k: NoiseKey, v: number) => {
    setNoise(n => ({ ...n, [k]: { ...n[k], vol: v } }));
    engine.setVolume(k, (v / 100) * 0.8);
  };

  /* ───────── hover / pin ───────── */
  const enter = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    touched.current = true;
    setHinted(true);
    setHover(true);
  };
  const leave = () => {
    leaveTimer.current = window.setTimeout(() => setHover(false), 160);
  };

  /* ───────── toast copy ───────── */
  const describe = (x: Toast): Described => {
    switch (x.kind) {
      case "water":
        return {
          mood: "sip", title: "Hydrate, friend!",
          sub: water >= 8 ? "You hit 8 glasses. Legend." : `Glass ${water + 1} of 8 is waiting`,
          actions: [
            { label: "Drank it", primary: true, run: () => { const w = Math.min(8, water + 1); setWater(w); setToast({ kind: "cheer", msg: `+1 glass · ${w}/8 today`, mood: "happy" }); } },
            { label: "Later", run: () => setToast(null) },
          ],
        };
      case "todo":
        return {
          mood: "reminder", title: x.text, sub: "Due right now. Lekuvo is poking you.",
          actions: [
            { label: "Done", primary: true, run: () => { setTodos(ts => ts.map(i => (i.text === x.text ? { ...i, done: true } : i))); setToast({ kind: "cheer", msg: "Checked off. Nice!", mood: "wow" }); } },
            { label: "Snooze", run: () => setToast(null) },
          ],
        };
      case "prayer":
        return { mood: "calm", title: "Dhuhr in 5 minutes", sub: "Jakarta · Kemenag · works offline", actions: [{ label: "Thanks", primary: true, run: () => setToast(null) }] };
      case "stretch":
        return {
          mood: "reminder", title: "45 minutes of sitting!", sub: "Stand up, roll those shoulders.",
          actions: [
            { label: "Stretched", primary: true, run: () => setToast({ kind: "cheer", msg: "Spine says thank you ✨", mood: "happy" }) },
            { label: "Snooze", run: () => setToast(null) },
          ],
        };
      case "update":
        return { mood: "wow", title: "v2.1.6 is ready", sub: "Tiny fixes + a shinier kalimba", actions: [{ label: "Update", primary: true, run: runUpdate }, { label: "Later", run: () => setToast(null) }] };
      case "updating":
        return { mood: "focus", title: "Updating…", sub: "Lekuvo is changing colors", busy: true };
      case "updated":
        return { mood: "happy", title: "Updated to v2.1.6 ✨", sub: "Zero restarts. Zero fuss." };
      case "dictate":
        return { mood: "listen", title: "Listening…", sub: "Release Ctrl + Win to paste", wave: true };
      case "pasted":
        return { mood: "happy", title: `Pasted ${x.words} words`, sub: "Typed into Notepad. Nobody typed." };
      case "shot":
        return { mood: "cheese", title: "Screenshot copied", sub: "Saved to Board · Ctrl+V anywhere" };
      case "cheer":
        return { mood: x.mood, title: x.msg, sub: "Lekuvo approves." };
    }
  };

  /* ───────── geometry ───────── */
  const p = POSITIONS.find(x => x.id === pos) ?? POSITIONS[1];
  const flush = mode === "notch";
  const gap = 12;
  const inset = {
    top: p.edge === "top" && flush ? 0 : gap,
    bottom: TASKBAR + (p.edge === "bottom" && flush ? 0 : gap),
    left: p.edge === "left" && flush ? 0 : gap,
    right: p.edge === "right" && flush ? 0 : gap,
  };
  const availW = Math.max(240, size.w - 24);
  const availH = Math.max(260, size.h - TASKBAR - 24);

  const view: "open" | "toast" | "idle" = pinned ? "open" : toast ? "toast" : hover ? "open" : "idle";
  const idleW = live === "music" ? 276 : live === "focus" ? 256 : 240;
  const dims =
    view === "open" ? { w: Math.min(600, availW), h: Math.min(392, availH) }
    : view === "toast" ? { w: Math.min(450, availW), h: 82 }
    : { w: Math.min(idleW, availW), h: 46 };

  /* report the notch's interactive bounds so the Rust side can make the
     rest of the window click-through (shoulders + mascot overhang incl.) */
  useEffect(() => {
    const w = dims.w + SH * 2;
    const h = dims.h + (view === "open" ? 40 : 4);
    const x = p.ax * (size.w - w);
    const y = p.ay * (size.h - h);
    void invoke("set_hit_rect", { x, y, w, h }).catch(console.error);
  }, [dims.w, dims.h, size.w, size.h, view, p.ax, p.ay]);

  const R = view === "idle" ? 22 : 30;
  const radius =
    p.edge === "top" ? `0px 0px ${R}px ${R}px`
    : p.edge === "bottom" ? `${R}px ${R}px 0px 0px`
    : p.edge === "left" ? `0px ${R}px ${R}px 0px`
    : `${R}px 0px 0px ${R}px`;

  const g = (at: string) => `radial-gradient(circle at ${at}, transparent ${SH - 0.5}px, ${NOTCH} ${SH}px)`;
  const shoulders: CSSProperties[] =
    p.edge === "top" ? [{ left: -SH, top: 0, background: g("0 100%") }, { right: -SH, top: 0, background: g("100% 100%") }]
    : p.edge === "bottom" ? [{ left: -SH, bottom: 0, background: g("0 0") }, { right: -SH, bottom: 0, background: g("100% 0") }]
    : p.edge === "left" ? [{ left: 0, top: -SH, background: g("100% 0") }, { left: 0, bottom: -SH, background: g("100% 100%") }]
    : [{ right: 0, top: -SH, background: g("0 0") }, { right: 0, bottom: -SH, background: g("0 100%") }];

  const perch = p.ay === 1; // notch at the bottom → Lekuvo sits on top instead of hanging below
  const d = toast ? describe(toast) : null;
  const activeTab = TABS.find(x => x.id === tab) ?? TABS[0];
  // match the GNOME clock: 24h vs AM/PM, same timezone as the system
  const time = clock.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(sys.st?.clock24 ? { hour12: false } : {}),
  });
  const contentKey = view === "toast" && toast ? `toast-${toast.kind}` : view === "idle" ? `idle-${live}` : view;
  const focusTotal = focusMode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;

  const bodyClick = () => {
    if (!toast || toast.kind === "dictate" || toast.kind === "updating") return;
    setToast(null);
    if (!canHover()) setPinned(true);
  };


  /* ───────── render ───────── */
  return (
    <div ref={stageRef} className="relative w-full h-full overflow-hidden select-none">
    {/* ═══════ the notch / island ═══════ */}
    <motion.div
      className="absolute pointer-events-none z-20"
      initial={false}
      animate={{ top: inset.top, bottom: inset.bottom, left: inset.left, right: inset.right }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Lekuvo Dynamic Island demo"
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPinned(v => !v); touched.current = true; setHinted(true); }
          if (e.key === "Escape") setPinned(false);
        }}
        className="absolute pointer-events-auto outline-none rounded-[26px] focus-visible:ring-2 focus-visible:ring-butter"
        initial={false}
        animate={{
          width: dims.w, height: dims.h,
          left: `${p.ax * 100}%`, top: `${p.ay * 100}%`,
          x: `${-p.ax * 100}%`, y: `${-p.ay * 100}%`,
        }}
        transition={SPRING}
        onHoverStart={enter}
        onHoverEnd={leave}
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerLeave={onDragEnd}
      >
        {flush && shoulders.map((s, i) => <span key={i} className="absolute pointer-events-none" style={{ width: SH, height: SH, ...s }} />)}

        <motion.div
          className="absolute inset-0 overflow-hidden text-white shadow-[0_22px_50px_-16px_rgba(15,20,60,0.7)]"
          style={{ background: NOTCH }}
          initial={false}
          animate={{ borderRadius: radius }}
          transition={SPRING}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={contentKey}
              className="absolute inset-x-0 top-0 flex justify-center"
              initial={{ opacity: 0, filter: "blur(8px)", scale: 0.94 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { delay: 0.06, duration: 0.22 } }}
              exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.12 } }}
            >
              {/* ── compact pill ── */}
              {view === "idle" && (
                <div
                  style={{ width: dims.w, height: 46 }}
                  className="flex items-center gap-2.5 pl-2 pr-4 cursor-pointer"
                  onClick={() => { touched.current = true; setHinted(true); setPinned(true); }}
                >
                  <Lekuvo size={44} mood={live === "music" ? "music" : live === "focus" ? "focus" : "sleep"} skin={skin} track={false} shadow={false} dark className="shrink-0" />
                  <span className="w-px h-6 bg-white/15 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-[13px] truncate">
                        {live === "music" ? song.title : live === "focus" ? (focusMode === "focus" ? "Focus" : "Break") : "Lekuvo is napping…"}
                      </span>
                      {live === "music" && <Eq color={song.colors[0]} />}
                      {live === "focus" && <span className="font-display font-semibold text-[13px] tabular-nums">{fmt(focusLeft)}</span>}
                      {live === "idle" && <span className="text-[10px] text-white/35 shrink-0">hover me</span>}
                    </div>
                    {live !== "idle" && (
                      <div className="h-1 rounded-full bg-white/15 mt-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-butter transition-[width] duration-1000 ease-linear"
                          style={{ width: `${live === "music" ? (t / song.dur) * 100 : (1 - focusLeft / focusTotal) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onPointerDown={onHandleDown}
                    onClick={e => e.stopPropagation()}
                    aria-label="Move Lekuvo"
                    title="Drag to move"
                    className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-white/35 hover:text-white/85 hover:bg-white/10 transition"
                  >
                    <GripHorizontal className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── live activity / alert ── */}
              {view === "toast" && d && (
                <div style={{ width: dims.w, height: 82 }} className="flex items-center gap-3 pl-2.5 pr-3.5 cursor-pointer" onClick={bodyClick}>
                  <Lekuvo size={72} mood={d.mood} skin={skin} shadow={false} dark className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-[15.5px] leading-tight truncate">{d.title}</p>
                    <p className="text-[11.5px] text-white/55 truncate mt-0.5">{d.sub}</p>
                  </div>
                  {d.wave && (
                    <div className="flex items-center gap-[3px] h-8 shrink-0">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <span key={i} className="w-[3px] h-full rounded-full bg-butter wave-bar" style={{ animationDelay: `${i * 0.08}s`, animationDuration: `${0.5 + (i % 4) * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                  {d.busy && <span className="w-6 h-6 rounded-full border-[3px] border-white/20 border-t-butter animate-spin shrink-0" />}
                  {d.actions && (
                    <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                      {d.actions.map(a => (
                        <button
                          key={a.label}
                          onClick={e => { e.stopPropagation(); a.run(); }}
                          className={`text-[11.5px] font-extrabold px-3 py-1.5 rounded-full transition active:scale-95 ${a.primary ? "bg-butter text-navy hover:brightness-105" : "bg-white/12 hover:bg-white/22"}`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── expanded panel ── */}
              {view === "open" && (
                <div
                  style={{ width: dims.w, height: dims.h, background: `radial-gradient(120% 80% at 0% 0%, ${activeTab.color}24, transparent 60%)` }}
                  className="flex flex-col"
                >
                        <div className="flex items-center gap-2 p-3 pb-0 shrink-0">
                          <button
                            onPointerDown={onHandleDown}
                            aria-label="Move Lekuvo"
                            title="Drag to move"
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition"
                          >
                            <Move className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1 min-w-0 flex items-center gap-0.5 bg-white/[0.08] rounded-full p-1 overflow-x-auto no-scrollbar">
                      {TABS.map(tb => {
                        const on = tb.id === tab;
                        return (
                          <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            aria-label={tb.label}
                            className={`relative shrink-0 h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-extrabold transition-colors ${on ? "text-navy" : "text-white/55 hover:text-white"}`}
                          >
                            {on && <motion.span layoutId="tabpill" className="absolute inset-0 rounded-full" style={{ background: tb.color }} transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                            <tb.icon className="relative w-4 h-4" />
                            {on && <span className="relative">{tb.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => { touched.current = true; setHinted(true); setPinned(true); }}
                      aria-label="Pin open"
                      title="Pin open"
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${pinned ? "bg-butter text-navy" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setPinned(false); setHover(false); }}
                      aria-label="Close"
                      title="Close"
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 p-3">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={tab}
                        className="h-full"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                        exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
                      >
                        {tab === "music" && (
                          media.info ? (
                            <MusicPanel
                              song={song} t={t} playing={playing}
                              onToggle={() => media.control("playpause")}
                              onNext={() => media.control("next")}
                              onPrev={() => media.control("prev")}
                              onSeek={s => media.info && media.info.lengthSec > 0 && media.control("seek", s / media.info.lengthSec)}
                            />
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                              <span className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                                <Lekuvo size={56} mood="sleep" skin={skin} shadow={false} dark />
                              </span>
                              <div>
                                <p className="font-display font-bold text-white">Nothing is playing</p>
                                <p className="text-xs text-white/50 mt-1">Open your music player — Lekuvo will catch it here.</p>
                              </div>
                            </div>
                          )
                        )}
                        {tab === "focus" && (
                          <FocusPanel
                            mode={focusMode} left={focusLeft} running={focusRun} sessions={sessions}
                            onToggle={() => setFocusRun(v => !v)}
                            onReset={() => { setFocusRun(false); setFocusLeft(focusTotal); }}
                            onMode={m => { setFocusMode(m); setFocusRun(false); setFocusLeft(m === "focus" ? FOCUS_SECONDS : BREAK_SECONDS); }}
                            onSkip={() => { setFocusLeft(3); setFocusRun(true); }}
                          />
                        )}
                        {tab === "todo" && <TodoPanel todos={todos} setTodos={setTodos} onNudge={text => fire({ kind: "todo", text })} />}
                        {tab === "board" && <BoardPanel />}
                        {tab === "mixer" && <MixerPanel apps={mixer.apps} onVol={mixer.setVol} onMute={mixer.setMute} />}
                        {tab === "noise" && <NoisePanel noise={noise} onToggle={toggleNoise} onVol={volNoise} />}
                        {tab === "mirror" && <MirrorPanel />}
                        {tab === "system" && <SystemPanel />}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                        {/* Lekuvo's corner: he hangs here, with a tip per tab —
                            plus a real system status cluster on the right */}
                        <div className="h-[48px] shrink-0 border-t border-white/10 flex items-center gap-2 pr-3" style={{ paddingLeft: perch ? 16 : HANG_W + 34 }}>
                          <AnimatePresence mode="wait">
                            <motion.p key={tab} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-white/60 truncate">
                              <b className="text-white/90 font-extrabold">Lekuvo:</b> {TIPS[tab]}
                            </motion.p>
                          </AnimatePresence>

                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => sys.set({ dnd: !sys.st?.dnd })}
                              aria-label={sys.st?.dnd ? "Enable notifications" : "Silence notifications"}
                              title={sys.st?.dnd ? "Notifications: silenced" : "Notifications: on"}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${sys.st?.dnd ? "bg-butter text-navy" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`}
                            >
                              {sys.st?.dnd ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              onClick={() => { touched.current = true; setHinted(true); setPinned(true); setTab("system"); }}
                              aria-label="Wi-Fi and settings"
                              title={sys.st?.wifi ? "Wi-Fi connected — open System" : "Wi-Fi — open System"}
                              className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition ${sys.st?.wifi ? "text-white/70 hover:text-white" : "text-white/35"}`}
                            >
                              {sys.st?.wifi ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            </button>

                            <div className="relative">
                              <button
                                onClick={() => setVolOpen(v => !v)}
                                aria-label="Volume"
                                title="Volume"
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
                              >
                                {sys.st && (sys.st.mute || sys.st.vol === 0) ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                              </button>
                              {volOpen && (
                                <div className="absolute bottom-full mb-2 right-0 w-48 rounded-2xl bg-notch-2 border border-white/15 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.6)] p-3 flex items-center gap-2">
                                  <input
                                    type="range" min={0} max={100}
                                    value={volDrag ?? sys.st?.vol ?? 50}
                                    aria-label="Output volume"
                                    className="chunky flex-1 min-w-0"
                                    style={{ ["--p" as string]: `${volDrag ?? sys.st?.vol ?? 50}%`, ["--c" as string]: "#F8D77B" } as React.CSSProperties}
                                    onPointerDown={() => setVolDrag(volDrag ?? sys.st?.vol ?? 50)}
                                    onPointerUp={() => setVolDrag(null)}
                                    onPointerCancel={() => setVolDrag(null)}
                                    onChange={e => {
                                      const v = Number(e.target.value);
                                      setVolDrag(v);
                                      sys.set({ vol: v, mute: v === 0 ? true : false });
                                    }}
                                  />
                                  <button
                                    onClick={() => sys.set({ mute: !sys.st?.mute })}
                                    aria-label={sys.st?.mute ? "Unmute" : "Mute"}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition ${sys.st?.mute ? "bg-white text-navy" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
                                  >
                                    {sys.st?.mute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </div>

                            {sys.st?.batteryPct != null && (
                              <span
                                className="flex items-center gap-1.5 bg-white/10 rounded-full px-2 h-8 text-white/70"
                                title={`Battery ${sys.st.batteryPct}%${sys.st.charging ? " · charging" : ""}`}
                              >
                                {sys.st.charging ? <BatteryCharging className="w-3.5 h-3.5 text-mint" />
                                  : sys.st.batteryPct > 60 ? <BatteryFull className="w-3.5 h-3.5" />
                                  : sys.st.batteryPct > 25 ? <BatteryMedium className="w-3.5 h-3.5" />
                                  : <BatteryLow className="w-3.5 h-3.5 text-pink" />}
                                <span className="text-[11px] font-bold tabular-nums">{sys.st.batteryPct}%</span>
                              </span>
                            )}

                            <span className="text-[11px] font-extrabold text-white/80 tabular-nums ml-0.5">{time}</span>
                          </div>
                        </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* hanging / perching Lekuvo (outside the clip so he can dangle) */}
        <AnimatePresence>
          {view === "open" && (perch ? (
            <motion.div
              key="perch"
              className="absolute"
              style={{ left: 24, top: -70 }}
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 18, delay: 0.12 } }}
              exit={{ y: 26, opacity: 0, transition: { duration: 0.12 } }}
            >
              <Lekuvo size={92} mood={activeTab.mood} skin={skin} shadow={false} interactive />
            </motion.div>
          ) : (
            <motion.div
              key="hang"
              className="absolute"
              style={{ left: 22, top: `calc(100% - ${(HANG_W * 100) / 160}px)` }}
              initial={{ y: -28, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 16, delay: 0.14 } }}
              exit={{ y: -22, opacity: 0, transition: { duration: 0.12 } }}
            >
              <Lekuvo size={HANG_W} pose="hang" mood={activeTab.mood} skin={skin} dark interactive />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>

    {/* hint */}
    <AnimatePresence>
      {!hinted && !toast && (
        <motion.div key="hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 right-0 bottom-[60px] z-10 flex justify-center pointer-events-none">
          <div className="hint-bounce flex items-center gap-2 bg-notch text-white text-xs font-extrabold px-4 py-2.5 rounded-full shadow-[0_10px_24px_-10px_rgba(31,37,80,0.8)]">
            <MousePointer2 className="w-3.5 h-3.5 text-butter" /> Hover the notch · tap it on touch
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    </div>
  );
}
