// Scouting an incoming raid (docs/20-swarms.md § Scouting an incoming raid): a player's raid hides its size until the
// defender's Scouts go out and meet it, the same way a swarm does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { roughSwarmSize } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, newPlayerBeside, setColony, setPlayer, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let aId: number, bId: number;
let raidId: number;

const incomingRaid = async () => (await b.get('/api/state')).incoming.find((i: any) => i.type === 'raid');
const lastScoutReport = async () =>
  (await getPool().query("SELECT title, data FROM reports WHERE player_id = $1 AND type = 'scout' ORDER BY id DESC LIMIT 1", [bId])).rows[0];

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'sneaky');
  b = await newPlayerBeside(app, 'watchful', a);
  const sa = await a.get('/api/state');
  const sb = await b.get('/api/state');
  ca = sa.colony;
  cb = sb.colony;
  aId = sa.player.id;
  bId = sb.player.id;
  await calmWildNests();
  await knowAll();
  await setPlayer(bId, { protected_until: 0, last_active: clock.t });
  await setPlayer(aId, { research: { mandibles: 2 } });
  await setColony(ca.id, { nectar: 1e6, last_updated: clock.t, units: { major_soldier: 37 } });
  await setColony(cb.id, { nectar: 1e6, last_updated: clock.t, units: { scout: 60, minor_soldier: 30 } });
});
afterAll(async () => teardownTest(app));

describe('scouting an incoming raid', () => {
  it('with nothing coming, scouting your own colony is refused', async () => {
    const r = await b.post('/api/missions', { colonyId: cb.id, type: 'scout', target: cb.coords, units: { scout: 1 } });
    expect(r.ok).not.toBe(true);
    expect(JSON.stringify(r)).toContain('raid');
  });

  it("a player's raid shows only a rough size and no make-up until scouted", async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 37 } });
    expect(r.ok).toBe(true);
    raidId = r.mission.id;
    const inc = await incomingRaid();
    expect(inc.hostile).toBe(true);
    expect(inc.scouted).toBe(false);
    expect(inc.unitCount).toBe(roughSwarmSize(37));
    expect(inc.units).toBeUndefined();
    expect(inc.research).toBeUndefined();
  });

  it('naming a party that is not coming is refused', async () => {
    const r = await b.post('/api/missions', { colonyId: cb.id, type: 'scout', target: cb.coords, units: { scout: 1 }, meet: raidId + 999 });
    expect(r.ok).not.toBe(true);
  });

  it('scouts sent to meet it report its real size, and the card shows it with the raider’s research', async () => {
    const sent = await b.post('/api/missions', { colonyId: cb.id, type: 'scout', target: cb.coords, units: { scout: 60 }, meet: raidId });
    expect(sent.ok).toBe(true);
    const raid = (await getPool().query('SELECT arrive_at FROM missions WHERE id = $1', [raidId])).rows[0];
    expect(sent.mission.arriveAt).toBeLessThan(Number(raid.arrive_at));
    await setPlayer(bId, { last_active: sent.mission.arriveAt });
    await clock.advance(sent.mission.arriveAt - clock.t + 1);

    const rep = await lastScoutReport();
    // 60 scouts at 30% each: the chance none get back is about one in two billion
    expect(rep.title).toBe(`Raid scouted: 37 ants from sneaky heading for ${cb.name}`);
    expect(rep.data.party.units).toEqual({ major_soldier: 37 });
    expect(rep.data.party.from).toBe('sneaky');
    expect(rep.data.back + rep.data.lost).toBe(60);

    const inc = await incomingRaid();
    expect(inc.scouted).toBe(true);
    expect(inc.unitCount).toBe(37);
    expect(inc.units).toEqual({ major_soldier: 37 });
    expect(inc.research).toEqual({ mandibles: 2 });
    // the raider's own view of its mission is untouched
    expect((await a.get('/api/state')).missions.find((m: any) => m.id === raidId).units).toEqual({ major_soldier: 37 });
  });

  it('the scouted raid still lands as a normal battle', async () => {
    const raid = (await getPool().query('SELECT arrive_at FROM missions WHERE id = $1', [raidId])).rows[0];
    await setPlayer(bId, { last_active: Number(raid.arrive_at) });
    await clock.advance(Number(raid.arrive_at) - clock.t + 10);
    const battle = (await b.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(battle).toBeTruthy();
    expect((await getPool().query('SELECT status FROM missions WHERE id = $1', [raidId])).rows[0].status).not.toBe('outbound');
  });
});
