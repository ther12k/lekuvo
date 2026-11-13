import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Camera, CameraOff, Check, Copy, FileText, Image as ImageIcon, Layers, Link2, Pause, Play,
  Plus, SkipBack, SkipForward, Sparkles, Volume2, VolumeX, X, FastForward, RotateCcw,
} from "lucide-react";
import Lekuvo from "../Lekuvo";
import {
  BREAK_SECONDS, FOCUS_SECONDS, NOISES, fmt,
} from "./data";
import type { Clip, NoiseState, ShelfFile, Song, Todo } from "./data";
import type { NoiseKey } from "../../hooks/useNoise";
import type { MixerApp } from "../../hooks/useMedia";

const sliderStyle = (v: number, c: string) => ({ ["--p" as string]: `${v}%`, ["--c" as string]: c });

/* ───────────────────────── Music ───────────────────────── */
export function MusicPanel({
  song, t, playing, onToggle, onNext, onPrev, onSeek,
}: {
  song: Song; t: number; playing: boolean;
  onToggle: () => void; onNext: () => void; onPrev: () => void; onSeek: (s: number) => void;
}) {
  const abs = Math.floor(t / 4);
  const n = song.lyrics.length;
  const lines = [abs - 2, abs - 1, abs, abs + 1, abs + 2]
    .filter(i => i >= 0)
    .map(i => ({ i, text: song.lyrics[i % n], cur: i === abs }));
  const [c0, c1] = song.colors;

  return (
    <div className="h-full flex gap-3.5 items-stretch">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <motion.div
          animate={{ scale: playing ? [1, 1.035, 1] : 1, rotate: playing ? [0, -1.2, 0, 1.2, 0] : 0 }}
          transition={{ repeat: playing ? Infinity : 0, duration: 2.4, ease: "easeInOut" }}
          className="relative w-[104px] h-[104px] rounded-[26px] overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${c0}, ${c1})`, boxShadow: `0 14px 34px -10px ${c0}` }}
        >
          <div className="absolute -right-5 -top-5 w-20 h-20 rounded-full bg-white/25" />
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full border-[10px] border-white/20" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/80 flex items-center justify-center">
            <div className={`w-4 h-4 rounded-full bg-white/90 ${playing ? "animate-spin-slow" : ""}`} style={{ borderRight: `4px solid ${c0}` }} />
          </div>
          <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-black/55 text-white px-1.5 py-0.5 rounded-full">{song.source}</span>
        </motion.div>
        <div className="flex items-end gap-[3px] h-3.5">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <span key={i} className={`w-[3px] h-full rounded-full ${playing ? "wave-bar" : ""}`} style={{ background: c0, animationDelay: `${i * 0.11}s`, transform: playing ? undefined : "scaleY(.3)" }} />
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <p className="font-display font-bold text-[17px] leading-tight truncate">{song.title}</p>
        <p className="text-xs text-white/50 truncate">{song.artist}</p>

        <div className="mt-2 flex-1 min-h-[72px] overflow-hidden flex flex-col justify-center gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {lines.map(l => (
              <motion.p
                key={l.i}
                layout="position"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: l.cur ? 1 : 0.3, y: 0, scale: l.cur ? 1 : 0.96 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                style={{ transformOrigin: "left center", color: l.cur ? c0 : undefined }}
                className={`truncate ${l.cur ? "text-[15px] font-bold" : "text-xs"}`}
              >
                {l.text}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-auto">
          <div
            className="h-2 rounded-full bg-white/12 cursor-pointer overflow-hidden"
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * song.dur);
            }}
          >
            <div className="h-full rounded-full transition-[width] duration-700 ease-linear" style={{ width: `${(t / song.dur) * 100}%`, background: `linear-gradient(90deg, ${c0}, ${c1})` }} />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-white/40 mt-1">
            <span>{fmt(t)}</span><span>-{fmt(Math.max(0, song.dur - t))}</span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            <button onClick={onPrev} aria-label="Previous" className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-90 transition"><SkipBack className="w-4 h-4 fill-white" /></button>
            <button onClick={onToggle} aria-label="Play/Pause" className="w-11 h-11 rounded-full flex items-center justify-center text-[#1F2550] active:scale-90 hover:scale-105 transition" style={{ background: c0 }}>
              {playing ? <Pause className="w-5 h-5 fill-[#1F2550]" /> : <Play className="w-5 h-5 fill-[#1F2550] ml-0.5" />}
            </button>
            <button onClick={onNext} aria-label="Next" className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-90 transition"><SkipForward className="w-4 h-4 fill-white" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Focus ───────────────────────── */
export function FocusPanel({
  mode, left, running, sessions, onToggle, onReset, onMode, onSkip,
}: {
  mode: "focus" | "break"; left: number; running: boolean; sessions: number;
  onToggle: () => void; onReset: () => void; onMode: (m: "focus" | "break") => void; onSkip: () => void;
}) {
  const total = mode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;
  const R = 50;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, left / total));
  const color = mode === "focus" ? "#F8D77B" : "#86E3C3";
  const line = running
    ? mode === "focus" ? "Heads down. I'm watching the clock." : "Break! Drink water, blink a lot."
    : left === total ? "Ready when you are." : "Paused. No rush, friend.";

  return (
    <div className="h-full flex items-center gap-3 sm:gap-5">
      <div className="relative w-[106px] h-[106px] sm:w-[136px] sm:h-[136px] shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={R} stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none" />
          <circle cx="60" cy="60" r={R} stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-[22px] sm:text-[28px] leading-none tabular-nums">{fmt(left)}</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/45 mt-1">{mode === "focus" ? "Focus" : "Break"}</span>
        </div>
        {running && <span className="absolute inset-1 rounded-full border-2 ping-ring" style={{ borderColor: color }} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex gap-1.5">
          {(["focus", "break"] as const).map(m => (
            <button key={m} onClick={() => onMode(m)} className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${mode === m ? "bg-white text-[#1F2550] border-white" : "border-white/20 text-white/60 hover:text-white"}`}>
              {m === "focus" ? "Focus 25" : "Break 5"}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-white/70 mt-3 leading-snug min-h-[36px]">{line}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={onToggle} className="text-[#1F2550] text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 active:scale-95 transition" style={{ background: color }}>
            {running ? <Pause className="w-3.5 h-3.5 fill-[#1F2550]" /> : <Play className="w-3.5 h-3.5 fill-[#1F2550]" />}
            {running ? "Pause" : "Start"}
          </button>
          <button onClick={onReset} aria-label="Reset" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><RotateCcw className="w-3.5 h-3.5" /></button>
          <button onClick={onSkip} title="Demo: jump to the last 3 seconds" className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1 text-[11px] font-semibold transition"><FastForward className="w-3.5 h-3.5" /> 3s</button>
        </div>
        <div className="flex items-center gap-1.5 mt-3.5">
          {[0, 1, 2, 3].map(i => (
            <motion.span key={i} animate={{ scale: i < sessions ? 1 : 0.85 }} className={`h-2 flex-1 rounded-full ${i < sessions ? "bg-[#F8D77B]" : "bg-white/15"}`} />
          ))}
        </div>
        <p className="text-[10px] text-white/40 mt-1">{sessions} of 4 sessions today</p>
      </div>
    </div>
  );
}

/* ───────────────────────── To-do ───────────────────────── */
export function TodoPanel({
  todos, setTodos, onNudge,
}: { todos: Todo[]; setTodos: Dispatch<SetStateAction<Todo[]>>; onNudge: (text: string) => void }) {
  const [text, setText] = useState("");
  const [time, setTime] = useState("15:00");
  const add = () => {
    const v = text.trim();
    if (!v) return;
    setTodos(ts => [...ts, { id: Date.now(), text: v, done: false, time }]);
    setText("");
  };
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll space-y-1.5 pr-1">
        <AnimatePresence initial={false}>
          {todos.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20, height: 0, marginTop: 0 }}
              className="group flex items-center gap-2.5 bg-white/[0.07] hover:bg-white/[0.11] border border-white/10 rounded-2xl px-3 py-2 transition"
            >
              <button
                onClick={() => setTodos(ts => ts.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                aria-label="Toggle"
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition active:scale-90 ${t.done ? "bg-[#86E3C3] border-[#86E3C3] text-[#1F2550]" : "border-white/30 hover:border-white/60"}`}
              >
                {t.done && <Check className="w-3 h-3 pop-in" strokeWidth={3.5} />}
              </button>
              <span className={`text-[13px] flex-1 truncate ${t.done ? "line-through text-white/35" : ""}`}>{t.text}</span>
              <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded-md text-white/70">{t.time}</span>
              <button onClick={() => onNudge(t.text)} title="Nudge me now" aria-label="Nudge" className="w-6 h-6 rounded-full hover:bg-[#86E3C3] hover:text-[#1F2550] flex items-center justify-center transition text-white/50"><Bell className="w-3.5 h-3.5" /></button>
              <button onClick={() => setTodos(ts => ts.filter(x => x.id !== t.id))} aria-label="Delete" className="w-5 h-5 rounded-full hidden group-hover:flex items-center justify-center text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
        {todos.length === 0 && <p className="text-center text-xs text-white/40 pt-8">All clear. Lekuvo is proud of you.</p>}
      </div>
      <div className="flex gap-1.5 mt-2.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-full px-3.5 py-2 text-xs placeholder:text-white/35 outline-none focus:border-[#86E3C3]"
        />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-[86px] bg-white/10 border border-white/15 rounded-full px-2.5 py-2 text-[11px] font-mono outline-none focus:border-[#86E3C3]" />
        <button onClick={add} aria-label="Add" className="w-9 h-9 rounded-full bg-[#86E3C3] text-[#1F2550] flex items-center justify-center shrink-0 active:scale-90 transition"><Plus className="w-4 h-4" strokeWidth={3} /></button>
      </div>
    </div>
  );
}

/* ───────────────────────── Board & Shelf ───────────────────────── */
export function BoardPanel({
  clips, shelf, setShelf,
}: { clips: Clip[]; shelf: ShelfFile[]; setShelf: Dispatch<SetStateAction<ShelfFile[]>> }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [over, setOver] = useState(false);

  const copy = (c: Clip) => {
    navigator.clipboard?.writeText(c.label)?.catch(() => undefined);
    setCopied(c.id);
    window.setTimeout(() => setCopied(null), 1100);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files).map((f, i) => ({ id: Date.now() + i, name: f.name }));
    if (files.length) setShelf(s => [...files, ...s].slice(0, 12));
  };
  const KindIcon = (k: Clip["kind"]) => (k === "link" ? Link2 : k === "image" ? ImageIcon : FileText);

  return (
    <div className="h-full grid grid-cols-2 gap-2.5">
      <div className="min-h-0 flex flex-col bg-white/[0.06] border border-white/10 rounded-2xl p-2.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-1.5 px-0.5">Board · tap to copy</p>
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll space-y-1.5 pr-0.5">
          <AnimatePresence initial={false}>
            {clips.map(c => {
              const Icon = KindIcon(c.kind);
              return (
                <motion.button
                  key={c.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  onClick={() => copy(c)}
                  className="w-full text-left flex items-center gap-2 bg-white/[0.08] hover:bg-white/[0.16] rounded-xl px-2 py-1.5 transition"
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.hue ?? "rgba(255,255,255,0.12)" }}><Icon className="w-3.5 h-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold truncate">{c.label}</span>
                    <span className="block text-[9px] text-white/40">{copied === c.id ? "Copied ✓" : c.sub}</span>
                  </span>
                  {copied === c.id ? <Check className="w-3.5 h-3.5 text-[#7DD3FC] pop-in" /> : <Copy className="w-3 h-3 text-white/30" />}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`min-h-0 flex flex-col rounded-2xl p-2.5 border-2 border-dashed transition ${over ? "bg-[#7DD3FC]/20 border-[#7DD3FC]" : "bg-white/[0.04] border-white/20"}`}
      >
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">Shelf · drop files</p>
          <button onClick={() => setShelf(s => [{ id: Date.now(), name: ["invoice.pdf", "logo_final.svg", "notes.md", "demo.mp4"][s.length % 4] }, ...s].slice(0, 12))} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-full">+ sample</button>
        </div>
        {shelf.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/35 text-center">
            <Layers className="w-6 h-6 mb-1.5" />
            <span className="text-[11px] leading-snug">Drag files here from your desktop.<br />They wait, no folders needed.</span>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto thin-scroll flex flex-wrap gap-1.5 content-start">
            <AnimatePresence initial={false}>
              {shelf.map(f => (
                <motion.span key={f.id} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="flex items-center gap-1 bg-[#7DD3FC] text-[#1F2550] text-[10px] font-bold pl-2 pr-1 py-1 rounded-full max-w-full">
                  <FileText className="w-3 h-3 shrink-0" /><span className="truncate max-w-[84px]">{f.name}</span>
                  <button onClick={() => setShelf(s => s.filter(x => x.id !== f.id))} aria-label="Remove" className="w-4 h-4 rounded-full hover:bg-black/15 flex items-center justify-center"><X className="w-3 h-3" /></button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Mixer (real PulseAudio sinks) ───────────────────────── */
const MIXER_PALETTE = ["#FFB38A", "#7DD3FC", "#86E3C3", "#F8D77B", "#C4B5FD", "#FF9EC4"];

export function MixerPanel({
  apps, onVol, onMute,
}: {
  apps: MixerApp[];
  onVol: (index: number, v: number) => void;
  onMute: (index: number, next: boolean) => void;
}) {
  // while dragging a slider, its local value wins so the 1.5s poll
  // doesn't yank the thumb back
  const [dragging, setDragging] = useState<{ index: number; v: number } | null>(null);

  if (apps.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-white/50">
        <Volume2 className="w-6 h-6 opacity-40" />
        <p className="text-xs">No apps are playing audio right now.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-between">
      <div className="space-y-2 overflow-y-auto thin-scroll pr-0.5">
        {apps.map((a, i) => {
          const live = !a.mute && a.vol > 0;
          const vol = dragging?.index === a.index ? dragging.v : a.vol;
          return (
            <div key={a.index} className="flex items-center gap-2.5 bg-white/[0.06] border border-white/10 rounded-2xl px-2.5 py-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-display font-extrabold text-white shrink-0" style={{ background: MIXER_PALETTE[i % MIXER_PALETTE.length], opacity: live ? 1 : 0.4 }}>
                {a.name.charAt(0).toUpperCase() || "?"}
              </span>
              <span className="text-xs font-semibold w-[72px] shrink-0 truncate" title={a.name}>{a.name}</span>
              <input
                type="range" min={0} max={100} value={vol} className="chunky flex-1 min-w-0"
                style={sliderStyle(vol, MIXER_PALETTE[i % MIXER_PALETTE.length])}
                onPointerDown={() => setDragging({ index: a.index, v: vol })}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
                onChange={e => {
                  const v = Number(e.target.value);
                  setDragging({ index: a.index, v });
                  onVol(a.index, v);
                }}
              />
              <div className="flex items-end gap-[2px] h-4 w-[18px] shrink-0">
                {[0, 1, 2, 3].map(k => (
                  <span key={k} className={`w-[3px] h-full rounded-full bg-[#FFB38A] ${live ? "wave-bar" : ""}`} style={{ animationDelay: `${k * 0.13 + i * 0.05}s`, animationDuration: `${0.5 + k * 0.12}s`, transform: live ? undefined : "scaleY(.15)" }} />
                ))}
              </div>
              <button
                onClick={() => onMute(a.index, !a.mute)}
                aria-label={a.mute ? "Unmute" : "Mute"}
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition ${a.mute ? "bg-white text-[#1F2550]" : "bg-white/10 hover:bg-white/20"}`}
              >
                {a.mute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-white/40 text-center">Real per-app volumes, straight from PulseAudio.</p>
    </div>
  );
}

/* ───────────────────────── White noise ───────────────────────── */
export function NoisePanel({
  noise, onToggle, onVol,
}: { noise: NoiseState; onToggle: (k: NoiseKey) => void; onVol: (k: NoiseKey, v: number) => void }) {
  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-4 gap-2 flex-1">
        {NOISES.map(n => {
          const s = noise[n.key];
          return (
            <div key={n.key} className={`rounded-2xl p-2 flex flex-col items-center justify-between border transition ${s.on ? "bg-white/[0.14] border-white/30" : "bg-white/[0.05] border-white/10"}`}>
              <button onClick={() => onToggle(n.key)} aria-label={n.label} className="flex flex-col items-center gap-1 w-full active:scale-95 transition">
                <span className={`relative w-10 h-10 rounded-2xl flex items-center justify-center ${s.on ? "animate-floaty" : ""}`} style={{ background: n.grad, opacity: s.on ? 1 : 0.55 }}>
                  <n.icon className="w-5 h-5 text-white" />
                  {s.on && n.key === "rain" && [0, 1, 2].map(i => <span key={i} className="absolute w-[2px] h-2 bg-white/80 rounded-full anim-rain" style={{ left: 8 + i * 11, bottom: -2, animationDelay: `${i * 0.25}s` }} />)}
                </span>
                <span className="text-[11px] font-bold">{n.label}</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.on ? n.color : "rgba(255,255,255,0.12)", color: s.on ? "#000" : undefined }}>{s.on ? "ON" : "OFF"}</span>
              </button>
              <input
                type="range" min={5} max={100} value={s.vol} disabled={!s.on}
                aria-label={`${n.label} volume`}
                onChange={e => onVol(n.key, Number(e.target.value))}
                className="chunky w-full mt-1 disabled:opacity-25"
                style={sliderStyle(s.vol, n.color)}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-white/40 text-center mt-1.5">Real sounds, made live on your desktop. Stack as many as you like.</p>
    </div>
  );
}

/* ───────────────────────── Mirror ───────────────────────── */
const COMPLIMENTS = ["Looking sharp ✨", "Lighting: chef's kiss", "Hair: immaculate", "Meeting-ready 🚀", "Nice background!"];

export function MirrorPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<"off" | "asking" | "on" | "denied">("off");
  const [ci, setCi] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (state !== "on") return;
    const v = videoRef.current;
    if (v && streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => undefined);
    }
    const id = window.setInterval(() => setCi(c => (c + 1) % COMPLIMENTS.length), 2400);
    return () => window.clearInterval(id);
  }, [state]);

  const start = async () => {
    setState("asking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (!mounted.current) { s.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = s;
      setState("on");
    } catch {
      if (mounted.current) setState("denied");
    }
  };
  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setState("off");
  };

  return (
    <div className="h-full flex items-center gap-3 sm:gap-4">
      <div className="relative w-[124px] h-[100px] sm:w-[168px] sm:h-[126px] rounded-[22px] overflow-hidden shrink-0 border border-white/15 bg-gradient-to-br from-[#2b2540] to-[#14121f] flex items-center justify-center">
        {state === "on" ? (
          <>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
            <span className="absolute top-2 left-2 text-[9px] font-bold bg-black/60 px-1.5 py-0.5 rounded-full flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />LIVE</span>
            <AnimatePresence mode="wait">
              <motion.span key={ci} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold bg-[#FF9EC4] text-[#1F2550] px-2.5 py-1 rounded-full">{COMPLIMENTS[ci]}</motion.span>
            </AnimatePresence>
          </>
        ) : (
          <>
            <div className="absolute inset-2 rounded-[16px] border-2 border-dashed border-white/15" />
            <Lekuvo size={112} mood={state === "denied" ? "chill" : "hello"} shadow={false} />
          </>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display font-bold text-base">Camera check</p>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">
          {state === "denied" ? "Camera blocked, so Lekuvo is your mirror today. Allow access to see yourself." : "Quick peek before your call. Framing, lighting, snack on the desk, all good?"}
        </p>
        <p className="text-[10px] text-white/35 mt-1.5 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Video never leaves your PC.</p>
        {state === "on" ? (
          <button onClick={stop} className="mt-3 bg-white/10 hover:bg-white/20 text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 transition"><CameraOff className="w-3.5 h-3.5" /> Turn off</button>
        ) : (
          <button onClick={start} disabled={state === "asking"} className="mt-3 bg-[#FF9EC4] text-[#1F2550] text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60">
            <Camera className="w-3.5 h-3.5" /> {state === "asking" ? "Asking…" : "Open mirror"}
          </button>
        )}
      </div>
    </div>
  );
}
