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
      },
      colonies: colonies.map((c) => ({ id: c.id, name: c.name, coords: { region: c.region, patch: c.patch, spot: c.spot } })),
      colony: current ? colonyView(advance(current, t)) : null,
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
