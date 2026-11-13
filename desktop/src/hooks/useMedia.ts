import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface MediaInfo {
  playing: boolean;
  title: string;
  artist: string;
  positionSec: number;
  lengthSec: number;
  artUrl: string;
}

export interface MixerApp {
  index: number;
  name: string;
  vol: number;
  mute: boolean;
}

/**
 * Real media state from lekuvo-media (MPRIS): event-driven with a poll
 * fallback, plus a local 1s position tick between authoritative updates.
 */
export function useMedia() {
  const [info, setInfo] = useState<MediaInfo | null>(null);
  // interpolation base: last authoritative position + when we got it
  const base = useRef<{ pos: number; at: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = (m: MediaInfo | null) => {
      if (!alive) return;
      setInfo(m);
      base.current = m ? { pos: m.positionSec, at: performance.now() } : null;
    };
    const un = listen<MediaInfo | null>("media-update", e => apply(e.payload));
    const refresh = () =>
      invoke<MediaInfo | null>("media_state").then(apply).catch(() => {});
    refresh();
    const id = window.setInterval(refresh, 2500);
    return () => {
      alive = false;
      un.then(f => f());
      window.clearInterval(id);
    };
  }, []);

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const positionSec = info
    ? Math.min(
        info.lengthSec || Infinity,
        info.playing && base.current
          ? base.current.pos + (performance.now() - base.current.at) / 1000
          : info.positionSec,
      )
    : 0;

  const control = (action: "playpause" | "next" | "prev" | "seek", fraction?: number) => {
    void invoke("media_control", { action, fraction: fraction ?? null }).catch(console.error);
    // optimistic refresh so the UI reacts even between worker polls
    window.setTimeout(
      () => void invoke<MediaInfo | null>("media_state").then(m => m && setInfo(m)).catch(() => {}),
      150,
    );
  };

  return { info, positionSec, control };
}

/** Real per-app output mixers from PulseAudio (pactl), polled. */
export function useMixerApps() {
  const [apps, setApps] = useState<MixerApp[]>([]);
  useEffect(() => {
    let alive = true;
    const poll = () =>
      invoke<MixerApp[]>("mixer_state").then(a => alive && setApps(a)).catch(() => alive && setApps([]));
    poll();
    const id = window.setInterval(poll, 1500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const setVol = (index: number, vol: number) => {
    setApps(as => as.map(a => (a.index === index ? { ...a, vol } : a)));
    void invoke("mixer_set", { index, vol }).catch(console.error);
  };
  const setMute = (index: number, mute: boolean) => {
    setApps(as => as.map(a => (a.index === index ? { ...a, mute } : a)));
    void invoke("mixer_set", { index, mute }).catch(console.error);
  };
  return { apps, setVol, setMute };
}
