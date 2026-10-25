// Map, missions and reports routes.
import type { FastifyInstance } from 'fastify';
import { WORLD, isInactive, isNewPlayerProtected, corpseFieldAmount } from '@hormigas/shared';
import { getPool, tx } from '../db';
import { now } from '../clock';
import { requireAuth } from '../auth';
import { GameError } from '../errors';
import { processDueEvents } from '../events';
import { getWorld } from '../world';
import { missionView, recallMission, sendMission } from '../game/missions';

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
      `SELECT c.id, c.name, c.spot, c.player_id, p.username, p.points_total, p.protected_until, p.last_active
         FROM colonies c JOIN players p ON p.id = c.player_id
        WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3 ORDER BY c.spot`,
      [world.id, region, patch],
    );
    const hasCorpses = (await q.query("SELECT to_regclass('corpse_fields') IS NOT NULL AS ok")).rows[0].ok;
    const corpses = hasCorpses
      ? (await q.query('SELECT spot, protein, created_at FROM corpse_fields WHERE world_id = $1 AND region = $2 AND patch = $3', [world.id, region, patch])).rows
      : [];
    const spots = [];
    for (let spot = 1; spot <= WORLD.spotsPerPatch + 1; spot++) {
      const c = r.rows.find((x: any) => x.spot === spot);
      const corpse = corpses.find((x: any) => x.spot === spot);
      spots.push({
        spot,
        colony: c
          ? {
              id: c.id,
              name: c.name,
              playerId: c.player_id,
              owner: c.username,
              points: c.points_total,
              mine: c.player_id === req.playerId,
              inactive: isInactive({ points: c.points_total, protectedUntil: c.protected_until, lastActive: c.last_active }, t),
              protected: isNewPlayerProtected({ points: c.points_total, protectedUntil: c.protected_until, lastActive: c.last_active }, t),
            }
          : null,
        corpses: corpse ? corpseFieldAmount(corpse.protein, corpse.created_at, t) : 0,
      });
    }
    return { region, patch, spots };
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
