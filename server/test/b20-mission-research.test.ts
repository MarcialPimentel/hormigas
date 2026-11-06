// Build 20: research for the missions players already run (docs/07-research.md § Research for missions).
// Rescue and Necrophoresis on a raid, Social Stomach on fuel, Recruitment Trails on windfalls, Aphid Husbandry on herds,
// Trophallaxis on trade trails. Joint raids are covered in b19-joint-raids.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FORMULAS, HERDS, SITE_SPOTS, TERRAIN, TRADE, WINDFALLS, distance, herdStoreCap, missionFuel, terrainForSpot, tradeEveryMs, windfallPile } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, newPlayerBeside, setColony, setPlayer, calmWildNests, calmNestEvents, exploreAll, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let speed = 1;
let a: Client, b: Client;
let ca: any, cb: any;
let ida: number, idb: number;
const H = 3600_000;

const reports = async (who: Client, type: string) => (await who.get('/api/reports?limit=100')).reports.filter((r: any) => r.type === type);
const stat = async (playerId: number, key: string) =>
  Number((await getPool().query('SELECT value FROM player_stats WHERE player_id = $1 AND key = $2', [playerId, key])).rows[0]?.value ?? 0);
const siteRow = async (spot: number) =>
  (await getPool().query('SELECT * FROM colonies WHERE region = $1 AND patch = $2 AND spot = $3', [ca.coords.region, ca.coords.patch, spot])).rows[0];
const stock = (units: object) => ({ foliage: 1e7, protein: 1e7, nectar: 1e7, last_updated: clock.t, units });

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'atta');
  b = await newPlayerBeside(app, 'bala', a);
  const [sa, sb] = await Promise.all([a.get('/api/state'), b.get('/api/state')]);
  [ca, cb] = [sa.colony, sb.colony];
  [ida, idb] = [sa.player.id, sb.player.id];
  speed = sa.world.speed;
  await calmWildNests();
  await calmNestEvents();
  await getPool().query("UPDATE events SET done = true WHERE type IN ('swarm_spotted', 'windfall_wild')");
  await exploreAll();
  await knowAll();
  for (const id of [ida, idb]) await setPlayer(id, { protected_until: 0, points_total: 100 });
  await setColony(ca.id, stock({ minor_soldier: 600, major_soldier: 200, worker: 60, media_worker: 20, scout: 10 }));
  await setColony(cb.id, stock({ minor_soldier: 250, major_soldier: 60 }));
});
afterAll(async () => teardownTest(app));

describe('a raid with Rescue, Social Stomach and Necrophoresis', () => {
  it('fuel is cut, some fallen come home, and the corpse field rots later', async () => {
    await setPlayer(ida, { research: { rescue: 3, social_stomach: 5 } });
    await setPlayer(idb, { research: { necrophoresis: 2 } });
    const units = { minor_soldier: 600, major_soldier: 200 };
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units });
    expect(r.error).toBeUndefined();
    // Social Stomach 5: 25% less Nectar fuel than without it
    const dist = distance(ca.coords, cb.coords);
    expect(r.mission.fuel).toBe(missionFuel(units, dist, { social_stomach: 5 }));
    expect(r.mission.fuel).toBeLessThan(missionFuel(units, dist));
    await clock.advance(r.mission.arriveAt - clock.t + 1000);

    const [rep] = await reports(a, 'battle');
    expect(rep.data.winner).toBe('attacker');
    // Rescue 3: 15% of each caste's fallen (rounded down) come home, and "lost" leaves them out
    expect(rep.data.rescueLevel).toBe(3);
    for (const [id, saved] of Object.entries(rep.data.carriedHome as Record<string, number>)) {
      const lostNow = rep.data.attacker.lost[id] ?? 0;
      expect(saved).toBe(Math.floor(((saved + lostNow) * 15) / 100));
    }
    // Necrophoresis 2 on the defender: the field starts to rot 24 h later than the usual 24 h
    expect(rep.data.rotDelayHours).toBe(24);
    expect(rep.data.corpsesRotAt).toBe(rep.createdAt + (FORMULAS.combat.corpseDecay.startAfterHours + 24) * H);
    const spot = (await b.get(`/api/map?region=${cb.coords.region}&patch=${cb.coords.patch}`)).spots.find((s: any) => s.spot === cb.coords.spot);
    expect(spot.corpses).toBeGreaterThan(0);
    expect(spot.corpsesRotDelayHours).toBe(24);
    // 40 h on, a normal field would have lost 160% (gone); this one hasn't started to rot
    await clock.advance(40 * H);
    const later = (await b.get(`/api/map?region=${cb.coords.region}&patch=${cb.coords.patch}`)).spots.find((s: any) => s.spot === cb.coords.spot);
    expect(later.corpses).toBe(spot.corpses);
  });
});

describe('Recruitment Trails', () => {
  it('windfall holders carry loads home 30% sooner at level 3', async () => {
    await setPlayer(ida, { research: { recruitment_trails: 3 } });
    await setColony(ca.id, stock({ media_worker: 20, minor_soldier: 50 }));
    // lay a grasshopper on this patch's windfall site (not left to the drop dice or who is active nearby)
    const row = await siteRow(SITE_SPOTS.windfall);
    const pile = windfallPile('grasshopper', row.npc.level);
    const drop = { kind: 'grasshopper', startedAt: clock.t, endsAt: clock.t + (WINDFALLS.lastsHours * H) / speed, pile, guarded: false };
    await getPool().query('UPDATE colonies SET units = $2, npc = $3, foliage = $4, protein = $5, nectar = $6 WHERE id = $1', [
      row.id, '{}', JSON.stringify({ ...row.npc, tender: null, drop }), pile.foliage, pile.protein, pile.nectar,
    ]);
    const target = { ...ca.coords, spot: SITE_SPOTS.windfall };
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target, units: { media_worker: 2 } });
    expect(r.error).toBeUndefined();
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const [held] = await reports(a, 'windfall');
    expect(held.data).toMatchObject({ event: 'windfall_held', loadCutPct: 30 });
    expect(held.data.deliverEveryHours).toBeCloseTo(WINDFALLS.deliverEveryHours * 0.7, 6);
    const ev = await getPool().query("SELECT due_at FROM events WHERE NOT done AND type = 'windfall_deliver' AND (payload->>'colonyId')::int = $1", [row.id]);
    expect(Number(ev.rows[0].due_at) - r.mission.arriveAt).toBeCloseTo((WINDFALLS.deliverEveryHours * 0.7 * H) / speed, -3);
  });
});

describe('Aphid Husbandry on wild herds', () => {
  it('each delivery brings home 5% more honeydew per level', async () => {
    await setPlayer(ida, { research: { aphid_husbandry: 5 } });
    await setColony(ca.id, stock({ worker: 20 }));
    const herd = await siteRow(SITE_SPOTS.herd);
    expect(herd?.npc.kind).toBe('herd');
    const target = { ...ca.coords, spot: SITE_SPOTS.herd };
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'tend', target, units: { worker: 5 } });
    expect(r.error).toBeUndefined();
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const [rep] = await reports(a, 'herd');
    expect(rep.data.bonusPct).toBe(25);
    // a full store makes no more, so the delivery is exactly the cap
    const now = await siteRow(SITE_SPOTS.herd);
    const cap = herdStoreCap(now.npc.level);
    await getPool().query('UPDATE colonies SET nectar = $2, npc = $3 WHERE id = $1', [herd.id, cap, JSON.stringify({ ...now.npc, at: clock.t })]);
    // the next delivery is due within deliverEveryHours: run just that one
    const ev = await getPool().query("SELECT due_at FROM events WHERE NOT done AND type = 'herd_deliver' AND (payload->>'colonyId')::int = $1", [herd.id]);
    const before = await stat(ida, 'herd_nectar');
    await clock.advance(Number(ev.rows[0].due_at) - clock.t + 1000);
    expect((await stat(ida, 'herd_nectar')) - before).toBe(Math.floor(Math.floor(cap) * 1.25));
  });
});

describe('Trophallaxis', () => {
  it('a trail opened at level 2 stays two days longer', async () => {
    await setPlayer(ida, { research: { trophallaxis: 2 } });
    await getPool().query("UPDATE events SET done = true WHERE NOT done AND type IN ('herd_deliver', 'windfall_deliver', 'windfall_rot')");
    // a second colony of a's on a free spot of the patch, for an own-colony trail
    const taken = await getPool().query('SELECT spot FROM colonies WHERE world_id = 1 AND region = $1 AND patch = $2', [ca.coords.region, ca.coords.patch]);
    const spot = TERRAIN.sunny_meadow.spots.find((s) => !taken.rows.some((row: { spot: number }) => row.spot === s))!;
    const chambers = { queen_chamber: 5, leaf_garden: 8 };
    await getPool().query(
      `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, last_updated, chambers, created_at)
       VALUES (1, $1, 'Meadow Nest', $2, $3, $4, $5, 150, $6, $7, $6)`,
      [ida, ca.coords.region, ca.coords.patch, spot, terrainForSpot(spot), clock.t, JSON.stringify(chambers)],
    );
    await setColony(ca.id, stock({ worker: 40 }));
    const to = { ...ca.coords, spot };
    const extra = (2 * 24) / TRADE.deliverEveryHours;
    const p = await a.get(`/api/trade/preview?colonyId=${ca.id}&region=${to.region}&patch=${to.patch}&spot=${to.spot}`);
    expect(p).toMatchObject({ deliveries: TRADE.deliveries + extra, extraDeliveries: extra });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'trade', target: to, units: { worker: 20 } });
    expect(r.error).toBeUndefined();
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const [opened] = await reports(a, 'trade');
    expect(opened.data).toMatchObject({ opened: true, deliveries: TRADE.deliveries + extra, extraDays: 2 });
    const m = (await a.get('/api/state')).missions.find((x: any) => x.id === r.mission.id);
    expect(m.result.deliveries).toBe(TRADE.deliveries + extra);
    expect(m.result.endsAt - r.mission.arriveAt).toBeCloseTo((TRADE.deliveries + extra) * tradeEveryMs(speed), -4);
    // it is still open after the usual three days, and closes after five
    await clock.advance(TRADE.deliveries * tradeEveryMs(speed) + 1000);
    expect((await a.get('/api/state')).missions.find((x: any) => x.id === r.mission.id).status).toBe('holding');
    await clock.advance(extra * tradeEveryMs(speed));
    const [closed] = await reports(a, 'trade');
    expect(closed.data).toMatchObject({ closed: 'done', deliveries: TRADE.deliveries + extra });
  });
});
