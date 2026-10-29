// /api/health is the deploy's go/no-go signal (and Docker's health check), so it must check the database.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await setupTest());
});
afterAll(async () => teardownTest(app));

describe('health', () => {
  it('is ok when the database answers', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('reports 503 when the database does not', async () => {
    const spy = vi.spyOn(getPool(), 'query').mockRejectedValueOnce(new Error('connection refused') as never);
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    spy.mockRestore();
    expect(r.statusCode).toBe(503);
    expect(r.json().ok).toBe(false);
  });
});
