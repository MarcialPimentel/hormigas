import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let aId: number, bId: number;

async function raid(units: Record<string, number>) {
  const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units });
  if (!r.ok) return r;
  await clock.advance(r.mission.arriveAt - clock.t + 10);
  return r;
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'raider');
  b = await newPlayer(app, 'victim');
  const sa = await a.get('/api/state');
  const sb = await b.get('/api/state');
  ca = sa.colony;
  cb = sb.colony;
  aId = sa.player.id;
  bId = sb.player.id;
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

describe('raid rules', () => {
  it('respects new-colony protection', async () => {
    await setColony(ca.id, { nectar: 1e6, last_updated: clock.t, units: { major_soldier: 50, hauler: 10, worker: 20, scout: 2 } });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(r.error.code).toBe('target_protected');
  });

  it('needs fighters', async () => {
    await setPlayer(bId, { protected_until: 0 });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { scout: 1 } });
    expect(r.error.code).toBe('no_fighters');
  });

  it('strength protection blocks raiding much weaker players', async () => {
    await setPlayer(aId, { points_total: 1000, points: { total: 1000, economy: 0, research: 0, military: 1000 } });
    await setPlayer(bId, { points_total: 10, points: { total: 10, economy: 0, research: 0, military: 10 } });
    // stop the periodic refresh from overwriting during this test: the route reads players.points
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(r.error.code).toBe('target_too_weak');
    await setPlayer(aId, { points_total: 0, points: { total: 0, economy: 0, research: 0, military: 0 } });
  });
});

describe('battle', () => {
  it('attacker wins: loot respects honeypot protection, corpses appear, defenses partly rebuild, reports for both', async () => {
    await setColony(cb.id, {
      foliage: 20000, protein: 20000, nectar: 2000, last_updated: clock.t,
      chambers: { queen_chamber: 4, honeypot_gallery: 1 },
      units: { minor_soldier: 20 }, defenses: { pit_trap: 10 },
    });
    const r = await raid({ major_soldier: 50, hauler: 10 });
    expect(r.ok).toBe(true);
    const rep = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(rep.data.winner).toBe('attacker');
    expect(rep.data.perspective).toBe('attacker');
    const loot = rep.data.loot;
    // lootable = 50% of (amount - 1600)
    expect(loot.foliage).toBeLessThanOrEqual(Math.floor((20000 - 1600) / 2));
    expect(loot.foliage + loot.protein + loot.nectar).toBeGreaterThan(0);
    expect(rep.data.corpses).toBeGreaterThan(0);

    const sb = await b.get('/api/state');
    expect(sb.colony.units.minor_soldier ?? 0).toBe(0);
    expect(sb.colony.resources.foliage).toBeCloseTo(20000 - loot.foliage, -1);
    const rebuilt = rep.data.defender.defensesRebuilt.pit_trap ?? 0;
    expect(sb.colony.defenses.pit_trap ?? 0).toBe(rebuilt);
    const dRep = (await b.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(dRep.data.perspective).toBe('defender');

    // map shows the corpse field
    const map = await a.get(`/api/map?region=${cb.coords.region}&patch=${cb.coords.patch}`);
    expect(map.spots.find((s: any) => s.spot === cb.coords.spot).corpses).toBe(rep.data.corpses);

    // loot comes home
    const m = (await a.get('/api/state')).missions[0];
    const before = (await a.get('/api/state')).colony.resources.foliage;
    await clock.advance(m.returnAt - clock.t + 10);
    const after = (await a.get('/api/state')).colony.resources.foliage;
    expect(after - before).toBeGreaterThanOrEqual(loot.foliage);
  });

  it('raiding ended the attacker’s own protection', async () => {
    const s = await a.get('/api/state');
    expect(s.player.protectedUntil).toBeLessThanOrEqual(s.serverNow);
  });

  it('defender wins: attacker loses everything, no loot', async () => {
    await setColony(cb.id, { units: { major_soldier: 200 }, defenses: {}, last_updated: clock.t });
    await raid({ minor_soldier: 0, major_soldier: 2 });
    const rep = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(rep.data.winner).toBe('defender');
    expect(rep.data.loot.foliage).toBe(0);
    const s = await a.get('/api/state');
    expect(s.missions).toHaveLength(0);
  });
});

describe('bash limit', () => {
  it('blocks after 4 won raids in 24 h', async () => {
    const t = clock.t;
    for (let i = 0; i < 4; i++)
      await getPool().query("INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES (1,$1,$2,'attacker',$3)", [aId, cb.id, t]);
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(r.error.code).toBe('bash_limit');
    await getPool().query('DELETE FROM raid_log');
  });

  it('counts raids still on their way, so sending several at once cannot get past it', async () => {
    // same army as the start of this file (the corpse tests below need the workers and scouts)
    await setColony(ca.id, { nectar: 1e6, last_updated: clock.t, units: { major_soldier: 10, hauler: 10, worker: 20, scout: 2 } });
    for (let i = 0; i < 3; i++)
      await getPool().query("INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES (1,$1,$2,'attacker',$3)", [aId, cb.id, clock.t]);
    const fourth = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(fourth.ok).toBe(true);
    const fifth = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(fifth.error.code).toBe('bash_limit');

    // a recalled raid no longer counts
    const recalled = await a.post(`/api/missions/${fourth.mission.id}/recall`);
    expect(recalled.ok).toBe(true);
    const again = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { major_soldier: 1 } });
    expect(again.error?.code).not.toBe('bash_limit');

    // tidy up for the next tests: bring every mission home and clear the log
    for (let i = 0; i < 3; i++) {
      const { missions } = await a.get('/api/state');
      if (!missions.length) break;
      await clock.advance(Math.max(...missions.map((m: any) => m.returnAt ?? m.arriveAt)) - clock.t + 10);
    }
    await getPool().query('DELETE FROM raid_log');
  });
});

describe('corpses', () => {
  it('hauling collects protein up to capacity, field decays after 24 h', async () => {
    await getPool().query('DELETE FROM corpse_fields');
    await getPool().query('INSERT INTO corpse_fields (world_id, region, patch, spot, protein, created_at) VALUES (1,$1,$2,$3,5000,$4)', [
      cb.coords.region, cb.coords.patch, cb.coords.spot, clock.t,
    ]);
    const h = await a.post('/api/missions', { colonyId: ca.id, type: 'haul', target: cb.coords, units: { worker: 2 } });
    expect(h.ok).toBe(true);
    await clock.advance(h.mission.arriveAt - clock.t + 10);
    const rep = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'haul');
    expect(rep.data.collected).toBe(3000);
    const map = await a.get(`/api/map?region=${cb.coords.region}&patch=${cb.coords.patch}`);
    expect(map.spots.find((s: any) => s.spot === cb.coords.spot).corpses).toBe(2000);
    await clock.advance(29 * 3600_000); // 29h old → 50% left
    const later = await a.get(`/api/map?region=${cb.coords.region}&patch=${cb.coords.patch}`);
    expect(later.spots.find((s: any) => s.spot === cb.coords.spot).corpses).toBeLessThan(1100);
  });

  it('intel returns the latest scout report for a spot', async () => {
    const s = await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: cb.coords, units: { scout: 2 } });
    await clock.advance(s.mission.arriveAt - clock.t + 10);
    const i = await a.get(`/api/intel?region=${cb.coords.region}&patch=${cb.coords.patch}&spot=${cb.coords.spot}`);
    expect(i.intel.data.resources).toBeTruthy();
  });
});
