// Build 9: contact, truces, supercolonies, Hold Position and the slow break-up (docs/23-supercolonies.md).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DIPLOMACY_MESSAGES, SUPERCOLONY_MAX_MEMBERS, scentFadeMs, truceNoticeMs } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let speed = 1;
let a: Client, b: Client, c: Client, d: Client;
let ca: any, cb: any, cc: any, cd: any;
let ida: number, idb: number, idc: number, idd: number;
const H = 3600_000;

const ARMY = { scout: 10, minor_soldier: 40, worker: 10 };

async function scout(from: Client, col: any, to: any) {
  const r = await from.post('/api/missions', { colonyId: col.id, type: 'scout', target: to.coords, units: { scout: 1 } });
  expect(r.error).toBeUndefined();
  await clock.advance(r.mission.arriveAt - clock.t + 10);
  await clock.advance(r.mission.arriveAt - r.mission.departAt + 10); // home again, slot free
}

// Equal points, so strength protection never gets in the way of these tests.
const POINTS = { total: 1000, economy: 1000, research: 0, military: 0 };
const even = () => getPool().query('UPDATE players SET points_total = 1000, points = $1 WHERE NOT is_npc', [JSON.stringify(POINTS)]);
const raid = async (from: Client, col: any, to: any, n = 5) => (await even(), from.post('/api/missions', { colonyId: col.id, type: 'raid', target: to.coords, units: { minor_soldier: n } }));
const spotOf = async (who: Client, at: any) => (await who.get(`/api/map?region=${at.region}&patch=${at.patch}`)).spots.find((s: any) => s.spot === at.spot);
const rearm = async () => { for (const col of [ca, cb, cc, cd]) await setColony(col.id, { units: ARMY, last_updated: clock.t, foliage: 1e5, protein: 1e5, nectar: 1e5 }); };

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  [a, b, c, d] = [await newPlayer(app, 'ant'), await newPlayer(app, 'bee'), await newPlayer(app, 'cricket'), await newPlayer(app, 'dung')];
  const states = await Promise.all([a, b, c, d].map((p) => p.get('/api/state')));
  [ca, cb, cc, cd] = states.map((s) => s.colony);
  [ida, idb, idc, idd] = states.map((s) => s.player.id);
  speed = states[0].world.speed;
  await calmWildNests();
  for (const id of [ida, idb, idc, idd]) await setPlayer(id, { protected_until: 0 });
  await rearm();
});
afterAll(async () => teardownTest(app));

describe('contact', () => {
  it('you need to have met a player before offering a truce', async () => {
    const r = await a.post('/api/truces', { playerId: idb });
    expect(r.error).toMatchObject({ code: 'no_contact', message: DIPLOMACY_MESSAGES.no_contact });
  });

  it('scouting makes contact both ways: the scouted player can make the offer too', async () => {
    await scout(a, ca, cb);
    const contacts = (await b.get('/api/diplomacy')).contacts;
    expect(contacts.map((x: any) => x.username)).toContain('ant');
    const r = await b.post('/api/truces', { playerId: ida });
    expect(r.ok).toBe(true);
    expect((await a.get('/api/state')).player.pendingDiplomacy).toBe(1);
  });
});

describe('truces', () => {
  let truceId: number;

  it('an accepted truce stops raids both ways, and shows on the map', async () => {
    truceId = (await a.get('/api/diplomacy')).truces[0].id;
    expect((await b.post(`/api/truces/${truceId}/accept`)).error.code).toBe('bad_answer'); // you can't accept your own offer
    expect((await a.post(`/api/truces/${truceId}/accept`)).ok).toBe(true);
    const r = await raid(a, ca, cb);
    expect(r.error).toMatchObject({ code: 'pact_truce', message: DIPLOMACY_MESSAGES.raid_truce });
    expect((await spotOf(a, cb.coords)).colony).toMatchObject({ relation: 'truce' });
    // a second offer while one is open is refused
    expect((await a.post('/api/truces', { playerId: idb })).error.code).toBe('truce_exists');
  });

  it('ending a truce takes notice: raids stay off until it runs out', async () => {
    expect((await b.post(`/api/truces/${truceId}/end`)).ok).toBe(true);
    const tr = (await a.get('/api/diplomacy')).truces[0];
    expect(tr.status).toBe('ending');
    expect(tr.endsAt).toBe(Math.round(clock.t + truceNoticeMs(speed)));
    expect((await raid(a, ca, cb)).error.code).toBe('pact_truce_ending');
    await clock.advance(truceNoticeMs(speed) - 60_000);
    expect((await raid(a, ca, cb)).error.code).toBe('pact_truce_ending');
    await clock.advance(120_000);
    expect((await a.get('/api/diplomacy')).truces).toHaveLength(0);
    const reports = (await b.get('/api/reports')).reports.map((x: any) => x.title);
    expect(reports).toContain('Your truce with ant has ended');
    const r = await raid(a, ca, cb);
    expect(r.error).toBeUndefined();
    await a.post(`/api/missions/${r.mission.id}/recall`);
    await clock.advance(H);
  });

  it('a raid already on its way when a truce is agreed turns back without a fight', async () => {
    await rearm();
    const r = await raid(a, ca, cb);
    expect(r.ok).toBe(true);
    await a.post('/api/truces', { playerId: idb });
    const id = (await b.get('/api/diplomacy')).truces[0].id;
    await b.post(`/api/truces/${id}/accept`);
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const beeUnits = (await b.get('/api/state')).colony.units;
    expect(beeUnits.minor_soldier).toBe(ARMY.minor_soldier);
    const report = (await a.get('/api/reports')).reports[0];
    expect(report.title).toMatch(/turned back/);
    // and it heads home with everyone
    const m = (await a.get('/api/state')).missions.find((x: any) => x.id === r.mission.id);
    expect(m.status).toBe('returning');
    expect(m.units.minor_soldier).toBe(5);
    // tidy up: end it and let the notice run out
    await a.post(`/api/truces/${id}/end`);
    await clock.advance(truceNoticeMs(speed) + 60_000);
  });
});

describe('supercolonies', () => {
  it('founding needs the Supercolony research', async () => {
    expect((await a.post('/api/supercolony', { name: 'Argentine Line' })).error).toMatchObject({ code: 'locked', message: DIPLOMACY_MESSAGES.needs_research });
    for (const id of [ida, idb, idc]) await setPlayer(id, { research: { supercolony: 1 } });
    expect((await a.post('/api/supercolony', { name: 'x' })).error.code).toBe('bad_name');
    expect((await a.post('/api/supercolony', { name: 'Argentine Line' })).ok).toBe(true);
    expect((await a.get('/api/state')).player.supercolony).toMatchObject({ name: 'Argentine Line', founderId: ida });
  });

  it('invites need contact; joining needs the research too', async () => {
    expect((await a.post('/api/supercolony/invite', { playerId: idd })).error.code).toBe('no_contact');
    await scout(a, ca, cd);
    expect((await a.post('/api/supercolony/invite', { playerId: idd })).ok).toBe(true);
    const inv = (await d.get('/api/diplomacy')).invitesForMe[0];
    expect(inv).toMatchObject({ name: 'Argentine Line', from: 'ant' });
    expect((await d.post(`/api/supercolony/${inv.supercolonyId}/accept`)).error.code).toBe('locked');
    expect((await d.post(`/api/supercolony/${inv.supercolonyId}/decline`)).ok).toBe(true);
  });

  it('members share a scent: they know each other, carry the tag, and never raid each other', async () => {
    expect((await a.post('/api/supercolony/invite', { playerId: idb })).ok).toBe(true);
    const sc = (await b.get('/api/diplomacy')).invitesForMe[0].supercolonyId;
    expect((await b.post(`/api/supercolony/${sc}/accept`)).ok).toBe(true);
    // bee never scouted ant, but now knows ant's colony
    expect((await spotOf(b, ca.coords)).colony).toMatchObject({ known: 'known', relation: 'ally', supercolony: 'Argentine Line' });
    expect((await raid(b, cb, ca)).error).toMatchObject({ code: 'pact_ally', message: DIPLOMACY_MESSAGES.raid_ally });
    const reports = (await a.get('/api/reports')).reports.map((x: any) => x.title);
    expect(reports).toContain('bee joined Argentine Line');
  });

  it(`holds at most ${SUPERCOLONY_MAX_MEMBERS} players`, async () => {
    const sc = (await a.get('/api/state')).player.supercolony.supercolonyId;
    // fill the remaining seats directly, then try one more
    const extra: number[] = [];
    for (let i = 0; i < SUPERCOLONY_MAX_MEMBERS - 2; i++) {
      const p = await newPlayer(app, `filler${i}`);
      extra.push((await p.get('/api/state')).player.id);
    }
    for (const id of extra) await getPool().query("INSERT INTO supercolony_members (supercolony_id, player_id, status, joined_at) VALUES ($1,$2,'member',$3)", [sc, id, clock.t]);
    await scout(a, ca, cc);
    expect((await a.post('/api/supercolony/invite', { playerId: idc })).error.code).toBe('full');
    await getPool().query('DELETE FROM supercolony_members WHERE player_id = ANY($1::int[])', [extra]);
    await calmWildNests();
  });
});

describe('hold position', () => {
  it('only works at a supercolony mate', async () => {
    await rearm();
    const r = await c.post('/api/missions', { colonyId: cc.id, type: 'hold', target: ca.coords, units: { minor_soldier: 5 } });
    expect(r.error).toMatchObject({ code: 'not_ally', message: DIPLOMACY_MESSAGES.hold_needs_ally });
  });

  it("an ally's soldiers stay and fight in the host's battles, and report back", async () => {
    const h = await b.post('/api/missions', { colonyId: cb.id, type: 'hold', target: ca.coords, units: { minor_soldier: 30 } });
    expect(h.ok).toBe(true);
    await clock.advance(h.mission.arriveAt - clock.t + 10);
    const held = (await b.get('/api/state')).missions.find((m: any) => m.id === h.mission.id);
    expect(held.status).toBe('holding');
    expect((await a.get('/api/reports')).reports[0].title).toBe(`bee's soldiers arrived to defend ${ca.name}`);
    // cricket scouts ant and sees the garrison, then raids
    await scout(c, cc, ca);
    const intel = (await c.get(`/api/intel?region=${ca.coords.region}&patch=${ca.coords.patch}&spot=${ca.coords.spot}`)).intel;
    if (intel.data.units) expect(intel.data.garrison).toMatchObject({ minor_soldier: 30 });
    await setColony(ca.id, { units: {}, last_updated: clock.t }); // ant's own army is away: only bee's soldiers defend
    const r = await raid(c, cc, ca, 10);
    expect(r.error).toBeUndefined();
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const battle = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(battle.data.defender.allies[0]).toMatchObject({ name: 'bee', units: { minor_soldier: 30 } });
    expect(battle.data.winner).toBe('defender');
    const allyReport = (await b.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(allyReport.title).toMatch(/^Your soldiers helped hold/);
    expect(allyReport.data.perspective).toBe('ally');
    const after = (await b.get('/api/state')).missions.find((m: any) => m.id === h.mission.id);
    const lost = battle.data.defender.allies[0].lost.minor_soldier ?? 0;
    expect(after.units.minor_soldier).toBe(30 - lost);
  });

  it('a recalled garrison walks home and rejoins its colony', async () => {
    const m = (await b.get('/api/state')).missions.find((x: any) => x.type === 'hold');
    const before = (await b.get('/api/state')).colony.units.minor_soldier ?? 0;
    expect((await b.post(`/api/missions/${m.id}/recall`)).ok).toBe(true);
    await clock.advance(m.arriveAt - m.departAt + 10);
    const s = await b.get('/api/state');
    expect(s.missions.find((x: any) => x.id === m.id)).toBeUndefined();
    expect(s.colony.units.minor_soldier).toBe(before + m.units.minor_soldier);
  });
});

describe('the slow break-up', () => {
  it('leaving starts a fade: raids stay off, garrisons go home', async () => {
    await rearm();
    const h = await a.post('/api/missions', { colonyId: ca.id, type: 'hold', target: cb.coords, units: { minor_soldier: 10 } });
    await clock.advance(h.mission.arriveAt - clock.t + 10);
    expect((await b.post('/api/supercolony/leave')).ok).toBe(true);
    const m = (await a.get('/api/state')).missions.find((x: any) => x.id === h.mission.id);
    expect(m.status).toBe('returning');
    expect((await raid(a, ca, cb)).error).toMatchObject({ code: 'pact_fading', message: DIPLOMACY_MESSAGES.raid_fading });
    expect((await raid(b, cb, ca)).error.code).toBe('pact_fading');
    expect((await spotOf(a, cb.coords)).colony).toMatchObject({ relation: 'fading' });
    // can't join another (or rejoin) while the old scent clings
    expect((await b.post('/api/supercolony', { name: 'New Scent' })).error.code).toBe('still_fading');
    // still fading just before the end; free after
    await clock.advance(scentFadeMs(speed) - 60_000);
    expect((await raid(a, ca, cb)).error?.code).toBe('pact_fading');
    await clock.advance(120_000);
    expect((await b.get('/api/reports')).reports[0].title).toBe('The Argentine Line scent has faded from your colonies');
    const r = await raid(a, ca, cb);
    expect(r.error).toBeUndefined();
    await a.post(`/api/missions/${r.mission.id}/recall`);
  });

  it('only the founder removes members; a removed member fades too', async () => {
    // bee rejoins, then ant removes bee
    await a.post('/api/supercolony/invite', { playerId: idb });
    const sc = (await b.get('/api/diplomacy')).invitesForMe[0].supercolonyId;
    await b.post(`/api/supercolony/${sc}/accept`);
    expect((await b.post('/api/supercolony/remove', { playerId: ida })).error.code).toBe('not_founder');
    expect((await a.post('/api/supercolony/remove', { playerId: idb })).ok).toBe(true);
    expect((await b.get('/api/diplomacy')).supercolony).toMatchObject({ myStatus: 'fading' });
    expect((await raid(a, ca, cb)).error?.code).toBe('pact_fading');
  });

  it('when the last member leaves, the supercolony dissolves and its name is free again', async () => {
    expect((await a.post('/api/supercolony/leave')).ok).toBe(true);
    const row = (await getPool().query("SELECT dissolved_at FROM supercolonies WHERE name = 'Argentine Line'")).rows[0];
    expect(row.dissolved_at).not.toBeNull();
    await clock.advance(scentFadeMs(speed) + 60_000);
    expect((await c.post('/api/supercolony', { name: 'argentine line' })).ok).toBe(true);
  });
});

describe('the migration', () => {
  it('only adds, and is safe to run again', async () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/migrations/010_supercolonies.sql'), 'utf8');
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER\s+TABLE\s+\w+\s+DROP)\b/i);
    await getPool().query(sql);
    await getPool().query(sql);
  });
});
