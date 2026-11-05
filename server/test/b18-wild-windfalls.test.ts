// Wild ants come for windfalls (docs/25-windfalls.md#wild-ants-come-for-windfalls): wild nests nearby send parties to
// claim windfalls, haul loads into their own store, and fight players' holders for them, but never other wild ants.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SITE_SPOTS, WINDFALLS, WILD_PARTIES, groupCargo, wildCarry, windfallLastsHours, windfallPile, type WindfallKind } from '@hormigas/shared';
import { getPool } from '../src/db';
import { schedule } from '../src/events';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client;
let ca: any;
let alpha: number;
let speed: number;
const H = 3600_000;

const siteRow = async (patch: number) =>
  (await getPool().query('SELECT * FROM colonies WHERE region = $1 AND patch = $2 AND spot = $3', [ca.coords.region, patch, SITE_SPOTS.windfall])).rows[0];
const site = (patch: number) => ({ region: ca.coords.region, patch, spot: SITE_SPOTS.windfall });
const spotOf = async (patch: number) =>
  (await a.get(`/api/map?region=${ca.coords.region}&patch=${patch}`)).spots.find((s: any) => s.spot === SITE_SPOTS.windfall);
const reports = async (type: string) => (await a.get('/api/reports?limit=100')).reports.filter((r: any) => r.type === type);
const wildId = async () => (await getPool().query('SELECT id FROM players WHERE is_npc LIMIT 1')).rows[0].id as number;
const wildClaims = async () =>
  (await getPool().query("SELECT * FROM missions WHERE type = 'claim' AND player_id = $1 ORDER BY id", [await wildId()])).rows;

/** Push every pending drop and wild party far off, so only what a test asks for happens. */
const hold = () =>
  getPool().query("UPDATE events SET due_at = due_at + 1000000000000 WHERE NOT done AND type IN ('windfall_drop', 'windfall_wild') AND due_at < 2500000000000");

/** Drop a windfall of this kind on the patch's site now (guarded if `guards`), with no wild parties on their way yet. */
async function dropNow(patch: number, kind: WindfallKind, guards?: Record<string, number>) {
  const row = await siteRow(patch);
  await getPool().query("UPDATE events SET due_at = $2 WHERE NOT done AND type = 'windfall_drop' AND (payload->>'colonyId')::int = $1", [row.id, clock.t]);
  await clock.advance(1);
  await hold();
  const after = await siteRow(patch);
  const pile = windfallPile(kind, after.npc.level);
  const endsAt = Number(after.npc.drop.startedAt) + (windfallLastsHours(kind) * H) / speed;
  await getPool().query("UPDATE events SET due_at = $2 WHERE NOT done AND type = 'windfall_rot' AND (payload->>'colonyId')::int = $1", [row.id, endsAt]);
  const npc = { ...after.npc, drop: { ...after.npc.drop, kind, pile, endsAt, guarded: !!guards } };
  await getPool().query('UPDATE colonies SET units = $2, npc = $3, foliage = $4, protein = $5, nectar = $6, name = $7 WHERE id = $1', [
    row.id, JSON.stringify(guards ?? {}), JSON.stringify(npc), pile.foliage, pile.protein, pile.nectar, WINDFALLS.kinds[kind].name,
  ]);
  return { id: row.id as number, startedAt: Number(after.npc.drop.startedAt) };
}

/** Empty a site (its windfall gone), so a new one can drop there. */
async function clearSite(patch: number) {
  const row = await siteRow(patch);
  await getPool().query('UPDATE colonies SET units = $2, npc = $3, foliage = 0, protein = 0, nectar = 0 WHERE id = $1', [
    row.id, '{}', JSON.stringify({ ...row.npc, tender: null, drop: null }),
  ]);
}

/** A wild party sets off for the site now. */
async function wildPartyNow(siteId: number, startedAt: number) {
  await schedule(getPool(), 1, 'windfall_wild', clock.t, { colonyId: siteId, startedAt });
  await clock.advance(1);
  await hold(); // no follow-up parties
}

/** Give every wild nest in the area a known army and an empty store, so parties are predictable. */
async function armNests() {
  await getPool().query(
    `UPDATE colonies SET units = $1, foliage = 0, protein = 0, nectar = 0, last_updated = $2
      WHERE npc ? 'species' AND npc->>'species' <> 'spider' AND region = $3`,
    [JSON.stringify({ minor_soldier: 50, worker: 20 }), clock.t, ca.coords.region],
  );
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'wanda');
  const s = await a.get('/api/state');
  ca = s.colony;
  alpha = s.player.id;
  speed = s.world.speed;
  await getPool().query("UPDATE events SET done = true WHERE type IN ('nest_raid', 'swarm_spotted')");
  await hold();
  await setPlayer(alpha, { protected_until: 0, points_total: 100 });
  await setColony(ca.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, units: { scout: 10, minor_soldier: 600, major_soldier: 300, media_worker: 20 } });
});
afterAll(async () => teardownTest(app));

describe('wild parties', () => {
  it('a wild nest that eats it sends part of its ants to a free windfall, and holds it', async () => {
    const { id, startedAt } = await dropNow(1, 'lizard');
    await armNests();
    await wildPartyNow(id, startedAt);
    const [m] = await wildClaims();
    expect(m.status).toBe('outbound');
    expect(m.target_colony_id).toBe(id);
    // partyShare of each kind the nest had
    expect(m.units).toEqual({ minor_soldier: Math.floor(50 * WILD_PARTIES.partyShare), worker: Math.floor(20 * WILD_PARTIES.partyShare) });
    const nest = (await getPool().query('SELECT name, units FROM colonies WHERE id = $1', [m.origin_colony_id])).rows[0];
    expect(nest.units.minor_soldier).toBeLessThan(50);

    await clock.advance(Number(m.arrive_at) - clock.t + 1000);
    const row = await siteRow(1);
    expect(row.npc.tender).toMatchObject({ playerId: await wildId(), colonyId: m.origin_colony_id });
    expect(row.units).toEqual(m.units);
    // players see who holds it: the nest, by name
    const spot = (await spotOf(1)).colony;
    expect(spot.owner).toBe(nest.name);
    expect(spot.windfall).toMatchObject({ held: true, yours: false, holderName: nest.name });
  });

  it('the wild holders haul loads home into their nest store', async () => {
    const before = Number((await siteRow(1)).protein);
    const holders = (await siteRow(1)).units;
    await clock.advance((WINDFALLS.deliverEveryHours * H) / speed + 1000);
    const load = Math.min(before, groupCargo(holders) + wildCarry(holders));
    expect(Number((await siteRow(1)).protein)).toBeCloseTo(before - load, 0);
    const nestId = (await siteRow(1)).npc.tender.colonyId;
    expect(Number((await getPool().query('SELECT protein FROM colonies WHERE id = $1', [nestId])).rows[0].protein)).toBeGreaterThanOrEqual(load - 1);
  });

  it('players can fight the wild holders off and take it', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: site(1), units: { minor_soldier: 200, major_soldier: 100, media_worker: 4 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    expect((await reports('battle'))[0].data.winner).toBe('attacker');
    expect((await siteRow(1)).npc.tender.playerId).toBe(alpha);
  });

  it('a wild party comes for a windfall you hold: you are warned, and they fight your holders', async () => {
    const row = await siteRow(1);
    await armNests();
    await wildPartyNow(row.id, Number(row.npc.drop.startedAt));
    const m = (await wildClaims()).at(-1);
    expect(m.status).toBe('outbound');
    const inc = (await a.get('/api/state')).incoming;
    expect(inc.some((x: any) => x.hostile && x.type === 'claim' && x.wild && x.windfall)).toBe(true);
    await clock.advance(Number(m.arrive_at) - clock.t + 1000);
    const fight = (await reports('battle'))[0];
    expect(fight.data.perspective).toBe('defender');
    expect(fight.data.winner).toBe('defender'); // a big army holds it
    expect((await siteRow(1)).npc.tender.playerId).toBe(alpha);
  });

  it('wild ants never fight wild ants: a party that finds wild guards goes home', async () => {
    // the last party's survivors are home (a nest out at a windfall sends no one else)
    await getPool().query("UPDATE missions SET status = 'done' WHERE type = 'claim' AND status IN ('outbound', 'returning')");
    // wild guards already there: no party sets off at all
    const { id, startedAt } = await dropNow(2, 'lizard', { minor_soldier: 7 });
    await armNests();
    const sent = (await wildClaims()).length;
    await wildPartyNow(id, startedAt);
    expect((await wildClaims()).length).toBe(sent);
    // free when it set off, but other wild ants got there first: it turns back without a fight
    await getPool().query("UPDATE colonies SET units = '{}' WHERE id = $1", [id]);
    await wildPartyNow(id, startedAt);
    const m = (await wildClaims()).at(-1);
    expect(m.target_colony_id).toBe(id);
    await getPool().query('UPDATE colonies SET units = $2 WHERE id = $1', [id, JSON.stringify({ minor_soldier: 7 })]);
    await clock.advance(Number(m.arrive_at) - clock.t + 1000);
    expect((await siteRow(2)).units).toEqual({ minor_soldier: 7 });
    const back = (await getPool().query('SELECT status, result, units FROM missions WHERE id = $1', [m.id])).rows[0];
    expect(back.status).toBe('returning');
    expect(back.result).toMatchObject({ turnedBack: true });
    expect(back.units).toEqual(m.units); // nobody died
  });

  it('only species that eat it come: no termites for a fig, no spiders ever', async () => {
    const { id, startedAt } = await dropNow(2, 'fig');
    // make every nearby nest something that doesn't eat figs
    await getPool().query(`UPDATE colonies SET npc = jsonb_set(npc, '{species}', '"pavement"') WHERE npc ? 'species' AND npc->>'species' NOT IN ('termite', 'spider') AND region = $1`, [ca.coords.region]);
    await getPool().query("UPDATE missions SET status = 'done' WHERE type = 'claim' AND status IN ('outbound', 'returning')");
    const before = (await wildClaims()).length;
    await wildPartyNow(id, startedAt);
    expect((await wildClaims()).length).toBe(before);
  });
});

describe('new windfall kinds', () => {
  it('a sugar spill dries in a few hours', async () => {
    await clearSite(2);
    const { id } = await dropNow(2, 'sugar');
    const row = (await getPool().query('SELECT npc FROM colonies WHERE id = $1', [id])).rows[0];
    expect(Number(row.npc.drop.endsAt) - Number(row.npc.drop.startedAt)).toBeCloseTo((WINDFALLS.kinds.sugar.lastsHours! * H) / speed, -3);
    expect(WINDFALLS.kinds.sugar.lastsHours!).toBeLessThan(WINDFALLS.lastsHours);
  });

  it('a dead beetle is slow to strip: each load carries half', async () => {
    await getPool().query("UPDATE missions SET status = 'done' WHERE type = 'claim' AND status IN ('outbound', 'returning')");
    await clearSite(2);
    const { id } = await dropNow(2, 'beetle');
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'claim', target: site(2), units: { media_worker: 2 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const before = Number((await getPool().query('SELECT protein FROM colonies WHERE id = $1', [id])).rows[0].protein);
    await clock.advance((WINDFALLS.deliverEveryHours * H) / speed + 1000);
    const after = Number((await getPool().query('SELECT protein FROM colonies WHERE id = $1', [id])).rows[0].protein);
    expect(before - after).toBe(Math.floor((groupCargo({ media_worker: 2 }) * WINDFALLS.kinds.beetle.carryPct!) / 100));
  });
});
