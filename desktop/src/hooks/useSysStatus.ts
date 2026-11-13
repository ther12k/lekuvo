import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SysStatus {
  vol: number;
  mute: boolean;
  wifi: boolean;
  batteryPct: number | null;
  charging: boolean;
  dnd: boolean;
}

/** Real system status: default-sink volume, wifi link, battery, DND. */
export function useSysStatus() {
  const [st, setSt] = useState<SysStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => invoke<SysStatus>("sys_status").then(s => alive && setSt(s)).catch(() => {});
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const set = (patch: { vol?: number; mute?: boolean; dnd?: boolean }) => {
    setSt(s => (s ? { ...s, ...patch } : s));
    void invoke("sys_set", patch).catch(console.error);
  };
  return { st, set };
}
