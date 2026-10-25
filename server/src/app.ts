import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { GameError } from './errors';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
// event handlers register themselves on import
import './game/chambers';
import './game/research';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cookie);

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err.validation || err.statusCode === 400) return reply.status(400).send({ error: { code: 'bad_request', message: err.message } });
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong.' } });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(gameRoutes);

  // Serve the built client in production (single deploy).
  if (config.clientDist && existsSync(config.clientDist)) {
    const root = resolve(config.clientDist);
    await app.register(fastifyStatic, { root });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
