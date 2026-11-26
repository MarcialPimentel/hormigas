import type { FastifyInstance } from 'fastify';
import { tx } from '../db';
import { SESSION_COOKIE, requireAuth, setSessionCookie, validateCredentials } from '../auth';
import { BAD_CODE_MESSAGE, login, logout, makeResetCode, register, resetPassword } from '../game/accounts';
import { GameError } from '../errors';
import { requireAdmin } from './feedback';

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/register', strict, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const { username, password } = validateCredentials(body.username, body.password);
    const { playerId, token } = await tx((q) => register(q, username, password));
    setSessionCookie(reply, token);
    return { ok: true, playerId };
  });

  app.post('/api/auth/login', strict, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const { playerId, token } = await tx((q) => login(q, String(body.username ?? ''), String(body.password ?? '')));
    setSessionCookie(reply, token);
    return { ok: true, playerId };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await tx((q) => logout(q, req.cookies[SESSION_COOKIE]));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // Forgot your password: the player types the one-time code an admin gave them, and a new password.
  app.post('/api/auth/reset', strict, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const { username, password } = validateCredentials(body.username, body.password);
    const result = await tx((q) => resetPassword(q, username, String(body.code ?? ''), password));
    if (!result.ok) throw new GameError('bad_code', BAD_CODE_MESSAGE, 401);
    setSessionCookie(reply, result.token);
    return { ok: true, playerId: result.playerId };
  });

  // Admin: make a one-time reset code for a player (replaces any earlier one).
  app.post('/api/admin/reset-code', { preHandler: requireAuth }, async (req) => {
    await requireAdmin(req.playerId, 'Only admins can reset passwords.');
    const username = String(((req.body ?? {}) as any).username ?? '');
    return { ok: true, ...(await tx((q) => makeResetCode(q, req.playerId, username))) };
  });
}
