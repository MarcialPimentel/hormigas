// Build 7: scents, discovery and placement (docs/22-discovery.md, docs/11-world.md).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WORLD, DISCOVERY_MESSAGES } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
const H = 3600_000;

const spotOf = async (who: Client, at: { region: number; patch: number; spot: number }) =>
  (await who.get(`/api/map?region=${at.region}&patch=${at.patch}`)).spots.find((s: any) => s.spot === at.spot);

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'alpha');
  b = await newPlayer(app, 'beta');
  ca = (await a.get('/api/state')).colony;
  cb = (await b.get('/api/state')).colony;
  await calmWildNests();
  // both out of new-colony protection, with an army and scouts
  const players = (await getPool().query('SELECT id FROM players WHERE NOT is_npc')).rows.map((r) => r.id);
  for (const id of players) await setPlayer(id, { protected_until: 0 });
  for (const c of [ca, cb]) await setColony(c.id, { foliage: 1e5, protein: 1e5, nectar: 1e5, last_updated: clock.t, units: { scout: 5, minor_soldier: 20, worker: 10 } });
});
afterAll(async () => teardownTest(app));

describe('placement', () => {
  it('the second player joins the first one in the same patch', () => {
    expect(cb.coords.region).toBe(ca.coords.region);
    expect(cb.coords.patch).toBe(ca.coords.patch);
  });
});

describe('scents', () => {
  it('an unscouted neighbour is only an ant scent: no name, owner, points or id', async () => {
    const s = await spotOf(a, cb.coords);
    expect(s.colony).toMatchObject({ known: 'scent', kind: 'player', name: 'Ant scent', owner: null, id: null });
    expect(s.colony.points).toBeUndefined();
    expect(JSON.stringify(s.colony)).not.toContain('beta');
    // your own colony is always known
    expect((await spotOf(a, ca.coords)).colony).toMatchObject({ known: 'mine', mine: true, name: ca.name });
  });

  it('raiding or sending to a scent is refused with the reason', async () => {
    const raid = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { minor_soldier: 5 } });
    expect(raid.error).toMatchObject({ code: 'not_scouted', message: DISCOVERY_MESSAGES.raid_needs_scout });
    const send = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 }, cargo: { foliage: 1 } });
    expect(send.error.code).toBe('not_scouted');
  });

  it('scouting is always allowed, and turns the scent into a known colony you can raid', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { scout: 1 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const s = await spotOf(a, cb.coords);
    expect(s.colony).toMatchObject({ known: 'known', kind: 'player', name: cb.name, owner: 'beta', mine: false });
    expect(s.colony.discoveredAt).toBeGreaterThan(0);
    const raid = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { minor_soldier: 5 } });
    expect(raid.error?.code).not.toBe('not_scouted');
  });

  it('the scouted player now recognizes the scent, but must still scout before raiding back', async () => {
    const s = await spotOf(b, ca.coords);
    expect(s.colony).toMatchObject({ known: 'familiar', kind: 'player', name: ca.name, owner: 'alpha', id: null });
    expect(s.colony.smelledAt).toBeGreaterThan(0);
    expect(s.colony.points).toBeUndefined();
    const raid = await b.post('/api/missions', { colonyId: cb.id, type: 'raid', target: ca.coords, units: { minor_soldier: 5 } });
    expect(raid.error.code).toBe('not_scouted');
  });

  it('a raid also leaves its scent on the defender', async () => {
    // a third player, raided by alpha, recognizes alpha afterwards
    const c = await newPlayer(app, 'gamma');
    const cc = (await c.get('/api/state')).colony;
    await setPlayer((await c.get('/api/state')).player.id, { protected_until: 0, points_total: 1000, points: { total: 1000, economy: 1000, research: 0, military: 0 } });
    await getPool().query(
      "INSERT INTO known_colonies (player_id, colony_id, via, first_at, discovered_at) SELECT player_id, $1, 'scouted', $2, $2 FROM colonies WHERE id = $3",
      [cc.id, clock.t, ca.id],
    );
    await calmWildNests();
    await clock.advance(12 * H); // earlier parties come home and free their slots
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cc.coords, units: { minor_soldier: 5 } });
    expect(r.error).toBeUndefined();
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    expect((await spotOf(c, ca.coords)).colony).toMatchObject({ known: 'familiar', owner: 'alpha' });
  });

  it('the wild nest in your patch starts as a wild scent', async () => {
    const spots = (await a.get(`/api/map?region=${ca.coords.region}&patch=${ca.coords.patch}`)).spots;
    const nest = spots.find((s: any) => s.colony?.kind === 'wild');
    expect(nest.colony).toMatchObject({ known: 'scent', name: 'Wild scent', owner: null });
    expect(nest.colony.wild).toBeUndefined();
    const raid = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: { ...ca.coords, spot: nest.spot }, units: { minor_soldier: 5 } });
    expect(raid.error.code).toBe('not_scouted');
  });
});

describe('the launch migration', () => {
  it('rebuilds what players knew from mission history, and is safe to run again', async () => {
    const before = (await getPool().query('SELECT player_id, colony_id FROM known_colonies ORDER BY 1, 2')).rows;
    await getPool().query('DELETE FROM known_colonies');
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/migrations/008_known_colonies.sql'), 'utf8');
    await getPool().query(sql);
    await getPool().query(sql);
    const rows = (await getPool().query('SELECT player_id, colony_id, via, discovered_at, smelled_at FROM known_colonies')).rows;
    const alpha = (await getPool().query("SELECT id FROM players WHERE username = 'alpha'")).rows[0].id;
    const beta = (await getPool().query("SELECT id FROM players WHERE username = 'beta'")).rows[0].id;
    // alpha scouted beta: known
    expect(rows.find((r) => r.player_id === alpha && r.colony_id === cb.id)).toMatchObject({ via: 'earlier' });
    expect(rows.find((r) => r.player_id === alpha && r.colony_id === cb.id).discovered_at).not.toBeNull();
    // beta was scouted by alpha: familiar only
    const back = rows.find((r) => r.player_id === beta && r.colony_id === ca.id);
    expect(back).toMatchObject({ discovered_at: null });
    expect(['scouted_you', 'raided_you']).toContain(back.via);
    expect(back.smelled_at).not.toBeNull();
    // nothing the game had recorded is lost
    expect(rows.length).toBe(before.length);
    // the wild owner never knows anything
    expect(rows.every((r) => r.player_id === alpha || r.player_id === beta || r.player_id > beta)).toBe(true);
  });
});

describe('placement fills patches, then opens the next one', () => {
  it('up to 4 players per patch, then the neighbouring patch; lone active players get neighbours first', async () => {
    // alpha, beta and gamma already share a patch; one more fills it
    const home = ca.coords;
    const d = await newPlayer(app, 'delta');
    expect((await d.get('/api/state')).colony.coords).toMatchObject({ region: home.region, patch: home.patch });
    const idx = (c: any) => (c.region - 1) * WORLD.patchesPerRegion + c.patch;
    const e = (await (await newPlayer(app, 'epsilon')).get('/api/state')).colony.coords;
    expect(idx(e)).toBe(idx(home) + 1);
    // the next one joins epsilon rather than opening another patch
    const f = (await (await newPlayer(app, 'zeta')).get('/api/state')).colony.coords;
    expect(idx(f)).toBe(idx(e));
  });

  it('a patch whose players are all inactive is not joined', async () => {
    await getPool().query(
      `UPDATE players SET last_active = $1 WHERE id IN (SELECT player_id FROM colonies WHERE region = (SELECT region FROM colonies c JOIN players p ON p.id = c.player_id WHERE p.username = 'zeta')
         AND patch = (SELECT patch FROM colonies c JOIN players p ON p.id = c.player_id WHERE p.username = 'zeta'))`,
      [clock.t - 30 * 24 * H],
    );
    const zeta = (await getPool().query("SELECT c.region, c.patch FROM colonies c JOIN players p ON p.id = c.player_id WHERE p.username = 'zeta'")).rows[0];
    const g = (await (await newPlayer(app, 'eta')).get('/api/state')).colony.coords;
    expect(`${g.region}:${g.patch}`).not.toBe(`${zeta.region}:${zeta.patch}`);
  });
});
