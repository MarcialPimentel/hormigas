import type { FastifyInstance } from 'fastify';
import { tx } from '../db';
import { SESSION_COOKIE, setSessionCookie, validateCredentials } from '../auth';
import { login, logout, register } from '../game/accounts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const { username, password } = validateCredentials(body.username, body.password);
    const { playerId, token } = await tx((q) => register(q, username, password));
    setSessionCookie(reply, token);
    return { ok: true, playerId };
  });

  app.post('/api/auth/login', async (req, reply) => {
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
}
