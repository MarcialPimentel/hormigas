// The map's region overview and "nearest colony" jumps (docs/11-world.md, "Map screen").
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, type Client } from './helpers';

let app: FastifyInstance;
let a: Client;
let b: Client;
let ca: any;
const far = { region: 3, patch: 50, spot: 5 };

beforeAll(async () => {
  ({ app } = await setupTest());
  a = await newPlayer(app, 'mapper');
  b = await newPlayer(app, 'faraway');
  ca = (await a.get('/api/state')).colony;
  const cb = (await b.get('/api/state')).colony;
  // move b's colony far off; any wild nest it spawned stays behind in its old patch
  await getPool().query('UPDATE colonies SET region = $1, patch = $2, spot = $3 WHERE id = $4', [far.region, far.patch, far.spot, cb.id]);
});
afterAll(async () => teardownTest(app));

describe('region overview', () => {
  it('marks your patch and its wild nest, and counts only player colonies', async () => {
    const r = await a.get(`/api/map/region?region=${ca.coords.region}`);
    const home = r.patches.find((p: any) => p.patch === ca.coords.patch);
    expect(home).toMatchObject({ mine: true, wild: true, colonies: 1 });
  });

  it("shows another player's patch without saying who lives there", async () => {
    const r = await a.get(`/api/map/region?region=${far.region}`);
    const p = r.patches.find((x: any) => x.patch === far.patch);
    expect(p).toEqual({ patch: far.patch, colonies: 1, wild: false, mine: false });
  });

  it('refuses a region that does not exist', async () => {
    expect((await a.get('/api/map/region?region=99')).error.code).toBe('bad_coords');
  });
});

describe('nearest colony', () => {
  it("jumps to the next patch with another player's colony, skipping wild nests", async () => {
    const r = await a.get(`/api/map/nearest?region=${ca.coords.region}&patch=${ca.coords.patch}&dir=1`);
    expect(r.found).toEqual({ region: far.region, patch: far.patch });
  });

  it('wraps around the world going backwards', async () => {
    const r = await a.get(`/api/map/nearest?region=${ca.coords.region}&patch=${ca.coords.patch}&dir=-1`);
    expect(r.found).toEqual({ region: far.region, patch: far.patch });
  });

  it('never lands on your own colony or on the patch you are looking at', async () => {
    const r = await b.get(`/api/map/nearest?region=${far.region}&patch=${far.patch}&dir=1`);
    expect(r.found).toEqual({ region: ca.coords.region, patch: ca.coords.patch });
    const self = await a.get(`/api/map/nearest?region=${far.region}&patch=${far.patch}&dir=1`);
    expect(self.found).toBeNull();
  });
});
