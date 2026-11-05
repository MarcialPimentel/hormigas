// Colony needs: the daily tasks (docs/26-come-back.md). Numbers and the list live in docs/data/needs.json.
import needsJson from '../../docs/data/needs.json';
import type { CasteId, ChamberId, Resources } from './data';
import { createRng } from './rng';
import { stat, type Stats } from './stats';

export type NeedUnlock =
  | { chamber: ChamberId; level: number }
  | { units: CasteId; count: number }
  /** this many ants of these castes together (e.g. any 3 carrying ants) */
  | { castes: CasteId[]; count: number }
  | { stat: string; count: number };

export interface NeedDef {
  id: string;
  title: string;
  hint: string;
  screen: string;
  stat: string;
  count: number;
  /** [highest Queen's Chamber level, count]: the goal grows with the colony (last match wins) */
  scale?: [number, number][];
  unlock?: NeedUnlock;
  weight?: number;
}

export const NEEDS_RULES = needsJson as unknown as {
  perDay: number;
  keepDays: number;
  rerollsPerDay: number;
  rewardHours: number;
  minReward: Resources;
  dayStartsUtcHour: number;
  needs: NeedDef[];
};
export const NEEDS: NeedDef[] = NEEDS_RULES.needs;
export const needDef = (id: string): NeedDef | undefined => NEEDS.find((n) => n.id === id);

/** What decides which needs a player can get. */
export interface NeedInput {
  /** highest level of each chamber across your colonies */
  chambers: Partial<Record<ChamberId, number>>;
  /** units you own, home or away */
  units: Partial<Record<CasteId, number>>;
  stats: Stats;
}

/** The day number a moment falls in. A day starts at dayStartsUtcHour and is a real day at world speed 1. */
export function needDay(t: number, worldSpeed = 1): number {
  const dayMs = 86_400_000 / worldSpeed;
  const offset = (NEEDS_RULES.dayStartsUtcHour * 3_600_000) / worldSpeed;
  return Math.floor((t - offset) / dayMs);
}

/** When a day starts (the inverse of needDay). */
export function needDayStart(day: number, worldSpeed = 1): number {
  return day * (86_400_000 / worldSpeed) + (NEEDS_RULES.dayStartsUtcHour * 3_600_000) / worldSpeed;
}

export function needUnlocked(def: NeedDef, p: NeedInput): boolean {
  const u = def.unlock;
  if (!u) return true;
  if ('chamber' in u) return (p.chambers[u.chamber] ?? 0) >= u.level;
  if ('units' in u) return (p.units[u.units] ?? 0) >= u.count;
  if ('castes' in u) return u.castes.reduce((n, id) => n + (p.units[id] ?? 0), 0) >= u.count;
  return stat(p.stats, u.stat) >= u.count;
}

/** The goal of a need for a player whose highest Queen's Chamber is at `queenLevel`. */
export function needTarget(def: NeedDef, queenLevel: number): number {
  let n = def.count;
  for (const [level, count] of def.scale ?? []) if (queenLevel >= level) n = count;
  return n;
}

export const needTitle = (def: NeedDef, target: number): string => def.title.replace('{n}', target.toLocaleString('en-US'));

/**
 * Pick `count` different needs the player can do, weighted, from a seed (same seed, same picks).
 * `exclude` are needs already showing, never picked twice.
 */
export function pickNeeds(p: NeedInput, seed: number, count: number, exclude: string[] = []): NeedDef[] {
  const rng = createRng(seed);
  let pool = NEEDS.filter((n) => needUnlocked(n, p) && !exclude.includes(n.id));
  const out: NeedDef[] = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, n) => s + (n.weight ?? 1), 0);
    let r = rng() * total;
    let pick = pool[pool.length - 1];
    for (const n of pool) {
      r -= n.weight ?? 1;
      if (r < 0) {
        pick = n;
        break;
      }
    }
    out.push(pick);
    pool = pool.filter((n) => n !== pick);
  }
  return out;
}

/** A seed for a player's needs on a day (and which pick: 0 for the day's set, then one per reroll). */
export const needSeed = (playerId: number, day: number, pick = 0): number => (Math.imul(playerId, 2654435761) ^ Math.imul(day + 1, 40503) ^ Math.imul(pick + 1, 97)) >>> 0;

/** A need's reward: rewardHours of the player's whole production per hour, at least minReward. */
export function needReward(productionPerHour: Resources): Resources {
  const h = NEEDS_RULES.rewardHours;
  const min = NEEDS_RULES.minReward;
  return {
    foliage: Math.max(min.foliage, Math.round((productionPerHour.foliage * h) / 10) * 10),
    protein: Math.max(min.protein, Math.round((productionPerHour.protein * h) / 10) * 10),
    nectar: Math.max(min.nectar, Math.round((productionPerHour.nectar * h) / 10) * 10),
  };
}

/** How far along a need is, from the counter now. */
export function needProgress(base: number, target: number, now: number): { done: number; ready: boolean } {
  const done = Math.max(0, Math.min(target, Math.floor(now - base)));
  return { done, ready: done >= target };
}
