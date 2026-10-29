// Feedback #5: "scouting a nest I just raided still shows its soldiers".
// The nest data was right; scouts outrun soldiers, so a scout sent after a raid can land first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let nest: { region: number; patch: number; spot: number };
const MIN = 60_000;

const nestRow = async () => (await getPool().query('SELECT * FROM colonies WHERE npc IS NOT NULL AND region = $1 AND patch = $2', [c.coords.region, c.coords.patch])).rows[0];
const latest = async (type: string) => (await p.get('/api/reports?limit=100')).reports.find((r: any) => r.type === type);
const total = (u: Record<string, number> = {}) => Object.values(u).reduce((a, b) => a + b, 0);

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'raider');
  c = (await p.get('/api/state')).colony;
  await getPool().query("UPDATE events SET done = true WHERE type IN ('nest_raid', 'nest_event')");
  await setColony(c.id, { foliage: 1e5, protein: 1e5, nectar: 1e5, last_updated: clock.t, units: { scout: 5, minor_soldier: 400 } });
  await knowAll();
  const row = await nestRow();
  nest = { region: row.region, patch: row.patch, spot: row.spot };
});
afterAll(async () => teardownTest(app));

describe('scouting a wild nest around a raid', () => {
  it('a scout that lands before your raid says so', async () => {
    expect((await p.post('/api/missions', { colonyId: c.id, type: 'raid', target: nest, units: { minor_soldier: 200 } })).ok).toBe(true);
    expect((await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: nest, units: { scout: 1 } })).ok).toBe(true);
    const missions = (await p.get('/api/state')).missions;
    const raid = missions.find((m: any) => m.type === 'raid');
    const scout = missions.find((m: any) => m.type === 'scout');
    expect(scout.arriveAt).toBeLessThan(raid.arriveAt); // scouts are faster

    await clock.advance(scout.arriveAt - clock.t);
    const rep = await latest('scout');
    expect(total(rep.data.units)).toBeGreaterThan(0);
    expect(rep.data.raidArrivesAt).toBe(raid.arriveAt);
    expect(rep.data.regrowMs).toBeGreaterThan(0);
    await clock.advance(raid.arriveAt - clock.t + MIN);
    expect((await latest('battle')).data.winner).toBe('attacker');
  });

  it('a scout that lands after the raid sees the emptied nest, with no note', async () => {
    expect(total((await nestRow()).units)).toBe(0);
    expect((await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: nest, units: { scout: 1 } })).ok).toBe(true);
    await clock.advance(5 * MIN);
    const rep = await latest('scout');
    expect(total(rep.data.units)).toBe(0);
    expect(rep.data.raidArrivesAt).toBeUndefined();
  });
});
