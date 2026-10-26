// Pure colony state advance (compute-don't-tick). Used by the server for truth and the client for live display.
import type { Resources, TerrainId } from './data';
import { accrue, productionPerHour, storageCapacity, type ChamberLevels, type DefenseCounts, type UnitCounts } from './economy';
import { advanceUnitQueue, type QueueItem } from './queue';

export interface ColonyState {
  terrain: TerrainId;
  chambers: ChamberLevels;
  units: UnitCounts;
  defenses: DefenseCounts;
  resources: Resources;
  lastUpdated: number;
  unitQueue: QueueItem[];
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

/** Bring a colony's resources and Brood Hall queue forward to time `to`. Never moves backwards. */
export function syncColony<S extends ColonyState>(state: S, to: number, worldSpeed = 1): S {
  if (to <= state.lastUpdated) return state;
  const seconds = (to - state.lastUpdated) / 1000;
  const resources = accrue(state.resources, productionPerHour(state.chambers, state.terrain, worldSpeed), storageCapacity(state.chambers), seconds);
  const adv = advanceUnitQueue(state.unitQueue, to);
  return {
    ...state,
    resources,
    lastUpdated: to,
    unitQueue: adv.queue,
    units: addCounts(state.units, adv.castes),
    defenses: addCounts(state.defenses, adv.defenses),
  };
}
