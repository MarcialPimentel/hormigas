// Army-ant swarms (docs/20-swarms.md): a roaming enemy that visits every player colony now and then,
// announced hours ahead. Each sighting rolls one of three sizes (a foraging column, a war column or, now and then,
// a great swarm), each sized against what the colony has at home.
import { FORMULAS, NPC_DATA, type Resources } from './data';
import { researchSum, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { defensesValue, simulateBattle, unitsValue } from './combat';
import { res } from './resources';
import { createRng, type Rng } from './rng';

export interface SwarmSize {
  id: 'foraging' | 'war' | 'great';
  name: string;
  /** percent of sightings */
  chance: number;
  /** the colony, keeping what it has at home, beats this size at least this share of the time */
  minWinRate: number;
  /** ...and loses at most this percent of what is at stake, on average (no limit if missing) */
  maxLossPct?: number;
  /** one line for the card once scouted */
  blurb: string;
}
export type SwarmSizeId = SwarmSize['id'];

export const SWARM = NPC_DATA.swarm as unknown as {
  name: string;
  everyHours: [number, number];
  warningHours: number;
  pack: UnitCounts;
  smallest: UnitCounts;
  minPacks: number;
  maxPacks: number;
  trials: number;
  sizes: SwarmSize[];
  prey: { pctOfWorth: number; mixPct: Resources; minHours: number; min: number };
  scouting: { basePct: number; perScentReadingPct: number; perMimicryPct: number; maxPct: number };
};

export const swarmSize = (id: string | undefined): SwarmSize | undefined => SWARM.sizes.find((s) => s.id === id);

/** Roll the size of a new sighting by each size's chance. */
export function rollSwarmSize(rng: Rng): SwarmSize {
  const total = SWARM.sizes.reduce((a, s) => a + s.chance, 0);
  let r = rng() * total;
  for (const s of SWARM.sizes) {
    r -= s.chance;
    if (r < 0) return s;
  }
  return SWARM.sizes[SWARM.sizes.length - 1];
}

/** Hours (world speed 1) until a colony's next swarm is spotted, picked uniformly from everyHours. */
export function nextSwarmHours(rng: Rng): number {
  const [lo, hi] = SWARM.everyHours;
  return lo + rng() * (hi - lo);
}

const worth = (r: Resources) => r.foliage + r.protein + r.nectar;

/**
 * What a colony keeps after beating a swarm: the prey it was carrying (docs/20-swarms.md). prey.pctOfWorth % of the
 * swarm's worth, split by prey.mixPct, and never less than prey.minHours of the colony's own total production per hour
 * (at the world's speed) or prey.min. It may go over the storage cap, like mission cargo.
 */
export function swarmPrey(swarm: UnitCounts, perHourTotal: number): Resources {
  const p = SWARM.prey;
  const total = Math.max(p.min, perHourTotal * p.minHours, (worth(unitsValue(swarm)) * p.pctOfWorth) / 100);
  const mix = worth(p.mixPct) || 1;
  return res(Math.floor((total * p.mixPct.foliage) / mix), Math.floor((total * p.mixPct.protein) / mix), Math.floor((total * p.mixPct.nectar) / mix));
}

export const swarmOfPacks = (n: number): UnitCounts =>
  Object.fromEntries(Object.entries(SWARM.pack).map(([k, v]) => [k, (v ?? 0) * n])) as UnitCounts;

/** A swarm of size n: 0 is the smallest party, otherwise n packs. */
export const swarmOfSize = (n: number): UnitCounts => (n <= 0 ? { ...SWARM.smallest } : swarmOfPacks(n));

export interface SwarmTarget {
  units: UnitCounts;
  defenses: DefenseCounts;
  research: ResearchLevels;
  /** the colony's ground on its defenses (groundDefensePct) */
  groundDefensePct?: number;
}

/**
 * How a colony fares against a swarm of size n over `trials` simulated battles: how often it wins, and what it loses
 * on average as a share of its ants' worth. What's lost counts the ants, plus the share of knocked-down defenses that
 * won't rebuild (1 - defenseRebuildChance). A colony with no ants at home measures against that share of its defenses.
 */
export function swarmOdds(target: SwarmTarget, n: number, seed: number, trials = SWARM.trials): { winRate: number; lossShare: number } {
  const keep = 1 - FORMULAS.combat.defenseRebuildChance;
  const ants = worth(unitsValue(target.units));
  const atStake = ants > 0 ? ants : keep * worth(defensesValue(target.defenses));
  let wins = 0;
  let lost = 0;
  for (let i = 0; i < trials; i++) {
    const r = simulateBattle({ units: swarmOfSize(n), research: {} }, { units: target.units, defenses: target.defenses, research: target.research, groundDefensePct: target.groundDefensePct }, createRng(seed + i));
    if (r.winner === 'defender') wins++;
    lost += worth(unitsValue(r.defenderLost)) + keep * worth(defensesValue(r.defensesDestroyed));
  }
  return { winRate: wins / trials, lossShare: atStake > 0 ? lost / trials / atStake : 0 };
}


/** Does a swarm of size n fit `size` for this colony? */
export function swarmFits(target: SwarmTarget, size: SwarmSize, n: number, seed: number): boolean {
  const o = swarmOdds(target, n, seed);
  return o.winRate >= size.minWinRate && (size.maxLossPct == null || o.lossShare * 100 <= size.maxLossPct);
}

/** The swarm size n (0 = smallest party) picked for `size`: the biggest that still fits, from what the colony has at home now. */
export function swarmPacksFor(target: SwarmTarget, size: SwarmSize, seed: number): number {
  let lo = SWARM.minPacks;
  let hi = SWARM.maxPacks;
  if (!swarmFits(target, size, lo, seed)) return lo;
  // the fight gets harder as the swarm grows: find the largest size that still fits
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (swarmFits(target, size, mid, seed)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The swarm a colony meets for a sighting of `size`. A colony with nothing at home meets the smallest party, which
 * takes some unprotected food.
 */
export function swarmParty(target: SwarmTarget, seed: number, size: SwarmSize = SWARM.sizes[0]): UnitCounts {
  return swarmOfSize(swarmPacksFor(target, size, seed));
}


// ---------- scouting the swarm or any incoming raid (docs/20-swarms.md § Scouting an incoming raid) ----------

/**
 * Chance one Scout slips up to the column and gets back: a base, plus Scent Reading and Chemical Mimicry
 * (army ants are nearly blind and hunt by smell), up to a cap.
 */
export function swarmScoutChance(research: ResearchLevels | undefined): number {
  const s = SWARM.scouting;
  const pct = s.basePct + s.perScentReadingPct * researchSum(research, 'scoutLevel') + s.perMimicryPct * researchSum(research, 'scoutStealth');
  return Math.min(s.maxPct, pct) / 100;
}

/**
 * What sending `scouts` Scouts at a swarm looks like before they go: each one rolls on its own, the report
 * comes back if at least one makes it, and the rest are eaten.
 */
export function swarmScoutOdds(scouts: number, research: ResearchLevels | undefined): { perScout: number; reportChance: number; expectedLost: number } {
  const perScout = swarmScoutChance(research);
  const n = Math.max(0, Math.floor(scouts));
  return { perScout, reportChance: n > 0 ? 1 - Math.pow(1 - perScout, n) : 0, expectedLost: n * (1 - perScout) };
}

/** How many of `scouts` Scouts get back from the swarm, rolling each on its own. */
export function rollSwarmScouts(scouts: number, research: ResearchLevels | undefined, rng: Rng): number {
  const p = swarmScoutChance(research);
  let back = 0;
  for (let i = 0; i < scouts; i++) if (rng() < p) back++;
  return back;
}

/** An unscouted swarm's size as the colony sees it: rounded to one figure (89 → 90, 1,234 → 1,000). */
export function roughSwarmSize(n: number): number {
  if (n < 10) return Math.max(0, Math.round(n));
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.round(n / step) * step;
}
