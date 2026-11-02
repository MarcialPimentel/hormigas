// Army-ant swarms (docs/20-swarms.md). Every player colony has one pending `swarm_spotted` event.
// When it fires, a swarm sized against what the colony has at home sets off from the patch's wilds and
// lands warningHours later as a raid. Survivors and their loot move on: nothing comes back.
import { SWARM, WILDS_SPOT, coordsKey, createRng, isInactive, lvl, nextSwarmHours, groundDefensePct, productionPerHour, randomSeed, res, rollSwarmScouts, storageCapacity, swarmParty, swarmPrey } from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { advance, getPlayer, lockColony, saveColony, type Colony } from '../colony';
import { addReport } from './reports';
import { recurringColonyEvent } from '../recurring';
import { gameHoursMs, getWorld } from '../world';
import { defineMission, launchMission, type ArrivalOutcome, type Mission } from './missions';
import { refreshPointsAfterCommit } from './points';
import { resolveRaid } from './combat';
import { wildPlayerId } from './nests';
import { GameError } from '../errors';

const swarms = recurringColonyEvent('swarm_spotted', {
  where: 'c.npc IS NULL',
  gapHours: () => nextSwarmHours(createRng(randomSeed())),
  async run(q, ev, { id: colonyId }) {
    const t = ev.due_at;
    const player = await getPlayer(q, (await q.query('SELECT player_id FROM colonies WHERE id = $1', [colonyId])).rows[0].player_id);
    const pvp = { points: player.points.total, protectedUntil: Number(player.protectedUntil), lastActive: Number(player.lastActive) };
    // never during new-colony protection, never at abandoned colonies, never two at once
    const busy = await q.query("SELECT 1 FROM missions WHERE type = 'swarm' AND status = 'outbound' AND target_colony_id = $1", [colonyId]);
    if (player.protectedUntil > t || isInactive(pvp, t) || busy.rowCount) return;

    const colony = advance(await lockColony(q, colonyId), t);
    const units = swarmParty({ units: colony.units, defenses: colony.defenses, research: player.research, groundDefensePct: groundDefensePct(colony.terrain) }, randomSeed());
    await launchSwarm(q, colony, units, t);
  },
});

/** Schedule a colony's next swarm sighting, counted from time t. */
export const scheduleSwarm = swarms.scheduleNext;

/** Give every player colony without a pending sighting one (startup; covers colonies made before Build 5). */
export const ensureSwarms = swarms.ensure;

/** Send a swarm at a colony from its patch's wilds, landing SWARM.warningHours from t. */
export async function launchSwarm(q: Tx, colony: Colony, units: Record<string, number>, t: number) {
  const world = await getWorld(q);
  const wild = await wildPlayerId(q, world.id, t);
  // the swarm comes out of the wilds; the missions table needs an origin colony, so it's anchored on the patch's wild nest (or the target itself)
  const nest = await q.query('SELECT id FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND npc IS NOT NULL AND spot <= 12 LIMIT 1', [world.id, colony.region, colony.patch]);
  const anchor = { ...colony, id: nest.rows[0]?.id ?? colony.id, spot: WILDS_SPOT } as Colony;
  const target = { region: colony.region, patch: colony.patch, spot: colony.spot };
  return launchMission(q, {
    worldId: world.id, playerId: wild, type: 'swarm', origin: anchor, target, targetColony: colony,
    units, cargo: res(), speedPct: 100, fuel: 0, departAt: t, arriveAt: t + gameHoursMs(SWARM.warningHours, world.speed), senderName: SWARM.name,
  });
}

/** A beaten swarm drops the prey it was carrying at the colony's entrance (docs/20-swarms.md). */
async function dropPrey(q: Tx, colonyId: number, at: number) {
  let c = advance(await lockColony(q, colonyId), at);
  const world = await getWorld(q);
  const perHour = productionPerHour(c.chambers, c.terrain, world.speed, c.research, c.units);
  const cap = storageCapacity(c.chambers, c.research);
  const prey = swarmPrey(perHour.foliage + perHour.protein + perHour.nectar, cap.protein - c.resources.protein);
  if (prey <= 0) return;
  c = { ...c, resources: { ...c.resources, protein: c.resources.protein + prey } };
  await saveColony(q, c);
  await addReport(q, world.id, c.playerId, 'nest_event', 'The swarm dropped its prey', {
    event: 'swarm_prey', text: 'Your soldiers broke the column. The army ants fled and left behind everything they had been carrying.', found: res(0, prey, 0), colonyId: c.id,
  }, at);
}

defineMission('swarm', {
  async validate() {
    throw new GameError('bad_type', 'Only the wild sends swarms.');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: false };
    await resolveRaid(q, m, at, { attackerName: SWARM.name });
    if ((m.result as { winner?: string } | null)?.winner === 'defender') await dropPrey(q, m.targetColonyId, at);
    // a swarm never goes home: survivors and whatever they took march on
    m.units = {};
    m.cargo = res();
    return { home: false };
  },
});

/** The swarm on its way to a colony, if there is one (there's never more than one at a time). */
export async function swarmHeadingFor(q: Q, colonyId: number) {
  const r = await q.query(
    "SELECT id, units, arrive_at, result FROM missions WHERE type = 'swarm' AND status = 'outbound' AND target_colony_id = $1 ORDER BY arrive_at LIMIT 1",
    [colonyId],
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), units: row.units as Record<string, number>, arriveAt: Number(row.arrive_at), scouted: !!row.result?.scouted } : null;
}

/**
 * Scouts sent at your own colony while a swarm is coming go out to meet the column (docs/20-swarms.md § Scouting the swarm).
 * Each one slips past on its own; if any get back, the swarm is scouted: its real size and make-up show on the colony's
 * swarm card, with live odds. The rest are eaten.
 */
export async function scoutSwarm(q: Tx, m: Mission, colony: Colony, at: number): Promise<ArrivalOutcome> {
  const scouts = lvl(m.units, 'scout');
  const swarm = await swarmHeadingFor(q, colony.id);
  const where = { colony: colony.name, colonyId: colony.id, coords: { region: colony.region, patch: colony.patch, spot: colony.spot } };
  if (!swarm || swarm.arriveAt <= at) {
    m.result = { swarm: true, gone: true };
    await addReport(q, m.worldId, m.playerId, 'scout', `Your scouts found no swarm near ${colony.name}`, { swarm: { ...where, gone: true }, scouts, back: scouts, lost: 0 }, at);
    return { home: true };
  }
  const player = await getPlayer(q, m.playerId);
  const back = rollSwarmScouts(scouts, player.research, createRng(randomSeed()));
  const lost = scouts - back;
  if (back > 0) await q.query(`UPDATE missions SET result = coalesce(result, '{}'::jsonb) || '{"scouted": true}'::jsonb WHERE id = $1`, [swarm.id]);
  const ants = Object.values(swarm.units).reduce((a, b) => a + (b ?? 0), 0);
  await addReport(
    q, m.worldId, m.playerId, 'scout',
    back > 0 ? `Swarm scouted: ${ants.toLocaleString('en')} army ants heading for ${colony.name}` : `Your scouts never came back from the swarm`,
    { swarm: { ...where, arriveAt: swarm.arriveAt, ...(back > 0 ? { units: swarm.units } : {}) }, scouts, back, lost, key: coordsKey(where.coords) },
    at,
  );
  m.result = { swarm: true, back, lost };
  if (lost > 0) await refreshPointsAfterCommit(q, m.playerId);
  if (back === 0) {
    m.units = {};
    return { home: false };
  }
  m.units = { ...m.units, scout: back };
  return { home: true };
}
