// Map, missions and reports routes.
import type { FastifyInstance } from 'fastify';
import { WORLD, SPECIES, SCENT_NAME, isInactive, isNewPlayerProtected, corpseFieldAmount, nestLevelFor } from '@hormigas/shared';
import { leaderOf } from '../game/nests';
import { knowledgeOf, type KnownEntry } from '../game/discovery';
import { relationsOf, supercolonyTags } from '../game/diplomacy';
import type { RelationInfo } from '@hormigas/shared';
import { getPool, tx } from '../db';
import { now } from '../clock';
import { requireAuth } from '../auth';
import { GameError } from '../errors';
import { processDueEvents } from '../events';
import { getWorld } from '../world';
import { missionView, recallMission, sendMission } from '../game/missions';

/**
 * One colony on the map, as this player knows it (docs/22-discovery.md).
 * A scent shows only whose ants it smells of; a familiar scent adds its name; a known colony shows everything.
 */
function colonyView(c: any, k: KnownEntry, leader: number, t: number, rel?: RelationInfo, tag?: { id: number; name: string }) {
  const kind = c.npc ? 'wild' : 'player';
  const base = { known: k.knowledge, kind, smelledAt: k.smelledAt, discoveredAt: k.discoveredAt };
  const species = c.npc ? SPECIES[c.npc.species as keyof typeof SPECIES] : null;
  const owner = species ? species.name : c.username;
  if (k.knowledge === 'scent') return { ...base, id: null, name: SCENT_NAME[kind as 'player' | 'wild'], owner: null };
  if (k.knowledge === 'familiar') return { ...base, id: null, name: c.name, owner };
  const pvp = { points: c.points_total, protectedUntil: c.protected_until, lastActive: c.last_active };
  return {
    ...base,
    id: c.id,
    name: c.name,
    playerId: c.player_id,
    owner,
    points: species ? 0 : c.points_total,
    mine: k.knowledge === 'mine',
    inactive: !species && isInactive(pvp, t),
    protected: !species && isNewPlayerProtected(pvp, t),
    // truces and supercolonies (docs/23-supercolonies.md)
    ...(rel ? { relation: rel.relation, relationUntil: rel.until ?? null } : {}),
    ...(tag ? { supercolony: tag.name } : {}),
    ...(species ? { wild: { species: c.npc.species, level: nestLevelFor(leader, c.npc.level), style: species.style } } : {}),
  };
}

export async function worldRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    await requireAuth(req);
    await processDueEvents();
  });

  app.get('/api/map', async (req) => {
    const qs = req.query as any;
    const region = Number(qs.region);
    const patch = Number(qs.patch);
    if (!(region >= 1 && region <= WORLD.regions && patch >= 1 && patch <= WORLD.patchesPerRegion))
      throw new GameError('bad_coords', 'That patch does not exist.');
    const q = getPool();
    const world = await getWorld(q);
    const t = now();
    const r = await q.query(
      `SELECT c.id, c.name, c.spot, c.player_id, c.npc, p.username, p.points_total, p.protected_until, p.last_active
         FROM colonies c JOIN players p ON p.id = c.player_id
        WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3 ORDER BY c.spot`,
      [world.id, region, patch],
    );
    const hasCorpses = (await q.query("SELECT to_regclass('corpse_fields') IS NOT NULL AS ok")).rows[0].ok;
    const corpses = hasCorpses
      ? (await q.query('SELECT spot, protein, created_at FROM corpse_fields WHERE world_id = $1 AND region = $2 AND patch = $3', [world.id, region, patch])).rows
      : [];
    // a wild nest's level follows the strongest active player in its patch
    const leader = leaderOf(r.rows.filter((x: any) => !x.npc), t);
    const known = await knowledgeOf(q, req.playerId, r.rows.map((x: any) => x.id));
    const owners = [...new Set(r.rows.filter((x: any) => !x.npc).map((x: any) => x.player_id as number))];
    const rels = await relationsOf(q, req.playerId, owners, t);
    const tags = await supercolonyTags(q, owners);
    const spots = [];
    for (let spot = 1; spot <= WORLD.spotsPerPatch + 1; spot++) {
      const c = r.rows.find((x: any) => x.spot === spot);
      const corpse = corpses.find((x: any) => x.spot === spot);
      spots.push({
        spot,
        colony: c ? colonyView(c, known.get(c.id)!, leader, t, rels.get(c.player_id), tags.get(c.player_id)) : null,
        corpses: corpse ? corpseFieldAmount(corpse.protein, corpse.created_at, t) : 0,
      });
    }
    return { region, patch, spots };
  });

  /** Which patches of a region have colonies: counts only, so players can find each other without seeing more. */
  app.get('/api/map/region', async (req) => {
    const region = Number((req.query as any).region);
    if (!(Number.isInteger(region) && region >= 1 && region <= WORLD.regions)) throw new GameError('bad_coords', 'That region does not exist.');
    const world = await getWorld(getPool());
    const r = await getPool().query(
      `SELECT patch,
              count(*) FILTER (WHERE npc IS NULL)::int AS colonies,
              bool_or(npc IS NOT NULL) AS wild,
              bool_or(npc IS NULL AND player_id = $3) AS mine
         FROM colonies WHERE world_id = $1 AND region = $2 GROUP BY patch ORDER BY patch`,
      [world.id, region, req.playerId],
    );
    return { region, patches: r.rows.map((x: any) => ({ patch: x.patch, colonies: x.colonies, wild: x.wild, mine: x.mine })) };
  });

  /**
   * The next patch, going one way through the world (region by region), that holds another player's colony.
   * Wild nests don't count: every inhabited patch has one. Wraps around the world.
   */
  app.get('/api/map/nearest', async (req) => {
    const qs = req.query as any;
    const region = Number(qs.region);
    const patch = Number(qs.patch);
    const dir = Number(qs.dir) < 0 ? -1 : 1;
    if (!(region >= 1 && region <= WORLD.regions && patch >= 1 && patch <= WORLD.patchesPerRegion))
      throw new GameError('bad_coords', 'That patch does not exist.');
    const q = getPool();
    const world = await getWorld(q);
    const P = WORLD.patchesPerRegion;
    const here = (region - 1) * P + patch;
    const idx = `((region - 1) * ${P} + patch)`;
    const pick = async (where: string, args: number[]) =>
      (
        await q.query(
          `SELECT region, patch FROM colonies
            WHERE world_id = $1 AND npc IS NULL AND player_id <> $2 AND ${where}
            ORDER BY ${idx} ${dir > 0 ? 'ASC' : 'DESC'} LIMIT 1`,
          [world.id, req.playerId, ...args],
        )
      ).rows[0];
    const row = (await pick(`${idx} ${dir > 0 ? '>' : '<'} $3`, [here])) ?? (await pick(`${idx} <> $3`, [here]));
    return { found: row ? { region: row.region, patch: row.patch } : null };
  });

  app.post('/api/missions', async (req) => {
    const m = await tx((q) => sendMission(q, req.playerId, (req.body ?? {}) as any));
    return { ok: true, mission: missionView(m) };
  });

  app.post('/api/missions/:id/recall', async (req) => {
    const m = await tx((q) => recallMission(q, req.playerId, Number((req.params as any).id)));
    return { ok: true, mission: missionView(m) };
  });

  app.get('/api/reports', async (req) => {
    const qs = req.query as any;
    const limit = Math.min(100, Math.max(1, Number(qs.limit) || 50));
    const before = Number(qs.before) || Number.MAX_SAFE_INTEGER;
    const r = await getPool().query(
      'SELECT id, type, title, data, created_at, read FROM reports WHERE player_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3',
      [req.playerId, before, limit],
    );
    return { reports: r.rows.map((x: any) => ({ id: x.id, type: x.type, title: x.title, data: x.data, createdAt: x.created_at, read: x.read })) };
  });

  app.post('/api/reports/read', async (req) => {
    const ids = ((req.body ?? {}) as any).ids;
    if (Array.isArray(ids) && ids.length) await getPool().query('UPDATE reports SET read = true WHERE player_id = $1 AND id = ANY($2::bigint[])', [req.playerId, ids.map(Number)]);
    else await getPool().query('UPDATE reports SET read = true WHERE player_id = $1', [req.playerId]);
    return { ok: true };
  });

  app.post('/api/reports/delete', async (req) => {
    const ids = ((req.body ?? {}) as any).ids;
    if (!Array.isArray(ids)) throw new GameError('bad_ids', 'Pick reports to delete.');
    await getPool().query('DELETE FROM reports WHERE player_id = $1 AND id = ANY($2::bigint[])', [req.playerId, ids.map(Number)]);
    return { ok: true };
  });

  /** Latest scout report you have on a colony spot (for the battle preview). */
  app.get('/api/intel', async (req) => {
    const qs = req.query as any;
    const key = `${Number(qs.region)}:${Number(qs.patch)}:${Number(qs.spot)}`;
    const r = await getPool().query(
      "SELECT id, data, created_at FROM reports WHERE player_id = $1 AND type = 'scout' AND title LIKE '%(' || $2 || ')' ORDER BY id DESC LIMIT 1",
      [req.playerId, key],
    );
    const row = r.rows[0];
    return { intel: row ? { reportId: row.id, at: row.created_at, data: row.data } : null };
  });
}
