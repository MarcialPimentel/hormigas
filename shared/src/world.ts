// Map, distance, travel and mission rules. Spec: docs/09-missions.md, docs/11-world.md
import { CASTES, FORMULAS, NPC_DATA, TERRAIN, TERRAIN_IDS, type CasteId, type TerrainId } from './data';
import { researchFraction, researchSum, type ResearchLevels, type UnitCounts } from './economy';

const D = FORMULAS.distance;
const T = FORMULAS.travel;
const SC = FORMULAS.scouting;

export interface Coords {
  region: number;
  patch: number;
  spot: number;
}

export const WORLD = FORMULAS.world;

export const coordsKey = (c: Coords) => `${c.region}:${c.patch}:${c.spot}`;
export const sameCoords = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;

/** Wild sites: extra spots in the wilds for aphid herds, termite mounds and spider dens (docs/24-npcs.md). */
const SITE_SPOT_LIST = Object.values(NPC_DATA.area.sites) as number[];

/** A real place: a colony spot (1–12), optionally the wilds (13), optionally a wild site (14+). */
export function validCoords(c: Coords, allowWilds = false, allowSites = false): boolean {
  const maxSpot = WORLD.spotsPerPatch + (allowWilds ? 1 : 0);
  return (
    Number.isInteger(c.region) && Number.isInteger(c.patch) && Number.isInteger(c.spot) &&
    c.region >= 1 && c.region <= WORLD.regions &&
    c.patch >= 1 && c.patch <= WORLD.patchesPerRegion &&
    ((c.spot >= 1 && c.spot <= maxSpot) || (allowSites && SITE_SPOT_LIST.includes(c.spot)))
  );
}

export function terrainForSpot(spot: number): TerrainId {
  return TERRAIN_IDS.find((t) => TERRAIN[t].spots.includes(spot)) ?? 'grassland';
}

export function distance(a: Coords, b: Coords): number {
  if (a.region !== b.region) return D.otherRegionPerRegion * Math.abs(a.region - b.region);
  if (a.patch !== b.patch) return D.sameRegionBase + D.sameRegionPerPatch * Math.abs(a.patch - b.patch);
  if (a.spot !== b.spot) return D.samePatchBase + D.samePatchPerSpot * Math.abs(a.spot - b.spot);
  return D.sameSpot;
}

/** Units that actually move on missions (excludes nothing in MVP, but keeps zero counts out). */
export const presentUnits = (units: UnitCounts): CasteId[] =>
  (Object.keys(units) as CasteId[]).filter((id) => (units[id] ?? 0) > 0);

export function unitSpeed(id: CasteId, research: ResearchLevels): number {
  return CASTES[id].speed * (1 + researchFraction(research, 'speedPct'));
}

/** Speed of the slowest unit in the group. */
export function groupSpeed(units: UnitCounts, research: ResearchLevels): number {
  const ids = presentUnits(units);
  if (ids.length === 0) return 0;
  return Math.min(...ids.map((id) => unitSpeed(id, research)));
}

export function groupCargo(units: UnitCounts, opts: { corpses?: boolean } = {}): number {
  let cargo = 0;
  for (const id of presentUnits(units)) {
    const def = CASTES[id];
    if (def.corpsesOnly && !opts.corpses) continue;
    cargo += def.cargo * (units[id] ?? 0);
  }
  return cargo;
}

/** One-way travel time in seconds. speedPct is 10..100. */
export function travelSeconds(dist: number, slowestSpeed: number, speedPct: number, worldSpeed: number): number {
  const factor = speedPct / 10; // 1..10
  const t = T.baseSeconds + (T.timeScale / factor) * Math.sqrt((dist * 10) / slowestSpeed);
  return Math.max(1, Math.round(t / worldSpeed));
}

/** Nectar consumed for the whole trip (paid at departure). */
export function missionFuel(units: UnitCounts, dist: number, speedPct: number): number {
  let use = 0;
  for (const id of presentUnits(units)) use += (units[id] ?? 0) * CASTES[id].nectarUse;
  const fuel = ((use * dist) / T.fuelDivisor) * Math.pow(speedPct / 100 + 1, 2);
  return Math.max(1, Math.round(fuel));
}

export const missionSlots = (research: ResearchLevels): number =>
  FORMULAS.missions.baseSlots + researchSum(research, 'missionSlots');

/** Most colonies a player may hold (docs/19-colonies.md): 1, plus one at Nuptial Flight levels 1, 3, 5… */
export const maxColonies = (research: ResearchLevels): number =>
  FORMULAS.colonies.base + Math.ceil(researchSum(research, 'coloniesPer2Levels') / 2);

/** Forage parties each colony can have out at once (per colony, docs/09-missions.md). */
export const forageSlots = (research: ResearchLevels): number =>
  FORMULAS.missions.baseForageSlots + Math.floor(researchSum(research, 'forageSlotsPer2Levels') / 2);

/** Find the speedPct (10..100, step 10) whose round trip returns closest to (but not before) `returnInSeconds`. */
export function speedForReturnIn(returnInSeconds: number, dist: number, slowestSpeed: number, worldSpeed: number): number {
  let best = 100;
  for (let pct = 100; pct >= 10; pct -= 10) {
    const roundTrip = 2 * travelSeconds(dist, slowestSpeed, pct, worldSpeed);
    if (roundTrip <= returnInSeconds) best = pct;
    else break;
  }
  return best;
}

export type ScoutDetail = 'resources' | 'units' | 'defenses' | 'full';

/** A player's scouting level: Scent Reading's scoutLevel effect. Used for report detail and detection. */
export const scoutLevel = (research: ResearchLevels | undefined): number => researchSum(research, 'scoutLevel');

/**
 * How much a scout report reveals (docs/07-research.md). diff = yours − theirs + (scouts − 1) / extraScoutsPerStep,
 * rounded down; each detail level needs diff at or above its threshold in formulas.json scouting.detail.
 */
export function scoutDetail(yourScent: number, theirScent: number, scouts: number): ScoutDetail {
  const d = SC.detail;
  const diff = Math.floor(yourScent - theirScent + (scouts - 1) / d.extraScoutsPerStep);
  if (diff >= d.fullFrom) return 'full';
  if (diff >= d.defensesFrom) return 'defenses';
  if (diff >= d.unitsFrom) return 'units';
  return 'resources';
}

/** Chance (0..1) that the defender's units detect and kill the scouts. */
export function scoutDetectionChance(defenderUnitCount: number, scouts: number, yourScent: number, theirScent: number, stealth = 0): number {
  if (defenderUnitCount <= 0) return 0;
  // Chemical Mimicry (stealth) counts as extra Scent Reading for detection only, not for report detail.
  const base = SC.detectionPerUnitPerScout * defenderUnitCount * scouts * Math.pow(SC.detectionScentBase, theirScent - yourScent - stealth);
  return Math.min(1, base);
}
