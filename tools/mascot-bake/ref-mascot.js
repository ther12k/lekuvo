// Standalone port of the reference Lekuvo mascot (develop repo's
// desktop/src/components/Lekuvo.tsx, extracted verbatim from the
// reference site bundle): moods, skins, poses, tail spiral, eyes,
// mouths, hands, head items and the site's `lk-*` keyframes.
//
// Rendered output is a square frame (viewBox 240x240) with the
// 240x190 artwork letterboxed vertically (translated down 25), so
// baked PNGs drop straight into the app's square mascot slots
// without aspect distortion.

export const SKINS = {
  classic: {
    label: "Classic",
    main: "#4C5FD7",
    light: "#8395F7",
    dark: "#3345B5",
    deep: "#25328A",
    belly: "#F8D77B",
    bellyLight: "#FDEEC4",
    bellyDark: "#DFAE48",
  },
  meadow: {
    label: "Meadow",
    main: "#22A776",
    light: "#66D9AA",
    dark: "#178158",
    deep: "#0E5C3F",
    belly: "#FBE38C",
    bellyLight: "#FFF3C8",
    bellyDark: "#DDB94B",
  },
  sunset: {
    label: "Sunset",
    main: "#EE6B67",
    light: "#FFA394",
    dark: "#C84B50",
    deep: "#963241",
    belly: "#FFE0A4",
    bellyLight: "#FFF2D6",
    bellyDark: "#E8B462",
  },
  dusk: {
    label: "Dusk",
    main: "#7356EE",
    light: "#A592FC",
    dark: "#5436CA",
    deep: "#3C269A",
    belly: "#FCD86F",
    bellyLight: "#FEEDB9",
    bellyDark: "#DCAC3E",
  },
};

// The reference component's mood table.
export const REF_MOODS = {
  idle: { body: "sit", eyes: "open", mouth: "smile", arm: "down", anim: "lk-breathe", look: [0.75, -0.3] },
  chill: { body: "sit", eyes: "half", mouth: "smile", arm: "down", anim: "lk-breathe", look: [0.9, 0.15] },
  focus: { body: "lie", eyes: "half", mouth: "flat", arm: "down", anim: "lk-breathe", look: [0.95, 0.3] },
  music: { body: "sit", eyes: "happy", mouth: "open", arm: "wave", head: ["notes"], anim: "lk-bob", look: [0, 0] },
  reminder: { body: "sit", eyes: "wide", mouth: "o", arm: "up", head: ["alert"], anim: "lk-perk", look: [0.55, -0.55] },
  sleep: { body: "curl", eyes: "closed", mouth: "tiny", arm: "down", head: ["zzz"], anim: "lk-breathe-slow", look: [0, 0] },
  hello: { body: "sit", eyes: "open", mouth: "open", arm: "wave", anim: "lk-breathe", look: [0.5, -0.25] },
  sip: { body: "sit", eyes: "open", mouth: "tiny", arm: "up", hand: "drop", anim: "lk-perk", look: [0.85, 0.1] },
  listen: { body: "sit", eyes: "wide", mouth: "o", arm: "up", hand: "mic", anim: "lk-bob", look: [0.85, 0.35] },
  cheese: { body: "sit", eyes: "happy", mouth: "open", arm: "up", hand: "camera", head: ["sparkles"], anim: "lk-bob", look: [0, 0] },
  calm: { body: "sit", eyes: "closed", mouth: "smile", arm: "down", head: ["moon"], anim: "lk-breathe-slow", look: [0, 0] },
  wow: { body: "sit", eyes: "wide", mouth: "open", arm: "up", head: ["sparkles"], anim: "lk-perk", look: [0.4, -0.65] },
  happy: { body: "sit", eyes: "happy", mouth: "open", arm: "down", anim: "lk-bob", look: [0, 0] },
};

// The app's twelve kit moods expressed with the reference parts.
// `dizzy` and `thinking` have no reference mood; they are authored
// here from the same part vocabulary (dizzy = dazed bob with closed
// eyes; thinking = half-lid gaze up-left, flat mouth).
export const APP_MOODS = {
  lazy: REF_MOODS.chill,
  awake: REF_MOODS.idle,
  wave: REF_MOODS.hello,
  listening: REF_MOODS.listen,
  dance: REF_MOODS.music,
  sleep: REF_MOODS.sleep,
  surprised: REF_MOODS.wow,
  dizzy: { body: "sit", eyes: "closed", mouth: "o", arm: "down", anim: "lk-bob", look: [0, 0] },
  focus: REF_MOODS.focus,
  thinking: { body: "sit", eyes: "half", mouth: "flat", arm: "down", anim: "lk-breathe", look: [-0.6, -0.5] },
  success: REF_MOODS.happy,
  alert: REF_MOODS.reminder,
};

// Primary CSS animation cycle (ms) per app mood, from the site's
// authored durations (lk-breathe 3.6s, lk-breathe-slow 5.4s,
// lk-bob .92s, lk-perk .75s).
export const APP_MOOD_CYCLES = {
  lazy: 3600,
  awake: 3600,
  wave: 1000,
  listening: 920,
  dance: 920,
  sleep: 5400,
  surprised: 750,
  dizzy: 920,
  focus: 3600,
  thinking: 3600,
  success: 920,
  alert: 750,
};

export const MASCOT_CSS = `
.lk-breathe{transform-box:fill-box;transform-origin:50% 100%;animation:3.6s ease-in-out infinite lk-breathe}
.lk-breathe-slow{transform-box:fill-box;transform-origin:50% 100%;animation:5.4s ease-in-out infinite lk-breathe}
.lk-bob{transform-box:fill-box;transform-origin:50% 100%;animation:.92s ease-in-out infinite lk-bob}
.lk-perk{transform-box:fill-box;transform-origin:50% 100%;animation:.75s ease-in-out infinite lk-perk}
.lk-wave{animation:1s ease-in-out infinite lk-wave}
.lk-float{animation:1.9s ease-out infinite lk-float}
.lk-float-slow{transform-box:fill-box;transform-origin:50%;animation:3s ease-in-out infinite lk-float-slow}
.lk-z{transform-box:fill-box;transform-origin:50%;animation:2.4s ease-in-out infinite lk-z}
.lk-twinkle{transform-box:fill-box;transform-origin:50%;animation:1.4s ease-in-out infinite lk-twinkle}
.lk-pulse{transform-box:fill-box;transform-origin:0 100%;animation:.8s ease-in-out infinite lk-pulse}
@keyframes lk-breathe{0%,to{transform:scale(1)}50%{transform:scale(1.014,.984)}}
@keyframes lk-bob{0%,to{transform:translateY(0)rotate(0)}25%{transform:translateY(-5px)rotate(-1.6deg)}75%{transform:translateY(-1px)rotate(1.6deg)}}
@keyframes lk-perk{0%,to{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes lk-wave{0%,to{transform:rotate(0)}30%{transform:rotate(-18deg)}70%{transform:rotate(10deg)}}
@keyframes lk-float{0%{opacity:0;transform:translateY(5px)}25%{opacity:1}to{opacity:0;transform:translateY(-12px)}}
@keyframes lk-z{0%{opacity:0;transform:translate(0)scale(.6)}30%{opacity:1}to{opacity:0;transform:translate(8px,-14px)scale(1.15)}}
@keyframes lk-twinkle{0%,to{opacity:.45;transform:scale(.5)rotate(0)}50%{opacity:1;transform:scale(1.12)rotate(25deg)}}
@keyframes lk-pulse{0%,to{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.86)}}
`;

const POSES = {
  sit: { head: "translate(160 82)" },
  lie: {
    body: "translate(128 180) scale(1.06 0.78) translate(-128 -180)",
    tail: "translate(58 182) scale(0.9) translate(-58 -182)",
    head: "translate(166 104) rotate(4)",
  },
  curl: {
    body: "translate(128 180) scale(1 0.72) translate(-128 -180)",
    tail: "translate(66 182) scale(0.94) translate(-58 -182)",
    head: "translate(150 116) rotate(10)",
  },
};

const PATHS = {
  mouthOpen: "M34 13Q50 31 67 10Q50 19 34 13Z",
  head: "M-44 30C-58 16-60-14-46-31C-34-44-12-50 10-47C30-45 44-37 57-28C69-20 77-6 74 6C71 18 60 26 46 30C24 38-14 44-44 30Z",
  headBelly: "M78 4C66 18 50 25 30 28C6 31-20 33-60 27L-60 64L84 64Z",
  body: "M70 162C62 130 80 98 116 92C148 87 174 100 182 126C189 150 184 176 160 180L96 180C80 179 72 172 70 162Z",
  bodyBelly: "M150 104C176 116 189 148 183 186L116 186C125 164 135 128 150 104Z",
  sparkle: "M0-8C1.2-2.4 2.4-1.2 8 0C2.4 1.2 1.2 2.4 0 8C-1.2 2.4-2.4 1.2-8 0C-2.4-1.2-1.2-2.4 0-8Z",
};

const INK = "#1F2550";
const PUPIL = "#191D3D";
const MOUTH_INK = "#24205A";
const TONGUE_PINK = "#FF7E9D";
const GOLD = "#F4C64B";

// ---------------------------------------------------------------------------
// Tail spiral (verbatim port of the reference generator).
// ---------------------------------------------------------------------------

const PI = Math.PI;
const resolve = (v, m) => (typeof v === "number" ? v : v(m));
const smooth = (a, b) => (t) => {
  const o = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return o * o * (3 - 2 * o);
};

function spiral(spec, inner, outer, from = 0, to = 1, steps = 90) {
  const front = [];
  const back = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = from + (to - from) * (i / steps);
    const angle = spec.a0 - spec.sweep * t;
    const radius = spec.r0 + (spec.r1 - spec.r0) * t;
    const width = spec.w0 + (spec.w1 - spec.w0) * t;
    const a = radius - width / 2 + width * resolve(outer, t);
    const b = radius - width / 2 + width * resolve(inner, t);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    front.push(`${(spec.cx + a * cos).toFixed(1)} ${(spec.cy + a * sin).toFixed(1)}`);
    back.push(`${(spec.cx + b * cos).toFixed(1)} ${(spec.cy + b * sin).toFixed(1)}`);
  }
  return `M${front.join("L")}L${back.reverse().join("L")}Z`;
}

function tailShape(spec) {
  const end = spec.a0 - spec.sweep;
  return {
    spec,
    full: spiral(spec, 0, 1),
    belly: spiral(spec, 0, (t) => 0.47 * smooth(0.04, 0.18)(t)),
    crease: spiral(spec, (t) => 1 - 0.13 * smooth(0.12, 0.26)(t), 1),
    shine: spiral(spec, 0.6, (t) => 0.6 + 0.2 * Math.sin(PI * (t - 0.1) / 0.42), 0.1, 0.52),
    tip: {
      x: spec.cx + spec.r1 * Math.cos(end),
      y: spec.cy + spec.r1 * Math.sin(end),
      r: spec.w1 / 2,
    },
  };
}

const GROUND_TAIL = tailShape({
  cx: 58, cy: 146, r0: 36, r1: 4.5, w0: 25, w1: 7,
  a0: -PI / 2 + 0.95, sweep: 3.35 * PI,
});

// ---------------------------------------------------------------------------
// SVG builders.
// ---------------------------------------------------------------------------

function eye(idPrefix, which, mood, skin) {
  const near = which === "n";
  const cx = near ? 12 : 56;
  const cy = near ? -11 : -28;
  const socketR = near ? 26 : 15.5;
  const scleraR = near ? 19 : 11.4;
  const pupilR = near ? 10.5 : 6.4;
  const reach = near ? 6.5 : 3.8;
  const eyes = mood.eyes;
  const pupilsVisible = eyes !== "closed" && eyes !== "happy";
  const lidOnly = eyes === "closed" || eyes === "happy";
  const lidDrop = eyes === "wide" ? 0.12 : eyes === "half" ? 0.56 : 0.34;
  const clipR = scleraR + 0.8;
  const lidBottom = cy - scleraR + 2 * scleraR * lidDrop;
  const lidPath = `M${cx - clipR - 3} ${cy - clipR - 3}H${cx + clipR + 3}V${lidBottom - 2}Q${cx} ${lidBottom + 5} ${cx - clipR - 3} ${lidBottom - 2}Z`;
  const lidLine = `M${cx - clipR - 3} ${lidBottom - 2}Q${cx} ${lidBottom + 5} ${cx + clipR + 3} ${lidBottom - 2}`;
  const look = mood.look;
  const parts = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${socketR}" fill="url(#${idPrefix}tur)" style="stroke:${skin.dark}" stroke-opacity=".28" stroke-width="1.6"/>`);
  parts.push(`<circle data-sclera="${which}" cx="${cx}" cy="${cy}" r="${scleraR}" fill="url(#${idPrefix}scl)"/>`);
  parts.push(`<clipPath id="${idPrefix}c${which}"><circle cx="${cx}" cy="${cy}" r="${clipR}"/></clipPath>`);
  if (pupilsVisible) {
    parts.push(`<g data-pupil="${which}" transform="translate(${look[0] * reach} ${look[1] * reach})"><circle cx="${cx}" cy="${cy}" r="${pupilR}" fill="${PUPIL}"/><circle cx="${cx + pupilR * 0.36}" cy="${cy - pupilR * 0.38}" r="${pupilR * 0.33}" fill="#fff"/><circle cx="${cx - pupilR * 0.34}" cy="${cy + pupilR * 0.36}" r="${pupilR * 0.14}" fill="#fff" opacity=".75"/></g>`);
  }
  parts.push(`<g clip-path="url(#${idPrefix}c${which})">`);
  if (lidOnly) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${clipR + 1}" fill="url(#${idPrefix}lid)"/>`);
  } else {
    parts.push(`<path d="${lidPath}" fill="url(#${idPrefix}lid)"/>`);
    parts.push(`<path d="${lidLine}" style="stroke:${skin.deep}" stroke-width="${scleraR * 0.15}" fill="none" stroke-linecap="round"/>`);
  }
  parts.push(`</g>`);
  if (eyes === "closed") {
    parts.push(`<path d="M${cx - scleraR * 0.62} ${cy + scleraR * 0.05}Q${cx} ${cy + scleraR * 0.5} ${cx + scleraR * 0.62} ${cy + scleraR * 0.05}" style="stroke:${skin.deep}" stroke-width="${scleraR * 0.16}" stroke-linecap="round" fill="none"/>`);
  }
  if (eyes === "happy") {
    parts.push(`<path d="M${cx - scleraR * 0.6} ${cy + scleraR * 0.3}Q${cx} ${cy - scleraR * 0.45} ${cx + scleraR * 0.6} ${cy + scleraR * 0.3}" style="stroke:${skin.deep}" stroke-width="${scleraR * 0.16}" stroke-linecap="round" fill="none"/>`);
  }
  return parts.join("");
}

function mouth(idPrefix, mood, skin) {
  switch (mood.mouth) {
    case "open":
      return `<g><path d="${PATHS.mouthOpen}" fill="${MOUTH_INK}"/><clipPath id="${idPrefix}mc"><path d="${PATHS.mouthOpen}"/></clipPath><ellipse cx="51" cy="22" rx="8" ry="4" fill="${TONGUE_PINK}" clip-path="url(#${idPrefix}mc)"/></g>`;
    case "o":
      return `<ellipse cx="52" cy="18" rx="4.4" ry="5.2" fill="${MOUTH_INK}"/>`;
    case "flat":
      return `<path d="M40 17Q52 20 63 15" style="stroke:${skin.deep}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
    case "tiny":
      return `<path d="M46 17Q52 21 58 16" style="stroke:${skin.deep}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
    default:
      return `<g style="stroke:${skin.deep}" stroke-width="2.8" stroke-linecap="round" fill="none"><path d="M36 15Q50 23 64 11"/><path d="M64 11q3.5-1 4.6-4.6"/></g>`;
  }
}

function noteGlyph(double) {
  if (double) {
    return `<g fill="${INK}"><ellipse cx="0" cy="12" rx="4.6" ry="3.6" transform="rotate(-22 0 12)"/><ellipse cx="13" cy="9" rx="4.6" ry="3.6" transform="rotate(-22 13 9)"/><rect x="3" y="-4" width="2.4" height="16" rx="1.2"/><rect x="16" y="-7" width="2.4" height="16" rx="1.2"/><path d="M3-4L18.4-7V-2.5L3 0.5Z"/></g>`;
  }
  return `<g fill="${INK}"><ellipse cx="0" cy="10" rx="5.2" ry="4" transform="rotate(-22 0 10)"/><rect x="3.2" y="-8" width="2.6" height="18.5" rx="1.3"/><path d="M5.8-8c6 1.5 9 5 8 11-1.6-3.6-4.4-5-8-5.2z"/></g>`;
}

function headItems(mood) {
  const items = mood.head ?? [];
  const parts = [];
  for (const item of items) {
    if (item === "notes") {
      parts.push(`<g><g transform="translate(40 -60)"><g class="lk-float">${noteGlyph(false)}</g></g><g transform="translate(70 -46)"><g class="lk-float" style="animation-delay:.8s">${noteGlyph(true)}</g></g></g>`);
    } else if (item === "alert") {
      parts.push(`<g transform="translate(66 -40)"><g class="lk-pulse" stroke="${GOLD}" stroke-width="5.5" stroke-linecap="round"><path d="M0-8L3-22"/><path d="M10-2L22-10"/><path d="M14 10L28 9"/></g></g>`);
    } else if (item === "zzz") {
      parts.push(`<g fill="${INK}" font-family="Outfit, Nunito, sans-serif" font-weight="800"><g transform="translate(48 -44)"><text class="lk-z" font-size="20">z</text></g><g transform="translate(64 -60)"><text class="lk-z" style="animation-delay:.8s" font-size="15">z</text></g><g transform="translate(78 -72)"><text class="lk-z" style="animation-delay:1.6s" font-size="11">z</text></g></g>`);
    } else if (item === "sparkles") {
      parts.push(`<g><g transform="translate(-50 -56) scale(1.3)"><path class="lk-twinkle" d="${PATHS.sparkle}" fill="${GOLD}"/></g><g transform="translate(88 -36)"><path class="lk-twinkle" style="animation-delay:.4s" d="${PATHS.sparkle}" fill="${GOLD}"/></g><g transform="translate(66 -70) scale(.8)"><path class="lk-twinkle" style="animation-delay:.8s" d="${PATHS.sparkle}" fill="${GOLD}"/></g></g>`);
    } else if (item === "moon") {
      parts.push(`<g transform="translate(74 -62)"><g class="lk-float-slow"><path d="M6-12A13 13 0 1 0 14 10A10 10 0 1 1 6-12Z" fill="${GOLD}"/></g></g>`);
    }
  }
  return parts.join("");
}

function handItem(mood) {
  switch (mood.hand) {
    case "drop":
      return `<g transform="translate(228 90)"><g class="lk-perk"><path d="M0-12C5-4 9 0 9 6A9 9 0 0 1-9 6C-9 0-5-4 0-12Z" fill="#7CC4FF"/><ellipse cx="-3" cy="4" rx="2.2" ry="3.4" fill="#fff" opacity=".75"/></g></g>`;
    case "mic":
      return `<g transform="translate(214 92)"><rect x="-5.5" y="-10" width="11" height="19" rx="5.5" fill="${INK}"/><path d="M-3-4H3M-3 0H3" stroke="#8EA7F7" stroke-width="1.4"/><g class="lk-pulse" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M11-8Q16-1 11 6"/><path d="M16-12Q23-1 16 10"/></g></g>`;
    case "camera":
      return `<g transform="translate(216 104)"><rect x="-14" y="-9" width="28" height="19" rx="5" fill="${INK}"/><rect x="-6" y="-13" width="10" height="6" rx="2" fill="${INK}"/><circle r="5.6" fill="#8EA7F7" stroke="#fff" stroke-width="1.6"/><circle cx="-1.6" cy="-1.6" r="1.6" fill="#fff"/></g>`;
    default:
      return "";
  }
}

function toes(idPrefix, xs, y) {
  return xs
    .map((x, index) => `<circle cx="${x}" cy="${index === 1 ? y + 1.4 : y}" r="4.4" fill="url(#${idPrefix}tur)"/>`)
    .join("");
}

function defs(idPrefix, skin) {
  return `<defs>
<radialGradient id="${idPrefix}bod" gradientUnits="userSpaceOnUse" cx="108" cy="98" r="122" fx="98" fy="84"><stop offset="0" stop-color="${skin.light}"/><stop offset="0.5" stop-color="${skin.main}"/><stop offset="1" stop-color="${skin.dark}"/></radialGradient>
<radialGradient id="${idPrefix}hed" gradientUnits="userSpaceOnUse" cx="-6" cy="-30" r="104" fx="-14" fy="-42"><stop offset="0" stop-color="${skin.light}"/><stop offset="0.5" stop-color="${skin.main}"/><stop offset="1" stop-color="${skin.dark}"/></radialGradient>
<radialGradient id="${idPrefix}tur" cx="0.38" cy="0.3" r="0.78"><stop offset="0" stop-color="${skin.light}"/><stop offset="0.55" stop-color="${skin.main}"/><stop offset="1" stop-color="${skin.dark}"/></radialGradient>
<radialGradient id="${idPrefix}scl" cx="0.42" cy="0.36" r="0.72"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F6F2EA"/><stop offset="1" stop-color="#D9D2C5"/></radialGradient>
<linearGradient id="${idPrefix}lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin.light}"/><stop offset="0.75" stop-color="${skin.main}"/></linearGradient>
<linearGradient id="${idPrefix}bel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin.bellyLight}"/><stop offset="0.45" stop-color="${skin.belly}"/><stop offset="1" stop-color="${skin.bellyDark}"/></linearGradient>
<linearGradient id="${idPrefix}leg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin.main}"/><stop offset="1" stop-color="${skin.dark}"/></linearGradient>
<radialGradient id="${idPrefix}shd"><stop offset="0" stop-color="${INK}" stop-opacity="0.42"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>
</defs>`;
}

/**
 * Renders one app mood as a square SVG string.
 * @param {string} appMood one of APP_MOODS' keys
 * @param {object} opts `{ size, skin, idPrefix, animate }`
 */
export function renderAppMood(appMood, opts = {}) {
  const size = opts.size ?? 288;
  const skin = SKINS[opts.skin ?? "classic"] ?? SKINS.classic;
  const idPrefix = (opts.idPrefix ?? "mascot").replace(/[^a-zA-Z0-9_-]/g, "");
  const animate = opts.animate !== false;
  const mood = APP_MOODS[appMood] ?? APP_MOODS.awake;
  const pose = POSES[mood.body] ?? POSES.sit;
  const bodyTransform = pose.body ? ` transform="${pose.body}"` : "";
  const tailTransform = pose.tail ? ` transform="${pose.tail}"` : "";

  const headGroup = `<g transform="${pose.head}">
<ellipse cx="-6" cy="40" rx="42" ry="12" fill="url(#${idPrefix}shd)"/>
<ellipse cx="-50" cy="6" rx="12" ry="30" fill="url(#${idPrefix}shd)"/>
<path d="${PATHS.head}" fill="url(#${idPrefix}hed)"/>
<clipPath id="${idPrefix}hc"><path d="${PATHS.head}"/></clipPath>
<g clip-path="url(#${idPrefix}hc)"><path d="${PATHS.headBelly}" fill="url(#${idPrefix}bel)"/><path d="M-60 34C-20 48 30 46 84 22L84 64L-60 64Z" fill="${skin.bellyDark}" opacity=".3"/><path d="M-42-31C-30-43-8-48 16-46" stroke="${skin.light}" stroke-opacity=".55" stroke-width="6" stroke-linecap="round" fill="none"/><ellipse cx="-16" cy="-36" rx="24" ry="7" fill="#fff" opacity=".08" transform="rotate(-8 -16 -36)"/></g>
<path d="M-40-22C-28-35-8-41 16-40" stroke="${skin.dark}" stroke-opacity=".38" stroke-width="2.4" stroke-linecap="round" fill="none"/>
<circle cx="65" cy="-5" r="1.7" fill="${skin.deep}" opacity=".55"/>
${eye(idPrefix, "n", mood, skin)}
${eye(idPrefix, "f", mood, skin)}
${mouth(idPrefix, mood, skin)}
${headItems(mood)}
</g>`;

  const tail = `<g${tailTransform}>
<circle cx="${GROUND_TAIL.spec.cx}" cy="${GROUND_TAIL.spec.cy}" r="${GROUND_TAIL.spec.r0 * 0.6}" fill="${skin.deep}"/>
<path d="${GROUND_TAIL.full}" fill="url(#${idPrefix}bod)"/>
<circle cx="${GROUND_TAIL.tip.x}" cy="${GROUND_TAIL.tip.y}" r="${GROUND_TAIL.tip.r}" fill="url(#${idPrefix}bod)"/>
<path d="${GROUND_TAIL.belly}" fill="url(#${idPrefix}bel)"/>
<path d="${GROUND_TAIL.crease}" fill="${skin.deep}" opacity=".45"/>
<path d="${GROUND_TAIL.shine}" fill="#fff" opacity=".22"/>
</g>`;

  const arm =
    mood.body === "sit" && mood.arm !== "down"
      ? `<g${mood.arm === "wave" && animate ? ' class="lk-wave"' : ""} style="transform-origin:170px 140px"><path d="M168 142Q186 132 203 121" stroke="url(#${idPrefix}leg)" stroke-width="14" stroke-linecap="round" fill="none"/><circle cx="208" cy="116" r="9.6" fill="url(#${idPrefix}tur)"/><circle cx="209" cy="104.5" r="4.4" fill="url(#${idPrefix}tur)"/><circle cx="217.8" cy="108.2" r="4.4" fill="url(#${idPrefix}tur)"/><circle cx="219.8" cy="117.4" r="4.4" fill="url(#${idPrefix}tur)"/>${handItem(mood)}</g>`
      : "";

  const standing = `
<ellipse cx="128" cy="182" rx="${mood.body === "sit" ? 90 : 98}" ry="6" fill="${INK}" opacity=".13"/>
<g${bodyTransform}><circle cx="90" cy="102" r="6" fill="url(#${idPrefix}bod)"/><circle cx="102" cy="96" r="6" fill="url(#${idPrefix}bod)"/><circle cx="114" cy="92" r="6" fill="url(#${idPrefix}bod)"/><path d="${PATHS.body}" fill="url(#${idPrefix}bod)"/><clipPath id="${idPrefix}bc"><path d="${PATHS.body}"/></clipPath><g clip-path="url(#${idPrefix}bc)"><path d="${PATHS.bodyBelly}" fill="url(#${idPrefix}bel)"/></g><path d="M104 160C100 170 100 177 104 180L124 180C128 175 127 166 121 158Z" fill="url(#${idPrefix}leg)"/>${toes(idPrefix, [105.5, 113.5, 121.5], 180)}</g>
${tail}
<g${bodyTransform}><path d="M158 152C154 166 155 176 159 180L180 180C184 174 183 162 176 150Z" fill="url(#${idPrefix}leg)"/>${toes(idPrefix, [160, 169, 178], 180)}</g>
${headGroup}
${arm}`;

  const animClass = animate ? mood.anim : undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 240 240" fill="none" role="img" aria-label="Lekuvo the chameleon" style="overflow:visible">${defs(idPrefix, skin)}<g class="${animClass ?? ""}"><g transform="translate(0 25)">${standing}</g></g></svg>`;
}
