// Chamber construction, and the dig plan lined up behind it (docs/04-colony.md).
import {
  CHAMBER_IDS,
  chamberBlocker,
  chamberBuildSeconds,
  chamberCost,
  digPlanWait,
  lvl,
  planBlocker,
  plannedLevel,
  sub,
  add,
  type ChamberId,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, requireAffordable, getPlayer, lockOwnColony, lockColony, saveColony, type Colony, type Player } from '../colony';
import { cancelEvent, onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';
import { refreshPointsAfterCommit } from './points';
import { addReport } from './reports';

const chamberId = (chamber: string): ChamberId => {
  if (!CHAMBER_IDS.includes(chamber as ChamberId)) throw new GameError('bad_chamber', 'Unknown chamber.');
  return chamber as ChamberId;
};

/** Start digging `id` to `level` at time `t` (the colony already brought up to `t`): pay, schedule, set the job. */
async function beginDig(q: Tx, c: Colony, player: Player, id: ChamberId, level: number, t: number) {
  const cost = chamberCost(id, level);
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
  const eventId = await schedule(q, world.id, 'build_complete', endAt, { colonyId: c.id });
  c.resources = sub(c.resources, cost);
  c.buildJob = { chamber: id, level, startAt: t, endAt, cost, eventId };
}

/**
 * Nothing is being dug: start the first planned dig if the colony can, or schedule a look again for when it should be
 * able to (resources produced, the Brood Hall or research done). `t` is the colony's time; the caller saves it.
 */
async function settleDigPlan(q: Tx, c: Colony, t: number) {
  const plan = c.digPlan;
  if (!plan?.chambers.length || c.buildJob) return;
  const player = await getPlayer(q, c.playerId);
  const world = await getWorld(q);
  for (;;) {
    const wait = digPlanWait(c, player, world.speed, t);
    if (!wait) break;
    if (plan.eventId) await cancelEvent(q, plan.eventId);
    plan.eventId = null;
    if (wait.kind === 'drop') {
      // no longer allowed (never expected: the plan was checked when it was made); let the next one try
      plan.chambers.shift();
      continue;
    }
    if (wait.kind === 'ready') {
      const level = plannedLevel(c, 0);
      const id = plan.chambers.shift()!;
      plan.checkAt = null;
      plan.waiting = plan.chambers.length ? 'queued' : null;
      await beginDig(q, c, player, id, level, t);
      return;
    }
    plan.checkAt = wait.until;
    plan.waiting = wait.kind;
    if (wait.until != null) plan.eventId = await schedule(q, world.id, 'dig_plan', wait.until, { colonyId: c.id });
    return;
  }
}

export async function startBuild(q: Tx, playerId: number, colonyId: number, chamber: string) {
  const id = chamberId(chamber);
  const t = now();
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);

  // same checks the Chambers screen uses to grey out the button
  const blocked = chamberBlocker(id, c, player);
  if (blocked) throw new GameError(blocked.code, blocked.message);

  const level = lvl(c.chambers, id) + 1;
  requireAffordable(c, chamberCost(id, level));
  await beginDig(q, c, player, id, level, t);
  // a planned dig that was waiting now waits behind this one
  if (c.digPlan) {
    if (c.digPlan.eventId) await cancelEvent(q, c.digPlan.eventId);
    c.digPlan = { ...c.digPlan, eventId: null, checkAt: null, waiting: 'queued' };
  }
  await saveColony(q, c);
  return c;
}

export async function cancelBuild(q: Tx, playerId: number, colonyId: number) {
  let c = await lockOwnColony(q, colonyId, playerId);
  const t = now();
  c = advance(c, t);
  if (!c.buildJob) throw new GameError('nothing', 'Nothing is being built.');
  await cancelEvent(q, c.buildJob.eventId);
  c.resources = add(c.resources, c.buildJob.cost);
  c.buildJob = null;
  // the planned dig moves up
  await settleDigPlan(q, c, t);
  await saveColony(q, c);
  return c;
}

/** Line `chamber` up behind the dig in progress. It costs nothing until it starts. */
export async function planDig(q: Tx, playerId: number, colonyId: number, chamber: string) {
  const id = chamberId(chamber);
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, now());
  const blocked = planBlocker(id, c, player);
  if (blocked) throw new GameError(blocked.code, blocked.message);
  c.digPlan = { chambers: [...(c.digPlan?.chambers ?? []), id], eventId: c.digPlan?.eventId ?? null, checkAt: c.digPlan?.checkAt ?? null, waiting: c.digPlan?.waiting ?? 'queued' };
  await saveColony(q, c);
  return c;
}

/** Take a planned dig (by its place in line, first is 0) out of the plan. Nothing was paid, so nothing is refunded. */
export async function unplanDig(q: Tx, playerId: number, colonyId: number, index: number) {
  let c = await lockOwnColony(q, colonyId, playerId);
  const t = now();
  c = advance(c, t);
  const plan = c.digPlan;
  if (!plan?.chambers.length || !Number.isInteger(index) || index < 0 || index >= plan.chambers.length)
    throw new GameError('nothing', 'That dig is not planned.');
  plan.chambers.splice(index, 1);
  if (index === 0) {
    // the next in line (if any) gets its own look
    if (plan.eventId) await cancelEvent(q, plan.eventId);
    c.digPlan = plan.chambers.length ? { chambers: plan.chambers, eventId: null, checkAt: null, waiting: 'queued' } : null;
    await settleDigPlan(q, c, t);
  }
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
  // the planned dig starts the moment this one ends, if the stores can pay
  await settleDigPlan(q, c, Math.max(ev.due_at, c.lastUpdated));
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

/** The first planned dig's look again: it was waiting for resources, the Brood Hall or research. */
onEvent('dig_plan', async (q, ev) => {
  let c = await lockColony(q, ev.payload.colonyId);
  if (c.digPlan?.eventId !== ev.id) return; // started, cancelled or rescheduled since
  const t = Math.max(ev.due_at, c.lastUpdated);
  c = advance(c, t);
  await settleDigPlan(q, c, t);
  await saveColony(q, c);
});
