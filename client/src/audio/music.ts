// The colony's music: three songs Marz made for the game, one for each thing the colony can be doing
// (docs/sound.md). The music follows the colony:
//   idle  — nobody out: Home in the Dirt
//   march — your ants are on the move: Ants on the March
//   tense — a raid or swarm is coming at you: Raid on the Nest
//
// The songs stream through <audio> elements (decoding all three would hold over 100 MB in memory), routed into
// the engine's music bus so the volume slider and limiter still apply. Three players take turns: switching songs,
// or a song wrapping around to its start, fades one in while every other one fades out, so there is never a gap
// and, once the fade is done, only ever one song you can hear.

import { engine as E } from './engine';

export type MusicMode = 'off' | 'idle' | 'march' | 'tense';
type Live = Exclude<MusicMode, 'off'>;

/** Files are levelled (about -19, -18, -17 LUFS) so calm sits a little under the raid. */
const SONGS: Record<Live, string> = {
  idle: '/music/home-in-the-dirt.mp3',
  march: '/music/ants-on-the-march.mp3',
  tense: '/music/raid-on-the-nest.mp3',
};
const LEVEL = 0.55; // brings the songs to the loudness the first, code-made march had
const SWITCH = 2.5; // seconds to fade from one song to another
const WRAP = 3; // seconds of overlap when a song comes back round to its start

interface Player {
  el: HTMLAudioElement;
  gain: GainNode | null; // made once the audio context exists
  song: Live | null;
  stopAt: number; // timer that pauses it once faded out
}

export class Music {
  private want: MusicMode = 'off';
  private players: Player[] = [0, 1, 2].map(() => {
    const el = new Audio();
    el.preload = 'auto';
    return { el, gain: null, song: null, stopAt: 0 };
  });
  private active = -1; // which player is the one you hear (-1: none)
  private resumeAt: Partial<Record<Live, number>> = {}; // where calm and march pick up again
  private unlocked = false;
  private paused: Player[] = [];
  private timer = 0;

  constructor() {
    E.whenRunning(() => this.wakeUp());
  }

  /** What the colony is doing now. Safe to call often; nothing plays until audio is running. */
  set(mode: MusicMode) {
    this.want = mode;
    this.sync();
  }

  /** For checking in the browser: what is playing right now. */
  get now() {
    const p = this.players[this.active];
    return { want: this.want, playing: p && !p.el.paused ? p.song : null, at: p ? Math.round(p.el.currentTime) : 0 };
  }

  /**
   * Call inside a click or key press. Phones only let a page start an <audio> element during one, so both
   * players get started (silently) here; after that they may play whenever the colony needs them.
   */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const song = this.want === 'off' ? 'idle' : this.want;
    for (const p of this.players) {
      if (!p.el.src) p.el.src = SONGS[song];
      p.el.muted = true;
      p.el.play().then(
        () => {
          p.el.muted = false;
          if (p.song === null) p.el.pause();
        },
        () => {
          p.el.muted = false;
          this.unlocked = false; // try again on the next press
        },
      );
    }
  }

  /** The tab was hidden: pause the songs (the engine suspends the audio as well). */
  sleep() {
    this.paused = this.players.filter((p) => !p.el.paused && p.song);
    for (const p of this.paused) p.el.pause();
  }

  private wakeUp() {
    // Only songs still wanted; one that finished fading out while the tab was hidden stays paused.
    for (const p of this.paused) if (p.song) void p.el.play().catch(() => {});
    this.paused = [];
    this.sync();
  }

  private sync() {
    const a = E.live;
    if (!a) return;
    if (this.want === 'off') {
      for (const p of this.players) if (this.audible(p)) this.letGo(p, null, 1.2);
      this.active = -1;
      return;
    }
    // Already playing this song, or it is still fading out from a moment ago: bring it back up (and fade
    // out whatever was playing instead).
    const same = [this.players[this.active], ...this.players].find((p) => p && p.song === this.want && !p.el.paused);
    if (same) {
      this.focus(this.players.indexOf(same), SWITCH);
      return;
    }
    this.startOn(this.want, SWITCH);
  }

  /** Make player i the one you hear: fade it up and fade every other player out. */
  private focus(i: number, secs: number) {
    const p = this.players[i];
    this.active = i;
    this.fade(p, 1, secs);
    for (const o of this.players) if (o !== p && this.audible(o)) this.letGo(o, p.song, secs);
  }

  /** Playing, or about to: anything that still needs fading out. */
  private audible(p: Player) {
    return !p.el.paused || p.song !== null;
  }

  /** Fade a player out, remembering where calm or march got to so they can pick up there next time. */
  private letGo(p: Player, next: Live | null, secs: number) {
    if (p.song && p.song !== 'tense' && p.song !== next && !p.el.paused) this.resumeAt[p.song] = p.el.currentTime;
    this.fadeOut(p, secs);
  }

  /** A player that is stopped, or else the quietest one that isn't the song you hear. */
  private freePlayer(): number {
    const others = this.players.map((_, i) => i).filter((i) => i !== this.active);
    const idle = others.find((i) => !this.audible(this.players[i]));
    if (idle !== undefined) return idle;
    const vol = (i: number) => this.players[i].gain?.gain.value ?? 0;
    return others.reduce((a, b) => (vol(b) < vol(a) ? b : a));
  }

  /** Start a song on the free player and fade over to it. */
  private startOn(song: Live, secs: number, fromStart = false) {
    const a = E.live!;
    const i = this.freePlayer();
    const p = this.players[i];
    if (!p.gain) {
      p.gain = a.createGain();
      p.gain.gain.value = 0;
      a.createMediaElementSource(p.el).connect(p.gain).connect(E.musicBus);
    }
    clearTimeout(p.stopAt);
    p.gain.gain.cancelScheduledValues(a.currentTime);
    p.gain.gain.setValueAtTime(0, a.currentTime);
    if (!p.el.src.endsWith(SONGS[song])) p.el.src = SONGS[song];
    p.song = song;
    // A raid always starts from the top; calm and march carry on where they left off.
    const at = fromStart || song === 'tense' ? 0 : this.resumeAt[song] ?? 0;
    this.seek(p.el, at);
    void p.el.play().catch(() => {});
    this.focus(i, secs);
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 200);
  }

  /** Near the end of a song, start it again on the other player and overlap the two. */
  private tick() {
    const p = this.players[this.active];
    if (!p || !p.song || p.el.paused || !E.live) return;
    const d = p.el.duration;
    if (Number.isFinite(d) && d > WRAP * 2 && p.el.currentTime > d - WRAP) {
      this.startOn(p.song, WRAP, true);
    }
  }

  private seek(el: HTMLAudioElement, at: number) {
    const go = () => {
      const d = el.duration;
      el.currentTime = Number.isFinite(d) && at > d - WRAP * 2 ? 0 : at;
    };
    if (el.readyState >= 1) go();
    else el.addEventListener('loadedmetadata', go, { once: true });
  }

  private fade(p: Player, to: number, secs: number) {
    const a = E.live;
    if (!a || !p.gain) return;
    clearTimeout(p.stopAt);
    const g = p.gain.gain;
    g.cancelScheduledValues(a.currentTime);
    g.setValueAtTime(g.value, a.currentTime);
    g.linearRampToValueAtTime(to * LEVEL, a.currentTime + secs);
  }

  private fadeOut(p: Player, secs: number) {
    this.fade(p, 0, secs);
    p.stopAt = window.setTimeout(() => {
      p.el.pause();
      p.song = null;
    }, secs * 1000 + 150);
  }

  /** Stop everything at once (a dev reload swapping this module out). */
  stopAll() {
    clearInterval(this.timer);
    for (const p of this.players) {
      clearTimeout(p.stopAt);
      p.el.pause();
      p.song = null;
    }
  }
}

export const music = new Music();

// In development a hot reload makes a new Music; silence the old one so its songs don't carry on underneath.
if (import.meta.hot) import.meta.hot.dispose(() => music.stopAll());
