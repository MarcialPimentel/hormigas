// Account-wide research, performed in one colony's Pheromone Chamber.
import {
  RESEARCH,
  RESEARCH_IDS,
  add,
  canAfford,
  lvl,
  missingRequirements,
  researchCost,
  researchSeconds,
  sub,
  type ResearchId,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, requireAffordable, getPlayer, lockColony, lockOwnColony, saveColony, savePlayerResearch } from '../colony';
import { cancelEvent, onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';
import { refreshPoints } from './points';

export async function startResearch(q: Tx, playerId: number, colonyId: number, research: string) {
  if (!RESEARCH_IDS.includes(research as ResearchId) || !RESEARCH[research as ResearchId].mvp)
    throw new GameError('bad_research', 'Unknown research.');
  const id = research as ResearchId;
  const t = now();
  // lock order everywhere: player, then colony
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);

  if (player.researchJob) throw new GameError('busy', 'The colony is already researching something.');
  if (lvl(c.chambers, 'pheromone_chamber') < 1) throw new GameError('locked', 'This colony needs a Pheromone Chamber.');
  if (c.buildJob?.chamber === 'pheromone_chamber') throw new GameError('busy', 'The Pheromone Chamber is being enlarged.');
  const missing = missingRequirements(RESEARCH[id].unlock, c.chambers, player.research);
  if (missing.length) throw new GameError('locked', `Requires ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}.`);

  const level = lvl(player.research, id) + 1;
  const cost = researchCost(id, level);
  requireAffordable(c, cost);

  const world = await getWorld(q);
  const secs = researchSeconds(id, level, {
    worldSpeed: world.speed,
    pheromone: lvl(c.chambers, 'pheromone_chamber'),
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
  player.research = { ...player.research, [job.research]: job.level };
  player.researchJob = null;
  await savePlayerResearch(q, player);
  await refreshPoints(q, player.id);
});
