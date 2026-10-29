import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { getPool } from './db';
import { GameError } from './errors';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
// event handlers register themselves on import
import './game/chambers';
import './game/research';
import './game/missions';
import './game/missionTypes';
import './game/combat';
import './game/forage';
import './game/nests';
import './game/nestEvents';
import './game/colonies';
import './game/herds';
import './game/swarms';
import { worldRoutes } from './routes/world';
import { feedbackRoutes } from './routes/feedback';
import { feedbackPageRoutes } from './routes/feedbackPage';
import { realtimeRoutes } from './realtime';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: config.trustProxy, bodyLimit: 64 * 1024 });
  await app.register(cookie);
  await app.register(websocket);
  // Per-IP limits. Generous for play; strict on login/sign-up (see routes/auth.ts) to stop password guessing.
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', keyGenerator: (req) => req.ip ?? 'unknown', allowList: (req) => req.url === '/api/health' || req.url === '/api/ws' || !req.url.startsWith('/api/') });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' } });
    if (err.validation || err.statusCode === 400) return reply.status(400).send({ error: { code: 'bad_request', message: err.message } });
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong.' } });
  });

  // Used by Docker's health check and by the deploy's go/no-go check, so "ok" must mean the game can reach its database.
  app.get('/api/health', async (_req, reply) => {
    try {
      await getPool().query('SELECT 1');
      return { ok: true };
    } catch (e) {
      app.log.error(e, 'health check: database unreachable');
      return reply.status(503).send({ ok: false, error: 'database unreachable' });
    }
  });
  await app.register(realtimeRoutes);
  await app.register(authRoutes);
  await app.register(gameRoutes);
  await app.register(worldRoutes);
  await app.register(feedbackRoutes);
  await app.register(feedbackPageRoutes);

  // Serve the built client in production (single deploy).
  if (config.clientDist && existsSync(config.clientDist)) {
    const root = resolve(config.clientDist);
    await app.register(fastifyStatic, {
      root,
      // Vite puts a content hash in asset file names, so they can be cached forever; index.html must not be.
      setHeaders: (reply, path) => {
        reply.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
