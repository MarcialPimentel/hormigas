// Army-ant swarms (docs/20-swarms.md): a roaming enemy that visits every player colony now and then,
// announced hours ahead, and sized so a colony that keeps its army home usually wins.
import { NPC_DATA } from './data';
import type { DefenseCounts, ResearchLevels, UnitCounts } from './economy';
import { simulateBattle } from './combat';
import { createRng, type Rng } from './rng';

export const SWARM = NPC_DATA.swarm as unknown as {
  name: string;
  everyHours: [number, number];
  warningHours: number;
  pack: UnitCounts;
  minPacks: number;
  maxPacks: number;
  defenderWinRate: number;
  trials: number;
};

/** Hours (world speed 1) until a colony's next swarm is spotted, picked uniformly from everyHours. */
export function nextSwarmHours(rng: Rng): number {
  const [lo, hi] = SWARM.everyHours;
  return lo + rng() * (hi - lo);
}

export const swarmOfPacks = (n: number): UnitCounts =>
  Object.fromEntries(Object.entries(SWARM.pack).map(([k, v]) => [k, (v ?? 0) * n])) as UnitCounts;

export interface SwarmTarget {
  units: UnitCounts;
  defenses: DefenseCounts;
  research: ResearchLevels;
}

/** Share of `trials` simulated battles the defender wins against a swarm of `packs` packs. */
export function defenderWinRate(target: SwarmTarget, packs: number, seed: number, trials = SWARM.trials): number {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const r = simulateBattle({ units: swarmOfPacks(packs), research: {} }, { units: target.units, defenses: target.defenses, research: target.research }, createRng(seed + i));
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

