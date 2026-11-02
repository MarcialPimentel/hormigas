// The colony's march: background music made in code, in 4/4, built on the ants' own footsteps.
// Ants walk with an alternating tripod gait (three legs land together, then the other three), so every beat
// is a tiny three-foot step that swings left, right, left, right. Under it a low soil drum, over it a sparse
// wooden marimba tune on a D minor pentatonic scale that rewrites itself as it goes, so it never loops for long.
//
// It follows the colony (docs/sound.md):
//   idle  — nobody out: quiet steps, a drum on beat 1, the tune two bars on, two bars off
//   march — your ants are on the move: drum on 1 and 3, soil grains on the off-beats, the full tune with a bass
//   tense — a raid or swarm is coming at you: faster, a woodblock backbeat, the tune lower and busier
// Changes wait for the next bar line, so the music never stumbles.
// The scheduler runs 120 ms ahead on the audio clock (steady even when the frame rate isn't). Ported from Papercut.

import { engine as E } from './engine';

export type MarchMode = 'off' | 'idle' | 'march' | 'tense';
type Live = Exclude<MarchMode, 'off'>;

E.want({ step: ['/sfx/ant-step-1.ogg', '/sfx/ant-step-2.ogg', '/sfx/ant-step-3.ogg'] });

const BPM: Record<Live, number> = { idle: 92, march: 100, tense: 112 };
const STEPS = 16; // sixteenths per bar

// Which sixteenths each part plays on. Feet are on every beat (0, 4, 8, 12) in every mode.
const KIT: Record<Live, { thump: number[]; grain: number[]; tok: number[] }> = {
  idle: { thump: [0], grain: [], tok: [] },
  march: { thump: [0, 8], grain: [2, 6, 10, 14], tok: [] },
  tense: { thump: [0, 8, 11], grain: [2, 3, 6, 7, 10, 14, 15], tok: [4, 12] },
};
const FEET: Record<Live, number> = { idle: 0.32, march: 0.4, tense: 0.46 };

// D minor pentatonic: D F G A C. Degree 0 is home, 3 is the fifth.
const SCALE = [0, 3, 5, 7, 10];
const D3 = 146.83;
export function note(degree: number, base = D3) {
  const oct = Math.floor(degree / SCALE.length);
  const i = degree - oct * SCALE.length;
  return base * 2 ** ((oct * 12 + SCALE[i]) / 12);
}
// Bass under each bar: home, home, the A below, the C below.
const BASS = [0, 0, -2, -1];

type Phrase = (number | null)[]; // 32 sixteenths (two bars): a scale degree or a rest
// Where a tune note may start in two bars: mostly on the eighths, so it walks with the feet.
const RHYTHMS = [
  [0, 4, 6, 8, 12, 16, 20, 24],
  [0, 2, 4, 8, 12, 16, 18, 20, 24],
  [0, 6, 8, 12, 16, 22, 24, 28],
  [0, 4, 8, 10, 12, 16, 24, 28],
];

function makePhrase(dense: boolean, low: number): Phrase {
  const out: Phrase = new Array(32).fill(null);
  const rhythm = RHYTHMS[Math.floor(Math.random() * RHYTHMS.length)];
  let d = low + 2 + Math.floor(Math.random() * 4);
  rhythm.forEach((st, i) => {
    if (!dense && i % 3 === 2) return; // calmer: leave gaps
    d += [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
    d = Math.max(low, Math.min(low + 8, d));
    out[st] = i === rhythm.length - 1 ? low + (Math.random() < 0.5 ? 0 : 3) : d; // end home or on the fifth
  });
  return out;
}

export class March {
  private want: MarchMode = 'off';
  private playing: Live | null = null; // what the scheduler plays; switches to `want` at bar lines
  private stopping = false;
  private gain: GainNode | null = null;
  private timer = 0;
  private next = 0; // audio time of the next sixteenth
  private step = 0;
  private bar = 0;
  private phrases: Phrase[] = [];
  private form = [0, 0, 1, 0]; // A A B A

  constructor() {
    E.whenRunning(() => this.sync());
  }

  /** What the colony is doing now. Safe to call often; nothing happens until audio is running. */
  set(mode: MarchMode) {
    this.want = mode;
    this.sync();
  }

  /** For checking in the browser: what is playing right now. */
  get now() {
    return { want: this.want, playing: this.playing, stopping: this.stopping, bar: this.bar };
  }

  private sync() {
    const a = E.live;
    if (!a) return;
    if (this.want === 'off') {
      if (this.playing && !this.stopping) {
        this.stopping = true;
        this.fade(0.0001, 1.2);
      }
      return;
    }
    if (!this.playing) this.start(a, this.want);
    else if (this.stopping) {
      this.stopping = false;
      this.fade(1, 1);
    }
    // otherwise the next bar line picks up the new mode
  }

  private start(a: AudioContext, mode: Live) {
    if (!this.gain) {
      this.gain = a.createGain();
      this.gain.gain.value = 0.0001;
      this.gain.connect(E.musicBus);
    }
    this.playing = mode;
    this.stopping = false;
    this.fade(1, 2.5); // ease in: it's background, not an announcement
    this.next = a.currentTime + 0.08;
    this.step = 0;
    this.bar = 0;
    this.phrases = [this.phrase(mode), this.phrase(mode)];
    if (!this.timer) this.timer = window.setInterval(() => this.pump(), 25);
  }

  private phrase(mode: Live) {
    return makePhrase(mode !== 'idle', 0);
  }

  private fade(to: number, secs: number) {
    const a = E.live;
    if (!a || !this.gain) return;
    const g = this.gain.gain;
    g.cancelScheduledValues(a.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), a.currentTime);
    g.exponentialRampToValueAtTime(Math.max(0.0001, to), a.currentTime + secs);
  }

  /** Schedule the notes due in the next ~120 ms. */
  private pump() {
    const a = E.live;
    if (!a || !this.gain || !this.playing) return;
    if (this.stopping && this.gain.gain.value < 0.002) {
      clearInterval(this.timer);
      this.timer = 0;
      this.playing = null;
      this.stopping = false;
      return;
    }
    // A tab that fell behind skips ahead rather than playing a pile of late notes at once.
    if (this.next < a.currentTime - 0.1) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.12) {
      this.play(this.next, this.step, this.playing);
      this.next += 60 / BPM[this.playing] / 4;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.barLine();
    }
  }

  private barLine() {
    this.bar++;
    if (!this.stopping && this.want !== 'off' && this.want !== this.playing) {
      const wasTense = this.playing === 'tense';
      this.playing = this.want;
      // Into or out of a raid: a fresh tune for the new mood.
      if (wasTense || this.playing === 'tense') this.phrases = [this.phrase(this.playing), this.phrase(this.playing)];
    }
    // A new B phrase every 8 bars and a new A every 32, so a long session never hears the same loop.
    if (this.bar % 8 === 0) this.phrases[1] = this.phrase(this.playing!);
    if (this.bar % 32 === 0) this.phrases[0] = this.phrase(this.playing!);
  }

  private play(t: number, st: number, mode: Live) {
    const bus = this.gain!;
    const kit = KIT[mode];

    // Feet on every beat: LEFT right left right, the first beat of the bar a touch heavier.
    if (st % 4 === 0) {
      const beat = this.bar * 4 + st / 4;
      tripod(t, beat % 2 === 0 ? -1 : 1, FEET[mode] * (st === 0 ? 1.15 : 1), bus);
    }
    if (kit.thump.includes(st)) thump(t, st === 0 ? 0.6 : 0.4, bus);
    if (kit.grain.includes(st)) E.hiss({ dur: 0.04, type: 'highpass', freq: 4500, gain: st % 4 === 2 ? 0.06 : 0.035, at: t, pan: st % 8 < 4 ? -0.3 : 0.3, bus });
    if (kit.tok.includes(st)) tok(t, bus);

    // Bass marimba on the bar line (every other bar when idle), and on beat 3 when tense.
    const bassNote = note(BASS[this.bar % 4], D3 / 2);
    if (st === 0 && (mode !== 'idle' || this.bar % 2 === 0)) marimba(bassNote, mode === 'idle' ? 0.3 : 0.42, t, 0, bus);
    if (st === 8 && mode === 'tense') marimba(bassNote, 0.3, t, 0, bus);

    // The tune: two bars on, two off when idle; A A B A otherwise. Lower and darker when tense.
    if (mode === 'idle' && this.bar % 4 >= 2) return;
    const ph = this.phrases[this.form[Math.floor(this.bar / 2) % 4]];
    const d = ph[(this.bar % 2) * STEPS + st];
    if (d !== null && d !== undefined) marimba(note(d, mode === 'tense' ? D3 : D3 * 2), mode === 'idle' ? 0.22 : 0.28, t, 0.2, bus);
  }
}

/** One step of the tripod: three small feet landing almost together, leaning to one side. */
function tripod(t: number, side: number, gain: number, bus: AudioNode) {
  const legs: [number, number, number][] = [
    [0, side * 0.5, 1], // front leg
    [0.011, -side * 0.2, 0.45], // middle leg, other side
    [0.022, side * 0.5, 0.6], // back leg
  ];
  for (const [dt, pan, k] of legs) {
    // Recorded footsteps pitched up into tiny feet; a code-made tick if the files didn't load.
    if (!E.sample('step', { gain: gain * k, rate: 1.7, pan, at: t + dt, bus })) {
      E.hiss({ dur: 0.03, type: 'bandpass', freq: 1300, q: 1.5, gain: gain * k * 0.5, at: t + dt, pan, bus });
      E.tone({ f0: 190, f1: 95, dur: 0.035, gain: gain * k * 0.4, at: t + dt, pan, bus });
    }
  }
}

/** A low, muffled drum: a falling sine for the weight and a puff of dark noise for the soil. */
function thump(t: number, gain: number, bus: AudioNode) {
  E.tone({ f0: 105, f1: 46, dur: 0.35, gain, at: t, bus });
  E.hiss({ dur: 0.07, type: 'lowpass', freq: 260, gain: gain * 0.25, at: t, bus });
}

/** A woodblock: the backbeat while a raid is coming. */
function tok(t: number, bus: AudioNode) {
  E.tone({ f0: 820, dur: 0.06, gain: 0.1, attack: 0.001, at: t, pan: 0.15, bus });
  E.hiss({ dur: 0.03, type: 'bandpass', freq: 1600, q: 3, gain: 0.08, at: t, pan: 0.15, bus });
}

/** A wooden bar: a soft sine with the bright, quick overtone a struck marimba bar has (about ×3.9). */
function marimba(freq: number, gain: number, t: number, pan: number, bus: AudioNode) {
  E.tone({ f0: freq, dur: freq < 120 ? 0.9 : 0.55, gain, attack: 0.002, at: t, pan, bus });
  E.tone({ f0: freq * 3.93, dur: 0.07, gain: gain * 0.22, attack: 0.001, at: t, pan, bus });
}

export const march = new March();
