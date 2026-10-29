// Army-ant swarms (docs/20-swarms.md). Every player colony has one pending `swarm_spotted` event.
// When it fires, a swarm sized against what the colony has at home sets off from the patch's wilds and
// lands warningHours later as a raid. Survivors and their loot move on: nothing comes back.
import { SWARM, WILDS_SPOT, createRng, isInactive, nextSwarmHours, randomSeed, res, swarmParty } from '@hormigas/shared';
import type { Tx } from '../db';
import { advance, getPlayer, lockColony, type Colony } from '../colony';
import { recurringColonyEvent } from '../recurring';
import { gameHoursMs, getWorld } from '../world';
import { defineMission, launchMission } from './missions';
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
    const units = swarmParty({ units: colony.units, defenses: colony.defenses, research: player.research }, randomSeed());
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

defineMission('swarm', {
  allowsCargo: false,
  slot: 'mission',
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
