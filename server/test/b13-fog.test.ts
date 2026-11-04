// Fog of war (docs/22-discovery.md#fog-of-war): what you can see of the world, what you saw before, and what you've
// never explored.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FOG_MESSAGES, WILDS_SPOT, patchNeighbours } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let alpha: number, beta: number;
const H = 3600_000;
// b lives far away, in a patch a has never seen
const far = { region: 2, patch: 55, spot: 6 };

const fogAt = async (who: Client, region: number, patch: number) =>
  (await who.get(`/api/map/region?region=${region}`)).fog.find((x: any) => x.patch === patch).fog;
const mapOf = (who: Client, region: number, patch: number) => who.get(`/api/map?region=${region}&patch=${patch}`);

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'alpha');
  b = await newPlayer(app, 'beta');
  const sa = await a.get('/api/state'), sb = await b.get('/api/state');
  ca = sa.colony; cb = sb.colony; alpha = sa.player.id; beta = sb.player.id;
  await getPool().query('UPDATE colonies SET region = $1, patch = $2, spot = $3 WHERE id = $4', [far.region, far.patch, far.spot, cb.id]);
  cb = (await b.get('/api/state')).colony;
  await calmWildNests();
  for (const id of [alpha, beta]) await setPlayer(id, { protected_until: 0 });
  for (const c of [ca, cb]) await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, units: { scout: 10, minor_soldier: 50, worker: 20, winged_queen: 1 } });
});
afterAll(async () => teardownTest(app));

describe('neighbours', () => {
  it('are the hexes touching a patch in its region, odd rows shifted right', () => {
    expect(patchNeighbours(1).sort((x, y) => x - y)).toEqual([2, 11]);
    expect(patchNeighbours(12).sort((x, y) => x - y)).toEqual([2, 3, 11, 13, 22, 23]);
    expect(patchNeighbours(55).sort((x, y) => x - y)).toEqual([45, 46, 54, 56, 65, 66]);
    expect(patchNeighbours(100).sort((x, y) => x - y)).toEqual([90, 99]);
  });
});

describe('what you see', () => {
  it('your patch and the patches next to it are in sight; the rest is unexplored', async () => {
    const { region, patch } = ca.coords;
    expect(await fogAt(a, region, patch)).toBe('visible');
    for (const n of patchNeighbours(patch)) expect(await fogAt(a, region, n)).toBe('visible');
    expect(await fogAt(a, far.region, far.patch)).toBe('unexplored');
  });

  it('an unexplored patch shows only its outline: no spots, no colonies, no counts', async () => {
    const m = await mapOf(a, far.region, far.patch);
    expect(m).toMatchObject({ fog: 'unexplored', spots: [{ spot: WILDS_SPOT, colony: null }] });
    expect(m.spots).toHaveLength(1);
    const r = await a.get(`/api/map/region?region=${far.region}`);
    expect(r.patches.find((x: any) => x.patch === far.patch)).toBeUndefined();
    expect((await a.get(`/api/map/nearest?region=${ca.coords.region}&patch=${ca.coords.patch}&dir=1`)).found).toBeNull();
  });

  it('into an unexplored patch only Scouts surveying its wilds may go', async () => {
    const raid = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { minor_soldier: 5 } });
    expect(raid.error).toMatchObject({ code: 'unexplored', message: FOG_MESSAGES.unexplored });
    const scoutSpot = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { scout: 1 } });
    expect(scoutSpot.error.code).toBe('unexplored');
    const found = await a.post('/api/missions', { colonyId: ca.id, type: 'colonize', target: { ...far, spot: 7 }, units: { winged_queen: 1 } });
    expect(found.error.code).toBe('unexplored');
  });
});

describe('exploring', () => {
  it('a scout reaching the wilds explores the patch: its colonies show, as last seen', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: { region: far.region, patch: far.patch, spot: WILDS_SPOT }, units: { scout: 1 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    expect(await fogAt(a, far.region, far.patch)).toBe('explored');
    const m = await mapOf(a, far.region, far.patch);
    expect(m.fog).toBe('explored');
    expect(m.seenAt).toBe(r.mission.arriveAt);
    expect(m.spots.find((s: any) => s.spot === far.spot).colony).toMatchObject({ known: 'scent', kind: 'player' });
    // the region grid and Nearest can see it now
    expect((await a.get(`/api/map/region?region=${far.region}`)).patches.find((x: any) => x.patch === far.patch)).toMatchObject({ colonies: 1 });
    expect((await a.get(`/api/map/nearest?region=${ca.coords.region}&patch=${ca.coords.patch}&dir=1`)).found).toEqual({ region: far.region, patch: far.patch });
    // and you can now scout the colony itself
    const s = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { scout: 1 } });
    expect(s.ok).toBe(true);
    await clock.advance(s.mission.returnAt ? s.mission.returnAt - clock.t + 1000 : 48 * H);
  });

  it('a colony founded after your last look stays hidden until you look again', async () => {
    const q = getPool();
    const late = (await q.query(
      `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, last_updated, created_at)
       SELECT world_id, player_id, 'Latecomer', $1, $2, 9, terrain, base_space, $3, $3 FROM colonies WHERE id = $4 RETURNING id`,
      [far.region, far.patch, clock.t, cb.id],
    )).rows[0].id;
    let m = await mapOf(a, far.region, far.patch);
    expect(m.spots.find((s: any) => s.spot === 9).colony).toBeNull();
    // b sees it: it's b's own
    expect((await mapOf(b, far.region, far.patch)).spots.find((s: any) => s.spot === 9).colony).toMatchObject({ mine: true });
    // a looks again
    await clock.advance(H);
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: { region: far.region, patch: far.patch, spot: WILDS_SPOT }, units: { scout: 1 } });
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    m = await mapOf(a, far.region, far.patch);
    expect(m.spots.find((s: any) => s.spot === 9).colony).toMatchObject({ known: 'scent' });
    await q.query('DELETE FROM colonies WHERE id = $1', [late]);
  });

  it('supercolony mates share what they see', async () => {
    const q = getPool();
    const world = (await q.query('SELECT world_id FROM players WHERE id = $1', [alpha])).rows[0].world_id;
    // b has never explored a's home patch's far corner; a's patch is in b's sight once they're mates
    expect(await fogAt(b, ca.coords.region, ca.coords.patch)).not.toBe('visible');
    const sc = (await q.query("INSERT INTO supercolonies (world_id, name, founder_id, created_at) VALUES ($1, 'Fog Mates', $2, 0) RETURNING id", [world, alpha])).rows[0].id;
    await q.query("INSERT INTO supercolony_members (supercolony_id, player_id, status, joined_at) VALUES ($1, $2, 'member', 0), ($1, $3, 'member', 0)", [sc, alpha, beta]);
    expect(await fogAt(b, ca.coords.region, ca.coords.patch)).toBe('visible');
    await q.query('DELETE FROM supercolony_members WHERE supercolony_id = $1', [sc]);
    await q.query('DELETE FROM supercolonies WHERE id = $1', [sc]);
  });
});

describe('a whole region of spots at once (the Whole Yard)', () => {
  it('gives every patch you can see into exactly as /api/map does, and leaves out the unexplored ones', async () => {
    for (const region of new Set([ca.coords.region, far.region])) {
      const { patches } = await a.get(`/api/map/spots?region=${region}`);
      const fog = (await a.get(`/api/map/region?region=${region}`)).fog;
      const open = fog.filter((f: any) => f.fog !== 'unexplored').map((f: any) => f.patch);
      expect(patches.map((p: any) => p.patch)).toEqual(open);
      for (const p of patches) {
        const { region: _r, status: _s, ...one } = await mapOf(a, region, p.patch);
        expect(p).toEqual(one);
      }
    }
    // your home patch, its neighbours and the far patch you scouted are all there
    expect((await a.get(`/api/map/spots?region=${ca.coords.region}`)).patches.find((p: any) => p.patch === ca.coords.patch).fog).toBe('visible');
    expect((await a.get(`/api/map/spots?region=${far.region}`)).patches.find((p: any) => p.patch === far.patch).fog).toBe('explored');
  });

  it('refuses a region that does not exist', async () => {
    expect((await a.get('/api/map/spots?region=99')).error.code).toBe('bad_coords');
  });
});
