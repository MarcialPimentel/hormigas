import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'forager');
  c = (await p.get('/api/state')).colony;
  await setColony(c.id, { nectar: 1e6, last_updated: clock.t, units: { worker: 1000, minor_soldier: 100 } });
  await calmWildNests(); // this test runs 15 days of game time; keep nest raids out of it
});
afterAll(async () => teardownTest(app));

describe('forage', () => {
  it('only goes to the wilds', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: c.coords, units: { worker: 1 } });
    expect(r.error.code).toBe('bad_target');
  });

  it('uses its own slot pool (1 at start) and does not block normal missions', async () => {
    const wilds = { ...c.coords, spot: 13 };
    const f1 = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: wilds, units: { worker: 10 } });
    expect(f1.ok).toBe(true);
    const f2 = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: wilds, units: { worker: 10 } });
    expect(f2.error.code).toBe('no_slots');
    await clock.advance(24 * 3600_000);
  });

  it('many expeditions: every outcome is reported, finds never exceed cargo, losses applied', async () => {
    const wilds = { ...c.coords, spot: 13 };
    const outcomes = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await setColony(c.id, { units: { worker: 1000 }, nectar: 1e6, last_updated: clock.t });
      const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: wilds, units: { worker: 10 } });
      if (!r.ok) throw new Error(JSON.stringify(r));
      await clock.advance(6 * 3600_000);
    }
    // read straight from the database: nest events (Build 3) file reports too, so the API's newest-100 page can miss some
    const reports = (await getPool().query("SELECT data FROM reports WHERE type = 'forage' ORDER BY id")).rows;
    expect(reports.length).toBeGreaterThanOrEqual(60);
    for (const rep of reports) {
      outcomes.add(rep.data.outcome);
      const f = rep.data.found;
      expect(f.foliage + f.protein + f.nectar).toBeLessThanOrEqual(10 * 1500);
      if (rep.data.outcome === 'the_boot') expect(rep.data.lost.worker).toBe(10);
      expect(typeof rep.data.text).toBe('string');
    }
    expect(outcomes.has('food_cache')).toBe(true);
    const s = await p.get('/api/state');
    expect(s.missions).toHaveLength(0);
  });
});
