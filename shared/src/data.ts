// Typed access to the design data in docs/data/*.json.
// The JSON files are the source of truth for numbers; this module only adds types.
import resourcesJson from '../../docs/data/resources.json';
import chambersJson from '../../docs/data/chambers.json';
import castesJson from '../../docs/data/castes.json';
import defensesJson from '../../docs/data/defenses.json';
import researchJson from '../../docs/data/research.json';
import terrainJson from '../../docs/data/terrain.json';
import formulasJson from '../../docs/data/formulas.json';
import npcJson from '../../docs/data/npc.json';
import nestEventsJson from '../../docs/data/nest-events.json';

export const RESOURCE_IDS = ['foliage', 'protein', 'nectar'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Resources = Record<ResourceId, number>;

export const CHAMBER_IDS = [
  'queen_chamber',
  'leaf_garden',
  'hunting_grounds',
  'nursery',
  'granary',
  'larder',
  'brood_hall',
  'pheromone_chamber',
  'aphid_pasture',
  'nectar_cellar',
  'excavation_works',
  'honeypot_gallery',
] as const;
export type ChamberId = (typeof CHAMBER_IDS)[number];

export const CASTE_IDS = [
  'worker',
  'minor_soldier',
  'scout',
  'major_soldier',
  'hauler',
  'winged_queen',
  'carrion_beetle',
  'bullet_ant',
  // NPC-only (docs/23-npcs.md)
  'termite_worker',
  'termite_soldier',
  'spiderling',
  'trapdoor_spider',
] as const;
export type CasteId = (typeof CASTE_IDS)[number];

export const DEFENSE_IDS = ['soil_wall', 'pit_trap', 'acid_sentry'] as const;
export type DefenseId = (typeof DEFENSE_IDS)[number];

export const RESEARCH_IDS = [
  // Jaws
  'mandibles',
  'chitin',
  'guard_formation',
  'formic_acid',
  'raiding_columns',
  'nest_plugging',
  // Harvest
  'foraging_instinct',
  'group_hunting',
  'aphid_husbandry',
  'fungus_farming',
  'repletes',
  'symbiosis',
  // Nest
  'brood_science',
  'nurse_workers',
  'deep_digging',
  'tunnel_engineering',
  'nuptial_flight',
  'supercolony',
  // Scent
  'pheromone_trails',
  'colony_mind',
  'scent_reading',
  'tandem_running',
  'chemical_mimicry',
] as const;
export type ResearchId = (typeof RESEARCH_IDS)[number];

/** The four branches of the tech tree (docs/21-tech-tree.md). */
export const RESEARCH_BRANCH_IDS = ['jaws', 'harvest', 'nest', 'scent'] as const;
export type ResearchBranchId = (typeof RESEARCH_BRANCH_IDS)[number];
export interface ResearchBranchDef {
  name: string;
  blurb: string;
}

export const TERRAIN_IDS = ['sunny_meadow', 'sandy_soil', 'grassland', 'rotting_log', 'creek_bank'] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

/** Keys are chamber ids, or "research.<id>". Values are minimum levels. */
export type Requirements = Record<string, number>;

export interface ChamberEffect {
  type: 'gate' | 'produce' | 'workforce' | 'storage' | 'unitSpeed' | 'researchSpeed' | 'buildSpeed' | 'protectedStorage';
  resource?: ResourceId;
  base?: number;
}
export interface ChamberDef {
  name: string;
  baseCost: Resources;
  costFactor: number;
  unlock: Requirements;
  effect: ChamberEffect;
  workforceUse?: number;
}

export interface CombatStats {
  attack: number;
  guard: number;
  health: number;
  frenzy: Record<string, number>;
}
export interface CasteDef extends CombatStats {
  name: string;
  mvp: boolean;
  cost: Resources;
  speed: number;
  cargo: number;
  nectarUse: number;
  unlock: Requirements;
  canHaulCorpses?: boolean;
  corpsesOnly?: boolean;
  /** Lives only in NPC colonies (termites, spiders): never raised by players. */
  npcOnly?: boolean;
}
export interface DefenseDef extends CombatStats {
  name: string;
  mvp: boolean;
  cost: Resources;
  max?: number;
  unlock: Requirements;
}
export interface ResearchDef {
  name: string;
  branch: ResearchBranchId;
  mvp: boolean;
  /** Highest level that can be researched. Missing = no cap. */
  maxLevel?: number;
  baseCost: Resources;
  unlock: Requirements;
  effect: Record<string, number | boolean>;
}
export interface TerrainDef {
  name: string;
  spots: number[];
  space: [number, number];
  mods: Partial<Record<'foliagePct' | 'proteinPct' | 'nectarPct' | 'buildTimePct', number>>;
}

export const RESOURCES_DATA = resourcesJson as {
  startingResources: Resources;
  baseIncomePerHour: Resources;
  baseWorkforce: number;
  baseStorage: number;
};
export const CHAMBERS = chambersJson.chambers as unknown as Record<ChamberId, ChamberDef>;
export const CASTES = castesJson.castes as unknown as Record<CasteId, CasteDef>;
export const DEFENSES = defensesJson.defenses as unknown as Record<DefenseId, DefenseDef>;
export const RESEARCH = researchJson.research as unknown as Record<ResearchId, ResearchDef>;
export const RESEARCH_BRANCHES = researchJson.branches as Record<ResearchBranchId, ResearchBranchDef>;
export const TERRAIN = terrainJson.terrain as unknown as Record<TerrainId, TerrainDef>;
export const STARTING_TERRAIN = terrainJson.startingTerrain as TerrainId;
export const WILDS_SPOT = terrainJson.wildsSpot;
export const FORMULAS = formulasJson;
/** Wild nests (docs/17-wild-nests.md). Typed in nests.ts. */
export const NPC_DATA = npcJson;
/** Small random events inside the nest (docs/04-colony.md). Typed in nestEvents.ts. */
export const NEST_EVENTS_DATA = nestEventsJson;

/** Units that exist in the MVP (data also contains designed-but-later units). */
export const MVP_CASTES = CASTE_IDS.filter((id) => CASTES[id].mvp);
export const MVP_DEFENSES = DEFENSE_IDS.filter((id) => DEFENSES[id].mvp);
export const MVP_RESEARCH = RESEARCH_IDS.filter((id) => RESEARCH[id].mvp);

export const ZERO: Readonly<Resources> = Object.freeze({ foliage: 0, protein: 0, nectar: 0 });
