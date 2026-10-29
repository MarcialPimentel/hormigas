// Aphid herds and where wild things live. Spec: docs/24-npcs.md
import { NPC_DATA, WILDS_SPOT } from './data';
import { WORLD } from './world';
import { nestLevelFor, type NestKind, type NestState } from './nests';

interface HerdData {
  name: string;
  nectarPerHour: number[];
  storeHours: number;
  deliverEveryHours: number;
  wanderAfterHours: number;
  perColony: number;
  style: string;
}
export const HERDS = NPC_DATA.herds as unknown as HerdData;
export const HERD_MAX_LEVEL = HERDS.nectarPerHour.length;

/** A player's ants stationed at a herd. They belong to `colonyId` and walk home there when called back. */
export interface HerdTender {
  playerId: number;
  colonyId: number;
  /** when they took over the herd */
  since: number;
}

/** What an aphid herd keeps between changes (colonies.npc for a herd). Its honeydew is the colony row's Nectar. */
export interface HerdState {
  kind: 'herd';
  level: number;
  /** when the honeydew was last saved */
  at: number;
  tender: HerdTender | null;
  /** when the last tenders left or died; the herd wanders off wanderAfterHours later */
  untendedSince: number | null;
}

/** What colonies.npc holds: a nest-like state (wild nest, termite mound, spider den) or an aphid herd. */
export type NpcState = NestState | HerdState;

export const isHerdState = (npc: unknown): npc is HerdState => !!npc && (npc as { kind?: string }).kind === 'herd';

/** Herd levels follow the area's strongest active player, like wild nests, and never drop. */
export const herdLevelFor = (leaderPoints: number, current = 1) => Math.min(HERD_MAX_LEVEL, nestLevelFor(leaderPoints, current));

/** Nectar per hour a tended herd makes, at world speed 1. */
export const herdNectarPerHour = (level: number) => HERDS.nectarPerHour[Math.min(Math.max(1, level), HERD_MAX_LEVEL) - 1];

/** Most honeydew a herd holds before the aphids stop being milked. */
export const herdStoreCap = (level: number) => herdNectarPerHour(level) * HERDS.storeHours;

/**
 * The honeydew waiting at a herd at time t: what was saved at `state.at`, plus production while tended,
 * up to the store cap. Pure: nothing ticks.
 */
export function herdHoneydewAt(state: HerdState, saved: number, t: number, worldSpeed = 1): number {
  if (!state.tender) return saved;
  const cap = herdStoreCap(state.level);
  if (saved >= cap) return saved;
  const made = (herdNectarPerHour(state.level) * worldSpeed * Math.max(0, t - state.at)) / 3600_000;
  return Math.min(cap, saved + made);
}

// ---------- where wild things live ----------

const AREA = NPC_DATA.area as unknown as {
  range: number;
  mound: { every: number; offset: number; range: number };
  den: { every: number; offset: number; range: number };
  sites: Record<'herd' | 'mound' | 'den', number>;
};

/** The extra spots in a patch's wilds that hold herds, mounds and dens. Never one of the 12 colony spots. */
export const SITE_SPOTS = AREA.sites;
export const isSiteSpot = (spot: number) => Object.values(AREA.sites).includes(spot);
/** Highest spot number anything can live on. */
export const MAX_SPOT = Math.max(WILDS_SPOT, ...Object.values(AREA.sites));

export type WildThing = 'nest' | 'herd' | Exclude<NestKind, 'nest'>;

const hasMound = (patch: number) => patch % AREA.mound.every === AREA.mound.offset % AREA.mound.every;
const hasDen = (patch: number) => patch % AREA.den.every === AREA.den.offset % AREA.den.every;

/**
 * Every wild thing that should exist because a player lives in `patch`: a wild nest and an aphid herd in each patch
 * within `range` (same region), plus the termite mounds and spider dens within their own ranges.
 */
export function wildThingsAround(region: number, patch: number): { region: number; patch: number; thing: WildThing }[] {
  const out: { region: number; patch: number; thing: WildThing }[] = [];
  const P = WORLD.patchesPerRegion;
  const widest = Math.max(AREA.range, AREA.mound.range, AREA.den.range);
  for (let p = Math.max(1, patch - widest); p <= Math.min(P, patch + widest); p++) {
    const d = Math.abs(p - patch);
    if (d <= AREA.range) {
      out.push({ region, patch: p, thing: 'nest' });
      out.push({ region, patch: p, thing: 'herd' });
    }
    if (d <= AREA.mound.range && hasMound(p)) out.push({ region, patch: p, thing: 'mound' });
    if (d <= AREA.den.range && hasDen(p)) out.push({ region, patch: p, thing: 'den' });
  }
  return out;
}

/** Patches (same region) within the herd/nest range of `patch`: where a wandering herd may go. */
export function nearbyPatches(patch: number): number[] {
  const out: number[] = [];
  for (let p = Math.max(1, patch - AREA.range); p <= Math.min(WORLD.patchesPerRegion, patch + AREA.range); p++) if (p !== patch) out.push(p);
  return out;
}

/** The range (in patches) that sets a wild thing's level: the strongest active player this close. */
export const AREA_RANGE = AREA.range;
