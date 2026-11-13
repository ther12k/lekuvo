import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bell, BellOff, Bluetooth, BluetoothConnected, BluetoothOff, Check, ChevronLeft, ChevronRight,
  Lock, Moon, Sun, Wifi, WifiOff,
} from "lucide-react";
import { useSysStatus } from "../../hooks/useSysStatus";

interface WifiNet { ssid: string; signal: number; secure: boolean; connected: boolean }
interface BtDev { mac: string; name: string; connected: boolean }
interface NetStatus { wifiRadio: boolean; networks: WifiNet[]; wifiError: string | null; btAvailable: boolean; btPowered: boolean; devices: BtDev[] }

const sliderStyle = (v: number, c: string) => ({ ["--p" as string]: `${v}%`, ["--c" as string]: c });

function SignalBars({ signal }: { signal: number }) {
  const on = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px] h-3.5 w-4 shrink-0">
      {[6, 9, 12, 14].map((h, i) => (
        <span key={i} className="w-[2.5px] rounded-full" style={{ height: h, background: i < on ? "#A5B4FC" : "rgba(255,255,255,0.18)" }} />
      ))}
    </span>
  );
}

/** Monday-first month grid with today highlighted. */
function MiniCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthName = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const isToday = (d: number) =>
    d === today.getDate() && cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();

  return (
    <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month" className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] font-extrabold text-white/85">{monthName}</span>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month" className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-[9px] font-extrabold text-white/35 pb-1">{d}</span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className="flex items-center justify-center h-6">
            {d && (
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${isToday(d) ? "bg-butter text-navy" : "text-white/70"}`}>
                {d}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SystemPanel() {
  const sys = useSysStatus();
  const [net, setNet] = useState<NetStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // ssid awaiting a password
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [brightDrag, setBrightDrag] = useState<number | null>(null);

  const refreshNet = () => invoke<NetStatus>("net_status").then(setNet).catch(console.error);

  useEffect(() => {
    refreshNet();
    const id = window.setInterval(refreshNet, 3000);
    return () => window.clearInterval(id);
  }, []);

  const withBusy = (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setErr(null);
    fn()
      .then(() => { after?.(); refreshNet(); })
      .catch(e => setErr(String(e)))
      .finally(() => setBusy(null));
  };

  const chip = (on: boolean) =>
    `w-8 h-8 rounded-full flex items-center justify-center transition ${on ? "bg-[#A5B4FC] text-navy" : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"}`;

  return (
    <div className="h-full grid grid-cols-[1fr_188px] gap-3 min-h-0">
      {/* left: quick toggles + networks */}
      <div className="flex flex-col gap-2.5 min-h-0 overflow-y-auto thin-scroll pr-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => withBusy("wifiradio", () => invoke("wifi_radio", { on: !net?.wifiRadio }))} aria-label="Wi-Fi radio" title={`Wi-Fi ${net?.wifiRadio ? "on" : "off"}`} className={chip(!!net?.wifiRadio)}>
            {net?.wifiRadio ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          </button>
          {net?.btAvailable && (
            <button onClick={() => withBusy("btpower", () => invoke("bt_power", { on: !net.btPowered }))} aria-label="Bluetooth" title={`Bluetooth ${net.btPowered ? "on" : "off"}`} className={chip(net.btPowered)}>
              {net.btPowered ? <Bluetooth className="w-3.5 h-3.5" /> : <BluetoothOff className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={() => sys.set({ dnd: !sys.st?.dnd })} aria-label="Do not disturb" title={sys.st?.dnd ? "Notifications silenced" : "Notifications on"} className={chip(!!sys.st?.dnd)}>
            {sys.st?.dnd ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => sys.set({ dark: !sys.st?.dark })} aria-label="Dark mode" title={sys.st?.dark ? "Dark style" : "Light style"} className={chip(!!sys.st?.dark)}>
            {sys.st?.dark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
          {sys.st?.brightness != null && (
            <div className="flex items-center gap-2 flex-1 min-w-[130px] bg-white/[0.06] border border-white/10 rounded-full px-3 h-8">
              <Sun className="w-3.5 h-3.5 text-white/50 shrink-0" />
              <input
                type="range" min={5} max={100} value={brightDrag ?? sys.st.brightness}
                aria-label="Brightness"
                className="chunky flex-1 min-w-0"
                style={sliderStyle(brightDrag ?? sys.st.brightness ?? 50, "#A5B4FC")}
                onPointerDown={() => setBrightDrag(brightDrag ?? sys.st?.brightness ?? 50)}
                onPointerUp={() => setBrightDrag(null)}
                onPointerCancel={() => setBrightDrag(null)}
                onChange={e => { const v = Number(e.target.value); setBrightDrag(v); sys.set({ brightness: v }); }}
              />
            </div>
          )}
        </div>

        {/* Wi-Fi networks */}
        <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-2 space-y-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/40 px-1.5 pt-0.5">Wi-Fi</p>
          {!net?.wifiRadio && <p className="text-[11px] text-white/40 px-1.5 py-1.5">Turn the radio on to see networks.</p>}
          {net?.wifiRadio && net.networks.length === 0 && <p className="text-[11px] text-white/40 px-1.5 py-1.5">Scanning…</p>}
          {net?.networks.map(n => (
            <div key={n.ssid}>
              <button
                onClick={() => {
                  if (n.connected) return;
                  if (n.secure) { setPending(n.ssid); setPw(""); setErr(null); }
                  else withBusy(n.ssid, () => invoke("wifi_connect", { ssid: n.ssid, password: null }));
                }}
                disabled={busy === n.ssid}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 h-9 text-left transition ${n.connected ? "bg-[#A5B4FC]/20" : "hover:bg-white/10"} ${busy === n.ssid ? "opacity-50" : ""}`}
              >
                <SignalBars signal={n.signal} />
                <span className="text-xs font-bold truncate flex-1">{n.ssid}</span>
                {n.secure && <Lock className="w-3 h-3 text-white/35 shrink-0" />}
                {n.connected ? (
                  <span className="flex items-center gap-1 text-[10px] font-extrabold text-[#A5B4FC] shrink-0"><Check className="w-3 h-3" strokeWidth={3.5} />ON</span>
                ) : busy === n.ssid ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-[#A5B4FC] animate-spin shrink-0" />
                ) : null}
              </button>
              {pending === n.ssid && (
                <div className="flex items-center gap-1.5 px-2 pb-1.5">
                  <input
                    autoFocus type="password" value={pw} onChange={e => setPw(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && pw) withBusy(n.ssid, () => invoke("wifi_connect", { ssid: n.ssid, password: pw }), () => { setPending(null); setPw(""); }); }}
                    placeholder={`Password for ${n.ssid}…`}
                    className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs placeholder:text-white/35 outline-none focus:border-[#A5B4FC]"
                  />
                  <button
                    onClick={() => pw && withBusy(n.ssid, () => invoke("wifi_connect", { ssid: n.ssid, password: pw }), () => { setPending(null); setPw(""); })}
                    aria-label="Connect" className="w-7 h-7 rounded-full bg-[#A5B4FC] text-navy flex items-center justify-center shrink-0 active:scale-90 transition"
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bluetooth */}
        <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-2 space-y-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/40 px-1.5 pt-0.5">Bluetooth</p>
          {net && !net.btAvailable && <p className="text-[11px] text-white/40 px-1.5 py-1.5">No adapter on this machine.</p>}
          {net?.btAvailable && !net.btPowered && <p className="text-[11px] text-white/40 px-1.5 py-1.5">Powered off — flip the toggle up top.</p>}
          {net?.btPowered && net.devices.length === 0 && <p className="text-[11px] text-white/40 px-1.5 py-1.5">No paired devices yet.</p>}
          {net?.btPowered && net.devices.map(d => (
            <button
              key={d.mac}
              onClick={() => withBusy(d.mac, () => invoke("bt_device", { mac: d.mac, connect: !d.connected }))}
              disabled={busy === d.mac}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 h-9 text-left transition ${d.connected ? "bg-[#A5B4FC]/20" : "hover:bg-white/10"}`}
            >
              {d.connected ? <BluetoothConnected className="w-3.5 h-3.5 text-[#A5B4FC] shrink-0" /> : <Bluetooth className="w-3.5 h-3.5 text-white/45 shrink-0" />}
              <span className="text-xs font-bold truncate flex-1">{d.name}</span>
              <span className="text-[10px] font-extrabold text-white/50 shrink-0">{d.connected ? "DISCONNECT" : "CONNECT"}</span>
            </button>
          ))}
        </div>

        {err && <p className="text-[11px] text-pink px-1.5 truncate" title={err}>{err}</p>}
      </div>

      {/* right: calendar */}
      <div className="min-h-0">
        <MiniCalendar />
      </div>
    </div>
  );
}
