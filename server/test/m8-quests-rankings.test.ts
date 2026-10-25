import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { QUESTS } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client, other: Client;
let c: any;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'newbie');
  other = await newPlayer(app, 'veteran');
  c = (await p.get('/api/state')).colony;
});
afterAll(async () => teardownTest(app));

describe('onboarding quests', () => {
  it('starts with the first quest, not ready', async () => {
    const s = await p.get('/api/state');
    expect(s.quests.quest.id).toBe(QUESTS[0].id);
    expect(s.quests.quest.ready).toBe(false);
    const early = await p.post('/api/quests/claim', { id: QUESTS[0].id, colonyId: c.id });
    expect(early.error.code).toBe('not_done');
  });

  it('claims in order and pays the reward into the colony', async () => {
    await setColony(c.id, { chambers: { queen_chamber: 1, leaf_garden: 1 }, foliage: 0, protein: 0, nectar: 0, last_updated: clock.t });
    const skip = await p.post('/api/quests/claim', { id: QUESTS[1].id, colonyId: c.id });
    expect(skip.error.code).toBe('bad_quest');
    const ok = await p.post('/api/quests/claim', { id: QUESTS[0].id, colonyId: c.id });
    expect(ok.ok).toBe(true);
    const s = await p.get('/api/state');
    expect(s.colony.resources.foliage).toBeCloseTo(QUESTS[0].reward.foliage, 0);
    expect(s.quests.quest.id).toBe(QUESTS[1].id);
    const again = await p.post('/api/quests/claim', { id: QUESTS[0].id, colonyId: c.id });
    expect(again.error.code).toBe('bad_quest');
  });

  it('mission-based quests count missions ever sent', async () => {
    await setColony(c.id, {
      chambers: { queen_chamber: 2, leaf_garden: 1, nursery: 1, hunting_grounds: 1, brood_hall: 1 },
      units: { worker: 5, scout: 1 }, nectar: 10000, last_updated: clock.t,
    });
    for (const id of ['nursery', 'hunt', 'queen', 'brood', 'workers']) {
      const r = await p.post('/api/quests/claim', { id, colonyId: c.id });
      expect(r.ok).toBe(true);
    }
    expect((await p.get('/api/state')).quests.quest.ready).toBe(false);
    await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: { ...c.coords, spot: 13 }, units: { worker: 2 } });
    expect((await p.get('/api/state')).quests.quest.ready).toBe(true);
    expect((await p.post('/api/quests/claim', { id: 'forage', colonyId: c.id })).ok).toBe(true);
    const oc = (await other.get('/api/state')).colony;
    await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: oc.coords, units: { scout: 1 } });
    expect((await p.post('/api/quests/claim', { id: 'scout', colonyId: c.id })).ok).toBe(true);
    const s = await p.get('/api/state');
    expect(s.quests.finished).toBe(true);
  });
});

describe('rankings', () => {
  it('orders players by points and reports my rank', async () => {
    const vet = (await other.get('/api/state')).player.id;
    await setPlayer(vet, { points_total: 5000, points: { total: 5000, economy: 1000, research: 0, military: 4000 } });
    const r = await p.get('/api/rankings?kind=total');
    expect(r.rows[0].username).toBe('veteran');
    expect(r.myRank).toBe(2);
    const m = await p.get('/api/rankings?kind=military');
    expect(m.rows[0].points).toBe(4000);
    const bogus = await p.get('/api/rankings?kind=drop table');
    expect(bogus.kind).toBe('total');
  });
});

describe('realtime', () => {
  it('rejects sockets without a session and greets logged-in ones', async () => {
    await app.ready();
    const ws = await (app as any).injectWS('/api/ws', { headers: { cookie: p.cookie } });
    const msg = await new Promise<string>((res) => ws.once('message', (d: Buffer) => res(d.toString())));
    expect(JSON.parse(msg).type).toBe('hello');
    ws.terminate();
  });
});
