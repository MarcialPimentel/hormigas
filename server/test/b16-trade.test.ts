// Build 16: trade trails (docs/23-supercolonies.md § Trade trails).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CASTES, TRADE, TRADE_MESSAGES, missionSlotUsage, terrainForSpot, tradeDelivery, tradeEveryMs, truceNoticeMs } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, newPlayerBeside, setColony, setPlayer, calmWildNests, calmNestEvents, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let speed = 1;
let a: Client, b: Client;
let ca: any, cb: any;
let ida: number, idb: number;
let meadow: { id: number; coords: { region: number; patch: number; spot: number } };

const CHAMBERS = { queen_chamber: 5, leaf_garden: 8, hunting_grounds: 8, nursery: 8, aphid_pasture: 5, granary: 10, larder: 10, nectar_cellar: 10, brood_hall: 2 };
const STOCK = { foliage: 50_000, protein: 50_000, nectar: 50_000 };

const mission = async (who: Client, id: number) => (await who.get('/api/state')).missions.find((m: any) => m.id === id);
const send = (who: Client, from: number, to: any, units: object) => who.post('/api/missions', { colonyId: from, type: 'trade', target: to, units });

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'ant');
  b = await newPlayerBeside(app, 'bee', a);
  const [sa, sb] = await Promise.all([a.get('/api/state'), b.get('/api/state')]);
  [ca, cb] = [sa.colony, sb.colony];
  [ida, idb] = [sa.player.id, sb.player.id];
  speed = sa.world.speed;
  // a second colony of a's on Sunny Meadow (spot 1) in the same patch: it makes Foliage, so its trail brings Foliage
  const spot = 1;
  const r = await getPool().query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, last_updated, chambers, created_at)
     VALUES (1, $1, 'Meadow Nest', $2, $3, $4, $5, 150, $6, $7, $6) RETURNING id`,
    [ida, ca.coords.region, ca.coords.patch, spot, terrainForSpot(spot), clock.t, JSON.stringify(CHAMBERS)],
  );
  meadow = { id: r.rows[0].id, coords: { ...ca.coords, spot } };
  for (const id of [ca.id, cb.id, meadow.id]) await setColony(id, { ...STOCK, chambers: CHAMBERS, last_updated: clock.t });
  await setColony(ca.id, { units: { worker: 40, media_worker: 10, minor_soldier: 10, scout: 5 } });
  await setColony(cb.id, { units: { worker: 40, scout: 5 } });
  for (const id of [ida, idb]) await setPlayer(id, { protected_until: 0 });
  await calmWildNests();
  await calmNestEvents();
  await knowAll();
});
afterAll(async () => teardownTest(app));

describe('own-colony trails', () => {
  let id: number;

  it('only carriers walk a trail', async () => {
    const r = await send(a, ca.id, meadow.coords, { minor_soldier: 5 });
    expect(r.error).toMatchObject({ code: 'carriers_only', message: TRADE_MESSAGES.carriers_only });
  });

  it('the preview says what a trail to your Meadow colony brings', async () => {
    const p = await a.get(`/api/trade/preview?colonyId=${ca.id}&region=${meadow.coords.region}&patch=${meadow.coords.patch}&spot=${meadow.coords.spot}`);
    expect(p).toMatchObject({ kind: 'own', terrain: 'sunny_meadow', goods: 'Foliage', partner: null, deliveries: TRADE.deliveries });
    expect(p.potential.foliage).toBeGreaterThan(0);
    expect(p.potential.protein).toBe(0);
    expect(p.potential.nectar).toBe(0);
  });

  it('a caravan opens the trail and stays; it uses this colony’s trail, not a mission slot', async () => {
    const r = await send(a, ca.id, meadow.coords, { worker: 10 });
    expect(r.error).toBeUndefined();
    id = r.mission.id;
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const m = await mission(a, id);
    expect(m.status).toBe('holding');
    expect(m.result).toMatchObject({ trading: true, kind: 'own', next: 1 });
    const st = await a.get('/api/state');
    const research = st.player.research;
    expect(missionSlotUsage(st.missions, 'mission', research).used).toBe(0);
    expect(missionSlotUsage(st.missions, 'trade', research, ca.id).used).toBe(1);
    // one trail per colony
    const again = await send(a, ca.id, meadow.coords, { worker: 5 });
    expect(again.error).toMatchObject({ code: 'no_slots', message: TRADE_MESSAGES.one_per_colony(1) });
    // the other colony has its own trail
    await setColony(meadow.id, { units: { worker: 5 } });
    expect((await send(a, meadow.id, ca.coords, { worker: 5 })).error).toBeUndefined();
  });

  it('every few hours goods arrive at home, never more than the caravan carries', async () => {
    const p = await a.get(`/api/trade/preview?colonyId=${ca.id}&region=${meadow.coords.region}&patch=${meadow.coords.patch}&spot=${meadow.coords.spot}`);
    const before = (await a.get(`/api/state?colony=${ca.id}`)).colony;
    await clock.advance(tradeEveryMs(speed));
    const m = await mission(a, id);
    const want = tradeDelivery(p.potential, 10 * CASTES.worker.cargo);
    expect(m.result.next).toBe(2);
    expect(m.result.delivered).toEqual(want);
    expect(m.result.delivered.foliage).toBeLessThanOrEqual(10 * CASTES.worker.cargo);
    const after = (await a.get(`/api/state?colony=${ca.id}`)).colony;
    expect(after.resources.foliage).toBeGreaterThan(before.resources.foliage + want.foliage - 1);
  });

  it('after the last delivery the caravan walks home, and the colony can open a new trail', async () => {
    await clock.advance(tradeEveryMs(speed) * (TRADE.deliveries - 1) + 10);
    let m = await mission(a, id);
    expect(m.status).toBe('returning');
    expect(m.result).toMatchObject({ trading: false, closed: 'done', next: TRADE.deliveries + 1 });
    await clock.advance(m.returnAt - clock.t + 10);
    m = await mission(a, id);
    expect(m).toBeUndefined(); // done
    const home = (await a.get(`/api/state?colony=${ca.id}`)).colony;
    expect(home.units.worker).toBe(40);
    const reports = (await a.get('/api/reports')).reports.filter((r: any) => r.type === 'trade');
    expect(reports.map((r: any) => r.title)).toContain('Your trade trail to Meadow Nest has run its course');
  });

  it('recalling a caravan stops the deliveries', async () => {
    const r = await send(a, ca.id, meadow.coords, { worker: 5 });
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    expect((await a.post(`/api/missions/${r.mission.id}/recall`)).ok).toBe(true);
    await clock.advance(tradeEveryMs(speed) + 10);
    const m = await getPool().query('SELECT result, status FROM missions WHERE id = $1', [r.mission.id]);
    expect(m.rows[0].result.next).toBe(1);
    expect(['returning', 'done']).toContain(m.rows[0].status);
  });
});

describe('player trails', () => {
  let id: number;
  let truceId: number;

  it('need a truce or a shared scent', async () => {
    await clock.advance(24 * 3600_000); // everyone home
    const r = await send(a, ca.id, cb.coords, { worker: 10 });
    expect(r.error).toMatchObject({ code: 'needs_pact', message: TRADE_MESSAGES.needs_pact });
  });

  it('with a truce both sides gain: the host gets a share in the goods of the sender’s ground', async () => {
    expect((await b.post('/api/truces', { playerId: ida })).ok).toBe(true);
    truceId = (await a.get('/api/diplomacy')).truces[0].id;
    expect((await a.post(`/api/truces/${truceId}/accept`)).ok).toBe(true);
    const p = await a.get(`/api/trade/preview?colonyId=${ca.id}&region=${cb.coords.region}&patch=${cb.coords.patch}&spot=${cb.coords.spot}`);
    // b lives on Grassland: a bundle of all three; a lives on Grassland too, so b gains a bundle
    expect(p).toMatchObject({ kind: 'truce', terrain: 'grassland', goods: 'Foliage, Protein and Nectar', partnerGoods: 'Foliage, Protein and Nectar' });
    const r = await send(a, ca.id, cb.coords, { media_worker: 10 });
    expect(r.error).toBeUndefined();
    id = r.mission.id;
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    expect((await b.get('/api/reports')).reports.map((x: any) => x.title)).toContain("ant's caravan opened a trade trail to " + cb.name);
    await clock.advance(tradeEveryMs(speed));
    const m = await mission(a, id);
    expect(m.result.kind).toBe('truce');
    const got = m.result.delivered;
    const total = got.foliage + got.protein + got.nectar;
    expect(total).toBeGreaterThan(0);
    const host = m.result.partnerGot;
    expect(host.foliage + host.protein + host.nectar).toBeGreaterThanOrEqual(Math.floor(total * TRADE.partnerShare) - 3);
    expect(host.nectar).toBeGreaterThan(0);
  });

  it('a truce in its notice keeps the trail going; when it ends, the trail closes', async () => {
    expect((await b.post(`/api/truces/${truceId}/end`)).ok).toBe(true);
    // no new trails while the pact is ending
    await setColony(meadow.id, { units: { worker: 5 } });
    const r = await send(a, meadow.id, cb.coords, { worker: 5 });
    expect(r.error).toMatchObject({ code: 'pact_ending' });
    await clock.advance(tradeEveryMs(speed));
    expect((await mission(a, id)).result.next).toBe(3);
    await clock.advance(truceNoticeMs(speed));
    const m = await mission(a, id);
    expect(m.status).toBe('returning');
    expect(m.result.closed).toBe('pact_ended');
  });
});
