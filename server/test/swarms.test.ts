// Build 5: army-ant swarms (docs/20-swarms.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SWARM, defenderWinRate, swarmOfPacks, swarmParty } from '@hormigas/shared';
import { getPool, tx } from '../src/db';
import { ensureSwarms } from '../src/game/swarms';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let me: any;
let speed: number;
let worldId: number;
const H = 3600_000;

const sightings = async (colonyId: number) =>
  (await getPool().query("SELECT * FROM events WHERE NOT done AND type = 'swarm_spotted' AND (payload->>'colonyId')::int = $1", [colonyId])).rows;
const swarmsAt = async (colonyId: number) =>
  (await getPool().query("SELECT * FROM missions WHERE type = 'swarm' AND target_colony_id = $1 ORDER BY id", [colonyId])).rows;
const battles = async () => (await getPool().query("SELECT title, data FROM reports WHERE player_id = $1 AND type = 'battle' ORDER BY id", [me.id])).rows;
/** Bring the colony's next sighting forward to now and run it. */
async function spotNow(colonyId: number) {
  await getPool().query("UPDATE events SET due_at = $2 WHERE NOT done AND type = 'swarm_spotted' AND (payload->>'colonyId')::int = $1", [colonyId, clock.t]);
  await clock.advance(1);
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'defender');
  const s = await p.get('/api/state');
  c = s.colony;
  me = s.player;
  speed = s.world.speed;
  worldId = s.world.id;
  // calm the wild nests only: swarms are what this file tests
  await getPool().query("UPDATE events SET done = true WHERE type = 'nest_raid'");
});
afterAll(async () => teardownTest(app));

describe('sizing', () => {
  it('a colony with nothing at home meets the smallest swarm', () => {
    expect(swarmParty({ units: {}, defenses: {}, research: {} }, 1)).toEqual(swarmOfPacks(SWARM.minPacks));
  });

  it('a defended colony meets a swarm it beats about 70% of the time', () => {
    const home = { units: { minor_soldier: 60, major_soldier: 20, worker: 40 }, defenses: { soil_wall: 1, pit_trap: 10 }, research: {} };
    const party = swarmParty(home, 7);
    expect(party.minor_soldier).toBeGreaterThan(SWARM.pack.minor_soldier!);
    const packs = party.minor_soldier! / SWARM.pack.minor_soldier!;
    expect(defenderWinRate(home, packs, 7)).toBeGreaterThanOrEqual(SWARM.defenderWinRate);
    expect(defenderWinRate(home, packs + 1, 7)).toBeLessThan(SWARM.defenderWinRate);
  });
});

describe('in the world', () => {
  it('every colony gets a sighting at signup, and startup fills any gaps', async () => {
    expect(await sightings(c.id)).toHaveLength(1);
    await getPool().query("UPDATE events SET done = true WHERE type = 'swarm_spotted'");
    expect(await tx((q) => ensureSwarms(q, worldId, clock.t))).toBeGreaterThanOrEqual(1);
    expect(await sightings(c.id)).toHaveLength(1);
    expect(await tx((q) => ensureSwarms(q, worldId, clock.t))).toBe(0);
  });

  it('never comes during new-colony protection, but keeps its schedule', async () => {
    expect(me.protectedUntil).toBeGreaterThan(clock.t);
    await spotNow(c.id);
    expect(await swarmsAt(c.id)).toHaveLength(0);
    expect(await sightings(c.id)).toHaveLength(1);
  });

  it('is announced warningHours ahead as a hostile wild raid', async () => {
    await setPlayer(me.id, { protected_until: 0, last_active: clock.t });
    await setColony(c.id, { units: { minor_soldier: 40, major_soldier: 10 }, foliage: 5000, protein: 5000, nectar: 5000, last_updated: clock.t });
    await spotNow(c.id);
    const [m] = await swarmsAt(c.id);
    expect(m).toBeTruthy();
    expect(Number(m.arrive_at) - Number(m.depart_at)).toBe(Math.round((SWARM.warningHours * H) / speed));
    expect(m.origin_spot).toBe(13);
    const s = await p.get('/api/state');
    const inc = s.incoming.find((i: any) => i.type === 'swarm');
    expect(inc.hostile).toBe(true);
    expect(inc.from).toBe(SWARM.name);
    // no second swarm while one is on its way
    await spotNow(c.id);
    expect(await swarmsAt(c.id)).toHaveLength(1);
  });

  it('lands as a battle, leaves corpses, and never goes home', async () => {
    const [m] = await swarmsAt(c.id);
    await setPlayer(me.id, { last_active: Number(m.arrive_at) });
    await clock.advance(Number(m.arrive_at) - clock.t + 1);
    const rep = (await battles()).at(-1);
    expect(rep.title).toContain(SWARM.name);
    expect(rep.data.attacker.name).toBe(SWARM.name);
    const done = (await swarmsAt(c.id))[0];
    expect(done.status).toBe('done');
    expect(Number(rep.data.corpses)).toBeGreaterThan(0);
    const field = await getPool().query('SELECT protein FROM corpse_fields WHERE region = $1 AND patch = $2 AND spot = $3', [c.coords.region, c.coords.patch, c.coords.spot]);
    expect(field.rowCount).toBe(1);
  });

  it('an undefended colony loses only unprotected food, and keeps its chambers', async () => {
    await setColony(c.id, { units: {}, defenses: {}, foliage: 3000, protein: 3000, nectar: 3000, last_updated: clock.t, chambers: { queen_chamber: 3, honeypot_gallery: 1 } });
    await setPlayer(me.id, { last_active: clock.t });
    await spotNow(c.id);
    const [, m] = await swarmsAt(c.id);
    await setPlayer(me.id, { last_active: Number(m.arrive_at) });
    await clock.advance(Number(m.arrive_at) - clock.t + 1);
    const rep = (await battles()).at(-1);
    expect(rep.data.winner).toBe('attacker');
    const after = (await p.get('/api/state')).colony;
    expect(after.chambers).toEqual({ queen_chamber: 3, honeypot_gallery: 1 });
    // the Honeypot Gallery's protected amount stays
    for (const r of ['foliage', 'protein', 'nectar']) expect(after.resources[r]).toBeGreaterThanOrEqual(1600 - 1);
  });

  it('players cannot send swarms', async () => {
    await setColony(c.id, { units: { minor_soldier: 5 }, nectar: 1000, last_updated: clock.t });
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'swarm', target: { ...c.coords, spot: 1 }, units: { minor_soldier: 1 } });
    expect(r.ok).not.toBe(true);
  });
});
