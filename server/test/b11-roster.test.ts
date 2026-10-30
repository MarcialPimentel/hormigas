// Build 11, "The full roster": Slave-makers carry corpses home from a won raid; allies are raised like castes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let aId: number, bId: number;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'polyergus');
  b = await newPlayer(app, 'formica');
  const sa = await a.get('/api/state');
  const sb = await b.get('/api/state');
  ca = sa.colony;
  cb = sb.colony;
  aId = sa.player.id;
  bId = sb.player.id;
  await calmWildNests();
  await knowAll();
  await setPlayer(aId, { protected_until: 0 });
  await setPlayer(bId, { protected_until: 0 });
});
afterAll(async () => teardownTest(app));

describe('Slave-makers', () => {
  it('carry part of the dead straight home after a won raid; the rest stays on the field', async () => {
    await setColony(ca.id, { nectar: 1e6, protein: 0, last_updated: clock.t, units: { slave_maker: 40, minor_soldier: 60 } });
    await setColony(cb.id, { foliage: 5000, protein: 5000, nectar: 500, last_updated: clock.t, units: { worker: 30, minor_soldier: 10 }, defenses: {} });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { slave_maker: 40, minor_soldier: 60 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const rep = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(rep.data.winner).toBe('attacker');
    expect(rep.data.corpsesCarried).toBeGreaterThan(0);
    expect(rep.data.corpsesCarried).toBeLessThanOrEqual(rep.data.corpses);
    const field = await getPool().query('SELECT protein FROM corpse_fields WHERE region=$1 AND patch=$2 AND spot=$3', [cb.coords.region, cb.coords.patch, cb.coords.spot]);
    const left = field.rows[0] ? Number(field.rows[0].protein) : 0;
    expect(left).toBeCloseTo(rep.data.corpses - rep.data.corpsesCarried, 0);
    // home with the loot and the carried corpses
    await clock.advance(r.mission.arriveAt - r.mission.departAt + 10); // the walk home takes as long as the way out
    const home = (await a.get('/api/state')).colony.resources.protein;
    expect(home).toBeGreaterThanOrEqual(rep.data.corpsesCarried);
  });
});

describe('allies are raised like castes', () => {
  it('a Rhinoceros Beetle needs Brood Hall 6 and Symbiosis 4', async () => {
    await setColony(ca.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, unit_queue: [], chambers: { queen_chamber: 6, brood_hall: 6 } });
    await setPlayer(aId, { research: { symbiosis: 3 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'rhino_beetle', count: 1 })).error.code).toBeTruthy();
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'bullet_ant', count: 1 })).ok).toBe(true);
    await setPlayer(aId, { research: { symbiosis: 4 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'rhino_beetle', count: 1 })).ok).toBe(true);
  });
});
