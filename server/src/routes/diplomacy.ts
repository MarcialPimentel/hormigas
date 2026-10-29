// Truces and supercolonies (docs/23-supercolonies.md).
import type { FastifyInstance } from 'fastify';
import { getPool, tx } from '../db';
import { requireAuth } from '../auth';
import { processDueEvents } from '../events';
import {
  answerInvite,
  answerTruce,
  diplomacyView,
  endTruce,
  foundSupercolony,
  invite,
  leaveSupercolony,
  proposeTruce,
  removeMember,
  withdrawInvite,
} from '../game/diplomacy';

const body = (req: any) => (req.body ?? {}) as Record<string, unknown>;
const idParam = (req: any) => Number((req.params as any).id);

export async function diplomacyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    await requireAuth(req);
    await processDueEvents();
  });

  /** Everything the Allies screen shows: your supercolony, invitations, truces and the players you've met. */
  app.get('/api/diplomacy', async (req) => diplomacyView(getPool(), req.playerId));

  app.post('/api/truces', async (req) => ({ ok: true, id: await tx((q) => proposeTruce(q, req.playerId, Number(body(req).playerId))) }));
  for (const answer of ['accept', 'decline', 'withdraw'] as const)
    app.post(`/api/truces/:id/${answer}`, async (req) => {
      await tx((q) => answerTruce(q, req.playerId, idParam(req), answer));
      return { ok: true };
    });
  app.post('/api/truces/:id/end', async (req) => {
    await tx((q) => endTruce(q, req.playerId, idParam(req)));
    return { ok: true };
  });

  app.post('/api/supercolony', async (req) => ({ ok: true, id: await tx((q) => foundSupercolony(q, req.playerId, String(body(req).name ?? ''))) }));
  app.post('/api/supercolony/invite', async (req) => {
    await tx((q) => invite(q, req.playerId, Number(body(req).playerId)));
    return { ok: true };
  });
  app.post('/api/supercolony/invite/withdraw', async (req) => {
    await tx((q) => withdrawInvite(q, req.playerId, Number(body(req).playerId)));
    return { ok: true };
  });
  app.post('/api/supercolony/:id/accept', async (req) => {
    await tx((q) => answerInvite(q, req.playerId, idParam(req), true));
    return { ok: true };
  });
  app.post('/api/supercolony/:id/decline', async (req) => {
    await tx((q) => answerInvite(q, req.playerId, idParam(req), false));
    return { ok: true };
  });
  app.post('/api/supercolony/leave', async (req) => {
    await tx((q) => leaveSupercolony(q, req.playerId));
    return { ok: true };
  });
  app.post('/api/supercolony/remove', async (req) => {
    await tx((q) => removeMember(q, req.playerId, Number(body(req).playerId)));
    return { ok: true };
  });
}
