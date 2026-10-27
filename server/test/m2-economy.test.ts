import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { chamberCost, productionPerHour } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

describe('accounts', () => {
  it('registers, logs in, rejects bad input and duplicates', async () => {
    const ok = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'queen_ana', password: 'password123' } });
    expect(ok.statusCode).toBe(200);
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Queen_Ana', password: 'password123' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'x', password: 'short' } });
    expect(bad.statusCode).toBe(400);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'queen_ana', password: 'password123' } });
    expect(login.statusCode).toBe(200);
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'queen_ana', password: 'nope-nope' } });
    expect(wrong.statusCode).toBe(401);
  });

  it('requires a session for game routes', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/state' });
    expect(r.statusCode).toBe(401);
  });
});

describe('colony & idle economy', () => {
  let p: Client;
  let colonyId: number;

  beforeAll(async () => {
    p = await newPlayer(app, 'builder');
    const s = await p.get('/api/state');
    colonyId = s.colony.id;
  });

  it('starts with a grassland nest, Queen L1, starting resources and new-player protection', async () => {
    const s = await p.get('/api/state');
    expect(s.colony.terrain).toBe('grassland');
    expect([5, 6, 7, 8]).toContain(s.colony.coords.spot);
    expect(s.colony.chambers).toEqual({ queen_chamber: 1 });
    expect(s.colony.resources.foliage).toBe(500);
    expect(s.player.protectedUntil).toBeGreaterThan(s.serverNow);
    expect(s.world.speed).toBeGreaterThan(0);
  });

  it('produces resources over time without ticking (compute on read)', async () => {
    await setColony(colonyId, { foliage: 0, protein: 0, nectar: 0, last_updated: clock.t });
    await clock.advance(3600_000);
    const s = await p.get('/api/state');
    const rate = productionPerHour({ queen_chamber: 1 }, 'grassland', s.world.speed);
    expect(s.colony.resources.foliage).toBeCloseTo(rate.foliage, 3);
    expect(s.colony.resources.protein).toBeCloseTo(rate.protein, 3);
  });

  it('caps production at storage', async () => {
    await setColony(colonyId, { foliage: 9990, last_updated: clock.t });
    await clock.advance(10 * 3600_000);
    const s = await p.get('/api/state');
    expect(s.colony.resources.foliage).toBe(10000);
  });

  it('builds a chamber: pays cost, completes via event queue, production increases', async () => {
    await setColony(colonyId, { foliage: 1000, protein: 1000, nectar: 0, last_updated: clock.t });
    const r = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'leaf_garden' });
    expect(r.ok).toBe(true);
    const cost = chamberCost('leaf_garden', 1);
    expect(r.colony.resources.foliage).toBeCloseTo(1000 - cost.foliage, 3);
    expect(r.colony.buildJob.chamber).toBe('leaf_garden');

    // can't start a second build
    const busy = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'nursery' });
    expect(busy.status).toBe(400);
    expect(busy.error.code).toBe('busy');

    await clock.advance(r.colony.buildJob.endAt - clock.t + 1);
    const s = await p.get('/api/state');
    expect(s.colony.chambers.leaf_garden).toBe(1);
    expect(s.colony.buildJob).toBeNull();
    expect(s.player.points.total).toBeGreaterThanOrEqual(0);
  });

  it('enforces unlocks and affordability', async () => {
    const locked = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'granary' });
    expect(locked.error.code).toBe('locked');
    await setColony(colonyId, { foliage: 0, protein: 0, last_updated: clock.t });
    const poor = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'nursery' });
    expect(poor.error.code).toBe('cant_afford');
    const unknown = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'death_star' });
    expect(unknown.error.code).toBe('bad_chamber');
  });

  it('cancel refunds in full and the stale event does nothing', async () => {
    await setColony(colonyId, { foliage: 5000, protein: 5000, last_updated: clock.t });
    const r = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'nursery' });
    const endAt = r.colony.buildJob.endAt;
    const c = await p.post(`/api/colonies/${colonyId}/build/cancel`);
    expect(c.colony.buildJob).toBeNull();
    expect(c.colony.resources.foliage).toBeCloseTo(5000, 3);
    await clock.advance(endAt - clock.t + 1000);
    const s = await p.get('/api/state');
    expect(s.colony.chambers.nursery ?? 0).toBe(0);
  });

  it("can't touch someone else's colony", async () => {
    const other = await newPlayer(app, 'intruder');
    const r = await other.post(`/api/colonies/${colonyId}/build`, { chamber: 'leaf_garden' });
    expect(r.status).toBe(403);
  });

  it('renames a colony', async () => {
    const r = await p.patch(`/api/colonies/${colonyId}`, { name: 'Hill of Leaves' });
    expect(r.colony.name).toBe('Hill of Leaves');
  });
});

describe('balance pass', () => {
  it('world speed speeds up production, not just timers', async () => {
    const q = await newPlayer(app, 'speedy');
    const s = await q.get('/api/state');
    await setColony(s.colony.id, { foliage: 0, protein: 0, nectar: 0, last_updated: clock.t });
    await clock.advance(3600_000);
    const after = await q.get('/api/state');
    expect(after.colony.resources.foliage).toBeCloseTo(60 * s.world.speed, 3);
  });

  it('unaffordable builds explain what is missing', async () => {
    const q = await newPlayer(app, 'explainer');
    const s = await q.get('/api/state');
    await setColony(s.colony.id, { foliage: 0, protein: 0, nectar: 0, last_updated: clock.t, chambers: { queen_chamber: 2 } });
    const r = await q.post(`/api/colonies/${s.colony.id}/build`, { chamber: 'brood_hall' });
    expect(r.error.code).toBe('cant_afford');
    expect(r.error.message).toMatch(/You don't produce Nectar yet/);
  });

  it('first Aphid Pasture announces the Nectar milestone once', async () => {
    const q = await newPlayer(app, 'honeydew');
    const s = await q.get('/api/state');
    await setColony(s.colony.id, { foliage: 1e5, protein: 1e5, nectar: 0, last_updated: clock.t, chambers: { queen_chamber: 3 } });
    const b = await q.post(`/api/colonies/${s.colony.id}/build`, { chamber: 'aphid_pasture' });
    await clock.advance(b.colony.buildJob.endAt - clock.t + 10);
    const reps = (await q.get('/api/reports')).reports.filter((x: any) => x.type === 'milestone');
    expect(reps).toHaveLength(1);
    expect(reps[0].title).toMatch(/Nectar/);
  });
});
