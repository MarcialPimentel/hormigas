import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { distance, missionFuel, travelSeconds } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'alpha');
  b = await newPlayer(app, 'beta');
  ca = (await a.get('/api/state')).colony;
  cb = (await b.get('/api/state')).colony;
  await setColony(ca.id, { foliage: 50000, protein: 50000, nectar: 50000, last_updated: clock.t, units: { worker: 20, scout: 5, minor_soldier: 10 } });
  await setColony(cb.id, { foliage: 1000, protein: 1000, nectar: 0, last_updated: clock.t, units: { minor_soldier: 3 } });
});
afterAll(async () => teardownTest(app));

describe('map', () => {
  it('shows the patch with colonies and flags', async () => {
    const m = await a.get(`/api/map?region=${ca.coords.region}&patch=${ca.coords.patch}`);
    expect(m.spots).toHaveLength(13);
    const mine = m.spots.find((s: any) => s.spot === ca.coords.spot);
    expect(mine.colony.mine).toBe(true);
    expect(mine.colony.protected).toBe(true);
    const bad = await a.get('/api/map?region=9&patch=1');
    expect(bad.status).toBe(400);
  });
});

describe('transport', () => {
  it('delivers cargo, pays fuel, returns units', async () => {
    const dist = distance(ca.coords, cb.coords);
    const fuel = missionFuel({ worker: 10 }, dist, 100);
    const r = await a.post('/api/missions', {
      colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 10 }, cargo: { foliage: 5000, protein: 0, nectar: 100 }, speedPct: 100,
    });
    expect(r.ok).toBe(true);
    const s1 = await a.get('/api/state');
    expect(s1.colony.units.worker).toBe(10);
    expect(s1.colony.resources.nectar).toBeCloseTo(50000 - 100 - fuel, 0);
    expect(s1.missions).toHaveLength(1);
    const sb = await b.get('/api/state');
    expect(sb.incoming).toHaveLength(1);
    expect(sb.incoming[0].hostile).toBe(false);

    const oneWay = r.mission.arriveAt - r.mission.departAt;
    expect(oneWay).toBe(travelSeconds(dist, 5000, 100, s1.world.speed) * 1000);
    await clock.advance(oneWay + 10);
    const sb2 = await b.get('/api/state');
    expect(sb2.colony.resources.foliage).toBeGreaterThan(5900);
    expect(sb2.unreadReports).toBeGreaterThan(0);

    await clock.advance(oneWay + 10);
    const s2 = await a.get('/api/state');
    expect(s2.colony.units.worker).toBe(20);
    expect(s2.missions).toHaveLength(0);
  });

  it('rejects overloaded cargo, missing units and bad targets', async () => {
    const over = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 }, cargo: { foliage: 99999 } });
    expect(over.error.code).toBe('over_cargo');
    const tooMany = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 999 } });
    expect(tooMany.error.code).toBe('not_enough_units');
    const empty = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: { ...cb.coords, spot: cb.coords.spot === 1 ? 2 : 1 }, units: { worker: 1 } });
    expect(empty.error.code).toBe('bad_target');
    const none = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: {} });
    expect(none.error.code).toBe('no_units');
  });
});

describe('slots & recall', () => {
  it('limits concurrent missions and recalls return early', async () => {
    const m1 = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 }, speedPct: 10 });
    const m2 = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 }, speedPct: 10 });
    expect(m2.ok).toBe(true);
    const m3 = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 } });
    expect(m3.error.code).toBe('no_slots');

    await clock.advance(5000);
    const rc = await a.post(`/api/missions/${m1.mission.id}/recall`);
    expect(rc.mission.status).toBe('returning');
    expect(rc.mission.returnAt - clock.t).toBe(clock.t - m1.mission.departAt);
    await clock.advance(6000);
    const s = await a.get('/api/state');
    expect(s.missions.map((m: any) => m.id)).toEqual([m2.mission.id]);
    await a.post(`/api/missions/${m2.mission.id}/recall`);
    await clock.advance(3600_000);
    expect((await a.get('/api/state')).colony.units.worker).toBe(20);
  });

  it("can't recall someone else's mission", async () => {
    const m = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 } });
    const r = await b.post(`/api/missions/${m.mission.id}/recall`);
    expect(r.status).toBe(403);
    await clock.advance(3600_000);
  });
});

describe('scout', () => {
  it('only scouts may scout; report detail depends on scent reading', async () => {
    const bad = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { worker: 1 } });
    expect(bad.error.code).toBe('scouts_only');
    const self = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: ca.coords, units: { scout: 1 } });
    expect(self.error.code).toBe('bad_target');

    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { scout: 3 } });
    expect(r.ok).toBe(true);
    const sb = await b.get('/api/state');
    expect(sb.incoming.some((i: any) => i.type === 'scout' && i.hostile)).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const reports = await a.get('/api/reports');
    const rep = reports.reports.find((x: any) => x.type === 'scout');
    expect(rep).toBeTruthy();
    expect(rep.data.resources.foliage).toBeGreaterThan(0);
    // 3 scouts at equal scent reading: diff = floor(0 + 1) = 1 → units visible
    expect(rep.data.detail).toBe('units');
    expect(rep.data.units.minor_soldier).toBe(3);
    const def = await b.get('/api/reports');
    expect(def.reports.some((x: any) => x.type === 'scouted')).toBe(true);
    await clock.advance(3600_000);
  });
});

describe('relocate', () => {
  it('only to own colonies', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'relocate', target: cb.coords, units: { worker: 1 } });
    expect(r.error.code).toBe('bad_target');
  });
});

describe('reports', () => {
  it('mark read and delete', async () => {
    const list = await a.get('/api/reports');
    expect(list.reports.length).toBeGreaterThan(0);
    await a.post('/api/reports/read', {});
    expect((await a.get('/api/state')).unreadReports).toBe(0);
    await a.post('/api/reports/delete', { ids: [list.reports[0].id] });
    const after = await a.get('/api/reports');
    expect(after.reports.length).toBe(list.reports.length - 1);
    const n = await getPool().query("SELECT count(*)::int AS n FROM missions WHERE status <> 'done'");
    expect(n.rows[0].n).toBe(0);
  });
});
