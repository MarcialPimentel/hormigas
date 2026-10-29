import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { researchCost } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let colonyId: number;

const rich = () => setColony(colonyId, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t });

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'scholar');
  colonyId = (await p.get('/api/state')).colony.id;
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

describe('research', () => {
  it('needs a Pheromone Chamber', async () => {
    await rich();
    const r = await p.post('/api/research', { colonyId, research: 'colony_mind' });
    expect(r.error.code).toBe('locked');
  });

  it('researches, completes via event, and rejects a second job', async () => {
    await setColony(colonyId, { chambers: { queen_chamber: 3, pheromone_chamber: 2 } });
    await rich();
    const r = await p.post('/api/research', { colonyId, research: 'mandibles' });
    expect(r.ok).toBe(true);
    const s = await p.get('/api/state');
    const job = s.player.researchJob;
    expect(job.research).toBe('mandibles');
    expect(s.colony.resources.foliage).toBeCloseTo(1e6 - researchCost('mandibles', 1).foliage, 0);
    const busy = await p.post('/api/research', { colonyId, research: 'chitin' });
    expect(busy.error.code).toBe('busy');
    // can't enlarge the Pheromone Chamber mid-research
    const enlarge = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'pheromone_chamber' });
    expect(enlarge.error.code).toBe('busy');
    await clock.advance(job.endAt - clock.t + 1);
    const after = await p.get('/api/state');
    expect(after.player.research.mandibles).toBe(1);
    expect(after.player.researchJob).toBeNull();
    expect(after.player.points.research).toBeGreaterThan(0);
  });

  it('cancel refunds to the colony', async () => {
    await rich();
    await p.post('/api/research', { colonyId, research: 'chitin' });
    const before = (await p.get('/api/state')).colony.resources.foliage;
    await p.post('/api/research/cancel');
    const s = await p.get('/api/state');
    expect(s.player.researchJob).toBeNull();
    expect(s.colony.resources.foliage).toBeCloseTo(before + researchCost('chitin', 1).foliage, 0);
  });

  it('rejects non-MVP research', async () => {
    const r = await p.post('/api/research', { colonyId, research: 'symbiosis' });
    expect(r.error.code).toBe('bad_research');
  });
});

describe('brood hall', () => {
  it('needs a Brood Hall', async () => {
    const r = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 5 });
    expect(r.error.code).toBe('locked');
  });

  it('raises units one at a time; queue items run back to back', async () => {
    await setColony(colonyId, { chambers: { queen_chamber: 3, pheromone_chamber: 2, brood_hall: 1 } });
    await rich();
    const a = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 3 });
    expect(a.ok).toBe(true);
    const per = a.colony.unitQueue[0].perUnitMs;
    const b = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'defense', id: 'pit_trap', count: 2 });
    expect(b.colony.unitQueue).toHaveLength(2);
    expect(b.colony.unitQueue[1].startAt).toBeNull();

    await clock.advance(per * 2 + 10);
    let s = await p.get('/api/state');
    expect(s.colony.units.worker).toBe(2);

    await clock.advance(per + 10);
    s = await p.get('/api/state');
    expect(s.colony.units.worker).toBe(3);
    expect(s.colony.unitQueue).toHaveLength(1);
    expect(s.colony.unitQueue[0].id).toBe('pit_trap');

    await clock.advance(10 * 3600_000);
    s = await p.get('/api/state');
    expect(s.colony.defenses.pit_trap).toBe(2);
    expect(s.colony.unitQueue).toHaveLength(0);
  });

  it('enforces unlocks, max counts and batch limits', async () => {
    await rich();
    const major = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'major_soldier', count: 1 });
    expect(major.error.code).toBe('locked');
    const wall1 = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'defense', id: 'soil_wall', count: 1 });
    expect(wall1.ok).toBe(true);
    const wall2 = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'defense', id: 'soil_wall', count: 1 });
    expect(wall2.error.code).toBe('max');
    const bad = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 0 });
    expect(bad.error.code).toBe('bad_count');
    // the Winged Queen exists since Build 4, but needs Brood Hall 4 and Nuptial Flight
    const queen = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'winged_queen', count: 1 });
    expect(queen.error.code).toBe('locked');
    const later = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'carrion_beetle', count: 1 });
    expect(later.error.code).toBe('bad_unit');
  });

  it("can't enlarge the Brood Hall while it is raising units", async () => {
    const r = await p.post(`/api/colonies/${colonyId}/build`, { chamber: 'brood_hall' });
    expect(r.error.code).toBe('busy');
  });

  it('charges the full batch cost up front', async () => {
    await clock.advance(24 * 3600_000);
    await setColony(colonyId, { foliage: 1000, protein: 1000, nectar: 0, last_updated: clock.t });
    const tooMany = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 4 });
    expect(tooMany.error.code).toBe('cant_afford');
    const ok = await p.post(`/api/colonies/${colonyId}/brood`, { kind: 'caste', id: 'worker', count: 3 });
    expect(ok.colony.resources.foliage).toBeCloseTo(100, 0);
  });
});
