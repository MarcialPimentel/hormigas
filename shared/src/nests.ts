// Wild nests: NPC colonies, one per patch with players. Spec: docs/17-wild-nests.md
import { NPC_DATA, CASTES, DEFENSES, type CasteId, type DefenseId, type Resources, type TerrainId } from './data';
import type { DefenseCounts, UnitCounts } from './economy';
import { res, total } from './resources';
import { unitsValue } from './combat';

export type NestSpecies = keyof typeof NPC_DATA.species;
export const NEST_SPECIES = Object.keys(NPC_DATA.species) as NestSpecies[];

interface SpeciesDef {
  name: string;
  nest: string;
  terrains: TerrainId[];
  style: string;
  levels: { units: UnitCounts; defenses: DefenseCounts }[];
}
export const SPECIES = NPC_DATA.species as unknown as Record<NestSpecies, SpeciesDef>;
const LEVELS = NPC_DATA.levels as { level: number; minPatchPoints: number; stock: Resources }[];
export const NEST_MAX_LEVEL = LEVELS.length;
export const NEST_REGROW_HOURS = NPC_DATA.regrowHours;
export const NEST_RAIDS = NPC_DATA.raids as unknown as {
  everyHours: [number, number];
  partyShare: number;
  minParty: UnitCounts;
  maxPartyValuePctOfTargetPoints: number;
  speedPct: number;
  perPlayerCooldownHours: number;
  revengeWeight: number;
};

/** What a nest keeps between changes. Its live values are computed from this (nestAt). */
export interface NestState {
  species: NestSpecies;
  level: number;
  /** when units/defenses/resources were last saved */
  at: number;
}

export interface NestSnapshot {
  units: UnitCounts;
  defenses: DefenseCounts;
  resources: Resources;
}

export function speciesForTerrain(terrain: TerrainId): NestSpecies {
  return NEST_SPECIES.find((s) => SPECIES[s].terrains.includes(terrain)) ?? NEST_SPECIES[0];
}

/** Highest level the patch's strongest active player has reached. Never below `current`. */
export function nestLevelFor(patchLeaderPoints: number, current = 1): number {
  let level = 1;
  for (const l of LEVELS) if (patchLeaderPoints >= l.minPatchPoints) level = l.level;
  return Math.max(current, Math.min(level, NEST_MAX_LEVEL));
}

/** Full-strength soldiers, defenses and food store for a species at a level. */
export function nestTargets(species: NestSpecies, level: number): NestSnapshot {
  const L = Math.min(Math.max(1, level), NEST_MAX_LEVEL);
  const def = SPECIES[species].levels[L - 1];
  return { units: { ...def.units }, defenses: { ...def.defenses }, resources: { ...LEVELS[L - 1].stock } };
}

/** Grow `have` toward `target` by `fraction` of target (0..1), never shrinking what is already above it. */
function regrowCounts<K extends string>(have: Partial<Record<K, number>>, target: Partial<Record<K, number>>, fraction: number): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = { ...have };
  for (const k of Object.keys(target) as K[]) {
    const t = target[k] ?? 0;
    const h = have[k] ?? 0;
    if (h < t) out[k] = Math.min(t, h + Math.floor(t * fraction));
  }
  return out;
}

/**
 * A nest's live soldiers, defenses and food at time t: its saved values plus regrowth since `state.at`.
 * Everything regrows in a straight line to full over NEST_REGROW_HOURS (÷ world speed). Pure; nothing ticks.
 */
export function nestAt(state: NestState, saved: NestSnapshot, t: number, worldSpeed = 1): NestSnapshot {
  const target = nestTargets(state.species, state.level);
  const fraction = Math.max(0, Math.min(1, ((t - state.at) / 3600_000) * worldSpeed / NEST_REGROW_HOURS));
  const resources = res();
  for (const r of Object.keys(target.resources) as (keyof Resources)[]) {
    const have = saved.resources[r] ?? 0;
    const goal = target.resources[r];
    resources[r] = have >= goal ? have : Math.min(goal, have + goal * fraction);
  }
  return {
    units: regrowCounts<CasteId>(saved.units, target.units, fraction),
    defenses: regrowCounts<DefenseId>(saved.defenses, target.defenses, fraction),
    resources,
  };
}

/** Hours (world speed 1) until the next nest raid, picked uniformly from NEST_RAIDS.everyHours. */
export function nextNestRaidHours(rng: () => number): number {
  const [lo, hi] = NEST_RAIDS.everyHours;
  return lo + rng() * (hi - lo);
}

/**
 * The party a nest sends at a target: a share of its soldiers, at least the minimum party if it has them,
 * scaled down so it's never worth more than a small share of the target's points.
 */
export function nestRaidParty(home: UnitCounts, targetPoints: number): UnitCounts {
  const party: UnitCounts = {};
  for (const [k, n] of Object.entries(home) as [CasteId, number][]) {
    if (!n || CASTES[k].attack < 25) continue; // soldiers only; Workers stay home
    party[k] = Math.round(n * NEST_RAIDS.partyShare);
  }
  for (const [k, n] of Object.entries(NEST_RAIDS.minParty) as [CasteId, number][]) {
    if ((party[k] ?? 0) < n) party[k] = Math.min(n, home[k] ?? 0);
  }
  const cap = (targetPoints * 1000 * NEST_RAIDS.maxPartyValuePctOfTargetPoints) / 100;
  const value = total(unitsValue(party));
  if (value > cap && value > 0) {
    const k = cap / value;
    for (const id of Object.keys(party) as CasteId[]) party[id] = Math.floor((party[id] ?? 0) * k);
  }
  // the minimum party always goes, so even a brand-new target sees a raid it can learn from
  for (const [k, n] of Object.entries(NEST_RAIDS.minParty) as [CasteId, number][]) {
    if ((party[k] ?? 0) < n) party[k] = Math.min(n, home[k] ?? 0);
  }
  return Object.fromEntries(Object.entries(party).filter(([, n]) => (n ?? 0) > 0)) as UnitCounts;
}

export const nestName = (species: NestSpecies) => SPECIES[species].nest;
export const defenseName = (id: DefenseId) => DEFENSES[id].name;
