// Tiny WebAudio sound-effects module. No external assets: every sound is
// synthesized with OscillatorNode/GainNode. Safe to use in environments
// without AudioContext (all methods become no-ops).

export interface Sfx {
  setEngine(speed01: number): void;
  reverseBeep(on: boolean): void;
  collision(): void;
  success(): void;
  resume(): void;
}

type Ctor = new () => AudioContext;

function getAudioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: Ctor;
    webkitAudioContext?: Ctor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createSfx(): Sfx {
  const Ctor = getAudioContextCtor();

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  // Engine hum nodes (created lazily, kept running, volume gated to silence).
  let engineOsc: OscillatorNode | null = null;
  let engineSub: OscillatorNode | null = null;
  let engineGain: GainNode | null = null;

  // Reverse beep scheduling.
  let beepTimer: ReturnType<typeof setInterval> | null = null;

  // Lazily create (and resume) the AudioContext. Returns null if unavailable.
  function ensureCtx(): AudioContext | null {
    if (ctx) return ctx;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  function now(): number {
    return ctx ? ctx.currentTime : 0;
  }

  // A one-shot tone with a quick attack and exponential release.
  function blip(
    freq: number,
    when: number,
    duration: number,
    peak: number,
    type: OscillatorType = "sine",
  ): void {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function ensureEngine(): void {
    if (!ctx || !master) return;
    if (engineOsc) return;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0; // silent until setEngine raises it
    engineGain.connect(master);

    engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 55;

    engineSub = ctx.createOscillator();
    engineSub.type = "sine";
    engineSub.frequency.value = 27.5;

    engineOsc.connect(engineGain);
    engineSub.connect(engineGain);
    engineOsc.start();
    engineSub.start();
  }

  function setEngine(speed01: number): void {
    if (!ensureCtx()) return;
    ensureEngine();
    if (!ctx || !engineGain || !engineOsc || !engineSub) return;
    const s = Math.max(0, Math.min(1, speed01));
    const t = now();
    // Volume tracks speed; 0 means silent. Keep it soft.
    const vol = s === 0 ? 0 : 0.04 + s * 0.1;
    engineGain.gain.setTargetAtTime(vol, t, 0.08);
    // Pitch climbs gently with speed.
    engineOsc.frequency.setTargetAtTime(45 + s * 70, t, 0.1);
    engineSub.frequency.setTargetAtTime(22 + s * 35, t, 0.1);
  }

  function playBeep(): void {
    if (!ctx) return;
    blip(880, now(), 0.18, 0.12, "square");
  }

  function reverseBeep(on: boolean): void {
    if (on) {
      if (!ensureCtx()) return;
      if (beepTimer !== null) return;
      playBeep();
      beepTimer = setInterval(playBeep, 1000);
    } else {
      if (beepTimer !== null) {
        clearInterval(beepTimer);
        beepTimer = null;
      }
    }
  }

  function collision(): void {
    if (!ensureCtx()) return;
    if (!ctx || !master) return;
    const t = now();
    // Low thud: a short noisy-ish low tone with a fast decay.
    blip(80, t, 0.22, 0.5, "triangle");
    blip(55, t, 0.3, 0.4, "sine");
  }

  function success(): void {
    if (!ensureCtx()) return;
    if (!ctx) return;
    const t = now();
    // Pleasant rising arpeggio: C5, E5, G5.
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      blip(f, t + i * 0.12, 0.35, 0.16, "sine");
    });
  }

  function resume(): void {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") {
      void c.resume();
    }
  }

  return { setEngine, reverseBeep, collision, success, resume };
}
