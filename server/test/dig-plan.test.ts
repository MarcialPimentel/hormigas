// The dig plan (docs/04-colony.md): one chamber lined up behind the dig in progress, paid for when it starts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { chamberCost } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

const GROWN = { queen_chamber: 4, leaf_garden: 5, hunting_grounds: 5, nursery: 6, granary: 5, larder: 5 };
const RICH = { foliage: 20_000, protein: 20_000, nectar: 0 };

describe('dig plan', () => {
  let p: Client;
  let colonyId: number;
  const url = (path = '') => `/api/colonies/${colonyId}${path}`;

  beforeAll(async () => {
    p = await newPlayer(app, 'planner');
    colonyId = (await p.get('/api/state')).colony.id;
  });

  beforeEach(async () => {
    // a fresh mid-game nest, nothing digging, nothing planned
    await setColony(colonyId, { chambers: GROWN, ...RICH, build_job: null, dig_plan: null, last_updated: clock.t });
  });

  it("is locked until Queen's Chamber 4", async () => {
    await setColony(colonyId, { chambers: { ...GROWN, queen_chamber: 3 } });
    await p.post(url('/build'), { chamber: 'leaf_garden' });
    const r = await p.post(url('/plan'), { chamber: 'hunting_grounds' });
    expect(r.status).toBe(400);
    expect(r.error.code).toBe('locked');
    expect(r.error.message).toContain("Queen's Chamber 4");
  });

  it('needs a dig in progress, and holds one planned dig', async () => {
    const idle = await p.post(url('/plan'), { chamber: 'leaf_garden' });
    expect(idle.error.code).toBe('nothing');

    await p.post(url('/build'), { chamber: 'leaf_garden' });
    const r = await p.post(url('/plan'), { chamber: 'hunting_grounds' });
    expect(r.ok).toBe(true);
    expect(r.colony.digPlan.chambers).toEqual(['hunting_grounds']);
    const full = await p.post(url('/plan'), { chamber: 'nursery' });
    expect(full.error.code).toBe('full');
  });

  it('costs nothing when planned, and starts the moment the dig in progress ends', async () => {
    const b = await p.post(url('/build'), { chamber: 'leaf_garden' });
    const job = b.colony.buildJob;
    const before = b.colony.resources;
    const r = await p.post(url('/plan'), { chamber: 'leaf_garden' });
    // nothing paid yet
    expect(r.colony.resources.foliage).toBeCloseTo(before.foliage, 0);

    await clock.advance(job.endAt - clock.t + 1);
    const s = await p.get('/api/state');
    expect(s.colony.chambers.leaf_garden).toBe(6);
    // the same chamber, one level further, starting exactly when the last one ended
    expect(s.colony.buildJob.chamber).toBe('leaf_garden');
    expect(s.colony.buildJob.level).toBe(7);
    expect(s.colony.buildJob.startAt).toBe(job.endAt);
    expect(s.colony.buildJob.cost).toEqual(chamberCost('leaf_garden', 7));
    expect(s.colony.digPlan).toBeNull();
  });

  it('waits for resources while you are away, then starts on its own', async () => {
    const b = await p.post(url('/build'), { chamber: 'hunting_grounds' });
    await p.post(url('/plan'), { chamber: 'leaf_garden' });
    await setColony(colonyId, { foliage: 0, protein: 0, last_updated: clock.t });

    await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    let s = await p.get('/api/state');
    expect(s.colony.buildJob).toBeNull();
    expect(s.colony.digPlan.chambers).toEqual(['leaf_garden']);
    expect(s.colony.digPlan.waiting).toBe('resources');
    const checkAt = s.colony.digPlan.checkAt;
    expect(checkAt).toBeGreaterThan(clock.t);

    await clock.advance(checkAt - clock.t + 1);
    s = await p.get('/api/state');
    expect(s.colony.buildJob.chamber).toBe('leaf_garden');
    expect(s.colony.buildJob.startAt).toBe(checkAt);
    expect(s.colony.digPlan).toBeNull();
  });

  it('starts early when resources arrive before production would cover it', async () => {
    const b = await p.post(url('/build'), { chamber: 'hunting_grounds' });
    await p.post(url('/plan'), { chamber: 'leaf_garden' });
    await setColony(colonyId, { foliage: 0, protein: 0, last_updated: clock.t });
    await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    expect((await p.get('/api/state')).colony.digPlan.waiting).toBe('resources');

    // food arrives (here by hand; in play a forage party or a refund), and the colony is saved by any action
    await setColony(colonyId, { ...RICH, last_updated: clock.t });
    await p.patch(url(), { name: 'Early Diggers' });
    const s = await p.get('/api/state');
    expect(s.colony.buildJob?.chamber).toBe('leaf_garden');
    expect(s.colony.digPlan).toBeNull();
  });

  it('cancelling the dig in progress moves the planned dig up', async () => {
    await p.post(url('/build'), { chamber: 'nursery' });
    await p.post(url('/plan'), { chamber: 'hunting_grounds' });
    const c = await p.post(url('/build/cancel'));
    expect(c.colony.buildJob.chamber).toBe('hunting_grounds');
    expect(c.colony.buildJob.level).toBe(6);
    expect(c.colony.digPlan).toBeNull();
  });

  it('taking a dig out of the plan refunds nothing, because nothing was paid', async () => {
    const b = await p.post(url('/build'), { chamber: 'nursery' });
    await p.post(url('/plan'), { chamber: 'hunting_grounds' });
    const r = await p.post(url('/plan/cancel'), { index: 0 });
    expect(r.colony.digPlan).toBeNull();
    expect(r.colony.resources.foliage).toBeCloseTo(b.colony.resources.foliage, 0);
    const none = await p.post(url('/plan/cancel'), { index: 0 });
    expect(none.error.code).toBe('nothing');

    // and the dig in progress finishes with nothing after it
    await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    expect((await p.get('/api/state')).colony.buildJob).toBeNull();
  });

  it("starting a dig by hand puts a waiting plan back in line behind it", async () => {
    const b = await p.post(url('/build'), { chamber: 'hunting_grounds' });
    await p.post(url('/plan'), { chamber: 'leaf_garden' });
    await setColony(colonyId, { foliage: 0, protein: 0, last_updated: clock.t });
    await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    expect((await p.get('/api/state')).colony.digPlan.waiting).toBe('resources');

    await setColony(colonyId, { foliage: 2_000, protein: 2_000, last_updated: clock.t });
    // food arrives, and the player digs something else by hand before the plan's next look
    const n = await p.post(url('/build'), { chamber: 'nursery' });
    expect(n.colony.buildJob.chamber).toBe('nursery');
    expect(n.colony.digPlan.chambers).toEqual(['leaf_garden']);
    expect(n.colony.digPlan.waiting).toBe('queued');

    await clock.advance(n.colony.buildJob.endAt - clock.t + 1);
    const s = await p.get('/api/state');
    expect(s.colony.buildJob.chamber).toBe('leaf_garden');
  });

  it('rejects unknown chambers; anything the colony has unlocked can be planned', async () => {
    await p.post(url('/build'), { chamber: 'leaf_garden' });
    const bad = await p.post(url('/plan'), { chamber: 'death_star' });
    expect(bad.error.code).toBe('bad_chamber');
    const honeypot = await p.post(url('/plan'), { chamber: 'honeypot_gallery' });
    expect(honeypot.ok).toBe(true); // Queen's Chamber 4 unlocks it
  });
});
