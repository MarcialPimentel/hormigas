// Wild nests give up 75% of their store to a winning raid (docs/08-combat.md, Marz 30 Oct 2026).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FORMULAS } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'lootcheck');
  c = (await p.get('/api/state')).colony;
  await calmWildNests();
  await knowAll();
});
afterAll(async () => teardownTest(app));

describe('raiding a wild nest', () => {
  it('a won raid with room to carry takes 75% of the nest store', async () => {
    const nest = (await getPool().query(
      "SELECT * FROM colonies WHERE npc IS NOT NULL AND npc->>'kind' IS DISTINCT FROM 'herd' AND region = $1 AND patch = $2 AND spot <= 12",
      [c.coords.region, c.coords.patch],
    )).rows[0];
    expect(nest).toBeTruthy();
    // a known store: what the nest holds when the raid lands
    const store = { foliage: 4000, protein: 2000, nectar: 1000 };
    await getPool().query('UPDATE colonies SET foliage = $2, protein = $3, nectar = $4, last_updated = $5 WHERE id = $1', [nest.id, store.foliage, store.protein, store.nectar, clock.t]);
    await setColony(c.id, { foliage: 1e5, protein: 1e5, nectar: 1e5, last_updated: clock.t, units: { major_soldier: 60, worker: 20 } });

    const r = await p.post('/api/missions', { colonyId: c.id, type: 'raid', target: { region: nest.region, patch: nest.patch, spot: nest.spot }, units: { major_soldier: 60, worker: 20 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);

    const rep = (await p.get('/api/reports?limit=50')).reports.find((x: any) => x.type === 'battle');
    expect(rep.data.winner).toBe('attacker');
    const pct = FORMULAS.combat.lootPctOfWild / 100;
    // the nest regrows a little between the store being set and the raid landing; never below 75% of what we set
    expect(rep.data.loot.foliage).toBeGreaterThanOrEqual(Math.floor(store.foliage * pct));
    expect(rep.data.loot.foliage).toBeLessThan(store.foliage * 0.8);
    expect(rep.data.loot.nectar).toBeGreaterThanOrEqual(Math.floor(store.nectar * pct));
  });
});
