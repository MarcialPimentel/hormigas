// Why a chamber, research or brood order can't start right now. Written once: the server refuses with
// `code` + `message`, and the client greys out the button with `short`, so the two always agree.
// Affordability isn't here: the server checks it with requireAffordable, the client explains it with whyShort.
import { CHAMBERS, RESEARCH, type ChamberId, type DefenseId, type Requirements, type ResearchId } from './data';
import { lvl, missingRequirements, researchMaxLevel, spaceMax, spaceUsed, type ChamberLevels, type DefenseCounts, type ResearchLevels } from './economy';
import { queuedCounts, type QueueItem } from './queue';

export interface Blocker {
  /** Error code the server sends (locked, busy, no_space, max…). */
  code: string;
  /** Full sentence for the server's error. */
  message: string;
  /** Short reason shown next to a disabled button. */
  short: string;
}

/** What the blocker checks need to know about one colony. */
export interface BlockerColony {
  chambers: ChamberLevels;
  buildJob?: { chamber: string } | null;
  unitQueue?: QueueItem[];
  defenses?: DefenseCounts;
  baseSpace?: number;
}

/** What they need to know about its owner. */
export interface BlockerPlayer {
  research: ResearchLevels;
  researchJob?: { research: string } | null;
}

const needs = (unlock: Requirements, chambers: ChamberLevels, research: ResearchLevels): Blocker | null => {
  const missing = missingRequirements(unlock, chambers, research);
  if (!missing.length) return null;
  const list = missing.map((m) => `${m.name} ${m.need}`).join(', ');
  return { code: 'locked', message: `Requires ${list}.`, short: `Needs ${list}` };
};

/** Why the next level of a chamber can't be dug right now, or null. */
export function chamberBlocker(id: ChamberId, c: BlockerColony, p: BlockerPlayer): Blocker | null {
  const locked = needs(CHAMBERS[id].unlock, c.chambers, p.research);
  if (locked) return locked;
  if (c.buildJob)
    return { code: 'busy', message: 'Your workers are already digging a chamber.', short: c.buildJob.chamber === id ? 'Digging now' : 'Diggers are busy' };
  if (spaceUsed(c.chambers) + 1 > spaceMax(c.baseSpace ?? 0, p.research))
    return { code: 'no_space', message: 'No space left in this nest. Research Deep Digging to expand.', short: 'No space left' };
  if (id === 'brood_hall' && (c.unitQueue?.length ?? 0) > 0)
    return { code: 'busy', message: "The Brood Hall can't be enlarged while it is raising units.", short: 'Brood Hall is raising units' };
  if (id === 'pheromone_chamber' && p.researchJob)
    return { code: 'busy', message: "The Pheromone Chamber can't be enlarged during research.", short: 'Research in progress' };
  return null;
}

/** Why the next level of a research can't start in this colony right now, or null. */
export function researchBlocker(id: ResearchId, c: BlockerColony, p: BlockerPlayer): Blocker | null {
  const def = RESEARCH[id];
  if (!def.mvp) return { code: 'bad_research', message: 'Unknown research.', short: 'Coming in a later build' };
  if (lvl(p.research, id) >= researchMaxLevel(id))
    return { code: 'max', message: `${def.name} is already at its highest level.`, short: 'Highest level reached' };
  const locked = needs(def.unlock, c.chambers, p.research);
  if (locked) return locked;
  if (lvl(c.chambers, 'pheromone_chamber') < 1)
    return { code: 'locked', message: 'This colony needs a Pheromone Chamber.', short: 'Build a Pheromone Chamber first' };
  if (p.researchJob)
    return {
      code: 'busy',
      message: 'The colony is already researching something.',
      short: p.researchJob.research === id ? 'Researching now' : 'Another research is running',
    };
  if (c.buildJob?.chamber === 'pheromone_chamber')
    return { code: 'busy', message: 'The Pheromone Chamber is being enlarged.', short: 'Pheromone Chamber is being enlarged' };
  return null;
}

/** How many more of a capped defense (e.g. one Nest Wall) this colony may still build, counting the queue. Infinity when uncapped. */
export function defenseRoom(id: DefenseId, max: number | undefined, c: BlockerColony): number {
  if (!max) return Infinity;
  const have = lvl(c.defenses, id) + (queuedCounts(c.unitQueue ?? [])[id] ?? 0);
  return Math.max(0, max - have);
}

/**
 * Why `count` of a caste or defense can't be queued in the Brood Hall right now, or null.
 * `def` is the caste's or defense's data (its unlock, and `max` for capped defenses).
 */
export function broodBlocker(
  kind: 'caste' | 'defense',
  id: string,
  def: { name: string; unlock: Requirements; max?: number },
  count: number,
  c: BlockerColony,
  p: BlockerPlayer,
): Blocker | null {
  if (lvl(c.chambers, 'brood_hall') < 1) return { code: 'locked', message: 'Build a Brood Hall first.', short: 'Build a Brood Hall first' };
  const locked = needs(def.unlock, c.chambers, p.research);
  if (locked) return locked;
  if (c.buildJob?.chamber === 'brood_hall') return { code: 'busy', message: 'The Brood Hall is being enlarged.', short: 'Brood Hall is being enlarged' };
  if (kind === 'defense' && def.max) {
    const room = defenseRoom(id as DefenseId, def.max, c);
    const message = `You can only have ${def.max} ${def.name}.`;
    if (room === 0) return { code: 'max', message, short: `Limit ${def.max} per colony` };
    if (count > room) return { code: 'max', message, short: 'Over the limit' };
  }
  return null;
}
