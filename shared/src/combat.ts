// Combat engine. Spec: docs/08-combat.md
// Pure and deterministic for a given RNG, so the client preview runs the exact same code as the server.
import {
  CASTES,
  DEFENSES,
  FORMULAS,
  RESOURCE_IDS,
  type CasteId,
  type CombatStats,
  type DefenseId,
  type Resources,
} from './data';
import { researchFraction, researchSum, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { res, add, scale } from './resources';
import { createRng, type Rng } from './rng';

const C = FORMULAS.combat;

export interface CombatSide {
  units: UnitCounts;
  /**
   * Attacker only: the fall-back order (docs/08-combat.md). After a round in which the attackers have lost
   * at least this percent of their army's worth (resources), they break off. 0 or missing: fight to the end.
   */
  retreatPct?: number;
  defenses?: DefenseCounts;
  research: ResearchLevels;
  /**
   * Defender only: allied soldiers holding position at the colony (docs/23-supercolonies.md).
   * Each group fights with its own owner's research and is counted separately in the result.
   */
  allies?: { units: UnitCounts; research: ResearchLevels }[];
}

export interface RoundSummary {
  round: number;
  attackerShots: number;
  defenderShots: number;
  attackerDamage: number;
  defenderDamage: number;
  attackerRemaining: number;
  defenderRemaining: number;
}

export type Winner = 'attacker' | 'defender' | 'draw';

export interface BattleResult {
  winner: Winner;
  rounds: RoundSummary[];
  attackerLost: UnitCounts;
  attackerSurvivors: UnitCounts;
  defenderLost: UnitCounts;
  defenderSurvivors: UnitCounts;
  /** Defenses destroyed in battle (before free rebuild). */
  defensesDestroyed: DefenseCounts;
  /** Per allied group (same order as defender.allies): losses and survivors. Empty without allies. */
  alliesLost: UnitCounts[];
  alliesSurvivors: UnitCounts[];
  /** The round after which the attackers fell back (fall-back order); missing if they didn't. Counts as a defender win. */
  retreatedAfterRound?: number;
}

/** c: the side's own castes, d: defenses, a<i>: castes of allied group i. */
type EntityKey = `c:${CasteId}` | `d:${DefenseId}` | `a${number}:${CasteId}`;

interface EntityStats {
  attack: number;
  guard: number;
  health: number;
  frenzy: Record<string, number>;
  id: string;
  /** a defense (shots at defenses can be soaked by a shield) */
  defense: boolean;
  /** Soil Wall: its guard soaks shots aimed at the other defenses */
  shield: boolean;
  /** resources it cost, for the fall-back order */
  value: number;
}

interface Army {
  keys: EntityKey[]; // type table
  stats: EntityStats[];
  type: Uint16Array; // per entity → index into keys
  health: Float64Array;
  guard: Float64Array;
  size: number;
}

function statsFor(key: EntityKey, research: ResearchLevels): EntityStats {
  const id = key.slice(key.indexOf(':') + 1);
  const base: CombatStats & { cost: Resources } = key[0] === 'd' ? DEFENSES[id as DefenseId] : CASTES[id as CasteId];
  // Formic Acid: defenses get an extra percentage on all three stats.
  const def = key[0] === 'd' ? researchSum(research, 'defensePct') / 100 : 0;
  return {
    id,
    attack: base.attack * (1 + researchFraction(research, 'attackPct') + def),
    guard: base.guard * (1 + researchFraction(research, 'guardPct') + def),
    health: base.health * (1 + researchFraction(research, 'healthPct') + def),
    frenzy: base.frenzy ?? {},
    defense: key[0] === 'd',
    shield: !!(base as { shield?: boolean }).shield,
    value: base.cost.foliage + base.cost.protein + base.cost.nectar,
  };
}

function buildArmy(side: CombatSide): Army {
  const keys: EntityKey[] = [];
  const counts: number[] = [];
  for (const [id, n] of Object.entries(side.units)) if ((n ?? 0) > 0) { keys.push(`c:${id as CasteId}`); counts.push(n!); }
  // structures (the Narrow Tunnel) shape the fight but aren't in it
  for (const [id, n] of Object.entries(side.defenses ?? {}))
    if ((n ?? 0) > 0 && !DEFENSES[id as DefenseId].chokepoint) { keys.push(`d:${id as DefenseId}`); counts.push(n!); }
  const research: ResearchLevels[] = keys.map(() => side.research);
  // Allies come last, so a battle without allies runs exactly as before (same RNG draws).
  (side.allies ?? []).forEach((g, i) => {
    for (const [id, n] of Object.entries(g.units)) if ((n ?? 0) > 0) { keys.push(`a${i}:${id as CasteId}`); counts.push(n!); research.push(g.research); }
  });
  const size = counts.reduce((a, b) => a + b, 0);
  const stats = keys.map((k, t) => statsFor(k, research[t]));
  const type = new Uint16Array(size);
  const health = new Float64Array(size);
  const guard = new Float64Array(size);
  let i = 0;
  keys.forEach((_, t) => {
    for (let n = 0; n < counts[t]; n++, i++) { type[i] = t; health[i] = stats[t].health; }
  });
  return { keys, stats, type, health, guard, size };
}

function resetGuards(a: Army) {
  for (let i = 0; i < a.size; i++) a.guard[i] = a.stats[a.type[i]].guard;
}

/** Apply one shot of `dmg` to entity `t` of `a`: guard first, then health, then the collapse roll. */
function hit(a: Army, t: number, dmg: number, rng: Rng) {
  const ts = a.stats[a.type[t]];
  if (dmg <= a.guard[t]) a.guard[t] -= dmg;
  else {
    a.health[t] -= dmg - a.guard[t];
    a.guard[t] = 0;
  }
  const h = a.health[t];
  if (h > 0 && h < (C.collapseBelowHealthPct / 100) * ts.health && rng() < 1 - h / ts.health) a.health[t] = 0;
}

/** A living Soil Wall with guard left this round, or -1. */
function liveShield(a: Army): number {
  for (let i = 0; i < a.size; i++) if (a.stats[a.type[i]].shield && a.health[i] > 0 && a.guard[i] > 0) return i;
  return -1;
}

/**
 * Each entity of `src` fires at random entities of `dst`. Returns [shots, damage].
 * `fireChance` < 1: only that share of `src` gets to fire (attackers squeezing through a Narrow Tunnel).
 */
function fire(src: Army, dst: Army, rng: Rng, fireChance = 1): [number, number] {
  let shots = 0;
  let damage = 0;
  if (dst.size === 0) return [0, 0];
  const hasShield = dst.stats.some((s) => s.shield);
  for (let i = 0; i < src.size; i++) {
    const s = src.stats[src.type[i]];
    if (s.attack <= 0) continue;
    if (fireChance < 1 && rng() >= fireChance) continue;
    for (;;) {
      shots++;
      const t = Math.floor(rng() * dst.size);
      const ts = dst.stats[dst.type[t]];
      if (dst.health[t] > 0) {
        let dmg = s.attack;
        if (dmg >= (C.glanceThresholdPctOfGuard / 100) * ts.guard) {
          damage += dmg;
          // the Soil Wall's guard soaks shots at the other defenses first (docs/06-defense.md)
          const w = hasShield && ts.defense && !ts.shield ? liveShield(dst) : -1;
          if (w >= 0 && dmg >= (C.glanceThresholdPctOfGuard / 100) * dst.stats[dst.type[w]].guard) {
            const soaked = Math.min(dmg, dst.guard[w]);
            dst.guard[w] -= soaked;
            dmg -= soaked;
          }
          if (dmg > 0) hit(dst, t, dmg, rng);
        }
      }
      const n = s.frenzy[ts.id] ?? 1;
      if (n > 1 && rng() < (n - 1) / n) continue;
      break;
    }
  }
  return [shots, damage];
}

/** Remove dead entities in place. */
function compact(a: Army) {
  let w = 0;
  for (let r = 0; r < a.size; r++) {
    if (a.health[r] > 0) {
      a.type[w] = a.type[r];
      a.health[w] = a.health[r];
      w++;
    }
  }
  a.size = w;
}

function countByKey(a: Army): Map<EntityKey, number> {
  const m = new Map<EntityKey, number>();
  for (let i = 0; i < a.size; i++) {
    const k = a.keys[a.type[i]];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** The Narrow Tunnel the defender has, if any: for its first `rounds` rounds only `sharePct`% of attackers fight. */
function chokepointOf(side: CombatSide): { rounds: number; sharePct: number } | null {
  for (const [id, n] of Object.entries(side.defenses ?? {})) {
    const c = DEFENSES[id as DefenseId].chokepoint;
    if ((n ?? 0) > 0 && c) return c;
  }
  return null;
}

function armyValue(a: Army): number {
  let v = 0;
  for (let i = 0; i < a.size; i++) v += a.stats[a.type[i]].value;
  return v;
}

export function simulateBattle(attacker: CombatSide, defender: CombatSide, rng: Rng): BattleResult {
  const A = buildArmy(attacker);
  const D = buildArmy(defender);
  const rounds: RoundSummary[] = [];
  const choke = chokepointOf(defender);
  const startValue = armyValue(A);
  const retreatPct = attacker.retreatPct ?? 0;
  let retreatedAfterRound: number | undefined;
  for (let round = 1; round <= C.maxRounds && A.size > 0 && D.size > 0; round++) {
    resetGuards(A);
    resetGuards(D);
    const share = choke && round <= choke.rounds ? choke.sharePct / 100 : 1;
    const [as, ad] = fire(A, D, rng, share);
    const [ds, dd] = fire(D, A, rng);
    compact(A);
    compact(D);
    rounds.push({ round, attackerShots: as, defenderShots: ds, attackerDamage: ad, defenderDamage: dd, attackerRemaining: A.size, defenderRemaining: D.size });
    // fall-back order: break off once the losses pass the line, unless the fight is already over
    if (retreatPct > 0 && A.size > 0 && D.size > 0 && round < C.maxRounds && startValue > 0 && (startValue - armyValue(A)) * 100 >= retreatPct * startValue) {
      retreatedAfterRound = round;
      break;
    }
  }

  const winner: Winner =
    retreatedAfterRound != null ? 'defender' : A.size === 0 ? (D.size === 0 ? 'draw' : 'defender') : D.size === 0 ? 'attacker' : 'draw';

  const aLeft = countByKey(A);
  const dLeft = countByKey(D);
  const attackerSurvivors: UnitCounts = {};
  const attackerLost: UnitCounts = {};
  for (const [id, n] of Object.entries(attacker.units)) {
    if (!n) continue;
    const left = aLeft.get(`c:${id as CasteId}`) ?? 0;
    attackerSurvivors[id as CasteId] = left;
    if (n - left > 0) attackerLost[id as CasteId] = n - left;
  }
  const defenderSurvivors: UnitCounts = {};
  const defenderLost: UnitCounts = {};
  for (const [id, n] of Object.entries(defender.units)) {
    if (!n) continue;
    const left = dLeft.get(`c:${id as CasteId}`) ?? 0;
    defenderSurvivors[id as CasteId] = left;
    if (n - left > 0) defenderLost[id as CasteId] = n - left;
  }
  const defensesDestroyed: DefenseCounts = {};
  for (const [id, n] of Object.entries(defender.defenses ?? {})) {
    if (!n || DEFENSES[id as DefenseId].chokepoint) continue; // the tunnel can't be destroyed
    const left = dLeft.get(`d:${id as DefenseId}`) ?? 0;
    if (n - left > 0) defensesDestroyed[id as DefenseId] = n - left;
  }
  const alliesLost: UnitCounts[] = [];
  const alliesSurvivors: UnitCounts[] = [];
  (defender.allies ?? []).forEach((g, i) => {
    const lost: UnitCounts = {};
    const left: UnitCounts = {};
    for (const [id, n] of Object.entries(g.units)) {
      if (!n) continue;
      const k = dLeft.get(`a${i}:${id as CasteId}`) ?? 0;
      left[id as CasteId] = k;
      if (n - k > 0) lost[id as CasteId] = n - k;
    }
    alliesLost.push(lost);
    alliesSurvivors.push(left);
  });
  return {
    winner, rounds, attackerLost, attackerSurvivors, defenderLost, defenderSurvivors, defensesDestroyed, alliesLost, alliesSurvivors,
    ...(retreatedAfterRound != null ? { retreatedAfterRound } : {}),
  };
}

/** Each destroyed defense independently rebuilds with probability defenseRebuildChance. */
export function rebuildDefenses(destroyed: DefenseCounts, rng: Rng): DefenseCounts {
  const rebuilt: DefenseCounts = {};
  for (const [id, n] of Object.entries(destroyed)) {
    let k = 0;
    for (let i = 0; i < (n ?? 0); i++) if (rng() < C.defenseRebuildChance) k++;
    if (k > 0) rebuilt[id as DefenseId] = k;
  }
  return rebuilt;
}

export function unitsValue(units: UnitCounts): Resources {
  let v = res();
  for (const [id, n] of Object.entries(units)) if (n) v = add(v, scale(CASTES[id as CasteId].cost, n));
  return v;
}

export function defensesValue(defenses: DefenseCounts): Resources {
  let v = res();
  for (const [id, n] of Object.entries(defenses)) if (n) v = add(v, scale(DEFENSES[id as DefenseId].cost, n));
  return v;
}

/** Protein left as corpses: 30% of Foliage+Protein value of destroyed units (both sides). */
export function corpseProtein(...lost: UnitCounts[]): number {
  let v = 0;
  for (const l of lost) {
    const val = unitsValue(l);
    v += val.foliage + val.protein;
  }
  return Math.floor((v * C.corpsePctOfDestroyedValue) / 100);
}

/** The fall-back orders a raider can pick, in percent of the army's worth lost (0 = fight to the end). */
export const RETREAT_PCTS: readonly number[] = C.retreatOptions.pcts;
export const isValidRetreatPct = (pct: number): boolean => RETREAT_PCTS.includes(pct);

/** Share of unprotected stores a winning raid can take, in percent: 50, plus Raiding Columns. */
export const lootPct = (attackerResearch?: ResearchLevels): number => C.lootPctOfUnprotected + researchSum(attackerResearch, 'lootPct');

/** Amount of each resource raiders could take: lootPct of what's above the protected amount. */
export function lootable(resources: Resources, protectedEach: number, pct: number = C.lootPctOfUnprotected): Resources {
  const out = res();
  for (const r of RESOURCE_IDS) out[r] = Math.floor((Math.max(0, resources[r] - protectedEach) * pct) / 100);
  return out;
}

/** Fill cargo as evenly as possible across resource types (water-filling). */
export function fillCargo(available: Resources, cargo: number): Resources {
  const taken = res();
  let cap = Math.max(0, Math.floor(cargo));
  for (let guard = 0; guard < 10 && cap > 0; guard++) {
    const open = RESOURCE_IDS.filter((r) => available[r] - taken[r] > 0);
    if (open.length === 0) break;
    const share = Math.floor(cap / open.length);
    if (share === 0) {
      // distribute the last few units one by one
      for (const r of open) if (cap > 0 && available[r] - taken[r] > 0) { taken[r]++; cap--; }
      continue;
    }
    for (const r of open) {
      const t = Math.min(share, available[r] - taken[r]);
      taken[r] += t;
      cap -= t;
    }
  }
  return taken;
}

// ---------- preview (Monte Carlo) ----------

export interface BattlePreview {
  runs: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  /** Share of runs where the attackers fell back (fall-back order). Included in lossRate. */
  retreatRate: number;
  avgAttackerLossValue: number;
  avgDefenderLossValue: number;
  /** Average loot if the attacker wins (0 if never). */
  avgLootOnWin: number;
}

export function previewBattle(
  attacker: CombatSide,
  defender: CombatSide,
  opts: { runs?: number; seed?: number; defenderResources?: Resources; protectedEach?: number; cargoOf?: (u: UnitCounts) => number } = {},
): BattlePreview {
  const totalEntities =
    Object.values(attacker.units).reduce((a, b) => a + (b ?? 0), 0) +
    Object.values(defender.units).reduce((a, b) => a + (b ?? 0), 0) +
    Object.values(defender.defenses ?? {}).reduce((a, b) => a + (b ?? 0), 0) +
    (defender.allies ?? []).reduce((s, g) => s + Object.values(g.units).reduce((a, b) => a + (b ?? 0), 0), 0);
  // keep previews responsive for huge battles
  const runs = opts.runs ?? (totalEntities > 50000 ? 5 : totalEntities > 10000 ? 15 : 50);
  const rng = createRng(opts.seed ?? 12345);
  let win = 0, draw = 0, retreat = 0, lossA = 0, lossD = 0, loot = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateBattle(attacker, defender, rng);
    if (r.winner === 'attacker') win++;
    else if (r.winner === 'draw') draw++;
    if (r.retreatedAfterRound != null) retreat++;
    const la = unitsValue(r.attackerLost);
    const ld = r.alliesLost.reduce((v, l) => add(v, unitsValue(l)), add(unitsValue(r.defenderLost), defensesValue(r.defensesDestroyed)));
    lossA += la.foliage + la.protein + la.nectar;
    lossD += ld.foliage + ld.protein + ld.nectar;
    if (r.winner === 'attacker' && opts.defenderResources && opts.cargoOf) {
      const l = fillCargo(lootable(opts.defenderResources, opts.protectedEach ?? 0, lootPct(attacker.research)), opts.cargoOf(r.attackerSurvivors));
      loot += l.foliage + l.protein + l.nectar;
    }
  }
  return {
    runs,
    winRate: win / runs,
    drawRate: draw / runs,
    lossRate: (runs - win - draw) / runs,
    retreatRate: retreat / runs,
    avgAttackerLossValue: Math.round(lossA / runs),
    avgDefenderLossValue: Math.round(lossD / runs),
    avgLootOnWin: win > 0 ? Math.round(loot / win) : 0,
  };
}

/** Current size of a corpse field: decays by decay.pctPerHour (of the original) per hour after startAfterHours. */
export function corpseFieldAmount(protein: number, createdAt: number, t: number): number {
  return Math.floor(protein * corpseDecayFactor(createdAt, t));
}

/** How much of a corpse field is left (1 = all, 0 = gone). Also used to store a remaining amount without resetting the decay clock. */
export function corpseDecayFactor(createdAt: number, t: number): number {
  const d = C.corpseDecay;
  const hours = (t - createdAt) / 3600_000;
  return Math.max(0, Math.min(1, 1 - (d.pctPerHour / 100) * Math.max(0, hours - d.startAfterHours)));
}
