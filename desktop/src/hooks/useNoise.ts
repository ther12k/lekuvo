import { useCallback, useEffect, useRef } from "react";

export type NoiseKey = "rain" | "forest" | "waves" | "kalimba" | "fire" | "wind" | "night" | "deep";

interface Voice {
  master: GainNode;
  stop: () => void;
}

/**
 * Tiny WebAudio engine that synthesizes ambient sounds in the browser.
 * No audio files needed — every layer is generated live.
 */
export function useNoise() {
  const ctxRef = useRef<AudioContext | null>(null);
  const voices = useRef<Partial<Record<NoiseKey, Voice>>>({});

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const noiseSource = (ctx: AudioContext) => {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  };

  /** brown noise: integrated white noise, warm and rumbling */
  const brownSource = (ctx: AudioContext) => {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  };

  const build = useCallback((key: NoiseKey, vol: number): Voice => {
    const ctx = getCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.4);

    const cleanups: Array<() => void> = [];

    if (key === "rain") {
      const src = noiseSource(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      src.connect(hp).connect(lp).connect(g).connect(master);
      src.start();
      cleanups.push(() => src.stop());
    }

    if (key === "forest") {
      const src = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 500;
      bp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0.28;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.15;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(bp).connect(g).connect(master);
      src.start();
      lfo.start();
      cleanups.push(() => { src.stop(); lfo.stop(); });

      const chirp = () => {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const eg = ctx.createGain();
        o.type = "sine";
        const base = 2400 + Math.random() * 1400;
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.09);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.18);
        eg.gain.setValueAtTime(0, t);
        eg.gain.linearRampToValueAtTime(0.09, t + 0.03);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(eg).connect(master);
        o.start(t);
        o.stop(t + 0.25);
      };
      const id = window.setInterval(() => {
        chirp();
        if (Math.random() > 0.5) window.setTimeout(chirp, 140);
      }, 1800 + Math.random() * 1500);
      cleanups.push(() => window.clearInterval(id));
    }

    if (key === "waves") {
      const src = noiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 650;
      const swell = ctx.createGain();
      swell.gain.value = 0.35;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(swell.gain);
      src.connect(lp).connect(swell).connect(master);
      src.start();
      lfo.start();
      cleanups.push(() => { src.stop(); lfo.stop(); });
    }

    if (key === "kalimba") {
      const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
      const pluck = () => {
        const t = ctx.currentTime;
        const f = notes[Math.floor(Math.random() * notes.length)];
        const eg = ctx.createGain();
        eg.gain.setValueAtTime(0, t);
        eg.gain.linearRampToValueAtTime(0.28, t + 0.008);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        eg.connect(master);
        const o1 = ctx.createOscillator();
        o1.type = "sine";
        o1.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = "triangle";
        o2.frequency.value = f * 4.01;
        const g2 = ctx.createGain();
        g2.gain.value = 0.12;
        o1.connect(eg);
        o2.connect(g2).connect(eg);
        o1.start(t);
        o2.start(t);
        o1.stop(t + 1.9);
        o2.stop(t + 1.9);
      };
      pluck();
      const id = window.setInterval(() => {
        pluck();
        if (Math.random() > 0.6) window.setTimeout(pluck, 260);
      }, 900 + Math.random() * 700);
      cleanups.push(() => window.clearInterval(id));
    }

    if (key === "fire") {
      // low rumble bed + random bright crackle bursts
      const src = noiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;
      const g = ctx.createGain();
      g.gain.value = 0.14;
      src.connect(lp).connect(g).connect(master);
      src.start();
      cleanups.push(() => src.stop());

      const crackle = () => {
        const t = ctx.currentTime;
        const c = noiseSource(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 1600 + Math.random() * 2400;
        const eg = ctx.createGain();
        const peak = 0.05 + Math.random() * 0.12;
        eg.gain.setValueAtTime(0, t);
        eg.gain.linearRampToValueAtTime(peak, t + 0.004);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
        c.connect(hp).connect(eg).connect(master);
        c.start(t);
        c.stop(t + 0.09);
      };
      let id = 0;
      const schedule = () => {
        crackle();
        if (Math.random() > 0.72) window.setTimeout(crackle, 30 + Math.random() * 60);
        id = window.setTimeout(schedule, 70 + Math.random() * 320);
      };
      schedule();
      cleanups.push(() => window.clearTimeout(id));
    }

    if (key === "wind") {
      // bandpassed noise with a slowly wandering center + gusts
      const src = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 500;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 280;
      lfo.connect(lfoGain).connect(bp.frequency);
      const gust = ctx.createOscillator();
      gust.frequency.value = 0.13;
      const gustGain = ctx.createGain();
      gustGain.gain.value = 0.12;
      gust.connect(gustGain).connect(g.gain);
      src.connect(bp).connect(g).connect(master);
      src.start(); lfo.start(); gust.start();
      cleanups.push(() => { src.stop(); lfo.stop(); gust.stop(); });
    }

    if (key === "night") {
      // faint dark air + cricket trills
      const src = noiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      src.connect(lp).connect(g).connect(master);
      src.start();
      cleanups.push(() => src.stop());

      const trill = () => {
        const t0 = ctx.currentTime;
        const pulses = 3 + Math.floor(Math.random() * 3);
        const f = 4000 + Math.random() * 700;
        for (let i = 0; i < pulses; i++) {
          const t = t0 + i * 0.075;
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = f;
          const eg = ctx.createGain();
          eg.gain.setValueAtTime(0, t);
          eg.gain.linearRampToValueAtTime(0.05, t + 0.012);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
          o.connect(eg).connect(master);
          o.start(t);
          o.stop(t + 0.07);
        }
      };
      const id = window.setInterval(trill, 1100 + Math.random() * 900);
      cleanups.push(() => window.clearInterval(id));
    }

    if (key === "deep") {
      // brown noise hum — steady and warm, for study
      const src = brownSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(lp).connect(g).connect(master);
      src.start();
      cleanups.push(() => src.stop());
    }

    return {
      master,
      stop: () => {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.25);
        window.setTimeout(() => {
          cleanups.forEach(fn => { try { fn(); } catch { /* already stopped */ } });
          master.disconnect();
        }, 320);
      },
    };
  }, [getCtx]);

  const start = useCallback((key: NoiseKey, vol: number) => {
    if (voices.current[key]) return;
    voices.current[key] = build(key, vol);
  }, [build]);

  const stop = useCallback((key: NoiseKey) => {
    voices.current[key]?.stop();
    delete voices.current[key];
  }, []);

  const setVolume = useCallback((key: NoiseKey, vol: number) => {
    const v = voices.current[key];
    const ctx = ctxRef.current;
    if (v && ctx) v.master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
  }, []);

  useEffect(() => {
    const current = voices.current;
    return () => {
      (Object.keys(current) as NoiseKey[]).forEach(k => current[k]?.stop());
      window.setTimeout(() => { void ctxRef.current?.close(); }, 500);
    };
  }, []);

  return { start, stop, setVolume };
}
