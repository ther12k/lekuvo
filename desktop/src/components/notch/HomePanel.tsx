import { Lightbulb, Plug, RefreshCcw, Thermometer, ToggleLeft } from "lucide-react";
import { useGhome } from "../../hooks/useCollectors";
import type { GhomeDevice } from "../../hooks/useCollectors";

function DeviceIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5";
  if (type === "light") return <Lightbulb className={cls} />;
  if (type === "socket") return <Plug className={cls} />;
  if (type === "thermostat") return <Thermometer className={cls} />;
  return <ToggleLeft className={cls} />;
}

function DeviceRow({ d, busy, onToggle }: { d: GhomeDevice; busy: boolean; onToggle: () => void }) {
  const on = d.state === "on";
  const offline = d.state === "offline";
  return (
    <button
      onClick={onToggle}
      disabled={busy || offline}
      aria-label={`${d.name} ${on ? "on" : "off"}`}
      className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 h-9 text-left transition ${on ? "bg-[#6FD9E8]/20" : "hover:bg-white/10"} ${offline ? "opacity-40" : ""}`}
    >
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-[#6FD9E8] text-navy" : "bg-white/10 text-white/55"}`}>
        <DeviceIcon type={d.type} />
      </span>
      <span className="text-xs font-bold truncate flex-1">{d.name}</span>
      {busy ? (
        <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-[#6FD9E8] animate-spin shrink-0" />
      ) : (
        <span className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${on ? "bg-[#6FD9E8]" : "bg-white/15"}`}>
          <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
        </span>
      )}
    </button>
  );
}

export default function HomePanel() {
  const { st, error, busy, cmd, refresh } = useGhome();

  if (!st) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-[#6FD9E8] animate-spin" />
      </div>
    );
  }

  const rooms = Object.entries(st.rooms ?? {});
  const devices = rooms.flatMap(([, ds]) => ds);

  const allOn = () => devices.filter(d => d.state !== "offline").forEach(d => cmd("on", d.id));
  const allOff = () => devices.forEach(d => cmd("off", d.id));

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2 px-1">
        <p className="text-[11px] font-extrabold text-white/60 flex-1 truncate">
          {st.summary.active_count}/{st.summary.total_count} active
          {!st.live && <span className="text-white/35 font-bold"> · simulation (no backend)</span>}
        </p>
        <button onClick={allOn} className="text-[10px] font-extrabold bg-[#6FD9E8]/20 text-[#6FD9E8] hover:bg-[#6FD9E8]/30 px-2.5 py-1 rounded-full transition">All on</button>
        <button onClick={allOff} className="text-[10px] font-extrabold bg-white/10 text-white/60 hover:bg-white/20 px-2.5 py-1 rounded-full transition">All off</button>
        <button onClick={() => void refresh()} aria-label="Refresh" className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition">
          <RefreshCcw className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll space-y-2 pr-0.5">
        {rooms.map(([room, ds]) => (
          <div key={room} className="rounded-2xl bg-white/[0.05] border border-white/10 p-2 space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/40 px-1.5 pt-0.5">{room}</p>
            {ds.map(d => (
              <DeviceRow key={d.id} d={d} busy={busy === d.id} onToggle={() => cmd("toggle", d.id)} />
            ))}
          </div>
        ))}
        {rooms.length === 0 && <p className="text-center text-xs text-white/40 pt-8">No devices configured.</p>}
      </div>

      {error && <p className="text-[11px] text-pink px-1 truncate" title={error}>{error}</p>}
    </div>
  );
}
