import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AiAccount {
  name: string;
  short: string;
  usedPct: number;
  resetMs: number | null;
}

interface TokenQuota {
  used_pct?: number | null;
  reset_ms?: number | null;
}

interface AiRaw {
  glm?: {
    enabled?: boolean;
    status?: string;
    accounts?: { name?: string; short?: string; status?: string; token_quota?: TokenQuota }[];
  };
  summary?: {
    text?: string;
    has_warning?: boolean;
    panel_accounts?: { name?: string; short?: string; used_pct?: number; reset_ms?: number | null }[];
  };
}

/** Same fallback chain gnome-notch uses: summary.panel_accounts first,
 *  then glm.accounts with usable quotas. */
export function panelAccounts(raw: AiRaw | null): AiAccount[] {
  if (!raw) return [];
  const pa = raw.summary?.panel_accounts ?? [];
  if (pa.length) {
    return pa.map(a => ({
      name: a.name ?? "account",
      short: a.short ?? (a.name ?? "ai").slice(0, 7),
      usedPct: a.used_pct ?? 0,
      resetMs: a.reset_ms ?? null,
    }));
  }
  return (raw.glm?.accounts ?? [])
    .filter(a => a.status === "ok" && a.token_quota && a.token_quota.used_pct != null)
    .map(a => ({
      name: a.name ?? "glm",
      short: a.short ?? (a.name ?? "glm").slice(0, 7),
      usedPct: a.token_quota!.used_pct ?? 0,
      resetMs: a.token_quota!.reset_ms ?? null,
    }));
}

/** AI API consumption from the aiacctool collector (30s poll, guarded
 *  against overlapping runs — the collector can take a while). */
export function useAi() {
  const [raw, setRaw] = useState<AiRaw | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await invoke<AiRaw>("ai_status");
        if (alive) {
          setRaw(data);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        pending = false;
      }
    };
    void poll();
    const id = window.setInterval(poll, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return { accounts: panelAccounts(raw), text: raw?.summary?.text ?? null, hasWarning: !!raw?.summary?.has_warning, error };
}

/* ───────────────────────── Google Home / Home Assistant ───────────────────────── */

export interface GhomeDevice {
  id: string;
  name: string;
  room: string;
  type: string; // socket | light | switch | thermostat
  state: string; // on | off | offline
}

export interface GhomeStatus {
  live: boolean;
  summary: { active_count: number; total_count: number; offline_count: number; has_active: boolean };
  rooms: Record<string, GhomeDevice[]>;
}

export function useGhome() {
  const [st, setSt] = useState<GhomeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      invoke<GhomeStatus>("ghome", { action: null })
        .then(s => {
          if (alive) {
            setSt(s);
            setError(null);
          }
        })
        .catch(e => alive && setError(String(e)));
    void poll();
    const id = window.setInterval(poll, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const cmd = (action: "toggle" | "on" | "off", id: string) => {
    setBusy(id);
    setError(null);
    invoke<GhomeStatus>("ghome", { action, id })
      .then(s => setSt(s))
      .catch(e => setError(String(e)))
      .finally(() => setBusy(null));
  };

  return { st, error, busy, cmd, refresh: () => invoke<GhomeStatus>("ghome", { action: null }).then(setSt).catch(e => setError(String(e))) };
}
