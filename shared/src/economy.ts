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

/** How production, workforce use and nursery supply scale with level: level * levelGrowth^level. */
export const levelGrowth = (level: number) => level * Math.pow(FORMULAS.production.levelGrowth, level);
const growth = levelGrowth;

/**
 * A research bonus as a fraction: the percentage in research.json's `effect` (e.g. Mandibles attackPct 10)
 * times the research level. Mandibles 3 → 0.3, so attack × 1.3.
 */
export const researchBonus = (research: ResearchLevels, id: ResearchId, key: string): number =>
  (Number(RESEARCH[id].effect[key] ?? 0) / 100) * lvl(research, id);

/** A per-level research effect in research.json (e.g. Deep Digging space 5) times the research level. */
export const researchPerLevel = (research: ResearchLevels, id: ResearchId, key: string): number =>
  Number(RESEARCH[id].effect[key] ?? 0) * lvl(research, id);

/**
 * One effect key summed over every research that has it (e.g. "foliagePct" from Fungus Farming).
 * Tech-tree effects use this so a key can come from more than one research. docs/21-tech-tree.md
 */
export function researchSum(research: ResearchLevels | undefined, key: string): number {
  if (!research) return 0;
  let sum = 0;
  for (const [id, level] of Object.entries(research)) {
    const v = RESEARCH[id as ResearchId]?.effect[key];
    if (typeof v === 'number' && level) sum += v * level;
  }
  return sum;
}

/** A percentage research effect as a multiplier: researchSum 15 → 1.15, -30 → 0.7. Never below 0.1. */
export const researchFactor = (research: ResearchLevels | undefined, key: string): number =>
  Math.max(0.1, 1 + researchSum(research, key) / 100);

/** Highest level a research can reach (Infinity when it has no cap). */
export const researchMaxLevel = (id: ResearchId): number => RESEARCH[id].maxLevel ?? Infinity;

// ---------- costs & times ----------

/** Cost to upgrade a chamber TO `level` (level >= 1). */
export function chamberCost(id: ChamberId, level: number): Resources {
  const def = CHAMBERS[id];
  return scale(def.baseCost, Math.pow(def.costFactor, level - 1)) as Resources;
}

export function researchCost(id: ResearchId, level: number): Resources {
  return scale(RESEARCH[id].baseCost, Math.pow(FORMULAS.cost.researchCostFactor, level - 1));
}

export interface TimeContext {
  worldSpeed: number;
  /** The owner's research, for tech-tree time bonuses (Tunnel Engineering, Nurse Workers, Tandem Running). */
  research?: ResearchLevels;
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
  let t = (c.foliage + c.protein) / (FORMULAS.buildTime.chamberDivisor * (1 + ctx.excavation)) / ctx.worldSpeed;
  t *= 1 + (TERRAIN[ctx.terrain].mods.buildTimePct ?? 0) / 100;
  t *= researchFactor(ctx.research, 'buildTimePct');
  if (FB.levels.includes(level)) t *= FB.multiplier;
  t *= ctx.timeMultiplier ?? 1;
  return Math.max(FORMULAS.buildTime.minimumSeconds, Math.round(t));
}

export function researchSeconds(id: ResearchId, level: number, ctx: TimeContext & { pheromone: number }): number {
  const c = researchCost(id, level);
  const t = ((c.foliage + c.protein) / (FORMULAS.buildTime.researchDivisor * (1 + ctx.pheromone)) / ctx.worldSpeed) * (ctx.timeMultiplier ?? 1) * researchFactor(ctx.research, 'researchTimePct');
  return Math.max(FORMULAS.buildTime.minimumSeconds, Math.round(t));
}

/** Seconds to raise ONE unit/defense of the given cost. */
export function unitSeconds(cost: Resources, ctx: TimeContext & { broodHall: number }): number {
  const t = ((cost.foliage + cost.protein) / (FORMULAS.buildTime.unitDivisor * (1 + ctx.broodHall)) / ctx.worldSpeed) * (ctx.timeMultiplier ?? 1) * researchFactor(ctx.research, 'unitTimePct');
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

/**
 * What one producing chamber at `level` makes per hour: chamber base × level growth × terrain × research
 * × workforce ratio × world speed. Research: Group Hunting, Aphid Husbandry and Fungus Farming add a percentage.
 * Returns null for chambers that don't produce. The Chambers screen and productionPerHour both use this.
 */
export function chamberOutputPerHour(
  id: ChamberId,
  level: number,
  terrain: TerrainId,
  research?: ResearchLevels,
  worldSpeed = 1,
  workforceRatio = 1,
): { resource: ResourceId; amount: number } | null {
  const def = CHAMBERS[id];
  if (def.effect.type !== 'produce' || !def.effect.resource) return null;
  const r = def.effect.resource;
  const terrainPct = (TERRAIN[terrain].mods[`${r}Pct` as 'foliagePct'] ?? 0) / 100;
  const amount = (def.effect.base ?? 0) * growth(level) * (1 + terrainPct) * researchFactor(research, `${r}Pct`) * workforceRatio * worldSpeed;
  return { resource: r, amount };
}

/** Resources produced per hour by a colony (base income + every producing chamber) × world speed. */
export function productionPerHour(chambers: ChamberLevels, terrain: TerrainId, worldSpeed = 1, research?: ResearchLevels): Resources {
  const out = res(
    RESOURCES_DATA.baseIncomePerHour.foliage,
    RESOURCES_DATA.baseIncomePerHour.protein,
    RESOURCES_DATA.baseIncomePerHour.nectar,
  );
  const { ratio } = workforce(chambers);
  for (const id of CHAMBER_IDS) {
    const made = chamberOutputPerHour(id, lvl(chambers, id), terrain, research, 1, ratio);
    if (made) out[made.resource] += made.amount;
  }
  return scale(out, worldSpeed);
}

// ---------- storage ----------

/** Which chamber stores each resource: the one whose effect in chambers.json is { type: "storage", resource }. */
const STORAGE_FOR = Object.fromEntries(
  CHAMBER_IDS.filter((id) => CHAMBERS[id].effect.type === 'storage').map((id) => [CHAMBERS[id].effect.resource, id]),
) as Record<ResourceId, ChamberId>;

/** How much of one resource a storage chamber at `level` holds. */
export const storageForLevel = (level: number): number =>
  RESOURCES_DATA.baseStorage * Math.pow(FORMULAS.storage.capacityGrowth, level);

/** How much one storage chamber at `level` holds, with Repletes research's percentage. */
export const chamberStorage = (level: number, research?: ResearchLevels): number =>
  storageForLevel(level) * researchFactor(research, 'storagePct');

/** Storage per resource. Repletes research adds a percentage. */
export function storageCapacity(chambers: ChamberLevels, research?: ResearchLevels): Resources {
  const cap = (r: ResourceId) => chamberStorage(lvl(chambers, STORAGE_FOR[r]), research);
  return res(cap('foliage'), cap('protein'), cap('nectar'));
}

/** Amount of EACH resource a Honeypot Gallery at `level` protects from raids. */
export const protectedForLevel = (level: number): number =>
  level > 0 ? FORMULAS.storage.protectedBase * Math.pow(FORMULAS.storage.protectedGrowth, level) : 0;

/** Amount of EACH resource protected from raids by the Honeypot Gallery. Nest Plugging research adds a percentage. */
export function protectedAmount(chambers: ChamberLevels, research?: ResearchLevels): number {
  return protectedForLevel(lvl(chambers, 'honeypot_gallery')) * researchFactor(research, 'protectedPct');
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
  baseSpace + researchPerLevel(research, 'deep_digging', 'space');

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

// ---------- why can't I afford it? ----------

const STORE_NAME: Record<ResourceId, string> = { foliage: 'Granary', protein: 'Larder', nectar: 'Nectar Cellar' };
const RES_NAME: Record<ResourceId, string> = { foliage: 'Foliage', protein: 'Protein', nectar: 'Nectar' };

export interface Shortfall {
  resource: ResourceId;
  need: number;
  have: number;
  /** storage: cost exceeds what storage can hold; no_income: none produced; wait: just needs time */
  kind: 'storage' | 'no_income' | 'wait';
  cap: number;
  /** seconds until affordable at current income (wait only) */
  eta?: number;
}

/** What is missing to pay `cost`, and why. Empty when affordable. */
export function shortfalls(cost: Resources, have: Resources, caps: Resources, perHour: Resources): Shortfall[] {
  const out: Shortfall[] = [];
  for (const r of RESOURCE_IDS) {
    if (have[r] + 1e-9 >= cost[r]) continue;
    const base = { resource: r, need: cost[r], have: have[r], cap: caps[r] };
    if (cost[r] > caps[r]) out.push({ ...base, kind: 'storage' });
    else if (perHour[r] <= 0) out.push({ ...base, kind: 'no_income' });
    else out.push({ ...base, kind: 'wait', eta: ((cost[r] - have[r]) / perHour[r]) * 3600 });
  }
  return out;
}

const n = (v: number) => {
  const a = Math.abs(v);
  if (a < 10_000) return Math.ceil(v).toLocaleString('en-US');
  if (a < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 1_000_000).toFixed(2)}M`;
};
const dur = (s: number) => {
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** One plain-language sentence explaining the most important shortfall. */
export function explainShortfall(list: Shortfall[]): string {
  if (list.length === 0) return '';
  const order = { storage: 0, no_income: 1, wait: 2 } as const;
  const s = [...list].sort((a, b) => order[a.kind] - order[b.kind] || (b.eta ?? 0) - (a.eta ?? 0))[0];
  const name = RES_NAME[s.resource];
  if (s.kind === 'storage') return `Costs ${n(s.need)} ${name}, but your ${STORE_NAME[s.resource]} only holds ${n(s.cap)}.`;
  if (s.kind === 'no_income') return `Needs ${n(s.need - s.have)} more ${name}. You don't produce ${name} yet.`;
  return `Needs ${n(s.need - s.have)} more ${name} (about ${dur(s.eta!)}).`;
}
