// Pure colony state advance (compute-don't-tick). Used by the server for truth and the client for live display.
import type { Resources, TerrainId } from './data';
import { GARDENER, accrue, gardenerCap, gardenerFoliagePerHour, gardenersCounted, productionPerHour, storageCapacity, type ChamberLevels, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { advanceUnitQueue, completionTimes, type QueueItem } from './queue';
import { advanceDigest, type DigestJob } from './brood';

export interface ColonyState {
  terrain: TerrainId;
  chambers: ChamberLevels;
  units: UnitCounts;
  defenses: DefenseCounts;
  resources: Resources;
  lastUpdated: number;
  unitQueue: QueueItem[];
  /** The owner's research (production and storage bonuses). Missing for wild nests. */
  research?: ResearchLevels;
  /** Larval digestion running in the Brood Hall (Protein → Nectar), if any. */
  digestJob?: DigestJob | null;
}

export function addCounts<T extends Record<string, number | undefined>>(a: T, b: T): T {
  const out: Record<string, number> = { ...(a as Record<string, number>) };
  for (const [k, v] of Object.entries(b)) if (v) out[k] = (out[k] ?? 0) + v;
  return out as T;
}

export function subCounts<T extends Record<string, number | undefined>>(a: T, b: T): T {
  const out: Record<string, number> = { ...(a as Record<string, number>) };
  for (const [k, v] of Object.entries(b)) if (v) out[k] = Math.max(0, (out[k] ?? 0) - v);
  return out as T;
}

/** Bring a colony's resources, Brood Hall queue and larval digestion forward to time `to`. Never moves backwards. */
export function syncColony<S extends ColonyState>(state: S, to: number, worldSpeed = 1): S {
  if (to <= state.lastUpdated) return state;
  const seconds = (to - state.lastUpdated) / 1000;
  // Gardener Minims hatching on the way count from the moment they hatch (up to the cap), so away time is paid exactly
  const room = gardenerCap(state.chambers) - gardenersCounted(state.chambers, state.units);
  const hatched = room > 0 ? completionTimes(state.unitQueue, GARDENER, state.lastUpdated, to, room) : [];
  const gardenHours = hatched.reduce((h, t) => h + (to - t) / 3600_000, 0);
  const extra = { foliage: gardenHours * gardenerFoliagePerHour(state.chambers, state.terrain, worldSpeed, state.research), protein: 0, nectar: 0 };
  const resources = accrue(state.resources, productionPerHour(state.chambers, state.terrain, worldSpeed, state.research, state.units), storageCapacity(state.chambers, state.research), seconds, extra);
  const adv = advanceUnitQueue(state.unitQueue, to);
  // digested Nectar lands like mission cargo: it may go over the storage cap
  const digest = advanceDigest(state.digestJob, to);
  if (digest.nectar > 0) resources.nectar += digest.nectar;
  return {
    ...state,
    resources,
    ...(state.digestJob !== undefined ? { digestJob: digest.job } : {}),
    lastUpdated: to,
    unitQueue: adv.queue,
    units: addCounts(state.units, adv.castes),
    defenses: addCounts(state.defenses, adv.defenses),
  };
}
