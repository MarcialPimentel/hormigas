// Build 9: more wild things (docs/23-npcs.md): nests in neighbouring patches, aphid herds, termite mounds, spider dens.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HERDS, SITE_SPOTS, WILD_SCENTS, herdNectarPerHour, herdStoreCap, nestTargets, regrowHours } from '@hormigas/shared';
import { getPool, tx } from '../src/db';
import { ensureWildNests } from '../src/game/nests';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let alpha: number, beta: number;
let speed: number;
const H = 3600_000;

const mapOf = async (who: Client, region: number, patch: number) => (await who.get(`/api/map?region=${region}&patch=${patch}`)).spots;
const wildRow = async (region: number, patch: number, spot: number) =>
  (await getPool().query('SELECT * FROM colonies WHERE region = $1 AND patch = $2 AND spot = $3', [region, patch, spot])).rows[0];
const latest = async (who: Client, type: string) => (await who.get('/api/reports?limit=100')).reports.find((r: any) => r.type === type);
const at = (patch: number, spot: number) => ({ region: ca.coords.region, patch, spot });
const herdAt = (patch: number) => at(patch, SITE_SPOTS.herd);

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
  await calmWildNests();
  for (const id of [alpha, beta]) await setPlayer(id, { protected_until: 0, points_total: 100 });
  for (const c of [ca, cb])
    await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, units: { scout: 10, minor_soldier: 400, major_soldier: 200, worker: 40 } });
});
afterAll(async () => teardownTest(app));

describe('the area fills with wild things', () => {
  it('a nest and a herd in every patch within 2, a termite mound and a spider den in reach', async () => {
    const { region, patch } = ca.coords;
    expect(patch).toBe(1);
    for (const p of [1, 2, 3]) {
      const rows = (await getPool().query('SELECT spot, npc FROM colonies WHERE region = $1 AND patch = $2 AND npc IS NOT NULL', [region, p])).rows;
      expect(rows.filter((r) => r.spot <= 12), `nest in patch ${p}`).toHaveLength(1);
      expect(rows.find((r) => r.spot === SITE_SPOTS.herd)?.npc.kind, `herd in patch ${p}`).toBe('herd');
    }
    expect((await wildRow(region, 3, SITE_SPOTS.mound)).npc.species).toBe('termite'); // patch % 5 == 3
    expect((await wildRow(region, 8, SITE_SPOTS.den)).npc.species).toBe('spider'); // patch % 10 == 8
    expect(await wildRow(region, 4, SITE_SPOTS.herd)).toBeUndefined(); // out of range
  });

  it('new things are scents that hint at what they are', async () => {
    const spots = await mapOf(a, ca.coords.region, 3);
    const herd = spots.find((s: any) => s.spot === SITE_SPOTS.herd).colony;
    const mound = spots.find((s: any) => s.spot === SITE_SPOTS.mound).colony;
    const nest = spots.find((s: any) => s.colony?.kind === 'wild' && s.spot <= 12).colony;
    expect(herd).toMatchObject({ known: 'scent', kind: 'wild', hint: 'herd', name: WILD_SCENTS.herd.name, id: null, owner: null });
    expect(mound).toMatchObject({ known: 'scent', hint: 'mound', name: WILD_SCENTS.mound.name });
    expect(nest).toMatchObject({ known: 'scent', hint: 'nest', name: 'Wild scent' });
    const den = (await mapOf(a, ca.coords.region, 8)).find((s: any) => s.spot === SITE_SPOTS.den).colony;
    expect(den).toMatchObject({ known: 'scent', hint: 'den', name: WILD_SCENTS.den.name });
  });

  it('startup fills in areas settled before this build, once', async () => {
    await getPool().query('DELETE FROM colonies WHERE region = $1 AND patch = 2 AND npc IS NOT NULL', [ca.coords.region]);
    const first = await tx((q) => ensureWildNests(q, ca.world_id ?? 1, clock.t));
    expect(first).toBe(2);
    expect(await tx((q) => ensureWildNests(q, 1, clock.t))).toBe(0);
  });

  it('mounds and dens never raid, and a Winged Queen cannot settle on a wild site', async () => {
    const mound = await wildRow(ca.coords.region, 3, SITE_SPOTS.mound);
    const ev = await getPool().query("SELECT count(*)::int AS n FROM events WHERE type = 'nest_raid' AND (payload->>'colonyId')::int = $1", [mound.id]);
    expect(ev.rows[0].n).toBe(0);
    await setColony(ca.id, { units: { winged_queen: 1, scout: 10, minor_soldier: 400, major_soldier: 200, worker: 40 } });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'colonize', target: at(5, SITE_SPOTS.herd), units: { winged_queen: 1 } });
    expect(r.error.code).toBe('bad_target');
  });

  it('players still settle next door: patches holding only wild things are open', async () => {
    await getPool().query("UPDATE players SET last_active = 0 WHERE username IN ('alpha', 'beta')");
    const c = (await newPlayer(app, 'gamma').then((g) => g.get('/api/state'))).colony.coords;
    expect(c.patch).toBe(2);
    await getPool().query('UPDATE players SET last_active = $1 WHERE NOT is_npc', [clock.t]);
    await calmWildNests();
  });
});

describe('termite mound', () => {
  it('scouting names it and says how slowly it regrows; a big army takes its store', async () => {
    const target = at(3, SITE_SPOTS.mound);
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target, units: { minor_soldier: 10 } })).error.code).toBe('not_scouted');
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target, units: { scout: 3 } })).ok).toBe(true);
    await clock.advance(6 * H);
    const rep = await latest(a, 'scout');
    expect(rep.data.wild).toMatchObject({ species: 'termite', kind: 'mound', level: 1 });
    expect(rep.data.regrowMs).toBe((regrowHours('termite') * H) / speed);
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target, units: { minor_soldier: 150, major_soldier: 40, worker: 20 } });
    expect(r.ok).toBe(true);
    await clock.advance(6 * H);
    const battle = await latest(a, 'battle');
    expect(battle.data.winner).toBe('attacker');
    // a richer haul than half of a level-6 nest's whole store, if you bring carriers
    const loot = battle.data.loot.foliage + battle.data.loot.protein + battle.data.loot.nectar;
    const l6 = nestTargets('pavement', 6).resources;
    expect(loot).toBeGreaterThan((l6.foliage + l6.protein + l6.nectar) / 2);
  });
});

describe('aphid herds', () => {
  const herd = () => herdAt(2);

  it('you scout a herd before you tend it; the report says what it makes', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'tend', target: herd(), units: { worker: 2 } });
    expect(r.error.code).toBe('not_scouted');
    await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: herd(), units: { scout: 1 } });
    await b.post('/api/missions', { colonyId: cb.id, type: 'scout', target: herd(), units: { scout: 1 } });
    await clock.advance(6 * H);
    const rep = await latest(a, 'scout');
    expect(rep.data.herd).toMatchObject({ tended: false, nectarPerHour: herdNectarPerHour(rep.data.herd.level) });
    const spot = (await mapOf(a, ca.coords.region, 2)).find((s: any) => s.spot === SITE_SPOTS.herd).colony;
    expect(spot).toMatchObject({ known: 'known', owner: 'Aphids', herd: { tended: false, yours: false } });
  });

  it('nobody to fight at an untended herd, and no deliveries', async () => {
    expect((await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: herd(), units: { minor_soldier: 5 } })).error.code).toBe('herd_untended');
    const t = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: herd(), units: { worker: 1 }, cargo: { foliage: 1, protein: 0, nectar: 0 } });
    expect(t.error.code).toBe('bad_target');
  });

  it('tenders claim the herd; honeydew piles up and is carried home every few hours', async () => {
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'tend', target: herd(), units: { worker: 2, minor_soldier: 10 } });
    expect(r.ok).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const rep = await latest(a, 'herd');
    expect(rep.data.claimed).toBe(true);
    let view = (await mapOf(a, ca.coords.region, 2)).find((s: any) => s.spot === SITE_SPOTS.herd).colony.herd;
    expect(view).toMatchObject({ tended: true, yours: true, tenderName: 'alpha', tenders: { worker: 2, minor_soldier: 10 } });
    // others see who tends it, but not how many
    const other = (await mapOf(b, ca.coords.region, 2)).find((s: any) => s.spot === SITE_SPOTS.herd).colony.herd;
    expect(other).toMatchObject({ tended: true, yours: false, tenderName: 'alpha' });
    expect(other.tenders).toBeUndefined();
    // tenders still count toward your points
    const pts = await getPool().query('SELECT points FROM players WHERE id = $1', [alpha]);
    expect(pts.rows[0].points.military).toBeGreaterThan(0);

    // honeydew builds up while tended
    await setColony(ca.id, { nectar: 0, last_updated: clock.t });
    await clock.advance((2 * H) / speed);
    view = (await mapOf(a, ca.coords.region, 2)).find((s: any) => s.spot === SITE_SPOTS.herd).colony.herd;
    expect(view.honeydew).toBeCloseTo(2 * view.nectarPerHour, -1);
    // ... and is delivered home
    const before = (await a.get('/api/state')).colony.resources.nectar;
    await clock.advance((HERDS.deliverEveryHours * H) / speed);
    const after = (await a.get('/api/state')).colony.resources.nectar;
    expect(after - before).toBeGreaterThanOrEqual(view.nectarPerHour * HERDS.deliverEveryHours * 0.9);
  });

  it('one herd per colony, and nobody else can tend a tended herd', async () => {
    await a.post('/api/missions', { colonyId: ca.id, type: 'scout', target: herdAt(3), units: { scout: 1 } });
    await clock.advance(6 * H);
    const two = await a.post('/api/missions', { colonyId: ca.id, type: 'tend', target: herdAt(3), units: { worker: 1 } });
    expect(two.error.code).toBe('herd_limit');
    const taken = await b.post('/api/missions', { colonyId: cb.id, type: 'tend', target: herd(), units: { worker: 1 } });
    expect(taken.error.code).toBe('herd_taken');
  });

  it('raiding a herd is a fight with its tenders; win and the herd is free, with the honeydew', async () => {
    const r = await b.post('/api/missions', { colonyId: cb.id, type: 'raid', target: herd(), units: { minor_soldier: 60, worker: 4 } });
    expect(r.ok).toBe(true);
    // the tender is warned
    const inc = (await a.get('/api/state')).incoming;
    expect(inc.some((x: any) => x.hostile && x.from === 'beta')).toBe(true);
    await clock.advance(r.mission.arriveAt - clock.t + 1000);
    const battle = await latest(b, 'battle');
    expect(battle.data.winner).toBe('attacker');
    expect(battle.data.loot.nectar).toBeGreaterThan(0);
    const defender = await latest(a, 'battle');
    expect(defender.data.perspective).toBe('defender');
    expect(defender.title).toContain('your tenders were driven off');
    const row = await wildRow(ca.coords.region, 2, SITE_SPOTS.herd);
    expect(row.npc.tender).toBeNull();
    expect(row.npc.untendedSince).toBeGreaterThan(0);
    // beta can now claim it
    const t = await b.post('/api/missions', { colonyId: cb.id, type: 'tend', target: herd(), units: { worker: 3 } });
    expect(t.ok).toBe(true);
    await clock.advance(t.mission.arriveAt - clock.t + 1000);
    expect((await wildRow(ca.coords.region, 2, SITE_SPOTS.herd)).npc.tender.playerId).toBe(beta);
  });

  it('calling tenders home brings them back with what honeydew they can carry', async () => {
    await clock.advance((3 * H) / speed);
    const before = (await b.get('/api/state')).colony;
    const r = await b.post(`/api/herds/${(await wildRow(ca.coords.region, 2, SITE_SPOTS.herd)).id}/recall`);
    expect(r.ok).toBe(true);
    expect(r.mission.status).toBe('returning');
    expect(r.mission.cargo.nectar).toBeGreaterThan(0);
    expect(r.mission.cargo.nectar).toBeLessThanOrEqual(herdStoreCap(1) * 6);
    // alpha can't call beta's tenders
    expect((await a.post(`/api/herds/${(await wildRow(ca.coords.region, 2, SITE_SPOTS.herd)).id}/recall`)).status).toBe(403);
    await clock.advance(r.mission.returnAt - clock.t + 1000);
    const after = (await b.get('/api/state')).colony;
    expect(after.units.worker).toBe(before.units.worker + 3);
  });

  it('an untended herd wanders off to a nearby patch after a while', async () => {
    const row = await wildRow(ca.coords.region, 2, SITE_SPOTS.herd);
    // make room: the only free herd site near players is patch 4, two patches from gamma's home in patch 2
    await getPool().query('DELETE FROM colonies WHERE region = $1 AND patch = 4 AND spot = $2', [ca.coords.region, SITE_SPOTS.herd]);
    await clock.advance((HERDS.wanderAfterHours * H) / speed + H);
    const moved = (await getPool().query('SELECT patch, npc FROM colonies WHERE id = $1', [row.id])).rows[0];
    expect(moved.patch).not.toBe(2);
    expect(moved.npc.tender).toBeNull();
  });
});

describe('spider den', () => {
  it('a day-14 army bounces off; a day-30 army brings her down', async () => {
    await knowAll();
    const target = at(8, SITE_SPOTS.den);
    await setColony(ca.id, { units: { minor_soldier: 400, major_soldier: 200, scout: 5, worker: 40 }, nectar: 1e6, last_updated: clock.t });
    const weak = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target, units: { minor_soldier: 150, major_soldier: 40 } });
    expect(weak.error).toBeUndefined();
    await clock.advance(weak.mission.arriveAt - clock.t + 1000);
    expect((await latest(a, 'battle')).data.winner).not.toBe('attacker');
    const den = await wildRow(ca.coords.region, 8, SITE_SPOTS.den);
    expect(den.units.trapdoor_spider).toBe(1); // she's whole: a small raid can't wear her down
    const strong = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target, units: { minor_soldier: 250, major_soldier: 100, worker: 10 } });
    await clock.advance(strong.mission.arriveAt - clock.t + 1000);
    const win = await latest(a, 'battle');
    expect(win.data.winner).toBe('attacker');
    expect(win.data.loot.protein).toBeGreaterThan(0);
  });
});
