// Build 4: more colonies — Nuptial Flight, the Winged Queen and the Found Colony mission (docs/19-colonies.md).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RESOURCES_DATA, TERRAIN, maxColonies, terrainForSpot } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let me: any;
const H = 3600_000;
const rich = { foliage: 1e6, protein: 1e6, nectar: 1e6 };

/** An empty colony spot in the player's patch (not the wilds, no colony or wild nest on it). */
async function emptySpot(skip: number[] = []) {
  const taken = (await getPool().query('SELECT spot FROM colonies WHERE region = $1 AND patch = $2', [c.coords.region, c.coords.patch])).rows.map((r: any) => r.spot);
  for (let s = 1; s <= 12; s++) if (!taken.includes(s) && !skip.includes(s)) return { ...c.coords, spot: s };
  throw new Error('no empty spot');
}
const colonies = async () => (await getPool().query('SELECT * FROM colonies WHERE player_id = $1 ORDER BY id', [me.id])).rows;
const reports = async (type: string) => (await getPool().query('SELECT title, data FROM reports WHERE player_id = $1 AND type = $2 ORDER BY id', [me.id, type])).rows;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'founder');
  const s = await p.get('/api/state');
  c = s.colony;
  me = s.player;
  await calmWildNests();
});
afterAll(async () => teardownTest(app));
// swarms are tested in swarms.test.ts; keep them away from these colonies
beforeEach(calmWildNests);

describe('the cap', () => {
  it('is 1 colony, plus one at Nuptial Flight levels 1, 3, 5', () => {
    expect(maxColonies({})).toBe(1);
    expect(maxColonies({ nuptial_flight: 1 })).toBe(2);
    expect(maxColonies({ nuptial_flight: 2 })).toBe(2);
    expect(maxColonies({ nuptial_flight: 3 })).toBe(3);
    expect(maxColonies({ nuptial_flight: 5 })).toBe(4);
  });
});

describe('unlocks', () => {
  it('Nuptial Flight needs Pheromone Chamber 3', async () => {
    await setColony(c.id, { ...rich, last_updated: clock.t, chambers: { queen_chamber: 5, pheromone_chamber: 2 } });
    const r = await p.post('/api/research', { colonyId: c.id, research: 'nuptial_flight' });
    expect(r.ok).not.toBe(true);
    await setColony(c.id, { chambers: { queen_chamber: 5, pheromone_chamber: 3 } });
    expect((await p.post('/api/research', { colonyId: c.id, research: 'nuptial_flight' })).ok).toBe(true);
    await getPool().query('UPDATE players SET research_job = NULL WHERE id = $1', [me.id]);
    await getPool().query("UPDATE events SET done = true WHERE type = 'research_done'");
  });

  it('the Winged Queen needs Brood Hall 4 and Nuptial Flight 1', async () => {
    await setColony(c.id, { ...rich, last_updated: clock.t, chambers: { queen_chamber: 5, brood_hall: 4, pheromone_chamber: 3 } });
    await setPlayer(me.id, { research: {} });
    const no = await p.post(`/api/colonies/${c.id}/brood`, { kind: 'caste', id: 'winged_queen', count: 1 });
    expect(no.ok).not.toBe(true);
    await setPlayer(me.id, { research: { nuptial_flight: 1 } });
    const yes = await p.post(`/api/colonies/${c.id}/brood`, { kind: 'caste', id: 'winged_queen', count: 1 });
    expect(yes.ok).toBe(true);
    await clock.advance(48 * H);
    expect((await p.get('/api/state')).colony.units.winged_queen).toBe(1);
  });
});

describe('founding', () => {
  it('needs exactly one queen, and an empty spot', async () => {
    await setColony(c.id, { ...rich, last_updated: clock.t, units: { winged_queen: 2, worker: 20 } });
    const target = await emptySpot();
    const none = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target, units: { worker: 5 } });
    expect(none.error.code).toBe('one_queen');
    const two = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target, units: { winged_queen: 2 } });
    expect(two.error.code).toBe('one_queen');
    const wild = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target: { ...c.coords, spot: 13 }, units: { winged_queen: 1 } });
    expect(wild.error.code).toBe('bad_target');
    const home = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target: c.coords, units: { winged_queen: 1 } });
    expect(home.error.code).toBe('bad_target');
  });

  it('founds a colony with the escorts, the cargo and the starting stores; the queen is used up', async () => {
    await setColony(c.id, { ...rich, last_updated: clock.t, units: { winged_queen: 2, worker: 20 } });
    const target = await emptySpot();
    const r = await p.post('/api/missions', {
      colonyId: c.id, type: 'colonize', target, units: { winged_queen: 1, worker: 10 }, cargo: { foliage: 300, protein: 200, nectar: 100 },
    });
    expect(r.ok).toBe(true);
    // the cap counts queens in the air: no second flight while this one is out
    const again = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target: await emptySpot([target.spot]), units: { winged_queen: 1 } });
    expect(again.error.code).toBe('colony_cap');

    // land, then keep the new colony's first swarm away (swarms.test.ts covers them)
    const flight = (await p.get('/api/state')).missions[0];
    await clock.advance(flight.arriveAt - clock.t + 1);
    await calmWildNests();
    await clock.advance(48 * H);
    const cols = await colonies();
    expect(cols).toHaveLength(2);
    const fresh = cols[1];
    expect(fresh.spot).toBe(target.spot);
    expect(fresh.name).toBe("founder's Nest 2");
    expect(fresh.chambers).toEqual({ queen_chamber: 1 });
    expect(fresh.units).toEqual({ worker: 10 });
    expect(fresh.terrain).toBe(terrainForSpot(target.spot));
    const [lo, hi] = TERRAIN[fresh.terrain as keyof typeof TERRAIN].space;
    expect(fresh.base_space).toBeGreaterThanOrEqual(lo);
    expect(fresh.base_space).toBeLessThanOrEqual(hi);
    expect(fresh.foliage).toBeGreaterThanOrEqual(RESOURCES_DATA.startingResources.foliage + 300);
    expect(fresh.protein).toBeGreaterThanOrEqual(RESOURCES_DATA.startingResources.protein + 200);

    const home = (await p.get(`/api/state?colony=${c.id}`)).colony;
    expect(home.units.winged_queen).toBe(1); // one flew, one stayed
    const s = await p.get('/api/state');
    expect(s.colonies).toHaveLength(2);
    expect(s.missions).toHaveLength(0);
    const rep = (await reports('colonize')).at(-1);
    expect(rep.data.founded).toBe(true);

    // its own nest events
    const ev = await getPool().query("SELECT 1 FROM events WHERE NOT done AND type = 'nest_event' AND (payload->>'colonyId')::int = $1", [fresh.id]);
    expect(ev.rowCount).toBe(1);
  });

  it('is capped by Nuptial Flight', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target: await emptySpot(), units: { winged_queen: 1 } });
    expect(r.error.code).toBe('colony_cap');
    await setPlayer(me.id, { research: { nuptial_flight: 3 } });
    const ok = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target: await emptySpot(), units: { winged_queen: 1 } });
    expect(ok.ok).toBe(true);
    // don't let it land: recall it, she comes home
    const m = (await p.get('/api/state')).missions[0];
    expect((await p.post(`/api/missions/${m.id}/recall`)).ok).toBe(true);
    await clock.advance(48 * H);
    expect((await p.get(`/api/state?colony=${c.id}`)).colony.units.winged_queen).toBe(1);
  });

  it('turns back if the spot is taken while she flies, and nothing is lost', async () => {
    const target = await emptySpot();
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'colonize', target, units: { winged_queen: 1, worker: 3 } });
    expect(r.ok).toBe(true);
    // someone else settles there first
    const rival = await newPlayer(app, 'squatter');
    const rs = await rival.get('/api/state');
    await setColony(rs.colony.id, { spot: target.spot, region: target.region, patch: target.patch });
    await calmWildNests();
    await clock.advance(96 * H);
    expect(await colonies()).toHaveLength(2);
    const rep = (await reports('colonize')).at(-1);
    expect(rep.data.founded).toBe(false);
    const home = (await p.get(`/api/state?colony=${c.id}`)).colony;
    expect(home.units.winged_queen).toBe(1);
  });
});
