// Chamber construction.
import {
  CHAMBERS,
  CHAMBER_IDS,
  canAfford,
  chamberBuildSeconds,
  chamberCost,
  lvl,
  missingRequirements,
  spaceMax,
  spaceUsed,
  sub,
  add,
  type ChamberId,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, requireAffordable, getPlayer, lockOwnColony, lockColony, saveColony } from '../colony';
import { cancelEvent, onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';
import { refreshPointsAfterCommit } from './points';
import { addReport } from './reports';

export async function startBuild(q: Tx, playerId: number, colonyId: number, chamber: string) {
  if (!CHAMBER_IDS.includes(chamber as ChamberId)) throw new GameError('bad_chamber', 'Unknown chamber.');
  const id = chamber as ChamberId;
  const t = now();
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);

  if (c.buildJob) throw new GameError('busy', 'Your workers are already digging a chamber.');
  const missing = missingRequirements(CHAMBERS[id].unlock, c.chambers, player.research);
  if (missing.length) throw new GameError('locked', `Requires ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}.`);
  if (spaceUsed(c.chambers) + 1 > spaceMax(c.baseSpace, player.research))
    throw new GameError('no_space', 'No space left in this nest. Research Deep Digging to expand.');
  if (id === 'brood_hall' && c.unitQueue.length > 0)
    throw new GameError('busy', "The Brood Hall can't be enlarged while it is raising units.");
  if (id === 'pheromone_chamber' && player.researchJob)
    throw new GameError('busy', "The Pheromone Chamber can't be enlarged during research.");

  const level = lvl(c.chambers, id) + 1;
  const cost = chamberCost(id, level);
  requireAffordable(c, cost);

  const world = await getWorld(q);
  const mult = await timeMultiplier(q, world.id, player.points.total, t);
  const secs = chamberBuildSeconds(id, level, {
    worldSpeed: world.speed,
    excavation: lvl(c.chambers, 'excavation_works'),
    terrain: c.terrain,
    timeMultiplier: mult,
    research: player.research,
  });
  const endAt = t + secs * 1000;
  const eventId = await schedule(q, world.id, 'build_complete', endAt, { colonyId });
  c.resources = sub(c.resources, cost);
  c.buildJob = { chamber: id, level, startAt: t, endAt, cost, eventId };
  await saveColony(q, c);
  return c;
}

export async function cancelBuild(q: Tx, playerId: number, colonyId: number) {
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, now());
  if (!c.buildJob) throw new GameError('nothing', 'Nothing is being built.');
  await cancelEvent(q, c.buildJob.eventId);
  c.resources = add(c.resources, c.buildJob.cost);
  c.buildJob = null;
  await saveColony(q, c);
  return c;
}

onEvent('build_complete', async (q, ev) => {
  let c = await lockColony(q, ev.payload.colonyId);
  if (!c.buildJob || c.buildJob.eventId !== ev.id) return; // cancelled or superseded
  const job = c.buildJob;
  c = advance(c, ev.due_at);
  c.chambers = { ...c.chambers, [job.chamber]: job.level };
  c.buildJob = null;
  await saveColony(q, c);
  await refreshPointsAfterCommit(q, c.playerId);
  if (job.chamber === 'aphid_pasture' && job.level === 1) {
    const first = await q.query("SELECT 1 FROM reports WHERE player_id = $1 AND type = 'milestone' AND data->>'id' = 'nectar'", [c.playerId]);
    if (!first.rowCount)
      await addReport(q, c.worldId, c.playerId, 'milestone', 'Your colony discovered Nectar', {
        id: 'nectar',
        colony: c.name,
        text: 'The first aphids are grazing in the pasture, and honeydew is flowing into the nest. Nectar fuels every journey beyond the nest and the castes you raise. The Brood Hall can now be built.',
      }, ev.due_at);
  }
});
