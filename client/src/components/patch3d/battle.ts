// A battle report turned into something the 3D Patch can act out (docs/art/sunlit-microcosm.md, "Battles"):
// how many ants each side brings, how many are still standing after every round, who won, and how long each
// part of the replay lasts. The server already fought the battle; this only reads its report.
import { CASTES } from '@hormigas/shared';

export interface Coords {
  region: number;
  patch: number;
  spot: number;
}
export interface ReplaySide {
  name: string;
  /** ants at the start (units, plus defenses and allied soldiers for the defender) */
  start: number;
  /** still standing after each round */
  left: number[];
  /** army ants (a swarm) */
  swarm: boolean;
  wild: boolean;
  /** share of fighters (soldier role) among the units, for which ants to draw */
  soldiers: number;
}
export interface BattlePlan {
  attacker: ReplaySide;
  defender: ReplaySide;
  rounds: number;
  winner: 'attacker' | 'defender' | 'draw';
  /** the raiders fell back after this round */
  fellBackAfter: number | null;
  target: Coords;
  origin: Coords | null;
  /** whose side the viewer is on */
  perspective: 'attacker' | 'defender' | 'ally';
}

const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
const fighters = (units: Record<string, number> | undefined) => {
  const total = sum(units);
  if (!total) return 0;
  let n = 0;
  for (const [id, c] of Object.entries(units ?? {})) if ((CASTES as Record<string, { role?: string }>)[id]?.role !== 'worker') n += c;
  return n / total;
};

/** The replay for a battle report's data, or null if it has nothing to show (a raid that turned back, no rounds). */
export function planBattle(d: any): BattlePlan | null {
  if (!d || d.turnedBack || !Array.isArray(d.rounds) || d.rounds.length === 0 || !d.target) return null;
  const allies = (d.defender?.allies ?? []) as { units?: Record<string, number> }[];
  const attackerStart = sum(d.attacker?.units);
  const defenderStart = sum(d.defender?.units) + sum(d.defender?.defenses) + allies.reduce((a, x) => a + sum(x.units), 0);
  // remaining counts never go up, and never above the start
  const clampLeft = (xs: number[], start: number) => {
    let prev = start;
    return xs.map((x) => (prev = Math.max(0, Math.min(prev, Number(x) || 0))));
  };
  const swarm = d.attacker?.name === 'Army ant swarm';
  // reports name players by username; on the patch, your own side is just "your raiders" or your colony
  const youAttacked = d.perspective === 'attacker';
  return {
    attacker: {
      name: youAttacked ? 'Your raiders' : d.attacker?.name ?? 'Raiders', start: attackerStart, swarm, wild: !!d.attacker?.wild,
      left: clampLeft(d.rounds.map((r: any) => r.attackerRemaining), attackerStart), soldiers: fighters(d.attacker?.units),
    },
    defender: {
      name: d.defender?.colony ?? d.defender?.name ?? 'Defenders', start: Math.max(defenderStart, Number(d.rounds[0]?.defenderRemaining) || 0),
      swarm: false, wild: !!d.defender?.wild,
      left: clampLeft(d.rounds.map((r: any) => r.defenderRemaining), Math.max(defenderStart, Number(d.rounds[0]?.defenderRemaining) || 0)),
      soldiers: fighters(d.defender?.units),
    },
    rounds: d.rounds.length,
    winner: d.winner === 'attacker' || d.winner === 'defender' ? d.winner : 'draw',
    fellBackAfter: d.retreatedAfterRound ?? null,
    target: d.target,
    origin: d.attacker?.origin ?? null,
    perspective: d.perspective === 'attacker' || d.perspective === 'ally' ? d.perspective : 'defender',
  };
}

/** The replay's timing, in seconds: the march in, one beat per round, then the outcome. */
export const TIMING = { approach: 2.5, round: 1.5, outcome: 3, linger: 12 };
export const replayLength = (p: BattlePlan) => TIMING.approach + p.rounds * TIMING.round + TIMING.outcome;

export interface ReplayMoment {
  phase: 'approach' | 'fight' | 'outcome' | 'done';
  /** 0…1 through the current phase (for the fight: through the current round) */
  k: number;
  /** the round being fought (1-based), or the last one */
  round: number;
  /** how many of each side are still standing right now (real numbers) */
  attackers: number;
  defenders: number;
}

/** Where the replay is `t` seconds in. Losses fall smoothly through each round, ending on the report's numbers. */
export function momentAt(p: BattlePlan, t: number): ReplayMoment {
  const { approach, round, outcome } = TIMING;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  if (t < approach) return { phase: 'approach', k: Math.max(0, t / approach), round: 1, attackers: p.attacker.start, defenders: p.defender.start };
  const ft = t - approach;
  if (ft < p.rounds * round) {
    const i = Math.floor(ft / round), k = (ft - i * round) / round;
    const a0 = i ? p.attacker.left[i - 1] : p.attacker.start, d0 = i ? p.defender.left[i - 1] : p.defender.start;
    return { phase: 'fight', k, round: i + 1, attackers: Math.round(lerp(a0, p.attacker.left[i], k)), defenders: Math.round(lerp(d0, p.defender.left[i], k)) };
  }
  const last = { attackers: p.attacker.left[p.rounds - 1], defenders: p.defender.left[p.rounds - 1], round: p.rounds };
  const ot = ft - p.rounds * round;
  if (ot < outcome) return { phase: 'outcome', k: ot / outcome, ...last };
  return { phase: 'done', k: 1, ...last };
}

/** How many drawn ants stand for `real` ants, when `drawn0` were drawn for `start`. Never shows 0 while some are alive. */
export function drawnFor(real: number, start: number, drawn0: number): number {
  if (real <= 0 || start <= 0) return 0;
  return Math.max(1, Math.min(drawn0, Math.round((drawn0 * real) / start)));
}
