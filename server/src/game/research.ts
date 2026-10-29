// Account-wide research, performed in one colony's Pheromone Chamber.
import {
  RESEARCH,
  RESEARCH_IDS,
  add,
  lvl,
  researchBlocker,
  researchCost,
  researchSeconds,
  sub,
  type ResearchId,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, requireAffordable, getPlayer, lockColony, lockOwnColony, playerColonyIds, saveColony, savePlayerResearch } from '../colony';
import { cancelEvent, onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';
import { refreshPoints } from './points';

export async function startResearch(q: Tx, playerId: number, colonyId: number, research: string) {
  if (!RESEARCH_IDS.includes(research as ResearchId)) throw new GameError('bad_research', 'Unknown research.');
  const id = research as ResearchId;
  const t = now();
  // lock order everywhere: player, then colony
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);

  // same checks the Research screen and tree use to grey out the button
  const blocked = researchBlocker(id, c, player);
  if (blocked) throw new GameError(blocked.code, blocked.message);

  const level = lvl(player.research, id) + 1;
  const cost = researchCost(id, level);
  requireAffordable(c, cost);

  const world = await getWorld(q);
  const secs = researchSeconds(id, level, {
    worldSpeed: world.speed,
    pheromone: lvl(c.chambers, 'pheromone_chamber'),
    research: player.research,
    timeMultiplier: await timeMultiplier(q, world.id, player.points.total, t),
  });
  const endAt = t + secs * 1000;
  const eventId = await schedule(q, world.id, 'research_complete', endAt, { playerId });
  c.resources = sub(c.resources, cost);
  player.researchJob = { research: id, level, startAt: t, endAt, cost, colonyId: c.id, eventId };
  await saveColony(q, c);
  await savePlayerResearch(q, player);
  return player;
}

export async function cancelResearch(q: Tx, playerId: number) {
  const player = await getPlayer(q, playerId, true);
  const job = player.researchJob;
  if (!job) throw new GameError('nothing', 'Nothing is being researched.');
  let c = await lockColony(q, job.colonyId);
  c = advance(c, now());
  c.resources = add(c.resources, job.cost);
  await cancelEvent(q, job.eventId);
  player.researchJob = null;
  await saveColony(q, c);
  await savePlayerResearch(q, player);
  return player;
}

onEvent('research_complete', async (q, ev) => {
  const player = await getPlayer(q, ev.payload.playerId, true);
  const job = player.researchJob;
  if (!job || job.eventId !== ev.id) return;
  // Some research changes production or storage (docs/21-tech-tree.md). Bring every colony up to the moment
  // it finishes at the old rates first, so the new rates only count from then on. Lock order: player, then colonies.
  for (const id of await playerColonyIds(q, player.id)) {
    const c = await lockColony(q, id);
    if (c.lastUpdated < job.endAt) await saveColony(q, advance(c, job.endAt));
  }
  player.research = { ...player.research, [job.research]: job.level };
  player.researchJob = null;
  await savePlayerResearch(q, player);
  await refreshPoints(q, player.id);
});
