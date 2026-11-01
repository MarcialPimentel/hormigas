// Windfalls (docs/25-windfalls.md): contested food that drops on each patch's windfall site.
// The site is a colony row owned by the hidden wild player, like an aphid herd. While a windfall lies there, the row's
// resources are the food left and its units are whoever holds it: wild ants that got there first, or a player's ants
// (npc.tender, the same shape as a herd's tenders). Claiming means fighting whoever is there, then holding it and
// carrying a load home every few hours until it is gone or rots.
import {
  AREA_RANGE,
  WINDFALLS,
  coordsKey,
  createRng,
  distance,
  fillCargo,
  groupCargo,
  groupSpeed,
  isInactive,
  isWindfallState,
  nextWindfallHours,
  presentUnits,
  randomSeed,
  res,
  rollWindfall,
  sub,
  add,
  travelSeconds,
  addCounts,
  windfallGuards,
  windfallName,
  windfallPile,
  type Resources,
  type WindfallState,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError } from '../errors';
import { advance, getColony, getPlayer, lockColony, saveColony, type Colony } from '../colony';
import { onEvent, schedule } from '../events';
import { recurringColonyEvent } from '../recurring';
import { gameHoursMs, getWorld } from '../world';
import { defineMission, launchReturn, type Mission } from './missions';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { syncNest } from './nests';
import { raidBlock } from './diplomacy';
import { resolveRaid } from './combat';
import { bump, foodIn } from './stats';

export const windfallOf = (c: Colony | null): WindfallState | null => (c && isWindfallState(c.npc) ? c.npc : null);

const floorRes = (r: Resources) => res(Math.floor(r.foliage), Math.floor(r.protein), Math.floor(r.nectar));
const isEmpty = (r: Resources) => Math.floor(r.foliage) + Math.floor(r.protein) + Math.floor(r.nectar) <= 0;
const coordsOf = (c: Colony) => ({ region: c.region, patch: c.patch, spot: c.spot });

/** The windfall is gone (eaten or rotted): the site is empty until the next one drops. */
async function clearSite(q: Tx, site: Colony) {
  const npc = windfallOf(site)!;
  site.units = {};
  site.resources = res();
  site.name = WINDFALLS.name;
  site.npc = { ...npc, tender: null, drop: null };
  await saveColony(q, site);
  await q.query('UPDATE colonies SET name = $2 WHERE id = $1', [site.id, site.name]);
}

/** The ants holding a windfall walk home to their colony, carrying `cargo`. */
async function holdersGoHome(q: Tx, site: Colony, cargo: Resources, at: number, result: object) {
  const npc = windfallOf(site)!;
  if (!npc.tender || presentUnits(site.units).length === 0) return;
  const home = await getColony(q, npc.tender.colonyId);
  const player = await getPlayer(q, npc.tender.playerId);
  const world = await getWorld(q);
  const secs = travelSeconds(distance(site, home), groupSpeed(site.units, player.research), 100, world.speed);
  await launchReturn(q, {
    worldId: world.id, playerId: player.id, type: 'claim', home, from: site, fromColonyId: site.id, units: site.units, cargo, at, returnAt: at + secs * 1000, result,
  });
  await refreshPointsAfterCommit(q, player.id);
}

async function scheduleDelivery(q: Q, worldId: number, siteId: number, since: number, from: number) {
  const speed = (await getWorld(q)).speed;
  await schedule(q, worldId, 'windfall_deliver', from + gameHoursMs(WINDFALLS.deliverEveryHours, speed), { colonyId: siteId, since });
}

/**
 * Active players with a colony within announceRange patches (same region) of the site: who hears about a new windfall.
 * Inactive players hear nothing, and a site with nobody active nearby drops nothing.
 */
async function playersNear(q: Q, site: Colony, t: number): Promise<number[]> {
  const range = Math.min(WINDFALLS.announceRange, AREA_RANGE);
  const r = await q.query(
    `SELECT DISTINCT p.id, p.points_total, p.protected_until, p.last_active
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND c.region = $2 AND c.patch BETWEEN $3 AND $4 AND NOT p.is_npc`,
    [site.worldId, site.region, site.patch - range, site.patch + range],
  );
  return r.rows
    .filter((row: any) => !isInactive({ points: row.points_total, protectedUntil: Number(row.protected_until), lastActive: Number(row.last_active) }, t))
    .map((row: any) => Number(row.id));
}

// ---------- a new windfall drops ----------

const drops = recurringColonyEvent('windfall_drop', {
  where: `c.npc->>'kind' = 'windfall'`,
  gapHours: () => nextWindfallHours(createRng(randomSeed())),
  async run(q, ev, { id }) {
    const t = ev.due_at;
    let site = await syncNest(q, await lockColony(q, id), t);
    const npc = windfallOf(site);
    if (!npc || npc.drop) return; // the last one is still there
    const near = await playersNear(q, site, t);
    if (near.length === 0) return;

    const roll = rollWindfall(createRng(randomSeed()));
    const pile = windfallPile(roll.kind, npc.level);
    const world = await getWorld(q);
    const endsAt = t + gameHoursMs(WINDFALLS.lastsHours, world.speed);
    const drop = { kind: roll.kind, startedAt: t, endsAt, pile, guarded: roll.guarded };
    site = { ...site, units: roll.guarded ? windfallGuards(npc.level) : {}, resources: pile, npc: { ...npc, tender: null, drop } };
    site.name = windfallName(site.npc as WindfallState);
    await saveColony(q, site);
    await q.query('UPDATE colonies SET name = $2 WHERE id = $1', [site.id, site.name]);
    await schedule(q, world.id, 'windfall_rot', endsAt, { colonyId: site.id, startedAt: t });

    const def = WINDFALLS.kinds[roll.kind];
    const coords = coordsOf(site);
    for (const playerId of near) {
      await addReport(q, world.id, playerId, 'windfall', `${def.name} in the wilds (${coordsKey(coords)})`, {
        event: 'windfall', kind: roll.kind, windfall: def.name, text: def.text, coords, pile, guarded: roll.guarded, endsAt,
      }, t);
    }
  },
});

/** Give every windfall site without a pending drop one (startup; also covers sites whose event was lost). */
export const ensureWindfallDrops = drops.ensure;

// ---------- holding it: loads home, and rotting ----------

/** Every few hours the holders carry a load home: as much as they can carry. When nothing is left they all go home. */
onEvent('windfall_deliver', async (q, ev) => {
  const t = ev.due_at;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1', [ev.payload.colonyId]);
  if (!found.rows[0]) return;
  let site = advance(await lockColony(q, ev.payload.colonyId), t);
  const npc = windfallOf(site);
  if (!npc?.drop || !npc.tender || npc.tender.since !== ev.payload.since) return; // gone, or the holders changed
  const load = fillCargo(floorRes(site.resources), groupCargo(site.units));
  if (!isEmpty(load)) {
    const home = advance(await lockColony(q, npc.tender.colonyId), t);
    home.resources = add(home.resources, load);
    await saveColony(q, home);
    await bump(q, npc.tender.playerId, 'food_home', foodIn(load));
    site.resources = sub(site.resources, load);
  }
  if (isEmpty(site.resources)) {
    const name = site.name;
    await addReport(q, site.worldId, npc.tender.playerId, 'windfall', `Your ants stripped the ${name.toLowerCase()} clean`, {
      event: 'windfall_done', windfall: name, coords: coordsOf(site), delivered: load, done: 'eaten',
    }, t);
    await holdersGoHome(q, site, res(), t, { stripped: true });
    await clearSite(q, site);
    return;
  }
  await saveColony(q, site);
  await scheduleDelivery(q, site.worldId, site.id, npc.tender.since, t);
});

/** The windfall rots. Whoever holds it carries one last load home; the rest is lost. */
onEvent('windfall_rot', async (q, ev) => {
  const t = ev.due_at;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1', [ev.payload.colonyId]);
  if (!found.rows[0]) return;
  const site = advance(await lockColony(q, ev.payload.colonyId), t);
  const npc = windfallOf(site);
  if (!npc?.drop || npc.drop.startedAt !== ev.payload.startedAt) return;
  if (npc.tender && presentUnits(site.units).length > 0) {
    const cargo = fillCargo(floorRes(site.resources), groupCargo(site.units));
    await addReport(q, site.worldId, npc.tender.playerId, 'windfall', `The ${site.name.toLowerCase()} rotted away`, {
      event: 'windfall_done', windfall: site.name, coords: coordsOf(site), carried: cargo, done: 'rotted',
    }, t);
    await holdersGoHome(q, site, cargo, t, { rotted: true, carried: cargo });
  }
  await clearSite(q, site);
});

// ---------- the Claim mission ----------

defineMission('claim', {
  async validate({ q, player, colony, targetColony, units, t }) {
    const npc = windfallOf(targetColony);
    if (!targetColony || !npc) throw new GameError('bad_target', 'Only windfalls can be claimed. Tap a windfall in the wilds.');
    if (!npc.drop) throw new GameError('windfall_gone', 'Nothing lies there right now. Windfalls drop every few hours.');
    if (presentUnits(units).length === 0) throw new GameError('no_units', 'Pick at least one unit to send.');
    if (npc.tender?.playerId === player.id && npc.tender.colonyId !== colony.id)
      throw new GameError('windfall_yours', 'Ants from another of your colonies already hold it. Send more from that colony.');
    // truces and supercolonies hold here too: no fighting a partner's ants for food (docs/23-supercolonies.md)
    if (npc.tender && npc.tender.playerId !== player.id) {
      const pact = await raidBlock(q, player.id, npc.tender.playerId, t);
      if (pact) throw new GameError(pact.code, pact.message);
    }
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    let site = await syncNest(q, await lockColony(q, m.targetColonyId), at);
    let npc = windfallOf(site);
    if (!npc?.drop) {
      m.result = { turnedBack: true };
      await addReport(q, m.worldId, m.playerId, 'windfall', 'Your ants found nothing left to claim', {
        event: 'windfall_turned_back', coords: m.target, why: 'It was gone before they got there.', turnedBack: true,
      }, at);
      return { home: true };
    }
    const held = presentUnits(site.units).length > 0;
    const ours = npc.tender?.playerId === m.playerId && npc.tender.colonyId === m.originColonyId;
    if (held && !ours && npc.tender?.playerId === m.playerId) {
      m.result = { turnedBack: true };
      await addReport(q, m.worldId, m.playerId, 'windfall', `Your ants turned back from the ${site.name.toLowerCase()}`, {
        event: 'windfall_turned_back', windfall: site.name, coords: m.target, why: 'Ants from another of your colonies already hold it.', turnedBack: true,
      }, at);
      return { home: true };
    }
    if (held && !ours) {
      if (npc.tender) {
        // a pact agreed on the way: they won't fight a partner's ants (docs/23-supercolonies.md)
        const pact = await raidBlock(q, m.playerId, npc.tender.playerId, at);
        if (pact) {
          m.result = { turnedBack: true, pact: pact.code };
          await addReport(q, m.worldId, m.playerId, 'windfall', `Your ants turned back from the ${site.name.toLowerCase()}`, {
            event: 'windfall_turned_back', windfall: site.name, coords: m.target, why: pact.message, turnedBack: true,
          }, at);
          return { home: true };
        }
      }
      // fight whoever is there, under the normal battle rules (docs/08-combat.md); the dead stay on the field
      await resolveRaid(q, m, at);
      const won = (m.result as { winner?: string } | null)?.winner === 'attacker';
      site = await lockColony(q, m.targetColonyId);
      npc = windfallOf(site);
      // what the winners grabbed in the fight goes back on the pile: they're staying to haul it
      if (m.cargo && !isEmpty(m.cargo)) site.resources = add(site.resources, m.cargo);
      m.cargo = res();
      if (!won || !npc?.drop || presentUnits(m.units).length === 0 || presentUnits(site.units).length > 0) {
        await saveColony(q, site);
        return { home: presentUnits(m.units).length > 0 };
      }
    }
    return hold(q, m, site, at);
  },
});

/** The party takes (or joins) the hold on a windfall. */
async function hold(q: Tx, m: Mission, site: Colony, at: number) {
  const npc = windfallOf(site)!;
  const fresh = !npc.tender || npc.tender.playerId !== m.playerId || npc.tender.colonyId !== m.originColonyId;
  const tender = fresh ? { playerId: m.playerId, colonyId: m.originColonyId, since: at } : npc.tender!;
  site = { ...site, units: addCounts(fresh ? {} : site.units, m.units), npc: { ...npc, tender } };
  await saveColony(q, site);
  if (fresh) {
    await scheduleDelivery(q, m.worldId, site.id, tender.since, at);
    await bump(q, m.playerId, 'windfalls_claimed');
    if (npc.drop?.kind) await bump(q, m.playerId, `windfall:${npc.drop.kind}`);
  }
  const home = await getColony(q, m.originColonyId);
  await addReport(q, m.worldId, m.playerId, 'windfall', fresh ? `Your ants hold the ${site.name.toLowerCase()} (${coordsKey(m.target)})` : `More of your ants reached the ${site.name.toLowerCase()}`, {
    event: 'windfall_held', windfall: site.name, coords: m.target, colony: home.name, units: m.units, holders: site.units, claimed: fresh,
    left: floorRes(site.resources), carryPerLoad: groupCargo(site.units), deliverEveryHours: WINDFALLS.deliverEveryHours, endsAt: npc.drop!.endsAt,
  }, at);
  m.result = { ...(m.result ?? {}), holding: true, claimed: fresh };
  m.units = {};
  await refreshPointsAfterCommit(q, m.playerId);
  return { home: false };
}
