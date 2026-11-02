// The audio graph: one context, a music bus and an effects bus, a soft limiter, and loaded recordings.
// Ported from Papercut's engine. Sound only reacts to the game; it never changes it.
// Browsers keep audio silent until the player clicks or presses a key, so `wake()` runs on the first gesture.

export interface SoundPrefs {
  /** Music volume, 0–1. */
  music: number;
  /** Effects volume, 0–1 (no effects yet; kept so the saved setting doesn't change shape when they arrive). */
  sfx: number;
  /** Master on/off; turning it back on restores the levels above. */
  on: boolean;
}

const KEY = 'hormigas.sound';
const DEFAULTS: SoundPrefs = { music: 0.5, sfx: 0.8, on: true };
export const SOUND_EVENT = 'hormigas:sound';

function loadPrefs(): SoundPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.music === 'number' && typeof v.on === 'boolean') return { ...DEFAULTS, ...v };
  } catch {
    /* private window or blocked storage: use the defaults */
  }
  return { ...DEFAULTS };
}

export class Engine {
  ctx: AudioContext | null = null;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  prefs: SoundPrefs = loadPrefs();
  private samples = new Map<string, AudioBuffer[]>();
  private noiseBuf: AudioBuffer | null = null;
  private wanted: Record<string, string[]> = {};
  private onRunning = new Set<() => void>();

  /** Create the context (on the first press) or resume it; returns null if audio is unavailable. */
  wake(): AudioContext | null {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      try {
        this.ctx = new Ctx();
      } catch {
        return null;
      }
      const a = this.ctx;
      const limiter = a.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(a.destination);
      this.sfxBus = a.createGain();
      this.sfxBus.connect(limiter);
      this.musicBus = a.createGain();
      this.musicBus.connect(limiter);
      this.applyVolumes();
      a.onstatechange = () => {
        if (a.state === 'running') this.onRunning.forEach((f) => f());
      };
      for (const [name, urls] of Object.entries(this.wanted)) void this.fetchSample(name, urls);
    }
    if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') void this.ctx.resume();
    if (this.ctx.state === 'running') this.onRunning.forEach((f) => f());
    return this.ctx;
  }

  /** Called whenever audio starts running (first wake, or coming back to the tab). */
  whenRunning(f: () => void) {
    this.onRunning.add(f);
  }

  /** Pause everything while the tab is hidden; `wake()` resumes it. */
  sleep() {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  /** The context only if it is running (nothing is queued before the first press). */
  get live(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  setPrefs(p: Partial<SoundPrefs>) {
    Object.assign(this.prefs, p);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* not saved; still applies until reload */
    }
    this.applyVolumes();
    window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { ...this.prefs } }));
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const on = this.prefs.on ? 1 : 0;
    const t = this.ctx.currentTime;
    // Squared so the slider feels even to the ear; music sits under the effects.
    this.sfxBus.gain.setTargetAtTime(on * this.prefs.sfx * this.prefs.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(on * this.prefs.music * this.prefs.music * 0.55, t, 0.05);
  }

  /** Ask for recordings by name (several files = a random take each time). Missing files are skipped quietly. */
  want(list: Record<string, string[]>) {
    Object.assign(this.wanted, list);
    if (this.ctx) for (const [name, urls] of Object.entries(list)) void this.fetchSample(name, urls);
  }

  private async fetchSample(name: string, urls: string[]) {
    const a = this.ctx!;
    const bufs: AudioBuffer[] = [];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        bufs.push(await a.decodeAudioData(await r.arrayBuffer()));
      } catch {
        /* missing or unreadable (e.g. .ogg on old Safari): the code-made sound plays instead */
      }
    }
    if (bufs.length) this.samples.set(name, bufs);
  }

  /** Where a sound goes: a bus, panned left/right (-1..1). */
  out(pan = 0, bus: AudioNode = this.sfxBus): AudioNode {
    const a = this.ctx!;
    if (!pan || !a.createStereoPanner) return bus;
    const p = a.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(bus);
    return p;
  }

  /** Play a loaded recording at ±5% pitch. Returns false when it isn't loaded, so the caller can fall back. */
  sample(name: string, o: { gain?: number; rate?: number; pan?: number; at?: number; bus?: AudioNode } = {}): boolean {
    const a = this.live,
      bufs = this.samples.get(name);
    if (!a || !bufs) return false;
    const s = a.createBufferSource();
    s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    s.playbackRate.value = (o.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = a.createGain();
    g.gain.value = o.gain ?? 1;
    s.connect(g).connect(this.out(o.pan, o.bus));
    s.start(o.at ?? a.currentTime);
    return true;
  }

  // ---------- code-made building blocks ----------

  private noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const a = this.ctx!,
        len = a.sampleRate * 2;
      this.noiseBuf = a.createBuffer(1, len, a.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /** A burst of filtered noise. `sweep` moves the filter to that frequency over the burst. */
  hiss(o: { dur: number; type: BiquadFilterType; freq: number; q?: number; gain: number; sweep?: number; attack?: number; at?: number; pan?: number; bus?: AudioNode }) {
    const a = this.live;
    if (!a) return;
    const t = o.at ?? a.currentTime;
    const s = a.createBufferSource();
    s.buffer = this.noise();
    const f = a.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + o.dur);
    const g = a.createGain(),
      att = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f).connect(g).connect(this.out(o.pan, o.bus));
    s.start(t, Math.random() * 1.5);
    s.stop(t + o.dur + 0.02);
  }

  /** An oscillator with a pitch glide and a fast-attack, exponential-decay envelope. */
  tone(o: { f0: number; f1?: number; dur: number; type?: OscillatorType; gain: number; attack?: number; at?: number; pan?: number; bus?: AudioNode }) {
    const a = this.live;
    if (!a) return;
    const t = o.at ?? a.currentTime;
    const osc = a.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = a.createGain(),
      att = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.out(o.pan, o.bus));
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }
}

export const engine = new Engine();
