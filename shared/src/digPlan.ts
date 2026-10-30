// The dig plan (docs/04-colony.md): chambers lined up behind the dig in progress. A planned dig costs nothing
// until it starts; it starts, and is paid for, as soon as the diggers are free and the colony can afford it.
// Written once here so the server's rules and the client's words always agree.
import { CHAMBERS, FORMULAS, type ChamberId, type Resources } from './data';
import {
  chamberCost,
  explainShortfall,
  lvl,
  missingRequirements,
  productionPerHour,
  shortfalls,
  spaceMax,
  spaceUsed,
  storageCapacity,
  type ChamberLevels,
} from './economy';
import { chamberBlocker, type Blocker, type BlockerColony, type BlockerPlayer } from './blockers';
import { queueEndsAt } from './queue';
import type { ColonyState } from './colony';

export const DIG_PLAN = FORMULAS.digPlan;

/** What a colony's dig plan holds. `waiting` and `checkAt` say what the first planned dig is waiting for, and when it is next looked at. */
export interface DigPlan {
  chambers: ChamberId[];
  /** Why the first planned dig hasn't started (only while nothing is being dug). */
  waiting?: DigPlanWait['kind'] | null;
  /** When the server next checks whether it can start (null: when something changes). */
  checkAt?: number | null;
}

/** How many digs can wait in line in this colony (0 until the plan is unlocked). */
export function digPlanSlots(chambers: ChamberLevels, research: BlockerPlayer['research']): number {
  return missingRequirements(DIG_PLAN.unlock, chambers, research).length ? 0 : DIG_PLAN.slots;
}

/** What the dig plan needs, in words ("Queen's Chamber 4"). */
export const digPlanNeeds = (): string =>
  Object.entries(DIG_PLAN.unlock)
    .map(([id, n]) => `${CHAMBERS[id as ChamberId]?.name ?? id} ${n}`)
    .join(', ');

export interface PlanColony extends BlockerColony {
  buildJob?: { chamber: string; level?: number } | null;
  digPlan?: DigPlan | null;
}

/**
 * The level the planned dig at `index` will reach: counts the dig in progress and earlier planned digs of the
 * same chamber (so "Leaf Garden" planned behind "Leaf Garden 12" is level 13).
 */
export function plannedLevel(c: PlanColony, index: number): number {
  const plan = c.digPlan?.chambers ?? [];
  const id = plan[index];
  let level = lvl(c.chambers, id as ChamberId) + 1;
  if (c.buildJob?.chamber === id) level++;
  for (let i = 0; i < index; i++) if (plan[i] === id) level++;
  return level;
}

/** The level `id` would reach if it were added to the end of the plan now. */
export const nextPlannedLevel = (c: PlanColony, id: ChamberId): number =>
  plannedLevel({ ...c, digPlan: { chambers: [...(c.digPlan?.chambers ?? []), id] } }, c.digPlan?.chambers.length ?? 0);

/** Why `id` can't be added to the dig plan right now, or null. A busy Brood Hall or running research doesn't stop it: the planned dig waits. */
export function planBlocker(id: ChamberId, c: PlanColony, p: BlockerPlayer): Blocker | null {
  const slots = digPlanSlots(c.chambers, p.research);
  if (slots === 0) {
    const list = digPlanNeeds();
    return { code: 'locked', message: `Planning the next dig needs ${list}.`, short: `Planning needs ${list}` };
  }
  if (!c.buildJob) return { code: 'nothing', message: 'Your diggers are free: dig it now instead.', short: 'Dig it now' };
  const planned = c.digPlan?.chambers.length ?? 0;
  if (planned >= slots)
    return { code: 'full', message: slots === 1 ? 'The next dig is already planned.' : `${slots} digs are already planned.`, short: 'Next dig already planned' };
  const missing = missingRequirements(CHAMBERS[id].unlock, c.chambers, p.research);
  if (missing.length) {
    const list = missing.map((m) => `${m.name} ${m.need}`).join(', ');
    return { code: 'locked', message: `Requires ${list}.`, short: `Needs ${list}` };
  }
  // every level in progress or planned takes one more unit of space
  if (spaceUsed(c.chambers) + 1 + planned + 1 > spaceMax(c.baseSpace ?? 0, p.research))
    return { code: 'no_space', message: 'No space left in this nest for another dig. Research Deep Digging to expand.', short: 'No space left' };
  const cost = chamberCost(id, nextPlannedLevel(c, id));
  const caps = storageCapacity(c.chambers, p.research);
  const tooBig = (Object.keys(cost) as (keyof Resources)[]).find((r) => cost[r] > caps[r]);
  if (tooBig) {
    const why = explainShortfall(shortfalls(cost, { foliage: 0, protein: 0, nectar: 0 }, caps, { foliage: 0, protein: 0, nectar: 0 }).filter((s) => s.kind === 'storage'));
    return { code: 'storage', message: why, short: 'Too big for your storage' };
  }
  return null;
}

export type DigPlanWait =
  /** It can start now. */
  | { kind: 'ready' }
  /** Something else is digging; it starts when that dig ends. */
  | { kind: 'queued'; message: string; until: number | null }
  /** The Brood Hall is raising units, or research is running in the Pheromone Chamber. */
  | { kind: 'busy'; message: string; until: number | null }
  /** Not enough resources yet. `until` is when production covers it, or null if it never will on its own. */
  | { kind: 'resources'; message: string; until: number | null }
  /** It can never start (no longer allowed): it leaves the plan. */
  | { kind: 'drop'; message: string };

export interface PlanWaitColony extends PlanColony, Pick<ColonyState, 'terrain' | 'resources' | 'research' | 'units'> {}

/** What the first planned dig is waiting for at time `t` (the colony brought up to `t`). */
export function digPlanWait(
  c: PlanWaitColony,
  p: BlockerPlayer & { researchJob?: { research: string; endAt?: number } | null },
  worldSpeed: number,
  t: number,
): DigPlanWait | null {
  const id = c.digPlan?.chambers[0];
  if (!id) return null;
  if (c.buildJob) return { kind: 'queued', message: 'Starts when the dig in progress ends.', until: (c.buildJob as { endAt?: number }).endAt ?? null };
  const blocked = chamberBlocker(id, c, p);
  if (blocked?.code === 'busy') {
    const ends = id === 'brood_hall' ? queueEndsAt(c.unitQueue ?? []) : (p.researchJob?.endAt ?? null);
    // never sooner than a second from now, so a timer that rounds short can't spin
    return { kind: 'busy', message: `${blocked.message} The planned dig starts after that.`, until: ends != null ? Math.max(ends, t + 1000) : null };
  }
  if (blocked) return { kind: 'drop', message: blocked.message };
  const cost = chamberCost(id, plannedLevel(c, 0));
  const caps = storageCapacity(c.chambers, c.research);
  const short = shortfalls(cost, c.resources, caps, productionPerHour(c.chambers, c.terrain, worldSpeed, c.research, c.units));
  if (!short.length) return { kind: 'ready' };
  const etas = short.map((s) => (s.kind === 'wait' ? s.eta! : Infinity));
  const longest = Math.max(...etas);
  return {
    kind: 'resources',
    message: explainShortfall(short),
    // a second's margin so rounding never wakes it just short of the cost
    until: Number.isFinite(longest) ? t + Math.ceil(longest) * 1000 + 1000 : null,
  };
}
