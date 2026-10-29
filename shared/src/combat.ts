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
import { lvl, researchBonus, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { res, add, scale } from './resources';
import { createRng, type Rng } from './rng';

const C = FORMULAS.combat;

export interface CombatSide {
  units: UnitCounts;
  defenses?: DefenseCounts;
  research: ResearchLevels;
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
}

type EntityKey = `c:${CasteId}` | `d:${DefenseId}`;

interface Army {
  keys: EntityKey[]; // type table
  stats: { attack: number; guard: number; health: number; frenzy: Record<string, number>; id: string }[];
  type: Uint16Array; // per entity → index into keys
  health: Float64Array;
  guard: Float64Array;
  size: number;
}

function statsFor(key: EntityKey, research: ResearchLevels) {
  const id = key.slice(2);
  const base: CombatStats = key[0] === 'c' ? CASTES[id as CasteId] : DEFENSES[id as DefenseId];
  return {
    id,
    attack: base.attack * (1 + researchBonus(research, 'mandibles', 'attackPct')),
    guard: base.guard * (1 + researchBonus(research, 'guard_formation', 'guardPct')),
    health: base.health * (1 + researchBonus(research, 'chitin', 'healthPct')),
    frenzy: base.frenzy ?? {},
  };
}

function buildArmy(side: CombatSide): Army {
  const keys: EntityKey[] = [];
  const counts: number[] = [];
  for (const [id, n] of Object.entries(side.units)) if ((n ?? 0) > 0) { keys.push(`c:${id as CasteId}`); counts.push(n!); }
  for (const [id, n] of Object.entries(side.defenses ?? {})) if ((n ?? 0) > 0) { keys.push(`d:${id as DefenseId}`); counts.push(n!); }
  const size = counts.reduce((a, b) => a + b, 0);
  const stats = keys.map((k) => statsFor(k, side.research));
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

/** Each entity of `src` fires at random entities of `dst`. Returns [shots, damage]. */
function fire(src: Army, dst: Army, rng: Rng): [number, number] {
  let shots = 0;
  let damage = 0;
  if (dst.size === 0) return [0, 0];
  for (let i = 0; i < src.size; i++) {
    const s = src.stats[src.type[i]];
    if (s.attack <= 0) continue;
    for (;;) {
      shots++;
      const t = Math.floor(rng() * dst.size);
      const ts = dst.stats[dst.type[t]];
      if (dst.health[t] > 0) {
        const dmg = s.attack;
        if (dmg >= (C.glanceThresholdPctOfGuard / 100) * ts.guard) {
          damage += dmg;
          if (dmg <= dst.guard[t]) dst.guard[t] -= dmg;
          else {
            dst.health[t] -= dmg - dst.guard[t];
            dst.guard[t] = 0;
          }
          const h = dst.health[t];
          if (h > 0 && h < (C.collapseBelowHealthPct / 100) * ts.health && rng() < 1 - h / ts.health) dst.health[t] = 0;
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

export function simulateBattle(attacker: CombatSide, defender: CombatSide, rng: Rng): BattleResult {
  const A = buildArmy(attacker);
  const D = buildArmy(defender);
  const rounds: RoundSummary[] = [];
  for (let round = 1; round <= C.maxRounds && A.size > 0 && D.size > 0; round++) {
    resetGuards(A);
    resetGuards(D);
    const [as, ad] = fire(A, D, rng);
    const [ds, dd] = fire(D, A, rng);
    compact(A);
    compact(D);
    rounds.push({ round, attackerShots: as, defenderShots: ds, attackerDamage: ad, defenderDamage: dd, attackerRemaining: A.size, defenderRemaining: D.size });
  }

  const winner: Winner = A.size === 0 ? (D.size === 0 ? 'draw' : 'defender') : D.size === 0 ? 'attacker' : 'draw';

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
    if (!n) continue;
    const left = dLeft.get(`d:${id as DefenseId}`) ?? 0;
    if (n - left > 0) defensesDestroyed[id as DefenseId] = n - left;
  }
  return { winner, rounds, attackerLost, attackerSurvivors, defenderLost, defenderSurvivors, defensesDestroyed };
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

/** Amount of each resource raiders could take: lootPct of what's above the protected amount. */
export function lootable(resources: Resources, protectedEach: number): Resources {
  const out = res();
  for (const r of RESOURCE_IDS) out[r] = Math.floor((Math.max(0, resources[r] - protectedEach) * C.lootPctOfUnprotected) / 100);
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
    Object.values(defender.defenses ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  // keep previews responsive for huge battles
  const runs = opts.runs ?? (totalEntities > 50000 ? 5 : totalEntities > 10000 ? 15 : 50);
  const rng = createRng(opts.seed ?? 12345);
  let win = 0, draw = 0, lossA = 0, lossD = 0, loot = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateBattle(attacker, defender, rng);
    if (r.winner === 'attacker') win++;
    else if (r.winner === 'draw') draw++;
    const la = unitsValue(r.attackerLost);
    const ld = add(unitsValue(r.defenderLost), defensesValue(r.defensesDestroyed));
    lossA += la.foliage + la.protein + la.nectar;
    lossD += ld.foliage + ld.protein + ld.nectar;
    if (r.winner === 'attacker' && opts.defenderResources && opts.cargoOf) {
      const l = fillCargo(lootable(opts.defenderResources, opts.protectedEach ?? 0), opts.cargoOf(r.attackerSurvivors));
      loot += l.foliage + l.protein + l.nectar;
    }
  }
  return {
    runs,
    winRate: win / runs,
    drawRate: draw / runs,
    lossRate: (runs - win - draw) / runs,
    avgAttackerLossValue: Math.round(lossA / runs),
    avgDefenderLossValue: Math.round(lossD / runs),
    avgLootOnWin: win > 0 ? Math.round(loot / win) : 0,
  };
}

/** Current size of a corpse field: decays by decay.pctPerHour (of the original) per hour after startAfterHours. */
export function corpseFieldAmount(protein: number, createdAt: number, t: number): number {
  const d = C.corpseDecay;
  const hours = (t - createdAt) / 3600_000;
  const factor = Math.max(0, Math.min(1, 1 - (d.pctPerHour / 100) * Math.max(0, hours - d.startAfterHours)));
  return Math.floor(protein * factor);
}

/** Inverse of corpseFieldAmount's decay factor, for storing a remaining amount without resetting the decay clock. */
export function corpseDecayFactor(createdAt: number, t: number): number {
  const d = C.corpseDecay;
  const hours = (t - createdAt) / 3600_000;
  return Math.max(0, Math.min(1, 1 - (d.pctPerHour / 100) * Math.max(0, hours - d.startAfterHours)));
}
