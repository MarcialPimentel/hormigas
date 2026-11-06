// Build 19: joint raids and the members' board (docs/23-supercolonies.md § Joint raids), spider dens as alliance raids.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BIG_ARMY, BOARD, JOINT_MESSAGES, SITE_SPOTS, jointLeadOptionMs } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, newPlayerBeside, setColony, setPlayer, calmWildNests, calmNestEvents, exploreAll, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let speed = 1;
let a: Client, b: Client, c: Client;
let ca: any, cb: any, cc: any;
let ida: number, idb: number, idc: number;

const ARMY = { minor_soldier: 120, major_soldier: 40 };
const raid = (who: Client, colonyId: number, target: any, units: object, joint?: object) => who.post('/api/missions', { colonyId, type: 'raid', target, units, ...(joint ? { joint } : {}) });
const mission = async (who: Client, id: number) => (await who.get('/api/state')).missions.find((m: any) => m.id === id);
const reports = async (who: Client, type: string) => (await who.get('/api/reports?limit=100')).reports.filter((r: any) => r.type === type);
const stat = async (playerId: number, key: string) =>
  Number((await getPool().query('SELECT value FROM player_stats WHERE player_id = $1 AND key = $2', [playerId, key])).rows[0]?.value ?? 0);
/** a wild ant nest (not a herd, mound, den or windfall) in this patch */
const nestIn = async (patch: number) => {
  const r = await getPool().query("SELECT id, region, patch, spot FROM colonies WHERE region = $1 AND patch = $2 AND spot <= 12 AND npc IS NOT NULL AND npc->>'species' IS NOT NULL", [ca.coords.region, patch]);
  const row = r.rows[0];
  return { id: Number(row.id), coords: { region: row.region, patch: row.patch, spot: row.spot } };
};
const den = () => ({ region: ca.coords.region, patch: 8, spot: SITE_SPOTS.den });
const stock = (units: object) => ({ foliage: 1e7, protein: 1e7, nectar: 1e7, last_updated: clock.t, units });
const restock = async () => {
  for (const col of [ca, cb, cc]) await setColony(col.id, stock({ minor_soldier: 2000, major_soldier: 1000, scout: 10, worker: 50 }));
};

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'atta');
  b = await newPlayerBeside(app, 'bala', a);
  c = await newPlayerBeside(app, 'camp', a);
  const [sa, sb, sc] = await Promise.all([a.get('/api/state'), b.get('/api/state'), c.get('/api/state')]);
  [ca, cb, cc] = [sa.colony, sb.colony, sc.colony];
  [ida, idb, idc] = [sa.player.id, sb.player.id, sc.player.id];
  speed = sa.world.speed;
  await calmWildNests();
  await calmNestEvents();
  await exploreAll();
  await knowAll();
  for (const id of [ida, idb, idc]) await setPlayer(id, { protected_until: 0, points_total: 100, research: { supercolony: 1 } });
  await restock();
});
afterAll(async () => teardownTest(app));

describe('before a supercolony', () => {
  it('spider dens refuse solo raids, and joint raids need a supercolony', async () => {
    const solo = await raid(a, ca.id, den(), BIG_ARMY);
    expect(solo.error).toMatchObject({ code: 'joint_only', message: JOINT_MESSAGES.solo_den(2) });
    const nest = await nestIn(ca.coords.patch);
    expect((await raid(a, ca.id, nest.coords, ARMY, { open: 2 })).error).toMatchObject({ code: 'not_member' });
    expect((await a.post('/api/board', { text: 'hello' })).error).toMatchObject({ code: 'not_member' });
  });

  it('three players form a supercolony', async () => {
    expect((await a.post('/api/supercolony', { name: 'Leafcutter Line' })).ok).toBe(true);
    for (const [who, id] of [[b, idb], [c, idc]] as const) {
      expect((await a.post('/api/supercolony/invite', { playerId: id })).ok).toBe(true);
      const inv = (await who.get('/api/diplomacy')).invitesForMe[0].supercolonyId;
      expect((await who.post(`/api/supercolony/${inv}/accept`)).ok).toBe(true);
    }
  });
});

describe('joint raids', () => {
  it('only wild targets: never a player colony', async () => {
    const r = await raid(a, ca.id, cb.coords, ARMY, { open: 2 });
    expect(r.error?.code).toMatch(/wild_only|raid_ally/);
  });

  it('open one, members see it on the board and join, all land together and split the loot', async () => {
    const nest = await nestIn(ca.coords.patch);
    const open = await raid(a, ca.id, nest.coords, ARMY, { open: 2 });
    expect(open.error).toBeUndefined();
    const landAt = open.mission.arriveAt;
    expect(landAt - clock.t).toBe(jointLeadOptionMs(2, speed));
    // members hear about it and see it on the board
    expect((await reports(b, 'joint')).map((r: any) => r.title)).toContain('atta opened a joint raid on ' + (await b.get('/api/board')).jointRaids[0].targetName + ': join before it lands');
    const board = await b.get('/api/board');
    expect(board.jointRaids).toHaveLength(1);
    expect(board.jointRaids[0]).toMatchObject({ leaderName: 'atta', playerCount: 1, mine: false, landAt });
    expect(board.posts[0]).toMatchObject({ kind: 'joint_open' });
    const id = board.jointRaids[0].id;
    // one army each; the second has to make the landing time
    const join = await raid(b, cb.id, nest.coords, { minor_soldier: 60 }, { id });
    expect(join.error).toBeUndefined();
    expect(join.mission.arriveAt).toBe(landAt);
    expect((await raid(b, cb.id, nest.coords, { minor_soldier: 5 }, { id })).error).toMatchObject({ code: 'one_army' });
    expect((await b.get('/api/board')).jointRaids[0]).toMatchObject({ playerCount: 2, mine: true });

    await clock.advance(landAt - clock.t + 1000);
    const [ra] = await reports(a, 'battle');
    const [rb] = await reports(b, 'battle');
    expect(ra.data.joint.members.map((m: any) => m.name)).toEqual(['atta', 'bala']);
    expect(ra.data.winner).toBe('attacker');
    expect(rb.data.seed).toBe(ra.data.seed); // one battle, seen from two sides
    const ma = await mission(a, open.mission.id);
    const mb = await mission(b, join.mission.id);
    expect(ma.status).toBe('returning');
    expect(mb.status).toBe('returning');
    // loot split by army worth: the bigger army takes the bigger share
    const sum = (r: any) => r.foliage + r.protein + r.nectar;
    expect(sum(ma.cargo)).toBeGreaterThan(sum(mb.cargo));
    expect(sum(mb.cargo)).toBeGreaterThan(0);
    // each walks home in its own travel time
    expect(mb.returnAt - landAt).toBe(mb.result.travelMs);
    expect(mb.result.travelMs).toBeLessThan(landAt - join.mission.departAt + 1);
    const after = await b.get('/api/board');
    expect(after.jointRaids).toHaveLength(0);
    expect(after.posts[0]).toMatchObject({ kind: 'joint_result' });
    expect(await stat(idb, 'joint_won')).toBe(1);
  });

  it('an army that cannot get there in time cannot join', async () => {
    await clock.advance(24 * 3600_000);
    await restock();
    const nest = await nestIn(ca.coords.patch + 1);
    const open = await raid(a, ca.id, nest.coords, ARMY, { open: 2 });
    expect(open.error).toBeUndefined();
    const id = (await b.get('/api/board')).jointRaids[0].id;
    await clock.advance(open.mission.arriveAt - clock.t - 1000);
    expect((await raid(b, cb.id, nest.coords, ARMY, { id })).error).toMatchObject({ code: 'too_far' });
    await clock.advance(5000);
  });

  it('a recalled army leaves; the opener can call the raid off, and only the opener', async () => {
    await clock.advance(24 * 3600_000);
    await restock();
    const nest = await nestIn(ca.coords.patch + 2);
    const open = await raid(a, ca.id, nest.coords, ARMY, { open: 4 });
    const id = (await b.get('/api/board')).jointRaids[0].id;
    const join = await raid(b, cb.id, nest.coords, ARMY, { id });
    const joinC = await raid(c, cc.id, nest.coords, ARMY, { id });
    await clock.advance(60_000);
    expect((await b.post(`/api/missions/${join.mission.id}/recall`)).ok).toBe(true);
    expect((await mission(b, join.mission.id)).status).toBe('returning');
    expect((await b.get('/api/board')).jointRaids[0].playerCount).toBe(2); // the raid goes on without b
    expect((await c.post(`/api/joint-raids/${id}/cancel`)).error).toMatchObject({ code: 'not_leader' });
    expect((await a.post(`/api/joint-raids/${id}/cancel`)).ok).toBe(true);
    expect((await mission(a, open.mission.id)).status).toBe('returning');
    expect((await mission(c, joinC.mission.id)).status).toBe('returning');
    expect((await reports(c, 'joint'))[0].title).toMatch(/^atta called off the joint raid on /);
    expect((await b.get('/api/board')).posts[0]).toMatchObject({ kind: 'joint_cancelled' });
    // nothing lands later
    await clock.advance(5 * 3600_000);
    expect((await reports(c, 'battle')).length).toBe(0);
  });
});

describe('spider dens are alliance raids', () => {
  it('one army in a joint raid is not enough: the raid is called off and nobody fights', async () => {
    await clock.advance(24 * 3600_000);
    await restock();
    const before = (await getPool().query('SELECT units FROM colonies WHERE region = $1 AND patch = 8 AND spot = $2', [ca.coords.region, SITE_SPOTS.den])).rows[0].units;
    const open = await raid(a, ca.id, den(), BIG_ARMY, { open: 24 });
    expect(open.error).toBeUndefined();
    await clock.advance(open.mission.arriveAt - clock.t + 1000);
    const [r] = await reports(a, 'joint');
    expect(r.data).toMatchObject({ calledOff: true });
    expect((await mission(a, open.mission.id)).status).toBe('returning');
    const after = (await getPool().query('SELECT units FROM colonies WHERE region = $1 AND patch = 8 AND spot = $2', [ca.coords.region, SITE_SPOTS.den])).rows[0].units;
    expect(after.trapdoor_spider).toBe(before.trapdoor_spider);
  });

  it('three big armies together take tier 1, and every member gets the Spider-slayer credit', async () => {
    await clock.advance(24 * 3600_000);
    await restock();
    // Build 20: Rescue is each member's own; Necrophoresis from any fighter keeps the field fresh (docs/08-combat.md)
    await setPlayer(ida, { research: { supercolony: 1, rescue: 3 } });
    await setPlayer(idc, { research: { supercolony: 1, necrophoresis: 2 } });
    const open = await raid(a, ca.id, den(), BIG_ARMY, { open: 24 });
    expect(open.error).toBeUndefined();
    const id = (await b.get('/api/board')).jointRaids[0].id;
    for (const [who, col] of [[b, cb], [c, cc]] as const) expect((await raid(who, col.id, den(), BIG_ARMY, { id })).error).toBeUndefined();
    await clock.advance(open.mission.arriveAt - clock.t + 1000);
    const [r] = await reports(c, 'battle');
    expect(r.data.winner).toBe('attacker');
    expect(r.data.joint.members).toHaveLength(3);
    expect(r.data.loot.protein).toBeGreaterThan(0);
    for (const pid of [ida, idb, idc]) expect(await stat(pid, 'beat:spider')).toBe(1);
    const [atta, bala] = r.data.joint.members;
    expect(atta.rescueLevel).toBe(3);
    const saved = Object.values(atta.carriedHome as Record<string, number>).reduce((s, n) => s + n, 0);
    const lost = Object.values(atta.lost as Record<string, number>).reduce((s, n) => s + n, 0);
    expect(saved).toBeGreaterThan(0);
    expect(saved).toBeLessThanOrEqual(Math.ceil(((saved + lost) * 15) / 100));
    expect(bala.carriedHome).toBeUndefined();
    expect(r.data.rotDelayHours).toBe(24);
    const field = await getPool().query('SELECT rot_delay_hours FROM corpse_fields WHERE region = $1 AND patch = $2 AND spot = $3', [den().region, den().patch, den().spot]);
    expect(Number(field.rows[0].rot_delay_hours)).toBe(24);
  });
});

describe("the members' board", () => {
  it('members post short messages; the newest come first', async () => {
    expect((await b.post('/api/board', { text: '  ' })).error).toMatchObject({ code: 'bad_post' });
    expect((await b.post('/api/board', { text: 'x'.repeat(BOARD.postLength + 1) })).error).toMatchObject({ code: 'bad_post' });
    expect((await b.post('/api/board', { text: 'Den at 1:8 again on Friday?' })).ok).toBe(true);
    const board = await c.get('/api/board');
    expect(board.supercolony.name).toBe('Leafcutter Line');
    expect(board.posts[0]).toMatchObject({ kind: 'post', username: 'bala', text: 'Den at 1:8 again on Friday?' });
  });
});
