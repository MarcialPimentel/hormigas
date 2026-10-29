import type { FastifyInstance } from 'fastify';
import { getPool, tx } from '../db';
import { now } from '../clock';
import { requireAuth } from '../auth';
import { GameError } from '../errors';
import { advance, getPlayer, playerColonies, lockOwnColony, saveColony, type Colony } from '../colony';
import { processDueEvents } from '../events';
import { getWorld } from '../world';
import { cancelBuild, startBuild } from '../game/chambers';
import { timeMultiplier } from '../game/boost';
import { cancelResearch, startResearch } from '../game/research';
import { enqueueUnits, startDigestion, stopDigestion } from '../game/brood';
import { activeMissions, incomingMissions, missionView } from '../game/missions';
import { claimQuest, questStatus } from '../game/quests';
import { hasForagedBefore } from '../game/forage';
import { membershipOf } from '../game/diplomacy';
import { isInactive } from '@hormigas/shared';

export function colonyView(c: Colony) {
  return {
    id: c.id,
    name: c.name,
    coords: { region: c.region, patch: c.patch, spot: c.spot },
    terrain: c.terrain,
    baseSpace: c.baseSpace,
    resources: c.resources,
    lastUpdated: c.lastUpdated,
    chambers: c.chambers,
    units: c.units,
    defenses: c.defenses,
    buildJob: c.buildJob,
    unitQueue: c.unitQueue,
    digestJob: c.digestJob ?? null,
    research: c.research,
  };
}

export const colonyIdParam = (p: any): number => {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0) throw new GameError('bad_id', 'Bad colony id.');
  return id;
};

export async function gameRoutes(app: FastifyInstance) {
  // Every game route: logged in, and the world is caught up before we read or change anything.
  app.addHook('preHandler', async (req) => {
    await requireAuth(req);
    await processDueEvents();
  });

  /** Everything the client needs to render: player, colony list, and one colony in full. */
  app.get('/api/state', async (req) => {
    const q = getPool();
    const t = now();
    const world = await getWorld(q);
    const player = await getPlayer(q, req.playerId);
    const colonies = await playerColonies(q, req.playerId);
    const wanted = Number((req.query as any).colony);
    const current = colonies.find((c) => c.id === wanted) ?? colonies[0];
    return {
      serverNow: t,
      world: { id: world.id, name: world.name, speed: world.speed },
      player: {
        id: player.id,
        username: player.username,
        research: player.research,
        researchJob: player.researchJob,
        points: player.points,
        protectedUntil: player.protectedUntil,
        timeMultiplier: await timeMultiplier(q, world.id, player.points.total, t),
        isAdmin: player.isAdmin,
        /** The next forage party is sure to find food (docs/09-missions.md). */
        firstForage: !(await hasForagedBefore(q, req.playerId)),
        /** the supercolony you belong to, if any (docs/23-supercolonies.md) */
        supercolony: await membershipOf(q, req.playerId),
        /** truce offers and supercolony invitations waiting for your answer */
        pendingDiplomacy: (
          await q.query(
            `SELECT (SELECT count(*)::int FROM truces WHERE (player_a = $1 OR player_b = $1) AND proposed_by <> $1 AND status = 'proposed')
                  + (SELECT count(*)::int FROM supercolony_invites WHERE player_id = $1) AS n`,
            [req.playerId],
          )
        ).rows[0].n,
      },
      colonies: colonies.map((c) => ({ id: c.id, name: c.name, coords: { region: c.region, patch: c.patch, spot: c.spot } })),
      colony: current ? colonyView(advance(current, t)) : null,
      missions: (await activeMissions(q, req.playerId)).map(missionView),
      incoming: await incomingMissions(q, req.playerId),
      quests: await questStatus(q, req.playerId),
      unreadReports: (await q.query('SELECT count(*)::int AS n FROM reports WHERE player_id = $1 AND NOT read', [req.playerId])).rows[0].n,
    };
  });

  app.post('/api/colonies/:id/build', async (req) => {
    const body = (req.body ?? {}) as any;
    const c = await tx((q) => startBuild(q, req.playerId, colonyIdParam(req.params), String(body.chamber ?? '')));
    return { ok: true, colony: colonyView(c) };
  });

  app.post('/api/colonies/:id/build/cancel', async (req) => {
    const c = await tx((q) => cancelBuild(q, req.playerId, colonyIdParam(req.params)));
    return { ok: true, colony: colonyView(c) };
  });

  app.post('/api/research', async (req) => {
    const body = (req.body ?? {}) as any;
    await tx((q) => startResearch(q, req.playerId, Number(body.colonyId), String(body.research ?? '')));
    return { ok: true };
  });

  app.post('/api/research/cancel', async (req) => {
    await tx((q) => cancelResearch(q, req.playerId));
    return { ok: true };
  });

  app.post('/api/colonies/:id/brood', async (req) => {
    const body = (req.body ?? {}) as any;
    const c = await tx((q) => enqueueUnits(q, req.playerId, colonyIdParam(req.params), String(body.kind ?? ''), String(body.id ?? ''), Number(body.count), body.feed));
    return { ok: true, colony: colonyView(c) };
  });

  app.post('/api/colonies/:id/digest', async (req) => {
    const body = (req.body ?? {}) as any;
    const c = await tx((q) => startDigestion(q, req.playerId, colonyIdParam(req.params), Number(body.protein)));
    return { ok: true, colony: colonyView(c) };
  });

  app.post('/api/colonies/:id/digest/stop', async (req) => {
    const c = await tx((q) => stopDigestion(q, req.playerId, colonyIdParam(req.params)));
    return { ok: true, colony: colonyView(c) };
  });

  app.post('/api/quests/claim', async (req) => {
    const body = (req.body ?? {}) as any;
    const quest = await tx((q) => claimQuest(q, req.playerId, String(body.id ?? ''), Number(body.colonyId)));
    return { ok: true, reward: quest.reward };
  });

  app.get('/api/rankings', async (req) => {
    const qs = req.query as any;
    const kind = ['total', 'economy', 'research', 'military'].includes(qs.kind) ? qs.kind : 'total';
    const page = Math.max(1, Number(qs.page) || 1);
    const size = 50;
    const q = getPool();
    const world = await getWorld(q);
    const t = now();
    const order = kind === 'total' ? 'points_total' : `(points->>'${kind}')::int`;
    const r = await q.query(
      `SELECT id, username, points, points_total, last_active, protected_until,
              (SELECT count(*)::int FROM colonies c WHERE c.player_id = p.id) AS colonies,
              rank() OVER (ORDER BY ${order} DESC, id) AS rank
         FROM players p WHERE world_id = $1 AND NOT is_npc ORDER BY ${order} DESC, id LIMIT $2 OFFSET $3`,
      [world.id, size, (page - 1) * size],
    );
    const mine = await q.query(
      `SELECT rank FROM (SELECT id, rank() OVER (ORDER BY ${order} DESC, id) AS rank FROM players WHERE world_id = $1 AND NOT is_npc) x WHERE id = $2`,
      [world.id, req.playerId],
    );
    const count = (await q.query('SELECT count(*)::int AS n FROM players WHERE world_id = $1 AND NOT is_npc', [world.id])).rows[0].n;
    return {
      kind,
      page,
      pages: Math.max(1, Math.ceil(count / size)),
      myRank: Number(mine.rows[0]?.rank ?? 0),
      rows: r.rows.map((x: any) => ({
        rank: Number(x.rank),
        playerId: x.id,
        username: x.username,
        points: kind === 'total' ? x.points_total : x.points[kind] ?? 0,
        colonies: x.colonies,
        inactive: isInactive({ points: x.points_total, protectedUntil: x.protected_until, lastActive: x.last_active }, t),
        me: x.id === req.playerId,
      })),
    };
  });

  app.patch('/api/colonies/:id', async (req) => {
    const name = String(((req.body ?? {}) as any).name ?? '').trim();
    if (name.length < 1 || name.length > 30) throw new GameError('bad_name', 'Name must be 1–30 characters.');
    const c = await tx(async (q) => {
      const col = advance(await lockOwnColony(q, colonyIdParam(req.params), req.playerId), now());
      col.name = name;
      await saveColony(q, col);
      return col;
    });
    return { ok: true, colony: colonyView(c) };
  });
}
