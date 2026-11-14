import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAi } from "../../hooks/useCollectors";
import type { AiAccount } from "../../hooks/useCollectors";

const usedColor = (pct: number) => (pct >= 95 ? "#FF9EC4" : pct >= 80 ? "#F8D77B" : "#86E3C3");

function resetIn(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`;
}

function AccountRow({ a }: { a: AiAccount }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick(n => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const c = usedColor(a.usedPct);
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-navy shrink-0" style={{ background: c }}>
          {a.short.slice(0, 2).toUpperCase()}
        </span>
        <span className="text-xs font-bold truncate flex-1">{a.name}</span>
        <span className="text-[13px] font-extrabold tabular-nums" style={{ color: c }}>{Math.round(a.usedPct)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, a.usedPct)}%`, background: c }} />
      </div>
      <p className="text-[10px] text-white/40 mt-1.5 font-bold">{resetIn(a.resetMs) ?? "no reset window"}</p>
    </div>
  );
}

export default function AiPanel() {
  const { accounts, text, hasWarning, error } = useAi();

  if (accounts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <span className="w-14 h-14 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-butter" />
        </span>
        <div>
          <p className="font-display font-bold text-white">{text ?? "AI quota"}</p>
          <p className="text-xs text-white/50 mt-1">
            {error ? "Collector failed — check ~/.config/ai-usage-monitor" : "No AI accounts reporting right now."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className={`w-3.5 h-3.5 ${hasWarning ? "text-butter" : "text-white/50"}`} />
        <p className="text-[11px] font-extrabold text-white/60 truncate flex-1">{text}</p>
        <span className="text-[10px] font-bold text-white/35">{accounts.length} account{accounts.length > 1 ? "s" : ""}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll grid grid-cols-2 gap-2 pr-0.5 content-start">
        {accounts.map(a => <AccountRow key={a.name + a.short} a={a} />)}
      </div>
    </div>
  );
}
