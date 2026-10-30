// Balance checks shared by `npm run combat` and the tests (docs/05-castes-units.md, docs/17-wild-nests.md).
// Nothing here runs in the game: it answers "who beats whom, at what cost" from the numbers in docs/data.
import { CASTES, CASTE_IDS, DEFENSES, NPC_DATA, type CasteId, type DefenseId } from './data';
import { previewBattle, unitsValue, defensesValue } from './combat';
import type { DefenseCounts, UnitCounts } from './economy';
import { nestTargets, type NestSpecies } from './nests';
import { total } from './resources';

const T = (NPC_DATA as unknown as { tuning: { nestArmies: Record<string, UnitCounts>; moundArmies: UnitCounts[]; denArmies: UnitCounts[] } }).tuning;
/** Fair army per wild-nest level (1–6). */
export const FAIR_NEST_ARMIES: Record<number, UnitCounts> = Object.fromEntries(Object.entries(T.nestArmies).map(([k, v]) => [Number(k), v]));
/** Fair army per termite mound tier (index 0 = tier 1). */
export const FAIR_MOUND_ARMIES: UnitCounts[] = T.moundArmies;
/** Fair army per spider den tier (index 0 = tier 1). */
export const FAIR_DEN_ARMIES: UnitCounts[] = T.denArmies;

export const halfArmy = (u: UnitCounts): UnitCounts => Object.fromEntries(Object.entries(u).map(([k, n]) => [k, Math.floor((n ?? 0) / 2)]));

const casteWorth = (id: CasteId) => total(CASTES[id].cost);
/** As many of a caste as `budget` resources buy. */
export const buyCaste = (id: CasteId, budget: number): UnitCounts => ({ [id]: Math.max(1, Math.round(budget / casteWorth(id))) });
/** As many of a defense as `budget` buys, respecting its per-colony limit. */
export const buyDefense = (id: DefenseId, budget: number): DefenseCounts => ({
  [id]: Math.max(1, Math.min(DEFENSES[id].max ?? Infinity, Math.round(budget / total(DEFENSES[id].cost)))),
});

/** The fighting castes players can raise: role "soldier", in the game. */
export const PLAYER_SOLDIERS: CasteId[] = CASTE_IDS.filter((id) => CASTES[id].mvp && CASTES[id].role === 'soldier');

export interface Matchup {
  attacker: string;
  defender: string;
  winRate: number;
  retreatRate: number;
  attackerLost: number;
  defenderLost: number;
}

/** One preview battle, summarised. Seeded, so the same numbers give the same answer every time. */
export function matchup(
  attacker: string, units: UnitCounts, defender: string, defUnits: UnitCounts, defenses: DefenseCounts = {},
  opts: { runs?: number; seed?: number; retreatPct?: number } = {},
): Matchup {
  const p = previewBattle({ units, research: {}, retreatPct: opts.retreatPct ?? 0 }, { units: defUnits, defenses, research: {} }, { runs: opts.runs ?? 100, seed: opts.seed ?? 3 });
  return { attacker, defender, winRate: p.winRate, retreatRate: p.retreatRate, attackerLost: p.avgAttackerLossValue, defenderLost: p.avgDefenderLossValue };
}

/** Every player soldier caste against every other, each side spending `budget`. */
export function casteMatrix(budget: number, castes: CasteId[] = PLAYER_SOLDIERS, runs?: number): Matchup[] {
  const out: Matchup[] = [];
  for (const a of castes) for (const d of castes) if (a !== d) out.push(matchup(CASTES[a].name, buyCaste(a, budget), CASTES[d].name, buyCaste(d, budget), {}, { runs }));
  return out;
}

/** An even split of `budget` across the given castes. */
export function evenMix(budget: number, castes: CasteId[]): UnitCounts {
  return Object.assign({}, ...castes.map((id) => buyCaste(id, budget / castes.length)));
}

/** Each soldier caste raiding a set of defenses worth about `budget`. */
export function defenseMatrix(budget: number, defenses: DefenseCounts, runs?: number): Matchup[] {
  const worth = total(defensesValue(defenses));
  const name = Object.entries(defenses).map(([id, n]) => `${n} ${DEFENSES[id as DefenseId].name}`).join(' + ');
  return PLAYER_SOLDIERS.map((id) => matchup(CASTES[id].name, buyCaste(id, budget), `${name} (${Math.round(worth / 1000)}k)`, {}, defenses, { runs }));
}

export interface NestCheck {
  target: string;
  level: number;
  fair: { winRate: number; lossShare: number };
  half: { winRate: number; lossShare: number };
}

/** A fair army (and half of it) against a wild thing at a level. */
export function nestCheck(species: NestSpecies, level: number, army: UnitCounts, runs = 100): NestCheck {
  const t = nestTargets(species, level);
  const run = (u: UnitCounts) => {
    const p = previewBattle({ units: u, research: {} }, { units: t.units, defenses: t.defenses, research: {} }, { runs, seed: 1 });
    return { winRate: p.winRate, lossShare: p.avgAttackerLossValue / Math.max(1, total(unitsValue(u))) };
  };
  return { target: species, level, fair: run(army), half: run(halfArmy(army)) };
}
