import type { LucideIcon } from "lucide-react";
import { CheckSquare, Camera, ClipboardList, CloudRain, Music, Settings, SlidersHorizontal, TreePine, Timer, Waves, Music2, Flame, Wind, MoonStar, AudioWaveform } from "lucide-react";
import type { LekuvoMood, SkinId } from "../Lekuvo";
import type { NoiseKey } from "../../hooks/useNoise";

export type TabId = "music" | "focus" | "todo" | "board" | "mixer" | "noise" | "mirror" | "system";

export const TABS: { id: TabId; label: string; icon: LucideIcon; color: string; mood: LekuvoMood }[] = [
  { id: "music", label: "Music", icon: Music, color: "#9DB2FF", mood: "music" },
  { id: "focus", label: "Focus", icon: Timer, color: "#F8D77B", mood: "focus" },
  { id: "todo", label: "To-do", icon: CheckSquare, color: "#86E3C3", mood: "reminder" },
  { id: "board", label: "Board", icon: ClipboardList, color: "#7DD3FC", mood: "wow" },
  { id: "mixer", label: "Mixer", icon: SlidersHorizontal, color: "#FFB38A", mood: "chill" },
  { id: "noise", label: "Noise", icon: CloudRain, color: "#C4B5FD", mood: "calm" },
  { id: "mirror", label: "Mirror", icon: Camera, color: "#FF9EC4", mood: "hello" },
  { id: "system", label: "System", icon: Settings, color: "#A5B4FC", mood: "hello" },
];

/** what Lekuvo says in the panel footer for each tab */
export const TIPS: Record<TabId, string> = {
  music: "Lyrics scroll on their own, thanks to LRCLIB.",
  focus: "Collapse me and the timer stays in the pill.",
  todo: "Give a task a time and I'll poke you.",
  board: "Everything you copy lands here. Tap to re-copy.",
  mixer: "Every app gets its own volume knob.",
  noise: "Rain + kalimba = instant cozy.",
  mirror: "Your camera feed never leaves this page.",
  system: "Wi-Fi, Bluetooth, brightness — all real, all here.",
};

export interface Song {
  title: string;
  artist: string;
  source: string;
  dur: number;
  colors: [string, string];
  lyrics: string[];
  /** real cover art (converted file:// or https URL); vinyl gradient when absent */
  art?: string;
}

export const SONGS: Song[] = [
  {
    title: "Neon Bubblegum", artist: "Lola Waves", source: "Spotify", dur: 192, colors: ["#FF9EC4", "#7C6CF2"],
    lyrics: ["Pink lights on the avenue", "Bubblegum skies, I'm chasing you", "Windows down, volume loud", "Dancing on a neon cloud", "Say my name like a melody", "Stay a little, stay with me"],
  },
  {
    title: "3AM Ramen", artist: "Kopi Club", source: "YouTube", dur: 168, colors: ["#FFC56B", "#FF7E7E"],
    lyrics: ["Kettle's singing in the dark", "Steam is drawing little hearts", "Noodles, eggs, and midnight thoughts", "Everything I never bought", "Slurp the stress away tonight", "Tomorrow's problem, out of sight"],
  },
  {
    title: "Paper Planes", artist: "Nara", source: "Spotify", dur: 214, colors: ["#7DD3FC", "#4C5FD7"],
    lyrics: ["Fold the Monday into wings", "Let it fly past everything", "Rooftop sunsets, city hum", "Whatever's next, we've just begun", "Catch the wind, don't look down", "Paper planes above the town"],
  },
];

export interface Todo { id: number; text: string; done: boolean; time: string }
export interface Clip { id: number; kind: "text" | "link" | "image"; label: string; sub: string; hue?: string }
export interface ShelfFile { id: number; name: string }

export const MIXER_APPS: { key: string; letter: string; color: string }[] = [
  { key: "Spotify", letter: "S", color: "#1DB954" },
  { key: "YouTube", letter: "Y", color: "#FF4B3E" },
  { key: "Discord", letter: "D", color: "#6B77F6" },
  { key: "Zoom", letter: "Z", color: "#2D8CFF" },
];
export type MixerState = Record<string, { vol: number; mute: boolean }>;

export const NOISES: { key: NoiseKey; label: string; icon: LucideIcon; grad: string; color: string }[] = [
  { key: "rain", label: "Rain", icon: CloudRain, grad: "linear-gradient(135deg,#7DD3FC,#4C5FD7)", color: "#7DD3FC" },
  { key: "forest", label: "Forest", icon: TreePine, grad: "linear-gradient(135deg,#86E3C3,#1F8A63)", color: "#86E3C3" },
  { key: "waves", label: "Waves", icon: Waves, grad: "linear-gradient(135deg,#9DB2FF,#3446B6)", color: "#9DB2FF" },
  { key: "kalimba", label: "Kalimba", icon: Music2, grad: "linear-gradient(135deg,#F8D77B,#F08A4B)", color: "#F8D77B" },
  { key: "fire", label: "Fire", icon: Flame, grad: "linear-gradient(135deg,#FDBA74,#DC2626)", color: "#FDBA74" },
  { key: "wind", label: "Wind", icon: Wind, grad: "linear-gradient(135deg,#A5F3FC,#0EA5E9)", color: "#A5F3FC" },
  { key: "night", label: "Night", icon: MoonStar, grad: "linear-gradient(135deg,#C4B5FD,#312E81)", color: "#C4B5FD" },
  { key: "deep", label: "Deep", icon: AudioWaveform, grad: "linear-gradient(135deg,#6EE7B7,#0F766E)", color: "#6EE7B7" },
];
export type NoiseState = Record<NoiseKey, { on: boolean; vol: number }>;

export type PosId = "tl" | "t" | "tr" | "l" | "r" | "bl" | "b" | "br" | "free";
export type Edge = "top" | "bottom" | "left" | "right" | "none";
export const POSITIONS: { id: PosId; label: string; ax: number; ay: number; edge: Edge }[] = [
  { id: "tl", label: "Top left", ax: 0, ay: 0, edge: "top" },
  { id: "t", label: "Top center", ax: 0.5, ay: 0, edge: "top" },
  { id: "tr", label: "Top right", ax: 1, ay: 0, edge: "top" },
  { id: "l", label: "Left", ax: 0, ay: 0.5, edge: "left" },
  { id: "r", label: "Right", ax: 1, ay: 0.5, edge: "right" },
  { id: "bl", label: "Bottom left", ax: 0, ay: 1, edge: "bottom" },
  { id: "b", label: "Bottom center", ax: 0.5, ay: 1, edge: "bottom" },
  { id: "br", label: "Bottom right", ax: 1, ay: 1, edge: "bottom" },
  { id: "free", label: "Floating", ax: 0.5, ay: 0.5, edge: "none" },
];

export interface Wall { id: string; label: string; skin: SkinId; top: string; bottom: string; w1: string; w2: string; w3: string; swatch: string }
export const WALLS: Wall[] = [
  { id: "bloom", label: "Bloom", skin: "classic", top: "#D3E3FC", bottom: "#A3C3F4", w1: "#BCD3F8", w2: "#E3EDFD", w3: "#8FB4F0", swatch: "linear-gradient(135deg,#D3E3FC,#8FB4F0)" },
  { id: "meadow", label: "Meadow", skin: "meadow", top: "#D9F4E6", bottom: "#A2DEC0", w1: "#C0ECD5", w2: "#EAF9F0", w3: "#82D2AB", swatch: "linear-gradient(135deg,#D9F4E6,#82D2AB)" },
  { id: "sunset", label: "Sunset", skin: "sunset", top: "#FFE6D6", bottom: "#FFBBA2", w1: "#FFD0BC", w2: "#FFF2E8", w3: "#FFA08A", swatch: "linear-gradient(135deg,#FFE6D6,#FFA08A)" },
  { id: "dusk", label: "Dusk", skin: "dusk", top: "#D6CFFA", bottom: "#9A8DE6", w1: "#BDB3F4", w2: "#E7E3FD", w3: "#8274DD", swatch: "linear-gradient(135deg,#D6CFFA,#8274DD)" },
];

export const DICTATIONS = [
  "Hey team, the launch moved to Friday. I'll send the updated checklist tonight!",
  "Reminder to self: buy coffee beans, call mom, and water the plants.",
  "Selamat pagi semua, meeting kita mulai jam sepuluh ya. See you there!",
];

export const FOCUS_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
