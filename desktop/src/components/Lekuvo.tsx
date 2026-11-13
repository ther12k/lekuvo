import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/* ════════════════════════════════════════════════════════════════
   Lekuvo — the little desktop lookout (a chameleon, obviously)
   Pure SVG so he can blink, track your cursor with independent
   eyes, flick his tongue and shift colors like a real chameleon.
   ════════════════════════════════════════════════════════════════ */

export type LekuvoMood =
  | "idle" | "chill" | "focus" | "music" | "reminder" | "sleep"
  | "hello" | "sip" | "listen" | "cheese" | "calm" | "wow" | "happy";
export type SkinId = "classic" | "meadow" | "sunset" | "dusk";

export interface Skin {
  label: string; main: string; light: string; dark: string; deep: string;
  belly: string; bellyLight: string; bellyDark: string;
}

export const SKINS: Record<SkinId, Skin> = {
  classic: { label: "Classic", main: "#4C5FD7", light: "#8395F7", dark: "#3345B5", deep: "#25328A", belly: "#F8D77B", bellyLight: "#FDEEC4", bellyDark: "#DFAE48" },
  meadow:  { label: "Meadow",  main: "#22A776", light: "#66D9AA", dark: "#178158", deep: "#0E5C3F", belly: "#FBE38C", bellyLight: "#FFF3C8", bellyDark: "#DDB94B" },
  sunset:  { label: "Sunset",  main: "#EE6B67", light: "#FFA394", dark: "#C84B50", deep: "#963241", belly: "#FFE0A4", bellyLight: "#FFF2D6", bellyDark: "#E8B462" },
  dusk:    { label: "Dusk",    main: "#7356EE", light: "#A592FC", dark: "#5436CA", deep: "#3C269A", belly: "#FCD86F", bellyLight: "#FEEDB9", bellyDark: "#DCAC3E" },
};
export const SKIN_ORDER: SkinId[] = ["classic", "meadow", "sunset", "dusk"];

export const NAVY = "#1F2550";
const PUPIL = "#191D3D";
const MOUTH = "#24205A";
const TONGUE = "#FF7E9D";
const BUTTER = "#F4C64B";

type Eyes = "open" | "wide" | "half" | "closed" | "happy";
type Mouth = "smile" | "open" | "o" | "flat" | "tiny";
type Arm = "down" | "wave" | "up";
type HeadProp = "notes" | "alert" | "zzz" | "sparkles" | "moon";
type HandProp = "drop" | "mic" | "camera";
type BodyPose = "sit" | "lie" | "curl";

interface MoodCfg {
  body: BodyPose; eyes: Eyes; mouth: Mouth; arm: Arm;
  head?: HeadProp[]; hand?: HandProp; anim: string; look: [number, number];
}

const MOODS: Record<LekuvoMood, MoodCfg> = {
  idle:     { body: "sit",  eyes: "open",   mouth: "smile", arm: "down", anim: "lk-breathe", look: [0.75, -0.3] },
  chill:    { body: "sit",  eyes: "half",   mouth: "smile", arm: "down", anim: "lk-breathe", look: [0.9, 0.15] },
  focus:    { body: "lie",  eyes: "half",   mouth: "flat",  arm: "down", anim: "lk-breathe", look: [0.95, 0.3] },
  music:    { body: "sit",  eyes: "happy",  mouth: "open",  arm: "wave", head: ["notes"], anim: "lk-bob", look: [0, 0] },
  reminder: { body: "sit",  eyes: "wide",   mouth: "o",     arm: "up",   head: ["alert"], anim: "lk-perk", look: [0.55, -0.55] },
  sleep:    { body: "curl", eyes: "closed", mouth: "tiny",  arm: "down", head: ["zzz"], anim: "lk-breathe-slow", look: [0, 0] },
  hello:    { body: "sit",  eyes: "open",   mouth: "open",  arm: "wave", anim: "lk-breathe", look: [0.5, -0.25] },
  sip:      { body: "sit",  eyes: "open",   mouth: "tiny",  arm: "up",   hand: "drop", anim: "lk-perk", look: [0.85, 0.1] },
  listen:   { body: "sit",  eyes: "wide",   mouth: "o",     arm: "up",   hand: "mic", anim: "lk-bob", look: [0.85, 0.35] },
  cheese:   { body: "sit",  eyes: "happy",  mouth: "open",  arm: "up",   hand: "camera", head: ["sparkles"], anim: "lk-bob", look: [0, 0] },
  calm:     { body: "sit",  eyes: "closed", mouth: "smile", arm: "down", head: ["moon"], anim: "lk-breathe-slow", look: [0, 0] },
  wow:      { body: "sit",  eyes: "wide",   mouth: "open",  arm: "up",   head: ["sparkles"], anim: "lk-perk", look: [0.4, -0.65] },
  happy:    { body: "sit",  eyes: "happy",  mouth: "open",  arm: "down", anim: "lk-bob", look: [0, 0] },
};
export const MOOD_LIST = Object.keys(MOODS) as LekuvoMood[];

/* ───────────── geometry helpers (computed once) ───────────── */
const PI = Math.PI;
type Fr = number | ((t: number) => number);
const ev = (f: Fr, t: number) => (typeof f === "number" ? f : f(t));
const smooth = (a: number, b: number) => (t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

interface Spiral { cx: number; cy: number; r0: number; r1: number; w0: number; w1: number; a0: number; sweep: number }

/** A tapered spiral band. fin/fout = fraction of the tail width (0 = inner edge, 1 = outer edge). */
function band(s: Spiral, fin: Fr, fout: Fr, t0 = 0, t1 = 1, steps = 90) {
  const o: string[] = [];
  const i: string[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = t0 + ((t1 - t0) * k) / steps;
    const a = s.a0 - s.sweep * t;
    const r = s.r0 + (s.r1 - s.r0) * t;
    const w = s.w0 + (s.w1 - s.w0) * t;
    const ro = r - w / 2 + w * ev(fout, t);
    const ri = r - w / 2 + w * ev(fin, t);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    o.push(`${(s.cx + ro * c).toFixed(1)} ${(s.cy + ro * sn).toFixed(1)}`);
    i.push(`${(s.cx + ri * c).toFixed(1)} ${(s.cy + ri * sn).toFixed(1)}`);
  }
  return `M${o.join("L")}L${i.reverse().join("L")}Z`;
}

function tailSet(s: Spiral) {
  const end = s.a0 - s.sweep;
  return {
    s,
    full: band(s, 0, 1),
    belly: band(s, 0, t => 0.47 * smooth(0.04, 0.18)(t)),
    crease: band(s, t => 1 - 0.13 * smooth(0.12, 0.26)(t), 1),
    shine: band(s, 0.6, t => 0.6 + 0.2 * Math.sin((PI * (t - 0.1)) / 0.42), 0.1, 0.52),
    tip: { x: s.cx + s.r1 * Math.cos(end), y: s.cy + s.r1 * Math.sin(end), r: s.w1 / 2 },
  };
}

const SIT_TAIL = tailSet({ cx: 58, cy: 146, r0: 36, r1: 4.5, w0: 25, w1: 7, a0: -PI / 2 + 0.95, sweep: 3.35 * PI });
const HANG_TAIL = tailSet({ cx: 64, cy: 162, r0: 23, r1: 3.5, w0: 16.5, w1: 5, a0: -PI / 2 + 0.75, sweep: 3.2 * PI });

const MARK_S: Spiral = { cx: 24, cy: 24, r0: 16, r1: 4.6, w0: 8.6, w1: 7, a0: 0.8 * PI, sweep: 2.05 * PI };
const MARK_PATH = band(MARK_S, 0, 1, 0, 1, 80);
const MARK_A = { x: MARK_S.cx + MARK_S.r0 * Math.cos(MARK_S.a0), y: MARK_S.cy + MARK_S.r0 * Math.sin(MARK_S.a0) };
const MARK_B = {
  x: MARK_S.cx + MARK_S.r1 * Math.cos(MARK_S.a0 - MARK_S.sweep),
  y: MARK_S.cy + MARK_S.r1 * Math.sin(MARK_S.a0 - MARK_S.sweep),
};

const HEAD = "M-44 30C-58 16-60-14-46-31C-34-44-12-50 10-47C30-45 44-37 57-28C69-20 77-6 74 6C71 18 60 26 46 30C24 38-14 44-44 30Z";
const THROAT = "M78 4C66 18 50 25 30 28C6 31-20 33-60 27L-60 64L84 64Z";
const BODY = "M70 162C62 130 80 98 116 92C148 87 174 100 182 126C189 150 184 176 160 180L96 180C80 179 72 172 70 162Z";
const BELLY = "M150 104C176 116 189 148 183 186L116 186C125 164 135 128 150 104Z";
const HANG_BODY = "M56 90C47 116 55 143 80 151C105 158 117 136 110 104C104 84 64 78 56 90Z";
const HANG_BELLY = "M98 96C110 118 110 138 92 155L136 160L136 96Z";
const STAR = "M0-8C1.2-2.4 2.4-1.2 8 0C2.4 1.2 1.2 2.4 0 8C-1.2 2.4-2.4 1.2-8 0C-2.4-1.2-1.2-2.4 0-8Z";
const OPEN_MOUTH = "M34 13Q50 31 67 10Q50 19 34 13Z";

const POSE_T: Record<BodyPose, { body?: string; tail?: string; head: string }> = {
  sit:  { head: "translate(160 82)" },
  lie:  { body: "translate(128 180) scale(1.06 0.78) translate(-128 -180)", tail: "translate(58 182) scale(0.9) translate(-58 -182)", head: "translate(166 104) rotate(4)" },
  curl: { body: "translate(128 180) scale(1 0.72) translate(-128 -180)", tail: "translate(66 182) scale(0.94) translate(-58 -182)", head: "translate(150 116) rotate(10)" },
};

/* ───────────── component ───────────── */
export interface LekuvoProps {
  /** rendered width in px */
  size?: number;
  mood?: LekuvoMood;
  /** "hang" = gripping a ledge (e.g. the notch edge) with the tail dangling */
  pose?: "auto" | "hang";
  skin?: SkinId;
  /** eyes follow the pointer (defaults to on for sizes ≥ 48) */
  track?: boolean;
  /** click → tongue flick + hop */
  interactive?: boolean;
  onPoke?: () => void;
  /** change this number to trigger a tongue flick from outside */
  pokeSignal?: number;
  shadow?: boolean;
  /** sitting on a dark surface → light-colored props (notes, zzz, sound waves) */
  dark?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export default function Lekuvo({
  size = 120, mood = "idle", pose = "auto", skin = "classic", track, interactive = false,
  onPoke, pokeSignal = 0, shadow = true, dark = false, animate = true, className = "", style, title = "Lekuvo the chameleon",
}: LekuvoProps) {
  const cfg = MOODS[mood] ?? MOODS.idle;
  const S = SKINS[skin] ?? SKINS.classic;
  const hang = pose === "hang";
  const VW = hang ? 160 : 240;
  const VH = hang ? 210 : 190;
  const uid = "lk" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [blink, setBlink] = useState(false);
  const [poke, setPoke] = useState(0);
  const tracking = track ?? size >= 48;
  const ink = dark ? "#EEF1FF" : NAVY;

  useEffect(() => {
    if (pokeSignal > 0) setPoke(p => p + 1);
  }, [pokeSignal]);

  /* natural blinking, sometimes a double blink */
  useEffect(() => {
    let alive = true;
    let t = 0;
    const shut = (ms: number) => {
      setBlink(true);
      window.setTimeout(() => alive && setBlink(false), ms);
    };
    const loop = () => {
      t = window.setTimeout(() => {
        if (!alive) return;
        shut(130);
        if (Math.random() < 0.22) window.setTimeout(() => alive && shut(110), 300);
        loop();
      }, 2300 + Math.random() * 3400);
    };
    loop();
    return () => { alive = false; window.clearTimeout(t); };
  }, []);

  /* chameleon eyes: the near eye follows you, the far eye wanders on its own */
  useEffect(() => {
    if (!tracking) return;
    const svg = svgRef.current;
    if (!svg) return;
    let raf = 0;
    let farFollow = false;
    let last: { clientX: number; clientY: number } | null = null;
    const aim = (which: "n" | "f", p: { clientX: number; clientY: number }) => {
      const sc = svg.querySelector<SVGCircleElement>(`[data-sclera="${which}"]`);
      const pu = svg.querySelector<SVGGElement>(`[data-pupil="${which}"]`);
      if (!sc || !pu) return;
      const r = sc.getBoundingClientRect();
      const dx = p.clientX - (r.left + r.width / 2);
      const dy = p.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 140) * (which === "n" ? 6.5 : 3.8);
      pu.style.transform = `translate(${(dx / d) * k}px, ${(dy / d) * k}px)`;
    };
    const onMove = (e: PointerEvent) => {
      last = { clientX: e.clientX, clientY: e.clientY };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!last) return;
        aim("n", last);
        if (farFollow) aim("f", last);
      });
    };
    const wander = window.setInterval(() => {
      const pu = svg.querySelector<SVGGElement>('[data-pupil="f"]');
      if (!pu) return;
      if (last && Math.random() < 0.4) { farFollow = true; aim("f", last); return; }
      farFollow = false;
      const a = Math.random() * PI * 2;
      const m = 1.4 + Math.random() * 2.4;
      pu.style.transform = `translate(${Math.cos(a) * m}px, ${Math.sin(a) * m}px)`;
    }, 1600 + Math.random() * 1400);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      window.clearInterval(wander);
    };
  }, [tracking]);

  const u = (id: string) => `url(#${uid}${id})`;
  const fillT = (c: string): CSSProperties => ({ fill: c, transition: "fill .6s ease" });
  const strokeT = (c: string): CSSProperties => ({ stroke: c, transition: "stroke .6s ease" });
  const stop = (c: string): CSSProperties => ({ stopColor: c, transition: "stop-color .6s ease" });

  /* ── eyes ── */
  const eye = (which: "n" | "f") => {
    const near = which === "n";
    const cx = near ? 12 : 56;
    const cy = near ? -11 : -28;
    const rt = near ? 26 : 15.5;
    const rs = near ? 19 : 11.4;
    const rp = near ? 10.5 : 6.4;
    const max = near ? 6.5 : 3.8;
    const base = cfg.eyes;
    const pupils = base !== "closed" && base !== "happy";
    const lidState: Eyes = blink && pupils ? "closed" : base;
    const full = lidState === "closed" || lidState === "happy";
    const cov = lidState === "wide" ? 0.12 : lidState === "half" ? 0.56 : 0.34;
    const R = rs + 0.8;
    const yEdge = cy - rs + 2 * rs * cov;
    const lid = `M${cx - R - 3} ${cy - R - 3}H${cx + R + 3}V${yEdge - 2}Q${cx} ${yEdge + 5} ${cx - R - 3} ${yEdge - 2}Z`;
    const rim = `M${cx - R - 3} ${yEdge - 2}Q${cx} ${yEdge + 5} ${cx + R + 3} ${yEdge - 2}`;
    const look = cfg.look;
    return (
      <g>
        <circle cx={cx} cy={cy} r={rt} fill={u("tur")} style={strokeT(S.dark)} strokeOpacity={0.28} strokeWidth={1.6} />
        <circle data-sclera={which} cx={cx} cy={cy} r={rs} fill={u("scl")} />
        <clipPath id={`${uid}c${which}`}><circle cx={cx} cy={cy} r={R} /></clipPath>
        {pupils && (
          <g data-pupil={which} transform={`translate(${look[0] * max} ${look[1] * max})`} style={{ transition: "transform .16s ease-out" }}>
            <circle cx={cx} cy={cy} r={rp} fill={PUPIL} />
            <circle cx={cx + rp * 0.36} cy={cy - rp * 0.38} r={rp * 0.33} fill="#fff" />
            <circle cx={cx - rp * 0.34} cy={cy + rp * 0.36} r={rp * 0.14} fill="#fff" opacity={0.75} />
          </g>
        )}
        <g clipPath={u(`c${which}`)}>
          {full ? <circle cx={cx} cy={cy} r={R + 1} fill={u("lid")} /> : <path d={lid} fill={u("lid")} />}
          {!full && <path d={rim} style={strokeT(S.deep)} strokeWidth={rs * 0.15} fill="none" strokeLinecap="round" />}
        </g>
        {lidState === "closed" && (
          <path d={`M${cx - rs * 0.62} ${cy + rs * 0.05}Q${cx} ${cy + rs * 0.5} ${cx + rs * 0.62} ${cy + rs * 0.05}`} style={strokeT(S.deep)} strokeWidth={rs * 0.16} strokeLinecap="round" fill="none" />
        )}
        {lidState === "happy" && (
          <path d={`M${cx - rs * 0.6} ${cy + rs * 0.3}Q${cx} ${cy - rs * 0.45} ${cx + rs * 0.6} ${cy + rs * 0.3}`} style={strokeT(S.deep)} strokeWidth={rs * 0.16} strokeLinecap="round" fill="none" />
        )}
      </g>
    );
  };

  /* ── mouth ── */
  const mouth = (() => {
    const st = strokeT(S.deep);
    switch (cfg.mouth) {
      case "open":
        return (
          <g>
            <path d={OPEN_MOUTH} fill={MOUTH} />
            <clipPath id={`${uid}mc`}><path d={OPEN_MOUTH} /></clipPath>
            <ellipse cx={51} cy={22} rx={8} ry={4} fill={TONGUE} clipPath={u("mc")} />
          </g>
        );
      case "o": return <ellipse cx={52} cy={18} rx={4.4} ry={5.2} fill={MOUTH} />;
      case "flat": return <path d="M40 17Q52 20 63 15" style={st} strokeWidth={2.8} strokeLinecap="round" fill="none" />;
      case "tiny": return <path d="M46 17Q52 21 58 16" style={st} strokeWidth={2.8} strokeLinecap="round" fill="none" />;
      default:
        return (
          <g style={st} strokeWidth={2.8} strokeLinecap="round" fill="none">
            <path d="M36 15Q50 23 64 11" />
            <path d="M64 11q3.5-1 4.6-4.6" />
          </g>
        );
    }
  })();

  /* ── head props (head-local coords) ── */
  const note = (double: boolean): ReactNode =>
    double ? (
      <g fill={ink}>
        <ellipse cx={0} cy={12} rx={4.6} ry={3.6} transform="rotate(-22 0 12)" />
        <ellipse cx={13} cy={9} rx={4.6} ry={3.6} transform="rotate(-22 13 9)" />
        <rect x={3} y={-4} width={2.4} height={16} rx={1.2} />
        <rect x={16} y={-7} width={2.4} height={16} rx={1.2} />
        <path d="M3-4L18.4-7V-2.5L3 0.5Z" />
      </g>
    ) : (
      <g fill={ink}>
        <ellipse cx={0} cy={10} rx={5.2} ry={4} transform="rotate(-22 0 10)" />
        <rect x={3.2} y={-8} width={2.6} height={18.5} rx={1.3} />
        <path d="M5.8-8c6 1.5 9 5 8 11-1.6-3.6-4.4-5-8-5.2z" />
      </g>
    );

  const headProps = (cfg.head ?? []).map(p => {
    switch (p) {
      case "notes":
        return (
          <g key={p}>
            <g transform="translate(40 -60)"><g className="lk-float">{note(false)}</g></g>
            <g transform="translate(70 -46)"><g className="lk-float" style={{ animationDelay: ".8s" }}>{note(true)}</g></g>
          </g>
        );
      case "alert":
        return (
          <g key={p} transform="translate(66 -40)">
            <g className="lk-pulse" stroke={BUTTER} strokeWidth={5.5} strokeLinecap="round">
              <path d="M0-8L3-22" /><path d="M10-2L22-10" /><path d="M14 10L28 9" />
            </g>
          </g>
        );
      case "zzz":
        return (
          <g key={p} fill={ink} fontFamily="Outfit, Nunito, sans-serif" fontWeight={800}>
            <g transform="translate(48 -44)"><text className="lk-z" fontSize={20}>z</text></g>
            <g transform="translate(64 -60)"><text className="lk-z" style={{ animationDelay: ".8s" }} fontSize={15}>z</text></g>
            <g transform="translate(78 -72)"><text className="lk-z" style={{ animationDelay: "1.6s" }} fontSize={11}>z</text></g>
          </g>
        );
      case "sparkles":
        return (
          <g key={p}>
            <g transform="translate(-50 -56) scale(1.3)"><path className="lk-twinkle" d={STAR} fill={BUTTER} /></g>
            <g transform="translate(88 -36)"><path className="lk-twinkle" style={{ animationDelay: ".4s" }} d={STAR} fill={BUTTER} /></g>
            <g transform="translate(66 -70) scale(.8)"><path className="lk-twinkle" style={{ animationDelay: ".8s" }} d={STAR} fill={BUTTER} /></g>
          </g>
        );
      case "moon":
        return (
          <g key={p} transform="translate(74 -62)">
            <g className="lk-float-slow"><path d="M6-12A13 13 0 1 0 14 10A10 10 0 1 1 6-12Z" fill={BUTTER} /></g>
          </g>
        );
      default:
        return null;
    }
  });

  /* ── head ── */
  const headT = hang ? "translate(80 61) scale(0.82) rotate(-3)" : POSE_T[cfg.body].head;
  const head = (
    <g transform={headT}>
      <ellipse cx={-6} cy={40} rx={42} ry={12} fill={u("shd")} />
      <ellipse cx={-50} cy={6} rx={12} ry={30} fill={u("shd")} />
      <path d={HEAD} fill={u("hed")} />
      <clipPath id={`${uid}hc`}><path d={HEAD} /></clipPath>
      <g clipPath={u("hc")}>
        <path d={THROAT} fill={u("bel")} />
        <path d="M-60 34C-20 48 30 46 84 22L84 64L-60 64Z" style={fillT(S.bellyDark)} opacity={0.3} />
        <path d="M-42-31C-30-43-8-48 16-46" style={strokeT(S.light)} strokeOpacity={0.55} strokeWidth={6} strokeLinecap="round" fill="none" />
        <ellipse cx={-16} cy={-36} rx={24} ry={7} fill="#fff" opacity={0.08} transform="rotate(-8 -16 -36)" />
      </g>
      <path d="M-40-22C-28-35-8-41 16-40" style={strokeT(S.dark)} strokeOpacity={0.38} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <circle cx={65} cy={-5} r={1.7} style={fillT(S.deep)} opacity={0.55} />
      {eye("n")}
      {eye("f")}
      {mouth}
      {headProps}
      {poke > 0 && (
        <g key={`t${poke}`} className="lk-tongue">
          <path d="M62 13Q100 1 140 6" stroke={TONGUE} strokeWidth={7} strokeLinecap="round" fill="none" />
          <circle cx={142} cy={6} r={8.5} fill={TONGUE} />
          <circle cx={139} cy={3} r={2.6} fill="#fff" opacity={0.55} />
        </g>
      )}
    </g>
  );

  /* ── tail ── */
  const tail = hang ? HANG_TAIL : SIT_TAIL;
  const tailEl = (
    <g transform={hang ? undefined : POSE_T[cfg.body].tail}>
      <circle cx={tail.s.cx} cy={tail.s.cy} r={tail.s.r0 * 0.6} style={fillT(S.deep)} />
      <path d={tail.full} fill={u("bod")} />
      <circle cx={tail.tip.x} cy={tail.tip.y} r={tail.tip.r} fill={u("bod")} />
      <path d={tail.belly} fill={u("bel")} />
      <path d={tail.crease} style={fillT(S.deep)} opacity={0.45} />
      <path d={tail.shine} fill="#fff" opacity={0.22} />
    </g>
  );

  /* ── hand props (sit pose, raised hand at 208,116) ── */
  const handProp = (() => {
    switch (cfg.hand) {
      case "drop":
        return (
          <g transform="translate(228 90)">
            <g className="lk-perk">
              <path d="M0-12C5-4 9 0 9 6A9 9 0 0 1-9 6C-9 0-5-4 0-12Z" fill="#7CC4FF" />
              <ellipse cx={-3} cy={4} rx={2.2} ry={3.4} fill="#fff" opacity={0.75} />
            </g>
          </g>
        );
      case "mic":
        return (
          <g transform="translate(214 92)">
            <rect x={-5.5} y={-10} width={11} height={19} rx={5.5} fill={NAVY} />
            <path d="M-3-4H3M-3 0H3" stroke="#8EA7F7" strokeWidth={1.4} />
            <g className="lk-pulse" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round">
              <path d="M11-8Q16-1 11 6" /><path d="M16-12Q23-1 16 10" />
            </g>
          </g>
        );
      case "camera":
        return (
          <g transform="translate(216 104)">
            <rect x={-14} y={-9} width={28} height={19} rx={5} fill={NAVY} />
            <rect x={-6} y={-13} width={10} height={6} rx={2} fill={NAVY} />
            <circle r={5.6} fill="#8EA7F7" stroke="#fff" strokeWidth={1.6} />
            <circle cx={-1.6} cy={-1.6} r={1.6} fill="#fff" />
          </g>
        );
      default:
        return null;
    }
  })();

  const legT = POSE_T[cfg.body].body;
  const toes = (xs: number[], y: number) => xs.map((x, i) => <circle key={x} cx={x} cy={i === 1 ? y + 1.4 : y} r={4.4} fill={u("tur")} />);

  const sitScene = (
    <>
      {shadow && <ellipse cx={128} cy={182} rx={cfg.body === "sit" ? 90 : 98} ry={6} fill={NAVY} opacity={0.13} />}
      <g transform={legT}>
        {[[90, 102], [102, 96], [114, 92]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={6} fill={u("bod")} />)}
        <path d={BODY} fill={u("bod")} />
        <clipPath id={`${uid}bc`}><path d={BODY} /></clipPath>
        <g clipPath={u("bc")}><path d={BELLY} fill={u("bel")} /></g>
        <path d="M104 160C100 170 100 177 104 180L124 180C128 175 127 166 121 158Z" fill={u("leg")} />
        {toes([105.5, 113.5, 121.5], 180)}
      </g>
      {tailEl}
      <g transform={legT}>
        <path d="M158 152C154 166 155 176 159 180L180 180C184 174 183 162 176 150Z" fill={u("leg")} />
        {toes([160, 169, 178], 180)}
      </g>
      {head}
      {cfg.body === "sit" && cfg.arm !== "down" && (
        <g className={cfg.arm === "wave" && animate ? "lk-wave" : undefined} style={{ transformOrigin: "170px 140px" }}>
          <path d="M168 142Q186 132 203 121" stroke={u("leg")} strokeWidth={14} strokeLinecap="round" fill="none" />
          <circle cx={208} cy={116} r={9.6} fill={u("tur")} />
          <circle cx={209} cy={104.5} r={4.4} fill={u("tur")} />
          <circle cx={217.8} cy={108.2} r={4.4} fill={u("tur")} />
          <circle cx={219.8} cy={117.4} r={4.4} fill={u("tur")} />
          {handProp}
        </g>
      )}
    </>
  );

  const hand = (x: number) => (
    <g key={x}>
      <ellipse cx={x} cy={101} rx={9.5} ry={8} fill={u("leg")} />
      <circle cx={x - 6.5} cy={94.5} r={3.9} fill={u("tur")} />
      <circle cx={x} cy={92.8} r={4.1} fill={u("tur")} />
      <circle cx={x + 6.5} cy={94.5} r={3.9} fill={u("tur")} />
    </g>
  );

  const hangScene = (
    <>
      <path d={HANG_BODY} fill={u("bod")} />
      <clipPath id={`${uid}hb`}><path d={HANG_BODY} /></clipPath>
      <g clipPath={u("hb")}><path d={HANG_BELLY} fill={u("bel")} /></g>
      {tailEl}
      {head}
      {hand(54)}
      {hand(106)}
    </>
  );

  const animCls = !animate ? undefined : hang ? "lk-sway" : cfg.anim;

  return (
    <svg
      ref={svgRef}
      width={size}
      height={(size * VH) / VW}
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      role="img"
      aria-label={title}
      className={`lk-hit ${interactive ? "cursor-pointer select-none" : ""} ${className}`}
      style={{ overflow: "visible", ...style }}
      onClick={interactive ? () => { setPoke(p => p + 1); onPoke?.(); } : undefined}
    >
      <defs>
        <radialGradient id={`${uid}bod`} gradientUnits="userSpaceOnUse" cx={hang ? 70 : 108} cy={hang ? 100 : 98} r={hang ? 110 : 122} fx={hang ? 64 : 98} fy={hang ? 88 : 84}>
          <stop offset="0" style={stop(S.light)} /><stop offset="0.5" style={stop(S.main)} /><stop offset="1" style={stop(S.dark)} />
        </radialGradient>
        <radialGradient id={`${uid}hed`} gradientUnits="userSpaceOnUse" cx={-6} cy={-30} r={104} fx={-14} fy={-42}>
          <stop offset="0" style={stop(S.light)} /><stop offset="0.5" style={stop(S.main)} /><stop offset="1" style={stop(S.dark)} />
        </radialGradient>
        <radialGradient id={`${uid}tur`} cx="0.38" cy="0.3" r="0.78">
          <stop offset="0" style={stop(S.light)} /><stop offset="0.55" style={stop(S.main)} /><stop offset="1" style={stop(S.dark)} />
        </radialGradient>
        <radialGradient id={`${uid}scl`} cx="0.42" cy="0.36" r="0.72">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.6" stopColor="#F6F2EA" /><stop offset="1" stopColor="#D9D2C5" />
        </radialGradient>
        <linearGradient id={`${uid}lid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop(S.light)} /><stop offset="0.75" style={stop(S.main)} />
        </linearGradient>
        <linearGradient id={`${uid}bel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop(S.bellyLight)} /><stop offset="0.45" style={stop(S.belly)} /><stop offset="1" style={stop(S.bellyDark)} />
        </linearGradient>
        <linearGradient id={`${uid}leg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop(S.main)} /><stop offset="1" style={stop(S.dark)} />
        </linearGradient>
        <radialGradient id={`${uid}shd`}>
          <stop offset="0" stopColor={NAVY} stopOpacity="0.42" /><stop offset="1" stopColor={NAVY} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g key={`hop${poke}`} className={poke > 0 ? "lk-hop" : undefined}>
        <g className={animCls}>{hang ? hangScene : sitScene}</g>
      </g>
    </svg>
  );
}

/* ───────────── brand bits ───────────── */
export function LekuvoMark({ size = 32, color = "#3F51D2", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d={MARK_PATH} fill={color} />
      <circle cx={MARK_A.x} cy={MARK_A.y} r={MARK_S.w0 / 2} fill={color} />
      <circle cx={MARK_B.x} cy={MARK_B.y} r={MARK_S.w1 / 2} fill={color} />
    </svg>
  );
}

export function LekuvoLogo({ size = 30, dark = false, className = "" }: { size?: number; dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LekuvoMark size={size} color={dark ? "#9DB0FF" : "#3F51D2"} className="lk-mark" />
      <span className={`font-display font-extrabold tracking-tight leading-none ${dark ? "text-white" : "text-[#2B39A6]"}`} style={{ fontSize: size * 0.86 }}>
        lekuvo
      </span>
    </span>
  );
}

export function LekuvoAppIcon({ size = 64, skin = "classic", className = "" }: { size?: number; skin?: SkinId; className?: string }) {
  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden bg-[#1F2550] shadow-[0_14px_30px_-12px_rgba(31,37,80,0.7)] ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.27 }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_30%_10%,rgba(142,167,247,0.35),transparent)]" />
      <Lekuvo size={size * 0.92} mood="idle" skin={skin} track={false} shadow={false} animate={false} style={{ marginBottom: size * 0.04 }} />
    </div>
  );
}
