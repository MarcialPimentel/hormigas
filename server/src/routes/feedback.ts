// In-game feedback: players send it from any screen; admins read it on the Feedback screen.
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db';
import { now } from '../clock';
import { requireAuth } from '../auth';
import { GameError } from '../errors';
import { getPlayer, playerColonies } from '../colony';
import { getWorld } from '../world';
import { syncFeedbackToGitHub } from '../game/feedbackGithub';

export const FEEDBACK_KINDS = ['bug', 'idea', 'confusing', 'other'] as const;
export const FEEDBACK_MAX_LENGTH = 2000;
/** Per player, so one tester can't flood the list. */
export const FEEDBACK_PER_HOUR = 10;

/** Keep only short, plain context values from the client. */
function cleanContext(raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['screen', 'userAgent', 'viewport', 'colonyId']) {
    const v = (raw as any)[key];
    if (typeof v === 'string') out[key] = v.slice(0, 300);
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    await requireAuth(req);
  });

  app.post('/api/feedback', async (req) => {
    const body = (req.body ?? {}) as any;
    const message = String(body.message ?? '').trim();
    if (message.length < 3) throw new GameError('too_short', 'Write a few words first.');
    if (message.length > FEEDBACK_MAX_LENGTH) throw new GameError('too_long', `Please keep it under ${FEEDBACK_MAX_LENGTH} characters.`);
    const kind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : 'other';

    const q = getPool();
    const t = now();
    const recent = await q.query('SELECT count(*)::int AS n FROM feedback WHERE player_id = $1 AND created_at > $2', [req.playerId, t - 3600_000]);
    if (recent.rows[0].n >= FEEDBACK_PER_HOUR) throw new GameError('slow_down', 'Thanks for all the feedback! Please wait a bit before sending more.', 429);

    const context = cleanContext(body.context);
    // Add what the server knows for sure: the colony (only if it's theirs) and the world clock.
    const colony = (await playerColonies(q, req.playerId)).find((c) => c.id === Number(context.colonyId));
    const world = await getWorld(q);
    const full = {
      ...context,
      ...(colony ? { colony: colony.name, coords: `${colony.region}:${colony.patch}:${colony.spot}` } : {}),
      worldSpeed: world.speed,
    };
    await q.query('INSERT INTO feedback (world_id, player_id, kind, message, context, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [
      world.id, req.playerId, kind, message, JSON.stringify(full), t,
    ]);
    void syncFeedbackToGitHub(q); // in the background; the player doesn't wait on GitHub
    return { ok: true };
  });

  app.get('/api/admin/feedback', async (req) => {
    await requireAdmin(req.playerId);
    const show = (req.query as any).show === 'all' ? 'all' : 'open';
    const r = await getPool().query(
      `SELECT f.id, f.kind, f.message, f.context, f.created_at, f.handled, p.username
         FROM feedback f JOIN players p ON p.id = f.player_id
        ${show === 'open' ? 'WHERE NOT f.handled' : ''}
        ORDER BY f.created_at DESC LIMIT 200`,
    );
    const open = (await getPool().query('SELECT count(*)::int AS n FROM feedback WHERE NOT handled')).rows[0].n;
    return {
      open,
      items: r.rows.map((x: any) => ({
        id: x.id, kind: x.kind, message: x.message, context: x.context, createdAt: Number(x.created_at), handled: x.handled, from: x.username,
      })),
    };
  });

  app.post('/api/admin/feedback/:id', async (req) => {
    await requireAdmin(req.playerId);
    const id = Number((req.params as any).id);
    const handled = !!((req.body ?? {}) as any).handled;
    const r = await getPool().query('UPDATE feedback SET handled = $2 WHERE id = $1', [id, handled]);
    if (!r.rowCount) throw new GameError('not_found', 'No such feedback.', 404);
    return { ok: true };
  });
}

async function requireAdmin(playerId: number) {
  const p = await getPlayer(getPool(), playerId);
  if (!p.isAdmin) throw new GameError('forbidden', 'Only admins can see feedback.', 403);
}
