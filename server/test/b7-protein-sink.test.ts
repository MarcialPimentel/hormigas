// Build 7 (#65): Protein sinks. Feeding the brood and larval digestion (Protein → Nectar).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CASTES, FORMULAS, digestPlan } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let colonyId: number;
let speed: number;

const rich = () => setColony(colonyId, { foliage: 1e6, protein: 1e6, nectar: 0, last_updated: clock.t, unit_queue: [], digest_job: null });
const state = () => p.get('/api/state');

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'nurse');
  const s = await state();
  colonyId = s.colony.id;
  speed = s.world.speed;
  await calmWildNests();
  await setColony(colonyId, { chambers: { queen_chamber: 3, brood_hall: 1 } });
});
afterAll(async () => teardownTest(app));

describe('feeding the brood', () => {
  it('Well fed costs extra Protein and raises castes faster', async () => {
    await rich();
    await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 10 });
    const normal = (await state()).colony.unitQueue[0];
    await rich();
    const r = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 10, feed: 'well_fed' });
    expect(r.ok).toBe(true);
    const s = await state();
    const fed = s.colony.unitQueue[0];
    expect(fed.feed).toBe('well_fed');
    const w = CASTES.worker.cost;
    const extra = ((w.foliage + w.protein) * FORMULAS.brood.feeding.well_fed.extraProteinPct) / 100;
    expect(s.colony.resources.protein).toBeCloseTo(1e6 - 10 * (w.protein + extra), 0);
    expect(s.colony.resources.foliage).toBeCloseTo(1e6 - 10 * w.foliage, 0);
    expect(fed.perUnitMs / normal.perUnitMs).toBeCloseTo(1 - FORMULAS.brood.feeding.well_fed.timeCutPct / 100, 2);
  });

  it('Feast is faster still, and costs more', async () => {
    await rich();
    await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 1, feed: 'feast' });
    const s = await state();
    expect(s.colony.unitQueue[0].feed).toBe('feast');
    expect(1e6 - s.colony.resources.protein).toBeCloseTo(100 + 400 * 1.5, 0);
  });

  it('refuses feeding defenses, and unknown feedings', async () => {
    await rich();
    const d = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'defense', id: 'pit_trap', count: 1, feed: 'feast' });
    expect(d.error.code).toBe('bad_feed');
    const u = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 1, feed: 'banquet' });
    expect(u.error.code).toBe('bad_feed');
  });

  it("can't feed what it can't afford: the message names the Protein", async () => {
    await setColony(colonyId, { foliage: 1e6, protein: 150, nectar: 0, last_updated: clock.t, unit_queue: [] });
    const r = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 1, feed: 'well_fed' });
    expect(r.error.code).toBe('cant_afford');
    expect(r.error.message).toMatch(/Protein/);
  });
});

describe('larval digestion', () => {
  it('needs Brood Hall 2', async () => {
    await rich();
    const r = await p.post(`/api/colonies/${colonyId}/digest`, { protein: 3000 });
    expect(r.error.code).toBe('locked');
  });

  it('turns Protein into Nectar at 3:1, trickling in over time', async () => {
    await setColony(colonyId, { chambers: { queen_chamber: 3, brood_hall: 2 } });
    await rich();
    const r = await p.post(`/api/colonies/${colonyId}/digest`, { protein: 3000 });
    expect(r.ok).toBe(true);
    const plan = digestPlan(3000, 2, speed);
    expect(plan.nectar).toBe(1000);
    let s = await state();
    const job = s.colony.digestJob;
    expect(job.nectar).toBe(1000);
    expect(job.endAt - job.startAt).toBe(plan.ms);
    expect(s.colony.resources.protein).toBeCloseTo(1e6 - 3000, 0);
    // halfway: about half the Nectar is in
    await clock.advance(plan.ms / 2);
    s = await state();
    expect(s.colony.resources.nectar).toBeGreaterThanOrEqual(490);
    expect(s.colony.resources.nectar).toBeLessThan(1000);
    // a second job is refused while one runs
    expect((await p.post(`/api/colonies/${colonyId}/digest`, { protein: 300 })).error.code).toBe('busy');
    await clock.advance(plan.ms);
    s = await state();
    expect(s.colony.digestJob).toBeNull();
    // production of Nectar is zero here (no Aphid Pasture), so it's all from digestion
    expect(Math.floor(s.colony.resources.nectar)).toBe(1000);
  });

  it('stopping keeps the Nectar made so far and refunds the undigested Protein', async () => {
    await rich();
    await p.post(`/api/colonies/${colonyId}/digest`, { protein: 6000 });
    const plan = digestPlan(6000, 2, speed);
    await clock.advance(plan.ms / 4);
    const r = await p.post(`/api/colonies/${colonyId}/digest/stop`);
    expect(r.ok).toBe(true);
    const s = await state();
    expect(s.colony.digestJob).toBeNull();
    expect(s.colony.resources.nectar).toBeGreaterThanOrEqual(499);
    expect(s.colony.resources.nectar).toBeLessThanOrEqual(500);
    // 6000 taken, 4500 back (plus a little Protein production over the quarter)
    expect(s.colony.resources.protein).toBeGreaterThanOrEqual(1e6 - 1500 - 1);
    expect((await p.post(`/api/colonies/${colonyId}/digest/stop`)).error.code).toBe('idle');
  });

  it('refuses too little, or more Protein than the colony has', async () => {
    await rich();
    expect((await p.post(`/api/colonies/${colonyId}/digest`, { protein: 10 })).error.code).toBe('bad_amount');
    await setColony(colonyId, { protein: 100, last_updated: clock.t });
    expect((await p.post(`/api/colonies/${colonyId}/digest`, { protein: 5000 })).error.code).toBe('cant_afford');
  });
});
