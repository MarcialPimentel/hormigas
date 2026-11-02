// Army-ant swarms (docs/20-swarms.md): a roaming enemy that visits every player colony now and then,
// announced hours ahead, and sized so a colony that keeps its army home usually wins.
import { NPC_DATA } from './data';
import { researchSum, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { simulateBattle } from './combat';
import { createRng, type Rng } from './rng';

export const SWARM = NPC_DATA.swarm as unknown as {
  name: string;
  everyHours: [number, number];
  warningHours: number;
  preyHours: number;
  minPrey: number;
  pack: UnitCounts;
  minPacks: number;
  maxPacks: number;
  defenderWinRate: number;
  trials: number;
  scouting: { basePct: number; perScentReadingPct: number; perMimicryPct: number; maxPct: number };
};

/** Hours (world speed 1) until a colony's next swarm is spotted, picked uniformly from everyHours. */
export function nextSwarmHours(rng: Rng): number {
  const [lo, hi] = SWARM.everyHours;
  return lo + rng() * (hi - lo);
}

/**
 * Protein a colony keeps after beating a swarm: the prey the swarm was carrying (docs/20-swarms.md).
 * preyHours of the colony's total production per hour (at the world's speed), at least minPrey, up to free storage.
 */
export function swarmPrey(perHourTotal: number, freeProteinStorage: number): number {
  const want = Math.max(SWARM.minPrey, perHourTotal * SWARM.preyHours);
  return Math.floor(Math.max(0, Math.min(want, freeProteinStorage)));
}

export const swarmOfPacks =(n: number): UnitCounts =>
  Object.fromEntries(Object.entries(SWARM.pack).map(([k, v]) => [k, (v ?? 0) * n])) as UnitCounts;

export interface SwarmTarget {
  units: UnitCounts;
  defenses: DefenseCounts;
  research: ResearchLevels;
  /** the colony's ground on its defenses (groundDefensePct) */
  groundDefensePct?: number;
}

/** Share of `trials` simulated battles the defender wins against a swarm of `packs` packs. */
export function defenderWinRate(target: SwarmTarget, packs: number, seed: number, trials = SWARM.trials): number {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const r = simulateBattle({ units: swarmOfPacks(packs), research: {} }, { units: target.units, defenses: target.defenses, research: target.research, groundDefensePct: target.groundDefensePct }, createRng(seed + i));
    if (r.winner === 'defender') wins++;
  }
  return wins / trials;
}

/**
 * The biggest swarm the colony still beats about SWARM.defenderWinRate of the time, from what it has at home now.
 * A colony with nothing at home meets the smallest swarm (minPacks), which takes some unprotected food.
 */
export function swarmParty(target: SwarmTarget, seed: number): UnitCounts {
  let lo = SWARM.minPacks;
  let hi = SWARM.maxPacks;
  if (defenderWinRate(target, lo, seed) < SWARM.defenderWinRate) return swarmOfPacks(lo);
  // win rate falls as the swarm grows: find the largest size that still meets the target
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (defenderWinRate(target, mid, seed) >= SWARM.defenderWinRate) lo = mid;
    else hi = mid - 1;
  }
  return swarmOfPacks(lo);
}


// ---------- scouting the swarm (docs/20-swarms.md § Scouting the swarm) ----------

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
