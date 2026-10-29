// Army-ant swarms (docs/20-swarms.md). Every player colony has one pending `swarm_spotted` event.
// When it fires, a swarm sized against what the colony has at home sets off from the patch's wilds and
// lands warningHours later as a raid. Survivors and their loot move on: nothing comes back.
import { SWARM, WILDS_SPOT, createRng, isInactive, nextSwarmHours, randomSeed, res, swarmParty } from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { advance, getPlayer, lockColony, type Colony } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { defineMission, launchMission } from './missions';
import { resolveRaid } from './combat';
import { wildPlayerId } from './nests';
import { GameError } from '../errors';

const HOUR = 3600_000;

/** Schedule a colony's next swarm sighting, counted from time t. */
export async function scheduleSwarm(q: Q, worldId: number, colonyId: number, t: number) {
  const speed = (await getWorld(q)).speed;
  await schedule(q, worldId, 'swarm_spotted', t + (nextSwarmHours(createRng(randomSeed())) * HOUR) / speed, { colonyId });
}

/** Give every player colony without a pending sighting one (startup; covers colonies made before Build 5). */
export async function ensureSwarms(q: Tx, worldId: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT c.id FROM colonies c WHERE c.world_id = $1 AND c.npc IS NULL
        AND NOT EXISTS (SELECT 1 FROM events e WHERE NOT e.done AND e.type = 'swarm_spotted' AND (e.payload->>'colonyId')::int = c.id)`,
    [worldId],
  );
  for (const row of r.rows) await scheduleSwarm(q, worldId, row.id, t);
  return r.rows.length;
}

onEvent('swarm_spotted', async (q, ev) => {
  const t = ev.due_at;
  const colonyId = ev.payload.colonyId;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1 AND npc IS NULL', [colonyId]);
  if (!found.rows[0]) return; // colony gone: stop
  const rearm = () => scheduleSwarm(q, ev.world_id, colonyId, t);

  const player = await getPlayer(q, (await q.query('SELECT player_id FROM colonies WHERE id = $1', [colonyId])).rows[0].player_id);
  const pvp = { points: player.points.total, protectedUntil: Number(player.protectedUntil), lastActive: Number(player.lastActive) };
  // never during new-colony protection, never at abandoned colonies, never two at once
  const busy = await q.query("SELECT 1 FROM missions WHERE type = 'swarm' AND status = 'outbound' AND target_colony_id = $1", [colonyId]);
  if (player.protectedUntil > t || isInactive(pvp, t) || busy.rowCount) {
    await rearm();
    return;
  }

  const colony = advance(await lockColony(q, colonyId), t);
  const units = swarmParty({ units: colony.units, defenses: colony.defenses, research: player.research }, randomSeed());
  await launchSwarm(q, colony, units, t);
  await rearm();
});

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
    units, cargo: res(), speedPct: 100, fuel: 0, departAt: t, arriveAt: t + (SWARM.warningHours * HOUR) / world.speed, senderName: SWARM.name,
  });
}

defineMission('swarm', {
  async validate() {
    throw new GameError('bad_type', 'Only the wild sends swarms.');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: false };
    await resolveRaid(q, m, at, { attackerName: SWARM.name });
    // a swarm never goes home: survivors and whatever they took march on
    m.units = {};
    m.cargo = res();
    return { home: false };
  },
});
