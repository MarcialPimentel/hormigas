// Forage slots belong to each colony (docs/09-missions.md, Marz 30 Oct 2026).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { forageSlots, missionSlotUsage, terrainForSpot } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let home: any;
let second: number;
let me: any;
const supplies = { foliage: 1e5, protein: 1e5, nectar: 1e5, units: { worker: 50 } };

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'twocolonies');
  const s = await p.get('/api/state');
  home = s.colony;
  me = s.player;
  // a second colony in the same patch, on a free spot
  const taken = (await getPool().query('SELECT spot FROM colonies WHERE region = $1 AND patch = $2', [home.coords.region, home.coords.patch])).rows.map((r: any) => r.spot);
  const spot = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((x) => !taken.includes(x))!;
  const r = await getPool().query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, last_updated, chambers, created_at)
     VALUES (1, $1, 'Second Nest', $2, $3, $4, $5, 150, $6, '{"queen_chamber":1}', $6) RETURNING id`,
    [me.id, home.coords.region, home.coords.patch, spot, terrainForSpot(spot), clock.t],
  );
  second = r.rows[0].id;
  for (const id of [home.id, second]) await setColony(id, { ...supplies, last_updated: clock.t });
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

const forage = (colonyId: number) =>
  p.post('/api/missions', { colonyId, type: 'forage', target: { ...home.coords, spot: 13 }, units: { worker: 3 } });

describe('forage slots per colony', () => {
  it('counts only the sending colony’s parties', () => {
    const out = [{ type: 'forage', originColonyId: 1 }, { type: 'raid', originColonyId: 1 }];
    expect(missionSlotUsage(out, 'forage', {}, 1)).toEqual({ used: 1, max: 1 });
    expect(missionSlotUsage(out, 'forage', {}, 2)).toEqual({ used: 0, max: 1 });
    // mission slots stay shared by the whole player
    expect(missionSlotUsage([{ type: 'raid', originColonyId: 2 }], 'mission', {}, 1).used).toBe(1);
  });

  it('each colony can have its own party out at the same time', async () => {
    expect((await forage(home.id)).ok).toBe(true);
    expect((await forage(second)).ok).toBe(true);
  });

  it('a colony with its party out is refused, with a reason', async () => {
    const r = await forage(home.id);
    expect(r.error.code).toBe('no_slots');
    expect(r.error.message).toContain('this colony');
  });

  it('Foraging Instinct adds a slot to every colony', async () => {
    expect(forageSlots({ foraging_instinct: 2 })).toBe(2);
    await setPlayer(me.id, { research: { foraging_instinct: 2 } });
    expect((await forage(home.id)).ok).toBe(true);
    expect((await forage(second)).ok).toBe(true);
    expect((await forage(home.id)).error.code).toBe('no_slots');
  });
});
