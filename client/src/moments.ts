// "Moments": small things that just happened (a party left, a chamber grew, a nest event…).
// The game state emits them; the Nest View animates them. A short history lets a view that is
// still starting up catch the moment that caused it to restart (e.g. a chamber level-up).
import type { Resources } from '@hormigas/shared';

export type Moment =
  | { kind: 'depart'; missionId: number; units: number }
  | { kind: 'return'; units: number; cargo: Resources }
  | { kind: 'levelup'; chamber: string; level: number }
  | { kind: 'units'; count: number }
  | { kind: 'nest_event'; event: string };

export interface Stamped {
  id: number;
  at: number;
  m: Moment;
}

let seq = 0;
const recent: Stamped[] = [];
const subs = new Set<(s: Stamped) => void>();

export function emitMoment(m: Moment) {
  const s = { id: ++seq, at: performance.now(), m };
  recent.push(s);
  if (recent.length > 30) recent.shift();
  for (const fn of subs) fn(s);
}

/** Subscribe to new moments; also replays those from the last `replayMs`. Returns an unsubscribe function. */
export function onMoment(fn: (s: Stamped) => void, replayMs = 0): () => void {
  const since = performance.now() - replayMs;
  if (replayMs > 0) for (const s of recent) if (s.at >= since) fn(s);
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
