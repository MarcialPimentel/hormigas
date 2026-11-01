// Windfalls (docs/25-windfalls.md): contested food that drops in the wilds, claimed by fighting whoever holds it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SITE_SPOTS, WINDFALLS, groupCargo, windfallPile, type WindfallKind } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let alpha: number, beta: number;
let speed: number;
const H = 3600_000;

const mapOf = async (who: Client, region: number, patch: number) => (await who.get(`/api/map?region=${region}&patch=${patch}`)).spots;
const siteRow = async (patch: number) =>
  (await getPool().query('SELECT * FROM colonies WHERE region = $1 AND patch = $2 AND spot = $3', [ca.coords.region, patch, SITE_SPOTS.windfall])).rows[0];
const reports = async (who: Client, type: string) => (await who.get('/api/reports?limit=100')).reports.filter((r: any) => r.type === type);
const latest = async (who: Client, type: string) => (await reports(who, type))[0];
const site = (patch: number) => ({ region: ca.coords.region, patch, spot: SITE_SPOTS.windfall });
const spotOf = async (who: Client, patch: number) => (await mapOf(who, ca.coords.region, patch)).find((s: any) => s.spot === SITE_SPOTS.windfall);

/** Push every pending drop far off, so only the drops a test asks for happen. */
const holdDrops = () => getPool().query("UPDATE events SET due_at = due_at + 1000000000000 WHERE NOT done AND type = 'windfall_drop' AND due_at < 2500000000000");

/** Bring a site's next drop forward to now and run it, then set what fell (so the test doesn't depend on the dice). */
async function dropNow(patch: number, opts: { kind?: WindfallKind; guards?: Record<string, number> } = {}) {
  const row = await siteRow(patch);
  await getPool().query("UPDATE events SET due_at = $2 WHERE NOT done AND type = 'windfall_drop' AND (payload->>'colonyId')::int = $1", [row.id, clock.t]);
  await clock.advance(1);
  await holdDrops();
  const after = await siteRow(patch);
  expect(after.npc.drop).not.toBeNull();
  const kind: WindfallKind = opts.kind ?? after.npc.drop.kind;
  const pile = windfallPile(kind, after.npc.level);
  const npc = { ...after.npc, drop: { ...after.npc.drop, kind, pile, guarded: !!opts.guards } };
  await getPool().query('UPDATE colonies SET units = $2, npc = $3, foliage = $4, protein = $5, nectar = $6, name = $7 WHERE id = $1', [
    row.id, JSON.stringify(opts.guards ?? {}), JSON.stringify(npc), pile.foliage, pile.protein, pile.nectar, WINDFALLS.kinds[kind].name,
  ]);
  return { id: row.id as number, pile, endsAt: Number(after.npc.drop.endsAt) };
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'alpha');
  b = await newPlayer(app, 'beta');
  const sa = await a.get('/api/state');
  ca = sa.colony;
  alpha = sa.player.id;
  speed = sa.world.speed;
  const sb = await b.get('/api/state');
  cb = sb.colony;
  beta = sb.player.id;
  // calm the wild nests and swarms only: windfalls are what this file tests
  await getPool().query("UPDATE events SET done = true WHERE type IN ('nest_raid', 'swarm_spotted')");
  for (const id of [alpha, beta]) await setPlayer(id, { protected_until: 0, points_total: 100 });
  for (const c of [ca, cb])
    await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, units: { scout: 10, minor_soldier: 400, major_soldier: 200, worker: 40, media_worker: 20 } });
});
afterAll(async () => teardownTest(app));

describe('windfall sites', () => {
  it('every patch within 2 gets a windfall site; it starts empty, hidden, with a first drop due soon', async () => {
    expect(ca.coords.patch).toBe(1);
    for (const p of [1, 2, 3]) {
      const row = await siteRow(p);
      expect(row?.npc.kind, `site in patch ${p}`).toBe('windfall');
      expect(row.npc.drop).toBeNull();
      const ev = await getPool().query("SELECT due_at FROM events WHERE NOT done AND type = 'windfall_drop' AND (payload->>'colonyId')::int = $1", [row.id]);
      expect(ev.rowCount).toBe(1);
      expect(Number(ev.rows[0].due_at) - clock.t).toBeLessThanOrEqual((WINDFALLS.firstDropHours[1] * H) / speed + 60_000);
    }
    expect(await siteRow(4)).toBeUndefined();
    expect(await spotOf(a, 2)).toBeUndefined(); // nothing to see yet
    await holdDrops();
  });

  it('drops only where an active player lives within announceRange patches', async () => {
    const row = await siteRow(3); // players live in patch 1, two patches away
    await getPool().query("UPDATE events SET due_at = $2 WHERE NOT done AND type = 'windfall_drop' AND (payload->>'colonyId')::int = $1", [row.id, clock.t]);
    await clock.advance(1);
    await holdDrops();
    expect((await siteRow(3)).npc.drop).toBeNull();
  });
});

describe('a windfall drops', () => {
  it('everyone nearby hears of it and sees it on the map without scouting', async () => {
    const { pile, endsAt } = await dropNow(2, { kind: 'grasshopper' });
    expect(endsAt - clock.t).toBeCloseTo((WINDFALLS.lastsHours * H) / speed, -4);
    for (const who of [a, b]) {
      const rep = await latest(who, 'windfall');
      expect(rep.title).toContain('in the wilds');
      expect(rep.data.event).toBe('windfall');
      const spot = await spotOf(who, 2);
      expect(spot.colony).toMatchObject({ known: 'known', kind: 'wild', name: 'Dead grasshopper', windfall: { kind: 'grasshopper', held: false, yours: false, left: pile } });
    }
  });

  it("can't be sent food to, and a free one has nobody to raid", async () => {
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: site(2), units: { worker: 1 }, cargo: { foliage: 10 } })).error.code).toBe('bad_target');
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: site(2), units: { minor_soldier: 5 } })).error.code).toBe('windfall_free');
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: { ...ca.coords, spot: 5 }, units: { worker: 1 } })).error.code).toBe('bad_target');
  });

  it('the first ants to arrive hold it and carry loads home every few hours', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: site(2), units: { media_worker: 2, minor_soldier: 20 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const rep = await latest(a, 'windfall');
    expect(rep.data).toMatchObject({ event: 'windfall_held', claimed: true });
    const mine = (await spotOf(a, 2)).colony.windfall;
    expect(mine).toMatchObject({ held: true, yours: true, holders: { media_worker: 2, minor_soldier: 20 } });
    const theirs = (await spotOf(b, 2)).colony;
    expect(theirs.owner).toBe('alpha');
    expect(theirs.windfall).toMatchObject({ held: true, yours: false, holderName: 'alpha' });
    expect(theirs.windfall.holders).toBeUndefined();

    await setColony(ca.id, { protein: 0, last_updated: clock.t });
    const before = (await siteRow(2)).protein;
    await clock.advance((WINDFALLS.deliverEveryHours * H) / speed + 1000);
    const load = groupCargo({ media_worker: 2, minor_soldier: 20 });
    const home = (await a.get('/api/state')).colony.resources.protein;
    expect(home).toBeGreaterThanOrEqual(Math.min(load, before) - 1);
    expect(Number((await siteRow(2)).protein)).toBeCloseTo(before - Math.min(load, before), 0);
  });

  it('a truce covers the holders; otherwise anyone can fight them for it', async () => {
    const [lo, hi] = [Math.min(alpha, beta), Math.max(alpha, beta)];
    await getPool().query("INSERT INTO truces (world_id, player_a, player_b, proposed_by, status, created_at, accepted_at) VALUES (1, $1, $2, $1, 'active', 0, 0)", [lo, hi]);
    expect((await b.post('/api/missions', { colonyId: cb.id, type: 'claim', target: site(2), units: { minor_soldier: 200 } })).error.code).toBe('pact_truce');
    await getPool().query('DELETE FROM truces');

    const left = Number((await siteRow(2)).protein);
    const r = await b.post('/api/missions', { colonyId: cb.id, type: 'claim', target: site(2), units: { minor_soldier: 200, major_soldier: 100, media_worker: 4 } });
    expect(r.ok).toBe(true);
    // the holders are warned
    const inc = (await a.get('/api/state')).incoming;
    expect(inc.some((x: any) => x.hostile && x.type === 'claim' && x.windfall)).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const fight = (await reports(b, 'battle'))[0];
    expect(fight.title).toContain('Fight for Dead grasshopper');
    expect(fight.data.winner).toBe('attacker');
    expect((await reports(a, 'battle'))[0].title).toContain('your ants were driven off');
    const row = await siteRow(2);
    expect(row.npc.tender.playerId).toBe(beta);
    // what the winners grabbed in the fight went back on the pile, and the dead stay on the field
    expect(Number(row.protein)).toBeCloseTo(left, 0);
    const field = await getPool().query('SELECT protein FROM corpse_fields WHERE region = $1 AND patch = 2 AND spot = $2', [ca.coords.region, SITE_SPOTS.windfall]);
    expect(field.rowCount).toBe(1);
  });

  it('it rots: the holders carry one last load home and the site empties', async () => {
    // plenty left, so beta's big party doesn't strip it clean before it rots
    await getPool().query('UPDATE colonies SET protein = 1000000 WHERE id = $1', [(await siteRow(2)).id]);
    const row = await siteRow(2);
    await clock.advance(Number(row.npc.drop.endsAt) - clock.t + 1000);
    const after = await siteRow(2);
    expect(after.npc.drop).toBeNull();
    expect(after.units).toEqual({});
    expect(await spotOf(b, 2)).toBeUndefined();
    const rep = await latest(b, 'windfall');
    expect(rep.data.done).toBe('rotted');
    const home = await getPool().query("SELECT status, cargo FROM missions WHERE player_id = $1 AND type = 'claim' ORDER BY id DESC LIMIT 1", [beta]);
    expect(home.rows[0].status).toBe('returning');
    expect(home.rows[0].cargo.protein).toBeGreaterThan(0);
  });
});

describe('guarded and small windfalls', () => {
  it('wild ants may get there first: fight them, no scouting needed', async () => {
    await dropNow(2, { kind: 'fig', guards: { minor_soldier: 3 } });
    expect((await spotOf(a, 2)).colony.windfall).toMatchObject({ guarded: true, held: false });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: site(2), units: { minor_soldier: 30, media_worker: 2 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    expect((await reports(a, 'battle'))[0].data.winner).toBe('attacker');
    expect((await siteRow(2)).npc.tender.playerId).toBe(alpha);
  });

  it('a pile smaller than one load is stripped clean in one trip, and the holders walk home', async () => {
    const id = (await siteRow(2)).id;
    await getPool().query('UPDATE colonies SET foliage = 100, protein = 0, nectar = 50 WHERE id = $1', [id]);
    await clock.advance((WINDFALLS.deliverEveryHours * H) / speed + 1000);
    const after = await siteRow(2);
    expect(after.npc.drop).toBeNull();
    expect((await latest(a, 'windfall')).data.done).toBe('eaten');
  });

  it('calling your ants home brings what they can carry', async () => {
    const { id } = await dropNow(1, { kind: 'branch' });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: site(1), units: { media_worker: 1 } });
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const back = await a.post(`/api/herds/${id}/recall`, {});
    expect(back.ok).toBe(true);
    expect(back.mission.cargo.foliage).toBe(groupCargo({ media_worker: 1 }));
    expect((await siteRow(1)).npc.tender).toBeNull();
  });
});
