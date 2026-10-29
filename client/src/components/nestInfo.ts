// What the nest shows in words, shared by the 2D nest (NestView) and the 3D slab (nest3d/Nest3D):
// the tag under each chamber and the timer over each party on the surface.
import { RESEARCH, queueEndsAt, storageCapacity, type ChamberId, type ResearchId } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../game';
import { fmtDuration } from '../format';
import { MISSION_LABEL, type MissionType } from '../nav';
import { STORE_OF } from './ChamberSheet';
import type { SurfaceParty } from './nestScene';

export interface ChamberTag {
  text: string;
  /** dig, learn, brood, store or full: styles the tag */
  tone: string;
}

/** What a chamber is busy with, shown under its name (null when there's nothing to say). */
export function chamberTag(colony: ServerColony, state: ServerState | null, now: number, id: ChamberId, level: number): ChamberTag | null {
  const job = colony.buildJob;
  if (job?.chamber === id) return { text: `Digging · ${fmtDuration(job.endAt - now)}`, tone: 'dig' };
  if (level === 0) return null;
  const rj = state?.player.researchJob;
  if (id === 'pheromone_chamber' && rj) return { text: `${RESEARCH[rj.research as ResearchId].name} · ${fmtDuration(rj.endAt - now)}`, tone: 'learn' };
  const qEnd = queueEndsAt(colony.unitQueue);
  if (id === 'brood_hall' && qEnd) {
    const raising = colony.unitQueue.reduce((s, i) => s + i.count - i.done, 0);
    return { text: `Raising ${raising} · ${fmtDuration(qEnd - now)}`, tone: 'brood' };
  }
  const r = STORE_OF[id];
  if (r) {
    const pct = Math.floor((colony.resources[r] / storageCapacity(colony.chambers)[r]) * 100);
    return pct >= 100 ? { text: 'Full', tone: 'full' } : { text: `${pct}% full`, tone: 'store' };
  }
  return null;
}

/** The name on a party's timer: "Forage", "Forage home", "Raid", "Scouts", "Delivery". */
export const partyLabel = (p: SurfaceParty) =>
  p.type === 'swarm' ? 'Swarm' : p.kind === 'raid' ? 'Raid' : p.kind === 'scout' ? 'Scouts' : p.kind === 'delivery' ? 'Delivery' : `${MISSION_LABEL[p.type as MissionType] ?? p.type}${p.outbound ? '' : ' home'}`;
