// Wild nests: NPC colonies, one per patch near players. Spec: docs/17-wild-nests.md
// Termite mounds and spider dens (docs/24-npcs.md) are nests of special species: same regrowth, scouting and raids,
// their own level table, store and regrow time, and they never raid back.
import { NPC_DATA, CASTES, DEFENSES, FORMULAS, type CasteId, type DefenseId, type Resources, type TerrainId } from './data';
import type { DefenseCounts, UnitCounts } from './economy';
import { res, total } from './resources';
import { unitsValue } from './combat';

export type NestSpecies = keyof typeof NPC_DATA.species;
/** 'nest' = an ordinary wild ant nest; 'mound' = a termite mound; 'den' = a spider den (boss). */
export type NestKind = 'nest' | 'mound' | 'den';

interface SpeciesDef {
  name: string;
  nest: string;
  terrains: TerrainId[];
  style: string;
  kind?: NestKind;
  /** hours to regrow from nothing to full (default: npc.regrowHours) */
  regrowHours?: number;
  /** false = never raids players */
  raids?: boolean;
  /** percent of the level's normal food store, per resource (default 100) */
  stockPct?: Partial<Resources>;
  levels: { units: UnitCounts; defenses: DefenseCounts; minPoints?: number; stock?: Resources }[];
}
export const SPECIES = NPC_DATA.species as unknown as Record<NestSpecies, SpeciesDef>;
const ALL_SPECIES = Object.keys(NPC_DATA.species) as NestSpecies[];
export const speciesKind = (s: NestSpecies): NestKind => SPECIES[s].kind ?? 'nest';
/** Ordinary wild-nest species (the ones terrain picks from). */
export const NEST_SPECIES = ALL_SPECIES.filter((s) => speciesKind(s) === 'nest');
/** The one species of each special kind: termite mound, spider den. */
export const speciesOfKind = (kind: Exclude<NestKind, 'nest'>): NestSpecies => ALL_SPECIES.find((s) => speciesKind(s) === kind)!;
const LEVELS = NPC_DATA.levels as { level: number; minPatchPoints: number; stock: Resources }[];
export const NEST_MAX_LEVEL = LEVELS.length;
export const NEST_REGROW_HOURS = NPC_DATA.regrowHours;
/** Highest level a species has: 6 for wild nests, fewer tiers for mounds and dens. */
export const maxLevel = (s: NestSpecies): number => (speciesKind(s) === 'nest' ? NEST_MAX_LEVEL : SPECIES[s].levels.length);
export const regrowHours = (s: NestSpecies): number => SPECIES[s].regrowHours ?? NEST_REGROW_HOURS;
export const nestRaidsBack = (s: NestSpecies): boolean => SPECIES[s].raids !== false;
export const NEST_RAIDS = NPC_DATA.raids as unknown as {
  everyHours: [number, number];
  partyShare: number;
  /** castes with at least this attack count as soldiers and join raids */
  soldierMinAttack: number;
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
  /**
   * When soldier and defense regrowth is counted from. Usually a little before `at`: whole ants are
   * regrown, and the time already spent on the next one is kept here so a save doesn't throw it away.
   */
  unitsAt?: number;
}

export interface NestSnapshot {
  units: UnitCounts;
  defenses: DefenseCounts;
  resources: Resources;
}

/**
 * The wild-nest species that lives on a terrain. Without `rng`, the first one listed (the original species);
 * with it, any species at home there, so new patches get a mix.
 */
export function speciesForTerrain(terrain: TerrainId, rng?: () => number): NestSpecies {
  const fits = NEST_SPECIES.filter((s) => SPECIES[s].terrains.includes(terrain));
  if (fits.length === 0) return NEST_SPECIES[0];
  return rng ? fits[Math.floor(rng() * fits.length)] : fits[0];
}

/**
 * Highest level the area's strongest active player has reached. Never below `current`.
 * Wild nests use npc.levels[].minPatchPoints; mounds and dens their own levels[].minPoints.
 */
export function nestLevelFor(leaderPoints: number, current = 1, species?: NestSpecies): number {
  let level = 1;
  if (species && speciesKind(species) !== 'nest') {
    SPECIES[species].levels.forEach((l, i) => { if (leaderPoints >= (l.minPoints ?? 0)) level = i + 1; });
  } else {
    for (const l of LEVELS) if (leaderPoints >= l.minPatchPoints) level = l.level;
  }
  const max = species ? maxLevel(species) : NEST_MAX_LEVEL;
  return Math.min(max, Math.max(current, level));
}

/** Full-strength soldiers, defenses and food store for a species at a level. */
export function nestTargets(species: NestSpecies, level: number): NestSnapshot {
  const L = Math.min(Math.max(1, level), maxLevel(species));
  const sp = SPECIES[species];
  const def = sp.levels[L - 1];
  const resources = def.stock ? { ...def.stock } : { ...LEVELS[L - 1].stock };
  if (!def.stock && sp.stockPct)
    for (const r of Object.keys(resources) as (keyof Resources)[]) resources[r] = Math.round((resources[r] * (sp.stockPct[r] ?? 100)) / 100);
  return { units: { ...def.units }, defenses: { ...def.defenses }, resources };
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
 * Everything regrows in a straight line to full over the species' regrow hours (÷ world speed). Pure; nothing ticks.
 */
const regrowFraction = (from: number, t: number, worldSpeed: number, hours = NEST_REGROW_HOURS) => Math.max(0, Math.min(1, ((t - from) / 3600_000) * worldSpeed / hours));

export function nestAt(state: NestState, saved: NestSnapshot, t: number, worldSpeed = 1): NestSnapshot {
  const target = nestTargets(state.species, state.level);
  const hours = regrowHours(state.species);
  const fraction = regrowFraction(state.at, t, worldSpeed, hours);
  const unitFraction = regrowFraction(state.unitsAt ?? state.at, t, worldSpeed, hours);
  const resources = res();
  for (const r of Object.keys(target.resources) as (keyof Resources)[]) {
    const have = saved.resources[r] ?? 0;
    const goal = target.resources[r];
    resources[r] = have >= goal ? have : Math.min(goal, have + goal * fraction);
  }
  return {
    units: regrowCounts<CasteId>(saved.units, target.units, unitFraction),
    defenses: regrowCounts<DefenseId>(saved.defenses, target.defenses, unitFraction),
    resources,
  };
}

/**
 * The `unitsAt` to save alongside nestAt(state, saved, t): t, minus the time already spent toward the next
 * soldier or defense that hasn't appeared yet. Without it, a nest saved often (scouted, raided) regrows nothing.
 */
export function nestUnitsAt(state: NestState, saved: NestSnapshot, t: number, worldSpeed = 1): number {
  const target = nestTargets(state.species, state.level);
  const from = state.unitsAt ?? state.at;
  const hours = regrowHours(state.species);
  const fraction = regrowFraction(from, t, worldSpeed, hours);
  const fullMs = (hours * 3600_000) / worldSpeed;
  let carry = 0;
  const pairs: [Record<string, number | undefined>, Record<string, number | undefined>][] = [
    [saved.units, target.units],
    [saved.defenses, target.defenses],
  ];
  for (const [have, goal] of pairs) {
    for (const k of Object.keys(goal)) {
      const g = goal[k] ?? 0;
      const h = have[k] ?? 0;
      if (g <= 0 || h >= g) continue;
      const exact = g * fraction;
      if (h + Math.floor(exact) >= g) continue; // full now: nothing to carry
      // keep the largest partial, so no kind loses progress (others gain at most one unit's worth)
      carry = Math.max(carry, ((exact - Math.floor(exact)) / g) * fullMs);
    }
  }
  return Math.round(t - Math.min(carry, t - from));
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
    if (!n || CASTES[k].attack < NEST_RAIDS.soldierMinAttack) continue; // soldiers only; Workers stay home
    party[k] = Math.round(n * NEST_RAIDS.partyShare);
  }
  for (const [k, n] of Object.entries(NEST_RAIDS.minParty) as [CasteId, number][]) {
    if ((party[k] ?? 0) < n) party[k] = Math.min(n, home[k] ?? 0);
  }
  const cap = (targetPoints * FORMULAS.points.resourcesPerPoint * NEST_RAIDS.maxPartyValuePctOfTargetPoints) / 100;
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
