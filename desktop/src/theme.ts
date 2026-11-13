import { useSyncExternalStore } from "react";

/* ─────────────────────────────────────────────────────────────
   Global color themes. Every brand color lives in a CSS variable
   (see index.css), so switching one attribute recolors the whole
   site — Lekuvo's skin, the notch, the buttons, everything.
   ───────────────────────────────────────────────────────────── */

export type ThemeId = "classic" | "meadow" | "sunset" | "dusk";

export interface Theme {
  id: ThemeId;
  label: string;
  hint: string;
  swatch: string;
}

export const THEMES: Theme[] = [
  { id: "classic", label: "Classic", hint: "cream + royal", swatch: "linear-gradient(135deg,#FBF5EC 0%,#4C5FD7 48%,#F8D77B 100%)" },
  { id: "meadow", label: "Meadow", hint: "green + lime", swatch: "linear-gradient(135deg,#F4F8EC 0%,#1F9A6B 48%,#F3E27B 100%)" },
  { id: "sunset", label: "Sunset", hint: "coral + gold", swatch: "linear-gradient(135deg,#FDF2EA 0%,#E85A55 48%,#FFD79A 100%)" },
  { id: "dusk", label: "Dusk", hint: "violet + lilac", swatch: "linear-gradient(135deg,#F5F2FD 0%,#7356EE 48%,#FCD86F 100%)" },
];

const KEY = "lekuvo-theme";
const subs = new Set<(t: ThemeId) => void>();

function read(): ThemeId {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v && THEMES.some(t => t.id === v)) return v as ThemeId;
  } catch { /* private mode */ }
  return "classic";
}

let current: ThemeId = "classic";

function apply(t: ThemeId) {
  document.documentElement.dataset.theme = t;
  try { window.localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

/** set as early as possible in the module so the first paint is right */
if (typeof document !== "undefined") {
  current = read();
  apply(current);
}

export function getTheme(): ThemeId { return current; }

export function setTheme(t: ThemeId) {
  if (t === current) return;
  current = t;
  apply(t);
  subs.forEach(fn => fn(t));
}

export function toggleTheme(dir: 1 | -1 = 1) {
  const i = THEMES.findIndex(t => t.id === current);
  const next = THEMES[(i + dir + THEMES.length) % THEMES.length];
  setTheme(next.id);
}

function subscribe(fn: (t: ThemeId) => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
