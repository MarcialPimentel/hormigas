// Map, distance, travel and mission rules. Spec: docs/09-missions.md, docs/11-world.md
import { CASTES, FORMULAS, TERRAIN, TERRAIN_IDS, type CasteId, type TerrainId } from './data';
import { lvl, type ResearchLevels, type UnitCounts } from './economy';

export interface Coords {
  region: number;
  patch: number;
  spot: number;
}

export const WORLD = FORMULAS.world;

export const coordsKey = (c: Coords) => `${c.region}:${c.patch}:${c.spot}`;
export const sameCoords = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;

export function validCoords(c: Coords, allowWilds = false): boolean {
  const maxSpot = WORLD.spotsPerPatch + (allowWilds ? 1 : 0);
  return (
    Number.isInteger(c.region) && Number.isInteger(c.patch) && Number.isInteger(c.spot) &&
    c.region >= 1 && c.region <= WORLD.regions &&
    c.patch >= 1 && c.patch <= WORLD.patchesPerRegion &&
    c.spot >= 1 && c.spot <= maxSpot
  );
}

export function terrainForSpot(spot: number): TerrainId {
  return TERRAIN_IDS.find((t) => TERRAIN[t].spots.includes(spot)) ?? 'grassland';
}

export function distance(a: Coords, b: Coords): number {
  if (a.region !== b.region) return 20000 * Math.abs(a.region - b.region);
  if (a.patch !== b.patch) return 2700 + 95 * Math.abs(a.patch - b.patch);
  if (a.spot !== b.spot) return 1000 + 5 * Math.abs(a.spot - b.spot);
  return 5;
}

/** Units that actually move on missions (excludes nothing in MVP, but keeps zero counts out). */
export const presentUnits = (units: UnitCounts): CasteId[] =>
  (Object.keys(units) as CasteId[]).filter((id) => (units[id] ?? 0) > 0);

export function unitSpeed(id: CasteId, research: ResearchLevels): number {
  return CASTES[id].speed * (1 + 0.1 * lvl(research, 'pheromone_trails'));
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
  const t = 10 + (3500 / factor) * Math.sqrt((dist * 10) / slowestSpeed);
  return Math.max(1, Math.round(t / worldSpeed));
}

/** Nectar consumed for the whole trip (paid at departure). */
export function missionFuel(units: UnitCounts, dist: number, speedPct: number): number {
  let use = 0;
  for (const id of presentUnits(units)) use += (units[id] ?? 0) * CASTES[id].nectarUse;
  const fuel = ((use * dist) / 35000) * Math.pow(speedPct / 100 + 1, 2);
  return Math.max(1, Math.round(fuel));
}

export const missionSlots = (research: ResearchLevels): number =>
  FORMULAS.missions.baseSlots + lvl(research, 'colony_mind');

export const forageSlots = (research: ResearchLevels): number =>
  1 + Math.floor(lvl(research, 'foraging_instinct') / 2);

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

/** How much a scout report reveals (docs/07-research.md). */
export function scoutDetail(yourScent: number, theirScent: number, scouts: number): ScoutDetail {
  const diff = Math.floor(yourScent - theirScent + (scouts - 1) / 2);
  if (diff < 0) return 'resources';
  if (diff <= 1) return 'units';
  if (diff <= 3) return 'defenses';
  return 'full';
}

/** Chance (0..1) that the defender's units detect and kill the scouts. */
export function scoutDetectionChance(defenderUnitCount: number, scouts: number, yourScent: number, theirScent: number): number {
  if (defenderUnitCount <= 0) return 0;
  const base = 0.0025 * defenderUnitCount * scouts * Math.pow(2, theirScent - yourScent);
  return Math.min(1, base);
}
