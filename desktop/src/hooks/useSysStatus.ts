import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SysStatus {
  vol: number;
  mute: boolean;
  wifi: boolean;
  batteryPct: number | null;
  charging: boolean;
  dnd: boolean;
  brightness: number | null;
  dark: boolean;
  clock24: boolean;
}

/** Real system status: default-sink volume, wifi link, battery, DND. */
export function useSysStatus() {
  const [st, setSt] = useState<SysStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () =>
      invoke<SysStatus>("sys_status")
        .then(s => {
          if (!alive || !s) return;
          // skip re-render when nothing actually changed
          setSt(prev => (prev && JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
        })
        .catch(() => {});
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const set = (patch: { vol?: number; mute?: boolean; dnd?: boolean; brightness?: number; dark?: boolean }) => {
    setSt(s => (s ? { ...s, ...patch } : s));
    void invoke("sys_set", patch).catch(console.error);
  };
  return { st, set };
}
