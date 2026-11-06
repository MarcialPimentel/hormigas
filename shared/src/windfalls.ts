// Windfalls: contested food that drops in the wilds (docs/25-windfalls.md).
// A windfall lives on the patch's windfall site, a colony row owned by the hidden wild player, like an aphid herd.
// Ants that claim it hold it the way tenders hold a herd: they fight whoever is there, then carry loads home.
import { NPC_DATA, RESOURCE_IDS, type Resources } from './data';
import { researchFactor, researchSum, type ResearchLevels, type UnitCounts } from './economy';
import type { HerdState, HerdTender } from './herds';
import type { Rng } from './rng';

export type WindfallKind = 'grasshopper' | 'fig' | 'branch' | 'lizard' | 'beetle' | 'sugar' | 'picnic';

interface WindfallKindDef {
  name: string;
  weight: number;
  /** pile multiplier: the lizard is a big one */
  size: number;
  /** percent of the pile per resource */
  mix: Resources;
  text: string;
  /** the wild species that come for it ("any": every wild nest but spiders) */
  eaters: string[];
  /** rots sooner or later than the usual lastsHours (a sugar spill dries fast) */
  lastsHours?: number;
  /** share of a holder's cargo it gives up per load (a beetle's shell is slow work); 100 when missing */
  carryPct?: number;
  /** wild parties it always draws (picnic crumbs); otherwise one, with wildParties.chance */
  parties?: number;
}

interface WildPartiesData {
  chance: number;
  delayHours: [number, number];
  repeatChance: number;
  range: number;
  partyShare: number;
  speedPct: number;
  carryEach: number;
}

interface WindfallData {
  name: string;
  everyHours: [number, number];
  firstDropHours: [number, number];
  lastsHours: number;
  deliverEveryHours: number;
  announceRange: number;
  guardChance: number;
  pile: number[];
  guards: UnitCounts[];
  kinds: Record<WindfallKind, WindfallKindDef>;
  wildParties: WildPartiesData;
}

export const WINDFALLS = NPC_DATA.windfalls as unknown as WindfallData;
export const WINDFALL_KINDS = Object.keys(WINDFALLS.kinds) as WindfallKind[];
export const WINDFALL_MAX_LEVEL = WINDFALLS.pile.length;
export const WILD_PARTIES = WINDFALLS.wildParties;

/** The food lying on a windfall site right now. */
export interface WindfallDrop {
  kind: WindfallKind;
  startedAt: number;
  /** when it rots */
  endsAt: number;
  /** how much it held when it fell */
  pile: Resources;
  /** wild ants got there first */
  guarded: boolean;
}

/** What colonies.npc holds for a windfall site. The food left is the row's resources; the ants holding it are its units. */
export interface WindfallState {
  kind: 'windfall';
  level: number;
  at: number;
  /** the player's ants holding it (same shape as a herd's tenders) */
  tender: HerdTender | null;
  /** the windfall lying there now, or null while the site is empty */
  drop: WindfallDrop | null;
}

export const isWindfallState = (npc: unknown): npc is WindfallState => !!npc && (npc as { kind?: string }).kind === 'windfall';

/** A wild site that players hold with their own ants: an aphid herd or a windfall. */
export type HeldState = HerdState | WindfallState;
export const isHeldState = (npc: unknown): npc is HeldState => {
  const k = !!npc && (npc as { kind?: string }).kind;
  return k === 'herd' || k === 'windfall';
};

const clampLevel = (level: number) => Math.min(Math.max(1, level), WINDFALL_MAX_LEVEL);

/** How much a windfall of this kind holds at this level, split by its mix. */
export function windfallPile(kind: WindfallKind, level: number): Resources {
  const def = WINDFALLS.kinds[kind];
  const total = WINDFALLS.pile[clampLevel(level) - 1] * def.size;
  const out = { foliage: 0, protein: 0, nectar: 0 } as Resources;
  for (const r of RESOURCE_IDS) out[r] = Math.round((total * (def.mix[r] ?? 0)) / 100);
  return out;
}

/** The wild ants guarding a windfall they found first, by level. */
export const windfallGuards = (level: number): UnitCounts => ({ ...WINDFALLS.guards[clampLevel(level) - 1] });

/** Pick what falls: a kind by weight, and whether wild ants got there first. */
export function rollWindfall(rng: Rng): { kind: WindfallKind; guarded: boolean } {
  const sum = WINDFALL_KINDS.reduce((a, k) => a + WINDFALLS.kinds[k].weight, 0);
  let x = rng() * sum;
  let kind = WINDFALL_KINDS[WINDFALL_KINDS.length - 1];
  for (const k of WINDFALL_KINDS) {
    x -= WINDFALLS.kinds[k].weight;
    if (x < 0) {
      kind = k;
      break;
    }
  }
  return { kind, guarded: rng() < WINDFALLS.guardChance };
}

/** Hours (world speed 1) until a windfall site's next roll. */
export function nextWindfallHours(rng: Rng): number {
  const [lo, hi] = WINDFALLS.everyHours;
  return lo + rng() * (hi - lo);
}

/** Hours (world speed 1) until a brand-new windfall site's first drop: soon, so new areas get one quickly. */
export function firstWindfallHours(rng: Rng): number {
  const [lo, hi] = WINDFALLS.firstDropHours;
  return lo + rng() * (hi - lo);
}

/** "Dead grasshopper" for a site with a drop, "Windfall" for an empty one. */
export const windfallName = (state: WindfallState) => (state.drop ? WINDFALLS.kinds[state.drop.kind].name : WINDFALLS.name);

// ---------- wild ants come for windfalls (docs/25-windfalls.md#wild-ants-come-for-windfalls) ----------

/** Hours (world speed 1) a windfall of this kind lies there before it rots. */
/**
 * Hours between the loads a windfall's holders carry home: deliverEveryHours, 10% sooner a level of the holder's
 * Recruitment Trails (docs/25-windfalls.md). Read when each load sets off, so new levels count from the next load.
 */
export const windfallDeliverEveryHours = (research?: ResearchLevels): number => WINDFALLS.deliverEveryHours * researchFactor(research, 'windfallLoadTimePct');

/** How much sooner Recruitment Trails brings each load, in percent (0 without it). */
export const windfallLoadCutPct = (research?: ResearchLevels): number => Math.max(0, -researchSum(research, 'windfallLoadTimePct'));

export const windfallLastsHours = (kind: WindfallKind): number => WINDFALLS.kinds[kind].lastsHours ?? WINDFALLS.lastsHours;

/** How much a holding party can strip per load: its cargo, less for a hard-shelled beetle. */
export const windfallLoadCap = (kind: WindfallKind | undefined, cargo: number): number =>
  Math.floor((cargo * (kind ? WINDFALLS.kinds[kind].carryPct ?? 100 : 100)) / 100);

/** Does this wild species come for this kind of windfall? Spiders never leave their den. */
export function eatsWindfall(species: string | undefined, kind: WindfallKind): boolean {
  if (!species || species === 'spider') return false;
  const eaters = WINDFALLS.kinds[kind].eaters;
  return eaters.includes('any') || eaters.includes(species);
}

/** How many wild parties a new windfall draws: a picnic always draws its `parties`, the rest one, by chance. */
export function wildPartiesFor(kind: WindfallKind, rng: Rng): number {
  const fixed = WINDFALLS.kinds[kind].parties;
  if (fixed) return fixed;
  return rng() < WILD_PARTIES.chance ? 1 : 0;
}

/** Hours (world speed 1) until a wild party sets off for a windfall. */
export function wildPartyDelayHours(rng: Rng): number {
  const [lo, hi] = WILD_PARTIES.delayHours;
  return lo + rng() * (hi - lo);
}

/** The ants a wild nest sends: partyShare of each kind it has. Empty when it's too small to send anyone. */
export function wildWindfallParty(units: UnitCounts): UnitCounts {
  const out: UnitCounts = {};
  for (const [id, n] of Object.entries(units)) {
    const k = Math.floor((n ?? 0) * WILD_PARTIES.partyShare);
    if (k > 0) out[id as keyof UnitCounts] = k;
  }
  return out;
}

/** What wild holders carry home per load, on top of their castes' cargo: termites and wild ants carry by the mouthful. */
export const wildCarry = (units: UnitCounts): number =>
  Object.values(units).reduce((a, n) => a + (n ?? 0), 0) * WILD_PARTIES.carryEach;
