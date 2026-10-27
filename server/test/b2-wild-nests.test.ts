// Build 2: wild nests (docs/17-wild-nests.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TERRAIN, STARTING_TERRAIN, nestTargets, NEST_REGROW_HOURS } from '@hormigas/shared';
import { getPool, tx } from '../src/db';
import { ensureNest, ensureWildNests } from '../src/game/nests';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let me: any;
let speed: number;
let nestSpot: any;
const H = 3600_000;

const mapOf = async (client: Client, coords: any) => (await client.get(`/api/map?region=${coords.region}&patch=${coords.patch}`)).spots;
const nestRow = async () => (await getPool().query('SELECT * FROM colonies WHERE npc IS NOT NULL AND region = $1 AND patch = $2', [c.coords.region, c.coords.patch])).rows[0];
const latest = async (client: Client, type: string) => (await client.get('/api/reports?limit=100')).reports.find((r: any) => r.type === type);

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'settler');
  const s = await p.get('/api/state');
  c = s.colony;
  me = s.player;
  speed = s.world.speed;
});
afterAll(async () => teardownTest(app));

describe('spawning', () => {
  it('signing up spawns one wild nest in the patch, off the starting spots', async () => {
    const spots = await mapOf(p, c.coords);
    const wild = spots.filter((s: any) => s.colony?.wild);
    expect(wild).toHaveLength(1);
    nestSpot = wild[0];
    expect(TERRAIN[STARTING_TERRAIN].spots).not.toContain(nestSpot.spot);
    expect(nestSpot.colony.wild.level).toBe(1);
    expect(nestSpot.colony.mine).toBe(false);
    expect(['Pavement Ants', 'Fire Ants', 'Carpenter Ants']).toContain(nestSpot.colony.owner);
    const row = await nestRow();
    expect(row.units).toEqual(nestTargets(row.npc.species, 1).units);
  });

  it('is idempotent, and startup gives nest-less patches a nest', async () => {
    const row = await nestRow();
    const again = await tx((q) => ensureNest(q, row.world_id, row.region, row.patch, clock.t));
    expect(again).toBe(row.id);
    await getPool().query('DELETE FROM colonies WHERE id = $1', [row.id]);
    const spawned = await tx((q) => ensureWildNests(q, row.world_id, clock.t));
    expect(spawned).toBe(1);
    nestSpot = (await mapOf(p, c.coords)).find((s: any) => s.colony?.wild);
    expect(nestSpot).toBeTruthy();
  });

  it('the wild owner is not a player: not in rankings, cannot log in', async () => {
    const r = await p.get('/api/rankings');
    expect(r.rows.map((x: any) => x.username)).toEqual(['settler']);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: '~wild', password: '!' } });
    expect(login.statusCode).not.toBe(200);
  });
});

describe('scouting and raiding a nest', () => {
  const target = () => ({ ...c.coords, spot: nestSpot.spot });

  beforeAll(async () => {
    await setColony(c.id, { foliage: 1e5, protein: 1e5, nectar: 1e5, last_updated: clock.t, units: { scout: 2, minor_soldier: 40, worker: 10 } });
  });

  it('scouting names the species and counts for the founding task', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: target(), units: { scout: 1 } });
    expect(r.ok).toBe(true);
    await clock.advance(6 * H);
    const rep = await latest(p, 'scout');
    expect(rep.data.wild.level).toBe(1);
    expect(rep.data.owner).toBe(nestSpot.colony.owner);
    // the nest's owner gets no "scouted" report, and nothing is sent to anyone else
    const n = await getPool().query("SELECT count(*)::int AS n FROM reports WHERE type = 'scouted'");
    expect(n.rows[0].n).toBe(0);
  });

  it('nests take no deliveries', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'transport', target: target(), units: { worker: 1 }, cargo: { foliage: 10, protein: 0, nectar: 0 } });
    expect(r.error.code).toBe('bad_target');
  });

  it('a protected player can raid a nest, keeps protection, and finishes the founding task', async () => {
    const before = (await p.get('/api/state')).player.protectedUntil;
    expect(before).toBeGreaterThan(clock.t);
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'raid', target: target(), units: { minor_soldier: 20, worker: 4 } });
    expect(r.ok).toBe(true);
    expect((await p.get('/api/state')).player.protectedUntil).toBe(before);
    await clock.advance(6 * H);

    const rep = await latest(p, 'battle');
    expect(rep.data.winner).toBe('attacker');
    expect(rep.data.defender.name).toBe(nestSpot.colony.owner === 'Fire Ants' ? 'Fire Ant Mound' : rep.data.defender.colony);
    expect(rep.data.defender.wild).toBe(true);
    const loot = rep.data.loot.foliage + rep.data.loot.protein + rep.data.loot.nectar;
    expect(loot).toBeGreaterThan(0);

    const s = await p.get('/api/state');
    expect(s.quests.quest).toBeTruthy();
    // claim everything up to the raid task so the wild raid is next in line
    const claimed = ['leaf', 'nursery', 'hunt', 'queen2', 'grow', 'queen3', 'nectar', 'brood', 'workers', 'forage', 'scout'];
    await setPlayer(me.id, { quests_claimed: claimed });
    const s2 = await p.get('/api/state');
    expect(s2.quests.quest.id).toBe('wild_raid');
    expect(s2.quests.quest.ready).toBe(true);
    expect((await p.post('/api/quests/claim', { id: 'wild_raid', colonyId: c.id })).ok).toBe(true);
    expect((await p.get('/api/state')).quests.finished).toBe(true);
  });

  it('the nest regrows to full within a day', async () => {
    const row = await nestRow();
    const full = nestTargets(row.npc.species, row.npc.level);
    const lost = Object.entries(full.units).some(([k, n]) => (row.units[k] ?? 0) < n!);
    expect(lost).toBe(true);
    await clock.advance((NEST_REGROW_HOURS * H) / speed + H);
    await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: target(), units: { scout: 1 } });
    await clock.advance(6 * H);
    const rep = await latest(p, 'scout');
    expect(rep.data.units).toEqual(full.units);
  });

  it('the bash limit still applies', async () => {
    const row = await nestRow();
    for (let i = 0; i < 4; i++)
      await getPool().query("INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES ($1,$2,$3,'attacker',$4)", [row.world_id, me.id, row.id, clock.t]);
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'raid', target: target(), units: { minor_soldier: 5 } });
    expect(r.error.code).toBe('bash_limit');
    await getPool().query('DELETE FROM raid_log WHERE attacker_id = $1', [me.id]);
  });

  it('levels up with the patch leader and never drops', async () => {
    await setPlayer(me.id, { points_total: 250 });
    let spot = (await mapOf(p, c.coords)).find((s: any) => s.colony?.wild);
    expect(spot.colony.wild.level).toBe(4);
    await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: target(), units: { scout: 1 } });
    await clock.advance(6 * H);
    expect((await nestRow()).npc.level).toBe(4);
    await setPlayer(me.id, { points_total: 0 });
    spot = (await mapOf(p, c.coords)).find((s: any) => s.colony?.wild);
    expect(spot.colony.wild.level).toBe(4);
  });
});

describe('nests raid back', () => {
  const fireRaid = async () => {
    await getPool().query("UPDATE events SET due_at = $1 WHERE type = 'nest_raid' AND NOT done", [clock.t]);
    await clock.advance(0);
  };

  it('never raids a protected player', async () => {
    await setColony(c.id, { units: {}, last_updated: clock.t });
    await fireRaid();
    expect((await p.get('/api/state')).incoming).toHaveLength(0);
  });

  it('sends a small, slow raid once protection ends, named after the nest', async () => {
    await setPlayer(me.id, { protected_until: 0, points_total: 30 });
    await fireRaid();
    const s = await p.get('/api/state');
    expect(s.incoming).toHaveLength(1);
    const inc = s.incoming[0];
    expect(inc.hostile).toBe(true);
    expect(inc.wild).toBe(true);
    expect(inc.from).toBe((await nestRow()).name);
    // slow: about 50 minutes of warning at ×1
    expect((inc.arriveAt - clock.t) * speed).toBeGreaterThan(40 * 60_000);

    // only one raid per player per cooldown, even if the nest wakes again
    await fireRaid();
    expect((await p.get('/api/state')).incoming).toHaveLength(1);

    await clock.advance(inc.arriveAt - clock.t + 1000);
    const rep = await latest(p, 'battle');
    expect(rep.data.perspective).toBe('defender');
    expect(rep.data.attacker.wild).toBe(true);
    expect(rep.title).toContain((await nestRow()).name);
    // the wild owner never gets reports
    const wildReports = await getPool().query('SELECT count(*)::int AS n FROM reports r JOIN players pl ON pl.id = r.player_id WHERE pl.is_npc');
    expect(wildReports.rows[0].n).toBe(0);
  });

  it('a defended colony beats the raid and keeps the corpses next door', async () => {
    await getPool().query('DELETE FROM raid_log');
    await setColony(c.id, { units: { minor_soldier: 40 }, last_updated: clock.t });
    await fireRaid();
    const inc = (await p.get('/api/state')).incoming[0];
    await clock.advance(inc.arriveAt - clock.t + 1000);
    const rep = await latest(p, 'battle');
    expect(rep.data.winner).toBe('defender');
    expect(rep.data.corpses).toBeGreaterThan(0);
  });
});

describe('safety net', () => {
  it('startup re-arms a nest whose raid event was lost', async () => {
    await getPool().query("UPDATE events SET done = true WHERE type = 'nest_raid'");
    const row = await nestRow();
    await tx((q) => ensureWildNests(q, row.world_id, clock.t));
    const pending = await getPool().query("SELECT count(*)::int AS n FROM events WHERE type = 'nest_raid' AND NOT done AND (payload->>'colonyId')::int = $1", [row.id]);
    expect(pending.rows[0].n).toBe(1);
  });
});
