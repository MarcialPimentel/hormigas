// More colonies (docs/19-colonies.md): creating a colony, and the Found Colony mission that a Winged Queen flies.
import {
  RESOURCES_DATA,
  TERRAIN,
  WORLD,
  add,
  coordsKey,
  createRng,
  lvl,
  maxColonies,
  randInt,
  randomSeed,
  res,
  subCounts,
  terrainForSpot,
  type Coords,
  type Resources,
  type TerrainId,
  type UnitCounts,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError } from '../errors';
import { colonyAt, getPlayer } from '../colony';
import { defineMission } from './missions';
import { addReport } from './reports';
import { ensureArea } from './nests';
import { scheduleNestEvent } from './nestEvents';
import { scheduleSwarm } from './swarms';
import { refreshPointsAfterCommit } from './points';

/**
 * Insert a player colony with Queen's Chamber 1 and the starting stores (plus `extra`), arm its nest events,
 * and make sure its patch has a wild nest. Used by sign-up and by Found Colony.
 */
export async function createColony(
  q: Tx,
  o: { worldId: number; playerId: number; name: string; at: Coords; terrain: TerrainId; baseSpace: number; t: number; extra?: Resources; units?: UnitCounts },
): Promise<number> {
  const stores = add(RESOURCES_DATA.startingResources as Resources, o.extra ?? res());
  const r = await q.query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated, chambers, units, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$12) RETURNING id`,
    [o.worldId, o.playerId, o.name, o.at.region, o.at.patch, o.at.spot, o.terrain, o.baseSpace,
      stores.foliage, stores.protein, stores.nectar, o.t, JSON.stringify({ queen_chamber: 1 }), JSON.stringify(o.units ?? {})],
  );
  const id = r.rows[0].id as number;
  await scheduleNestEvent(q, o.worldId, id, o.t);
  await scheduleSwarm(q, o.worldId, id, o.t);
  // the area around players fills with wild things: nests, aphid herds, termite mounds, spider dens (docs/23-npcs.md)
  await ensureArea(q, o.worldId, o.at.region, o.at.patch, o.t);
  return id;
}

/** Colonies the player holds plus queens already in the air: what counts against the cap. */
async function coloniesClaimed(q: Q, playerId: number, excludeMissionId?: number): Promise<number> {
  const r = await q.query(
    `SELECT (SELECT count(*)::int FROM colonies WHERE player_id = $1)
          + (SELECT count(*)::int FROM missions WHERE player_id = $1 AND type = 'colonize' AND status = 'outbound' AND id <> $2) AS n`,
    [playerId, excludeMissionId ?? 0],
  );
  return r.rows[0].n;
}

const CAP_MESSAGE = (max: number) =>
  `You can rule ${max} ${max === 1 ? 'colony' : 'colonies'} right now. Research more Nuptial Flight to found another.`;

defineMission('colonize', {
  allowsCargo: true,
  slot: 'mission',
  async validate({ q, player, units, target, targetColony }) {
    if (lvl(units, 'winged_queen') !== 1) throw new GameError('one_queen', 'Send exactly one Winged Queen to found a colony.');
    if (targetColony) throw new GameError('bad_target', 'That spot is taken. Pick an empty one.');
    if (target.spot > WORLD.spotsPerPatch) throw new GameError('bad_target', 'A colony needs a real spot (1–12).');
    if (!TERRAIN[terrainForSpot(target.spot)]) throw new GameError('bad_target', 'A colony needs a real spot (1–12).');
    const max = maxColonies(player.research);
    if ((await coloniesClaimed(q, player.id)) >= max) throw new GameError('colony_cap', CAP_MESSAGE(max));
  },
  async arrive(q, m, at) {
    const player = await getPlayer(q, m.playerId);
    const where = coordsKey(m.target);
    const taken = await colonyAt(q, m.worldId, m.target.region, m.target.patch, m.target.spot);
    const max = maxColonies(player.research);
    const over = (await coloniesClaimed(q, m.playerId, m.id)) >= max;
    if (taken || over) {
      const why = taken ? 'Someone settled the spot first.' : CAP_MESSAGE(max);
      await addReport(q, m.worldId, m.playerId, 'colonize', `The Winged Queen turned back from ${where}`, { target: m.target, founded: false, why }, at);
      m.result = { founded: false, why };
      return { home: true };
    }

    const n = (await q.query('SELECT count(*)::int AS n FROM colonies WHERE player_id = $1', [m.playerId])).rows[0].n + 1;
    const terrain = terrainForSpot(m.target.spot);
    const [lo, hi] = TERRAIN[terrain].space;
    const escorts = Object.fromEntries(Object.entries(subCounts(m.units, { winged_queen: 1 })).filter(([, k]) => (k ?? 0) > 0)) as UnitCounts;
    const name = `${player.username}'s Nest ${n}`;
    const id = await createColony(q, {
      worldId: m.worldId, playerId: m.playerId, name, at: m.target, terrain,
      baseSpace: randInt(createRng(randomSeed()), lo, hi), t: at, extra: m.cargo, units: escorts,
    });
    await addReport(q, m.worldId, m.playerId, 'colonize', `New colony founded at ${where}`, {
      target: m.target, founded: true, colonyId: id, name, terrain: TERRAIN[terrain].name, units: escorts, cargo: m.cargo,
    }, at);
    m.result = { founded: true, colonyId: id };
    m.units = {};
    m.cargo = res();
    await refreshPointsAfterCommit(q, m.playerId);
    return { home: false };
  },
});

