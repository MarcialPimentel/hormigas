// Army-ant swarms (docs/20-swarms.md). Every player colony has one pending `swarm_spotted` event.
// When it fires, the sighting rolls a size (foraging column, war column or great swarm), a swarm of that size is
// sized against what the colony has at home, sets off from the patch's wilds and lands warningHours later as a raid. Survivors and their loot move on: nothing comes back.
import { SWARM, WILDS_SPOT, add, createRng, isInactive, nextSwarmHours, groundDefensePct, productionPerHour, randomSeed, res, rollSwarmSize, swarmParty, swarmPrey, swarmSize, type SwarmSizeId, type UnitCounts } from '@hormigas/shared';
import type { Tx } from '../db';
import { advance, getPlayer, lockColony, saveColony, type Colony } from '../colony';
import { addReport } from './reports';
import { recurringColonyEvent } from '../recurring';
import { gameHoursMs, getWorld } from '../world';
import { defineMission, launchMission, type ArrivalOutcome, type Mission } from './missions';
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
    const size = rollSwarmSize(createRng(randomSeed()));
    const units = swarmParty({ units: colony.units, defenses: colony.defenses, research: player.research, groundDefensePct: groundDefensePct(colony.terrain) }, randomSeed(), size);
    await launchSwarm(q, colony, units, t, size.id);
  },
});

/** Schedule a colony's next swarm sighting, counted from time t. */
export const scheduleSwarm = swarms.scheduleNext;

/** Give every player colony without a pending sighting one (startup; covers colonies made before Build 5). */
export const ensureSwarms = swarms.ensure;

/** Send a swarm at a colony from its patch's wilds, landing SWARM.warningHours from t. Its size stays hidden until scouted. */
export async function launchSwarm(q: Tx, colony: Colony, units: Record<string, number>, t: number, size: SwarmSizeId = 'foraging') {
  const world = await getWorld(q);
  const wild = await wildPlayerId(q, world.id, t);
  // the swarm comes out of the wilds; the missions table needs an origin colony, so it's anchored on the patch's wild nest (or the target itself)
  const nest = await q.query('SELECT id FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND npc IS NOT NULL AND spot <= 12 LIMIT 1', [world.id, colony.region, colony.patch]);
  const anchor = { ...colony, id: nest.rows[0]?.id ?? colony.id, spot: WILDS_SPOT } as Colony;
  const target = { region: colony.region, patch: colony.patch, spot: colony.spot };
  const m = await launchMission(q, {
    worldId: world.id, playerId: wild, type: 'swarm', origin: anchor, target, targetColony: colony,
    units, cargo: res(), speedPct: 100, fuel: 0, departAt: t, arriveAt: t + gameHoursMs(SWARM.warningHours, world.speed), senderName: SWARM.name,
  });
  await q.query(`UPDATE missions SET result = coalesce(result, '{}'::jsonb) || jsonb_build_object('size', $2::text) WHERE id = $1`, [m.id, size]);
  m.result = { ...(m.result ?? {}), size };
  return m;
}

/**
 * A beaten swarm drops the prey it was carrying at the colony's entrance (docs/20-swarms.md): a share of the swarm's
 * worth in mixed food, at least a few hours of the colony's own production. It may go over the storage cap.
 */
async function dropPrey(q: Tx, colonyId: number, swarm: UnitCounts, sizeName: string | undefined, at: number) {
  let c = advance(await lockColony(q, colonyId), at);
  const world = await getWorld(q);
  const perHour = productionPerHour(c.chambers, c.terrain, world.speed, c.research, c.units);
  const prey = swarmPrey(swarm, perHour.foliage + perHour.protein + perHour.nectar);
  c = { ...c, resources: add(c.resources, prey) };
  await saveColony(q, c);
  const what = sizeName ? `the ${sizeName.toLowerCase()}` : 'the column';
  await addReport(q, world.id, c.playerId, 'nest_event', 'The swarm dropped its prey', {
    event: 'swarm_prey', text: `Your soldiers broke ${what}. The army ants fled and left behind everything they had been carrying.`, found: prey, colonyId: c.id,
  }, at);
}

defineMission('swarm', {
  async validate() {
    throw new GameError('bad_type', 'Only the wild sends swarms.');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: false };
    const size = swarmSize((m.result as { size?: string } | null)?.size);
    const sent = { ...m.units };
    await resolveRaid(q, m, at, { attackerName: size ? `${SWARM.name} (${size.name.toLowerCase()})` : SWARM.name });
    if ((m.result as { winner?: string } | null)?.winner === 'defender') await dropPrey(q, m.targetColonyId, sent, size?.name, at);
    // a swarm never goes home: survivors and whatever they took march on
    m.units = {};
    m.cargo = res();
    return { home: false };
  },
});

