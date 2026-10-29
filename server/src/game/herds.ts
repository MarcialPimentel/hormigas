// Aphid herds (docs/24-npcs.md): claimed by stationing tenders, who carry the honeydew home every few hours.
// A herd is a colony row on the patch's herd site, owned by the hidden wild player. Its units are the tenders
// (they still belong to `npc.tender`), its Nectar is the honeydew waiting to be carried home.
import {
  AREA_RANGE,
  HERDS,
  SITE_SPOTS,
  WORLD,
  coordsKey,
  createRng,
  distance,
  fillCargo,
  groupCargo,
  groupSpeed,
  herdNectarPerHour,
  isHerdState,
  nearbyPatches,
  presentUnits,
  randomSeed,
  res,
  travelSeconds,
  addCounts,
  type HerdState,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError, forbidden, notFound } from '../errors';
import { now } from '../clock';
import { advance, getColony, getPlayer, lockColony, saveColony, type Colony } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { defineMission, launchReturn } from './missions';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { requireKnown } from './discovery';
import { syncNest } from './nests';

const HOUR = 3600_000;

export const herdOf = (c: Colony | null): HerdState | null => (c && isHerdState(c.npc) ? c.npc : null);

/** The herd a colony's ants tend (or are on their way to tend), other than `exceptHerdId`. */
async function herdTendedFrom(q: Q, colonyId: number, exceptHerdId: number): Promise<string | null> {
  const r = await q.query(
    `SELECT c.name, c.region, c.patch, c.spot FROM colonies c
      WHERE c.id <> $2 AND (c.npc->'tender'->>'colonyId')::int = $1
     UNION ALL
     SELECT c.name, c.region, c.patch, c.spot FROM missions m JOIN colonies c ON c.id = m.target_colony_id
      WHERE m.origin_colony_id = $1 AND m.type = 'tend' AND m.status = 'outbound' AND c.id <> $2
     LIMIT 1`,
    [colonyId, exceptHerdId],
  );
  const row = r.rows[0];
  return row ? `${row.name} (${row.region}:${row.patch}:${row.spot})` : null;
}

async function scheduleDelivery(q: Tx, worldId: number, herdId: number, since: number, from: number) {
  const speed = (await getWorld(q)).speed;
  await schedule(q, worldId, 'herd_deliver', from + (HERDS.deliverEveryHours * HOUR) / speed, { colonyId: herdId, since });
}

async function scheduleWander(q: Tx, worldId: number, herdId: number, untendedSince: number) {
  const speed = (await getWorld(q)).speed;
  await schedule(q, worldId, 'herd_wander', untendedSince + (HERDS.wanderAfterHours * HOUR) / speed, { colonyId: herdId, untendedSince });
}

/** The herd has lost its tenders (called home, or killed): it starts to drift and will wander off if nobody comes. */
export async function leaveHerd(q: Tx, herd: Colony, at: number) {
  const npc = herdOf(herd)!;
  herd.units = {};
  herd.npc = { ...npc, tender: null, untendedSince: at };
  await saveColony(q, herd);
  await scheduleWander(q, herd.worldId, herd.id, at);
}

// ---------- the Tend mission ----------

defineMission('tend', {
  async validate({ q, player, colony, targetColony, units }) {
    const herd = herdOf(targetColony);
    if (!targetColony || !herd) throw new GameError('bad_target', 'Only aphid herds can be tended.');
    await requireKnown(q, player.id, targetColony.id, 'tend');
    if (herd.tender && herd.tender.colonyId !== colony.id) {
      if (herd.tender.playerId === player.id) throw new GameError('herd_yours', 'Another of your colonies already tends this herd.');
      throw new GameError('herd_taken', "Another colony's ants tend this herd. Raid it to drive them off first.");
    }
    const other = await herdTendedFrom(q, colony.id, targetColony.id);
    if (other) throw new GameError('herd_limit', `Each colony can tend one herd. ${colony.name} already tends ${other}: call those tenders home first.`);
    if (presentUnits(units).length === 0) throw new GameError('no_units', 'Pick at least one unit to send.');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    let herd = await syncNest(q, await lockColony(q, m.targetColonyId), at);
    const npc = herdOf(herd);
    const moved = herd.region !== m.target.region || herd.patch !== m.target.patch || herd.spot !== m.target.spot;
    if (!npc || moved || (npc.tender && npc.tender.colonyId !== m.originColonyId)) {
      const why = !npc || moved ? 'The herd had wandered off before they got there.' : 'Other ants were already tending it.';
      m.result = { turnedBack: true };
      await addReport(q, m.worldId, m.playerId, 'herd', `Your tenders turned back from ${herd.name}`, { herd: herd.name, coords: m.target, turnedBack: true, why }, at);
      return { home: true };
    }
    const fresh = !npc.tender;
    const tender = npc.tender ?? { playerId: m.playerId, colonyId: m.originColonyId, since: at };
    herd = { ...herd, units: addCounts(herd.units, m.units), npc: { ...npc, tender, untendedSince: null } };
    await saveColony(q, herd);
    if (fresh) await scheduleDelivery(q, m.worldId, herd.id, tender.since, at);
    const home = await getColony(q, m.originColonyId);
    await addReport(q, m.worldId, m.playerId, 'herd', fresh ? `Your ants now tend ${herd.name} (${coordsKey(m.target)})` : `More tenders reached ${herd.name}`, {
      herd: herd.name, coords: m.target, colony: home.name, units: m.units, tenders: herd.units, claimed: fresh,
      nectarPerHour: herdNectarPerHour(herd.npc && isHerdState(herd.npc) ? herd.npc.level : 1), deliverEveryHours: HERDS.deliverEveryHours,
    }, at);
    m.result = { tending: true, claimed: fresh };
    m.units = {};
    return { home: false };
  },
});

// ---------- calling the tenders home ----------

/** The player calls their tenders home. They carry what honeydew they can and the herd is left untended. */
export async function recallTenders(q: Tx, playerId: number, herdId: number) {
  const t = now();
  let herd = await lockColony(q, herdId);
  const npc = herdOf(herd);
  if (!npc) throw notFound('That is not an aphid herd.');
  if (!npc.tender || npc.tender.playerId !== playerId) throw forbidden();
  herd = advance(herd, t);
  const units = herd.units;
  const home = await getColony(q, npc.tender.colonyId);
  const player = await getPlayer(q, playerId);
  const cargo = fillCargo(res(0, 0, Math.floor(herd.resources.nectar)), groupCargo(units));
  herd.resources = { ...herd.resources, nectar: herd.resources.nectar - cargo.nectar };
  await leaveHerd(q, herd, t);
  const world = await getWorld(q);
  const secs = travelSeconds(distance(herd, home), groupSpeed(units, player.research), 100, world.speed);
  const m = await launchReturn(q, {
    worldId: world.id, playerId, type: 'tend', home, from: herd, fromColonyId: herd.id, units, cargo, at: t, returnAt: t + secs * 1000,
    result: { calledHome: true, carried: cargo.nectar },
  });
  await refreshPointsAfterCommit(q, playerId);
  return m;
}

// ---------- events: deliveries and wandering ----------

/** Every few hours the tenders carry the honeydew home (instantly, as a relay along the trail). */
onEvent('herd_deliver', async (q, ev) => {
  const t = ev.due_at;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1', [ev.payload.colonyId]);
  if (!found.rows[0]) return;
  let herd = await syncNest(q, await lockColony(q, ev.payload.colonyId), t);
  const npc = herdOf(herd);
  if (!npc?.tender || npc.tender.since !== ev.payload.since) return; // the tenders changed: their own delivery runs
  const amount = Math.floor(herd.resources.nectar);
  if (amount > 0) {
    let home = advance(await lockColony(q, npc.tender.colonyId), t);
    home.resources = { ...home.resources, nectar: home.resources.nectar + amount };
    await saveColony(q, home);
    herd.resources = { ...herd.resources, nectar: herd.resources.nectar - amount };
  }
  await saveColony(q, herd);
  await scheduleDelivery(q, herd.worldId, herd.id, npc.tender.since, t);
});

/** An untended herd drifts to a free herd site in a nearby patch where players live, and keeps drifting until tended. */
onEvent('herd_wander', async (q, ev) => {
  const t = ev.due_at;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1', [ev.payload.colonyId]);
  if (!found.rows[0]) return;
  const herd = advance(await lockColony(q, ev.payload.colonyId), t);
  const npc = herdOf(herd);
  if (!npc || npc.tender || npc.untendedSince !== ev.payload.untendedSince) return;
  const spot = SITE_SPOTS.herd;
  const taken = await q.query(
    `SELECT patch, bool_or(spot = $3) AS herd, bool_or(npc IS NULL) AS players FROM colonies
      WHERE world_id = $1 AND region = $2 GROUP BY patch`,
    [herd.worldId, herd.region, spot],
  );
  const byPatch = new Map<number, { herd: boolean; players: boolean }>(taken.rows.map((r: any) => [r.patch, { herd: r.herd, players: r.players }]));
  const nearPlayers = (p: number) => {
    for (let d = -AREA_RANGE; d <= AREA_RANGE; d++) if (byPatch.get(p + d)?.players) return true;
    return false;
  };
  const options = nearbyPatches(herd.patch).filter((p) => p >= 1 && p <= WORLD.patchesPerRegion && !byPatch.get(p)?.herd && nearPlayers(p));
  if (options.length > 0) {
    const to = options[Math.floor(createRng(randomSeed())() * options.length)];
    await q.query('UPDATE colonies SET patch = $2 WHERE id = $1', [herd.id, to]);
    herd.patch = to;
  }
  // it keeps its level; its honeydew goes stale on the way
  herd.resources = res();
  herd.npc = { ...npc, untendedSince: t };
  await saveColony(q, herd);
  await scheduleWander(q, herd.worldId, herd.id, t);
});
