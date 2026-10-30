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
import diplomacyJson from '../../docs/data/diplomacy.json';

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
  // Build 10: the counter triangle and siege (docs/05-castes-units.md)
  'acid_sprayer',
  'trap_jaw',
  // Build 11: the full roster (docs/05-castes-units.md)
  'supermajor',
  'slave_maker',
  'desert_ant',
  'gardener_minim',
  // the middle carrier between Worker and Hauler (docs/05-castes-units.md)
  'media_worker',
  'hauler',
  'winged_queen',
  // allies (Symbiosis): other insects living with the colony, raised like castes
  'carrion_beetle',
  'assassin_bug',
  'bullet_ant',
  'rhino_beetle',
  // NPC-only (docs/24-npcs.md)
  'termite_worker',
  'termite_soldier',
  'spiderling',
  'trapdoor_spider',
] as const;
export type CasteId = (typeof CASTE_IDS)[number];

export const DEFENSE_IDS = ['soil_wall', 'pit_trap', 'acid_sentry', 'narrow_tunnel'] as const;
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
  // Instincts (Build 11): each sharpens one caste (Jaws branch)
  'swarm_raiding',
  'armoured_heads',
  'acid_glands',
  'snap_reflex',
  'crushing_heads',
  'propaganda_glands',
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
/** What a caste is for (castes.json "role"). Screens group castes by it instead of listing ids. */
export const CASTE_ROLES = ['worker', 'soldier', 'scout', 'carrier', 'queen', 'wild'] as const;
export type CasteRole = (typeof CASTE_ROLES)[number];

export interface CasteDef extends CombatStats {
  name: string;
  role: CasteRole;
  /** The field-guide line shown in the Brood Hall. */
  blurb: string;
  mvp: boolean;
  cost: Resources;
  speed: number;
  cargo: number;
  nectarUse: number;
  unlock: Requirements;
  canHaulCorpses?: boolean;
  corpsesOnly?: boolean;
  /** Slave-maker: corpses (Protein) each one carries home straight from a won raid. */
  corpseCargo?: number;
  /** Trample: when a bite kills, the damage left over carries on into up to this many more enemies (big units; docs/08-combat.md). */
  trample?: number;
  /** Castes this one beats by sheer numbers at equal cost, not by frenzy (shown as a counter; docs/05-castes-units.md). */
  outnumbers?: string[];
  /** Castes this one beats by sheer toughness and trample (big units), not by frenzy. Shown as a counter like outnumbers. */
  overpowers?: string[];
  /** Lives only in NPC colonies (termites, spiders): never raised by players. */
  npcOnly?: boolean;
}
export interface DefenseDef extends CombatStats {
  name: string;
  /** The line shown in the Brood Hall. */
  blurb: string;
  mvp: boolean;
  cost: Resources;
  max?: number;
  unlock: Requirements;
  /** Soil Wall: its guard soaks shots aimed at the colony's other defenses (docs/06-defense.md). */
  shield?: boolean;
  /** Narrow Tunnel: not in the fight; for its first `rounds` rounds only `sharePct`% of the attackers get to fight. */
  chokepoint?: { rounds: number; sharePct: number };
}
/**
 * Research effect keys that hold a number. Code reads them only through researchSum / researchFactor
 * (economy.ts), so a key works whichever research gives it, and levels from several research add up.
 */
export const RESEARCH_NUMBER_EFFECTS = [
  // combat (combat.ts). casteAttackPct / casteHealthPct only boost the research's own `caste` (instincts).
  'attackPct', 'guardPct', 'healthPct', 'defensePct', 'lootPct', 'casteAttackPct', 'casteHealthPct',
  // economy (economy.ts)
  'foliagePct', 'proteinPct', 'nectarPct', 'storagePct', 'protectedPct', 'buildTimePct', 'unitTimePct', 'researchTimePct', 'space',
  // missions and the map (world.ts, forage.ts)
  'speedPct', 'missionSlots', 'forageSlotsPer2Levels', 'forageLuck', 'scoutLevel', 'scoutStealth', 'coloniesPer2Levels',
] as const;
export type ResearchNumberEffect = (typeof RESEARCH_NUMBER_EFFECTS)[number];

/**
 * Research effect keys that are only labels (`true`): what the research opens up is set by other data
 * naming the research as a requirement (e.g. a caste's unlock "research.brood_science").
 */
export const RESEARCH_UNLOCK_FLAGS = ['unlocksCastes', 'unlocksAllies', 'unlocksAlliances'] as const;
export type ResearchUnlockFlag = (typeof RESEARCH_UNLOCK_FLAGS)[number];
export type ResearchEffectKey = ResearchNumberEffect | ResearchUnlockFlag;

export interface ResearchDef {
  name: string;
  branch: ResearchBranchId;
  mvp: boolean;
  /** Highest level that can be researched. Missing = no cap. */
  maxLevel?: number;
  baseCost: Resources;
  unlock: Requirements;
  /** Instincts: the one caste this research boosts (its casteAttackPct / casteHealthPct apply only to it). */
  caste?: CasteId;
  effect: Partial<Record<ResearchNumberEffect, number> & Record<ResearchUnlockFlag, boolean>>;
}
export interface TerrainDef {
  name: string;
  spots: number[];
  space: [number, number];
  mods: Partial<Record<'foliagePct' | 'proteinPct' | 'nectarPct' | 'buildTimePct', number>>;
}

export const RESOURCES_DATA = resourcesJson as {
  /** Display names and tiers. Also lists workforce, which is not a stored resource. */
  resources: Record<ResourceId | 'workforce', { name: string; tier: string; stored: boolean; missionFuel?: boolean }>;
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
/** Multiplies everything a colony gathers itself: production, forage finds, aphid herds (formulas.json "gathering"). */
export const GATHER_MULTIPLIER: number = FORMULAS.gathering.multiplier;
/** Wild nests (docs/17-wild-nests.md). Typed in nests.ts. */
export const NPC_DATA = npcJson;
/** Small random events inside the nest (docs/04-colony.md). Typed in nestEvents.ts. */
export const NEST_EVENTS_DATA = nestEventsJson;
/** Truces and supercolonies (docs/23-supercolonies.md). Typed in diplomacy.ts. */
export const DIPLOMACY_DATA = diplomacyJson;

/** Units that exist in the MVP (data also contains designed-but-later units). */
export const MVP_CASTES = CASTE_IDS.filter((id) => CASTES[id].mvp);
export const MVP_DEFENSES = DEFENSE_IDS.filter((id) => DEFENSES[id].mvp);
export const MVP_RESEARCH = RESEARCH_IDS.filter((id) => RESEARCH[id].mvp);

/** Castes with the given role, in list order. */
export const castesWithRole = (role: CasteRole): CasteId[] => CASTE_IDS.filter((id) => CASTES[id].role === role);

/** How many ants of a role are in `units` (e.g. soldiers at home, for the nest's guards). */
export function roleCount(units: Partial<Record<CasteId, number>>, role: CasteRole): number {
  let n = 0;
  for (const [id, k] of Object.entries(units)) if (CASTES[id as CasteId]?.role === role) n += k ?? 0;
  return n;
}

export const ZERO: Readonly<Resources> = Object.freeze({ foliage: 0, protein: 0, nectar: 0 });
