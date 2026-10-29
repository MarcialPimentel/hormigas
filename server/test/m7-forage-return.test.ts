// Regression: forage finds reach the colony's stores only when the party gets home,
// not when it reaches the wilds (where the find is rolled and the report is filed).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;

const stores = async () => (await p.get('/api/state')).colony.resources as { foliage: number; protein: number; nectar: number };
const forage = async () => (await p.get('/api/state')).missions.find((m: any) => m.type === 'forage');

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'homebound');
  c = (await p.get('/api/state')).colony;
  // low stores so the find fits under the storage cap; nectar pays for the trip
  await setColony(c.id, { foliage: 0, protein: 0, nectar: 1000, last_updated: clock.t, units: { worker: 2 } });
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

describe('forage finds', () => {
  it('are added to the stores on return, not on arrival', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: { ...c.coords, spot: 13 }, units: { worker: 2 } });
    expect(r.ok).toBe(true);
    const sent = await forage();

    // just before and just after the party reaches the wilds: only a millisecond or two of production in between
    await clock.advance(sent.arriveAt - 1 - clock.t);
    const beforeArrive = await stores();
    await clock.advance(2);
    const atWilds = await forage();
    expect(atWilds.status).toBe('returning');
    const cargo = atWilds.cargo;
    expect(cargo.foliage + cargo.protein + cargo.nectar).toBeGreaterThan(0); // a first trip always finds food
    const afterArrive = await stores();
    for (const k of ['foliage', 'protein', 'nectar'] as const) expect(afterArrive[k] - beforeArrive[k]).toBeLessThanOrEqual(1);
    // the report says when the party gets home (#65)
    const rep = (await p.get('/api/reports')).reports.find((x: any) => x.type === 'forage');
    expect(rep.data.returnsAt).toBe(atWilds.returnAt);

    // just before and just after it gets home: now the find lands
    await clock.advance(atWilds.returnAt - 1 - clock.t);
    const beforeHome = await stores();
    await clock.advance(2);
    expect(await forage()).toBeUndefined();
    const home = await stores();
    for (const k of ['foliage', 'protein', 'nectar'] as const) {
      expect(home[k] - beforeHome[k]).toBeGreaterThanOrEqual(cargo[k]);
      expect(home[k] - beforeHome[k]).toBeLessThanOrEqual(cargo[k] + 1);
    }
  });
});
