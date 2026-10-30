// Brood Hall production queue. Units come out one at a time; computed on demand, never ticked.
import type { CasteId, DefenseId } from './data';
import type { Feeding } from './brood';
import type { DefenseCounts, UnitCounts } from './economy';

export interface QueueItem {
  kind: 'caste' | 'defense';
  id: CasteId | DefenseId;
  count: number;
  done: number;
  perUnitMs: number;
  /** When this item started; null while waiting behind earlier items. */
  startAt: number | null;
  /** How well the brood was fed (castes only; missing = normal). docs/05-castes-units.md */
  feed?: Feeding;
}

export interface QueueAdvance {
  queue: QueueItem[];
  castes: UnitCounts;
  defenses: DefenseCounts;
}

/** Advance the queue to time `to`, returning the new queue and the units finished since last advance. */
export function advanceUnitQueue(queue: QueueItem[], to: number): QueueAdvance {
  const q = queue.map((i) => ({ ...i }));
  const castes: UnitCounts = {};
  const defenses: DefenseCounts = {};
  while (q.length > 0) {
    const item = q[0];
    if (item.startAt == null) break; // malformed; should not happen for the head
    const finished = Math.max(0, Math.min(item.count, Math.floor((to - item.startAt) / item.perUnitMs)));
    const fresh = finished - item.done;
    if (fresh > 0) {
      if (item.kind === 'caste') castes[item.id as CasteId] = (castes[item.id as CasteId] ?? 0) + fresh;
      else defenses[item.id as DefenseId] = (defenses[item.id as DefenseId] ?? 0) + fresh;
      item.done = finished;
    }
    if (finished < item.count) break;
    q.shift();
    if (q[0]) q[0].startAt = item.startAt + item.count * item.perUnitMs;
  }
  return { queue: q, castes, defenses };
}

/**
 * When each unit of caste `id` finishes between `from` (exclusive) and `to` (inclusive), in order, at most `limit` of them.
 * Used to pay Gardener Minims that hatch while the player is away from the moment they hatch.
 */
export function completionTimes(queue: QueueItem[], id: CasteId, from: number, to: number, limit: number): number[] {
  const out: number[] = [];
  let start = queue[0]?.startAt ?? null;
  for (const item of queue) {
    if (start == null || out.length >= limit) break;
    if (item.kind === 'caste' && item.id === id)
      for (let u = item.done + 1; u <= item.count && out.length < limit; u++) {
        const t = start + u * item.perUnitMs;
        if (t > to) break;
        if (t > from) out.push(t);
      }
    start += item.count * item.perUnitMs;
  }
  return out;
}

/** When the whole queue will be finished (epoch ms), or null if empty. */
export function queueEndsAt(queue: QueueItem[]): number | null {
  if (queue.length === 0 || queue[0].startAt == null) return null;
  let t = queue[0].startAt;
  for (const item of queue) t += item.count * item.perUnitMs;
  return t;
}

/** Units/defenses already queued (not yet finished), by id. */
export function queuedCounts(queue: QueueItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of queue) out[i.id] = (out[i.id] ?? 0) + (i.count - i.done);
  return out;
}
