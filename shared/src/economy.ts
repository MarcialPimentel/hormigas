// Economy rules: costs, build times, production, workforce, storage, space, unlocks.
// Spec: docs/02-progression.md, docs/03-economy.md, docs/04-colony.md, docs/data/formulas.json
import {
  CHAMBERS,
  CHAMBER_IDS,
  RESEARCH,
  RESOURCES_DATA,
  RESOURCE_IDS,
  TERRAIN,
  FORMULAS,
  type ChamberId,
  type ResearchId,
  type CasteId,
  type DefenseId,
  type Requirements,
  type Resources,
  type ResourceId,
  type TerrainId,
} from './data';
import { res, scale } from './resources';

export type ChamberLevels = Partial<Record<ChamberId, number>>;
export type ResearchLevels = Partial<Record<ResearchId, number>>;
export type UnitCounts = Partial<Record<CasteId, number>>;
export type DefenseCounts = Partial<Record<DefenseId, number>>;

export const lvl = <K extends string>(levels: Partial<Record<K, number>> | undefined, id: K): number => levels?.[id] ?? 0;

const growth = (level: number) => level * Math.pow(1.1, level);

// ---------- costs & times ----------

/** Cost to upgrade a chamber TO `level` (level >= 1). */
export function chamberCost(id: ChamberId, level: number): Resources {
  const def = CHAMBERS[id];
  return scale(def.baseCost, Math.pow(def.costFactor, level - 1)) as Resources;
}

export function researchCost(id: ResearchId, level: number): Resources {
  return scale(RESEARCH[id].baseCost, Math.pow(2, level - 1));
}

export interface TimeContext {
  worldSpeed: number;
  /** Extra multiplier, e.g. late founding boost (0.5..1). */
  timeMultiplier?: number;
}

const FB = FORMULAS.buildTime.foundingBoost;

export function chamberBuildSeconds(
  id: ChamberId,
  level: number,
  ctx: TimeContext & { excavation: number; terrain: TerrainId },
): number {
  const c = chamberCost(id, level);
  let t = (c.foliage + c.protein) / (2.5 * (1 + ctx.excavation)) / ctx.worldSpeed;
  t *= 1 + (TERRAIN[ctx.terrain].mods.buildTimePct ?? 0) / 100;
  if (FB.levels.includes(level)) t *= FB.multiplier;
  t *= ctx.timeMultiplier ?? 1;
  return Math.max(FORMULAS.buildTime.minimumSeconds, Math.round(t));
}

export function researchSeconds(id: ResearchId, level: number, ctx: TimeContext & { pheromone: number }): number {
  const c = researchCost(id, level);
  const t = ((c.foliage + c.protein) / (1.0 * (1 + ctx.pheromone)) / ctx.worldSpeed) * (ctx.timeMultiplier ?? 1);
  return Math.max(FORMULAS.buildTime.minimumSeconds, Math.round(t));
}

/** Seconds to raise ONE unit/defense of the given cost. */
export function unitSeconds(cost: Resources, ctx: TimeContext & { broodHall: number }): number {
  const t = ((cost.foliage + cost.protein) / (2.5 * (1 + ctx.broodHall)) / ctx.worldSpeed) * (ctx.timeMultiplier ?? 1);
  return Math.max(1, t);
}

// ---------- workforce & production ----------

export interface Workforce {
  supply: number;
  demand: number;
  /** Production multiplier, 0..1 */
  ratio: number;
}

export function workforce(chambers: ChamberLevels): Workforce {
  const nursery = CHAMBERS.nursery.effect.base ?? 0;
  const supply = RESOURCES_DATA.baseWorkforce + nursery * growth(lvl(chambers, 'nursery'));
  let demand = 0;
  for (const id of CHAMBER_IDS) {
    const def = CHAMBERS[id];
    if (def.effect.type === 'produce' && def.workforceUse) demand += def.workforceUse * growth(lvl(chambers, id));
  }
  const ratio = demand <= 0 ? 1 : Math.min(1, supply / demand);
  return { supply: Math.round(supply), demand: Math.round(demand), ratio };
}

/** Resources produced per hour by a colony (base income + chambers × terrain × workforce ratio). */
export function productionPerHour(chambers: ChamberLevels, terrain: TerrainId): Resources {
  const out = res(
    RESOURCES_DATA.baseIncomePerHour.foliage,
    RESOURCES_DATA.baseIncomePerHour.protein,
    RESOURCES_DATA.baseIncomePerHour.nectar,
  );
  const { ratio } = workforce(chambers);
  const mods = TERRAIN[terrain].mods;
  for (const id of CHAMBER_IDS) {
    const def = CHAMBERS[id];
    if (def.effect.type !== 'produce' || !def.effect.resource) continue;
    const r = def.effect.resource;
    const terrainPct = (mods[`${r}Pct` as 'foliagePct'] ?? 0) / 100;
    out[r] += (def.effect.base ?? 0) * growth(lvl(chambers, id)) * (1 + terrainPct) * ratio;
  }
  return out;
}

// ---------- storage ----------

const STORAGE_FOR: Record<ResourceId, ChamberId> = { foliage: 'granary', protein: 'larder', nectar: 'nectar_cellar' };

export function storageCapacity(chambers: ChamberLevels): Resources {
  const cap = (r: ResourceId) => RESOURCES_DATA.baseStorage * Math.pow(1.8, lvl(chambers, STORAGE_FOR[r]));
  return res(cap('foliage'), cap('protein'), cap('nectar'));
}

/** Amount of EACH resource protected from raids by the Honeypot Gallery. */
export function protectedAmount(chambers: ChamberLevels): number {
  const L = lvl(chambers, 'honeypot_gallery');
  return L > 0 ? 1000 * Math.pow(1.6, L) : 0;
}

/**
 * Advance resources by `seconds` of production. Production stops at the storage cap,
 * but amounts already above the cap (from raids/missions) are never reduced.
 */
export function accrue(current: Resources, perHour: Resources, caps: Resources, seconds: number): Resources {
  const out = { ...current };
  if (seconds <= 0) return out;
  for (const r of RESOURCE_IDS) {
    if (out[r] >= caps[r]) continue;
    out[r] = Math.min(caps[r], out[r] + (perHour[r] * seconds) / 3600);
  }
  return out;
}

// ---------- space ----------

export const spaceUsed = (chambers: ChamberLevels): number =>
  CHAMBER_IDS.reduce((sum, id) => sum + lvl(chambers, id), 0);

export const spaceMax = (baseSpace: number, research: ResearchLevels): number =>
  baseSpace + 5 * lvl(research, 'deep_digging');

// ---------- requirements ----------

export interface MissingRequirement {
  key: string;
  name: string;
  need: number;
  have: number;
}

export function missingRequirements(req: Requirements, chambers: ChamberLevels, research: ResearchLevels): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  for (const [key, need] of Object.entries(req)) {
    if (key.startsWith('research.')) {
      const id = key.slice(9) as ResearchId;
      const have = lvl(research, id);
      if (have < need) missing.push({ key, name: RESEARCH[id]?.name ?? id, need, have });
    } else {
      const id = key as ChamberId;
      const have = lvl(chambers, id);
      if (have < need) missing.push({ key, name: CHAMBERS[id]?.name ?? id, need, have });
    }
  }
  return missing;
}

export const isUnlocked = (req: Requirements, chambers: ChamberLevels, research: ResearchLevels): boolean =>
  missingRequirements(req, chambers, research).length === 0;
