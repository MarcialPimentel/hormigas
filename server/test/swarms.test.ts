// Build 5: army-ant swarms (docs/20-swarms.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SWARM, createRng, rollSwarmScouts, rollSwarmSize, roughSwarmSize, swarmOdds, swarmOfPacks, swarmOfSize, swarmPacksFor, swarmParty, swarmPrey, swarmScoutChance, swarmScoutOdds, swarmSize, unitsValue } from '@hormigas/shared';
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
  const home = { units: { minor_soldier: 60, major_soldier: 20, worker: 40 }, defenses: { soil_wall: 1, pit_trap: 10 }, research: {} };
  const [foraging, war, great] = SWARM.sizes;

  it('a colony with nothing at home meets the smallest party, whatever the size', () => {
    for (const s of SWARM.sizes) expect(swarmParty({ units: {}, defenses: {}, research: {} }, 1, s)).toEqual(SWARM.smallest);
    expect(swarmOfSize(0)).toEqual(SWARM.smallest);
  });

  it('each size is the biggest swarm that still meets its win chance and loss limit', () => {
    for (const s of SWARM.sizes) {
      const n = swarmPacksFor(home, s, 7);
      expect(n).toBeGreaterThan(0);
      const at = swarmOdds(home, n, 7);
      expect(at.winRate).toBeGreaterThanOrEqual(s.minWinRate);
      if (s.maxLossPct != null) expect(at.lossShare * 100).toBeLessThanOrEqual(s.maxLossPct);
      const next = swarmOdds(home, n + 1, 7);
      expect(next.winRate < s.minWinRate || (s.maxLossPct != null && next.lossShare * 100 > s.maxLossPct)).toBe(true);
    }
  });

  it('foraging column < war column < great swarm, and only the great swarm can beat you', () => {
    const f = swarmPacksFor(home, foraging, 7), w = swarmPacksFor(home, war, 7), g = swarmPacksFor(home, great, 7);
    expect(f).toBeLessThan(w);
    expect(w).toBeLessThan(g);
    expect(swarmOdds(home, f, 99, 200).winRate).toBeGreaterThan(0.9);
    expect(swarmOdds(home, w, 99, 200).winRate).toBeGreaterThan(0.85);
    // near the top one more pack takes about 20 points off the win chance, so a great swarm lands between a coin flip and about 4 in 5
    const gw = swarmOdds(home, g, 99, 200).winRate;
    expect(gw).toBeGreaterThan(0.35);
    expect(gw).toBeLessThan(0.9);
  });

  it('rolls foraging columns most often and great swarms rarely', () => {
    const rng = createRng(3);
    const n: Record<string, number> = { foraging: 0, war: 0, great: 0 };
    for (let i = 0; i < 10000; i++) n[rollSwarmSize(rng).id]++;
    for (const s of SWARM.sizes) expect(n[s.id] / 100).toBeCloseTo(s.chance, -1);
    expect(swarmSize('war')?.name).toBe('War column');
    expect(swarmSize('nope')).toBeUndefined();
  });

  it('the prey is a share of the swarm in mixed food, at least a few hours of production', () => {
    const swarm = swarmOfPacks(10);
    const worth = Object.values(unitsValue(swarm)).reduce((a, b) => a + b, 0);
    const p = swarmPrey(swarm, 100);
    const total = p.foliage + p.protein + p.nectar;
    expect(total).toBeGreaterThan((worth * SWARM.prey.pctOfWorth) / 100 - 3);
    expect(total).toBeLessThanOrEqual((worth * SWARM.prey.pctOfWorth) / 100);
    expect(p.foliage).toBeGreaterThan(p.protein);
    expect(p.protein).toBeGreaterThan(p.nectar);
    // a rich colony meeting a small swarm still gets a few hours of its own production
    const rich = swarmPrey(swarmOfSize(0), 10000);
    expect(rich.foliage + rich.protein + rich.nectar).toBeGreaterThan(10000 * SWARM.prey.minHours - 3);
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
    expect(['foraging column', 'war column', 'great swarm'].map((n) => `${SWARM.name} (${n})`)).toContain(rep.data.attacker.name);
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

  it('a colony that beats a swarm keeps the prey it was carrying', async () => {
    await setColony(c.id, { units: { minor_soldier: 400, major_soldier: 200 }, defenses: {}, foliage: 0, protein: 0, nectar: 0, last_updated: clock.t, chambers: { queen_chamber: 3, leaf_garden: 5 } });
    await setPlayer(me.id, { last_active: clock.t });
    await spotNow(c.id);
    const m = (await swarmsAt(c.id)).at(-1);
    // a small swarm, so the colony surely wins
    await getPool().query('UPDATE missions SET units = $2 WHERE id = $1', [m.id, JSON.stringify(swarmOfPacks(1))]);
    await setPlayer(me.id, { last_active: Number(m.arrive_at) });
    await clock.advance(Number(m.arrive_at) - clock.t + 1);
    expect((await battles()).at(-1).data.winner).toBe('defender');
    const prey = (await getPool().query("SELECT title, data FROM reports WHERE player_id = $1 AND type = 'nest_event' ORDER BY id DESC LIMIT 1", [me.id])).rows[0];
    expect(prey.title).toBe('The swarm dropped its prey');
    const expected = swarmPrey(swarmOfPacks(1), 0);
    expect(prey.data.found.foliage).toBeGreaterThanOrEqual(expected.foliage);
    expect(prey.data.found.nectar).toBeGreaterThan(0);
    expect((await p.get('/api/state')).colony.resources.nectar).toBeGreaterThanOrEqual(expected.nectar);
  });

  it('players cannot send swarms', async () => {
    await setColony(c.id, { units: { minor_soldier: 5 }, nectar: 1000, last_updated: clock.t });
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'swarm', target: { ...c.coords, spot: 1 }, units: { minor_soldier: 1 } });
    expect(r.ok).not.toBe(true);
  });
});

// Build 13: Scouting the swarm (docs/20-swarms.md § Scouting the swarm).
describe('scouting the swarm: the odds', () => {
  it('each scout slips past with a base chance, more with Scent Reading and Chemical Mimicry, up to a cap', () => {
    expect(swarmScoutChance({})).toBeCloseTo(SWARM.scouting.basePct / 100);
    const s = SWARM.scouting;
    expect(swarmScoutChance({ scent_reading: 2, chemical_mimicry: 1 } as any)).toBeCloseTo((s.basePct + 2 * s.perScentReadingPct + s.perMimicryPct) / 100);
    expect(swarmScoutChance({ scent_reading: 20, chemical_mimicry: 3 } as any)).toBeCloseTo(s.maxPct / 100);
  });

  it('more scouts make a report likelier but lose more scouts', () => {
    expect(swarmScoutOdds(0, {}).reportChance).toBe(0);
    const one = swarmScoutOdds(1, {}), five = swarmScoutOdds(5, {});
    expect(one.reportChance).toBeCloseTo(swarmScoutChance({}));
    expect(five.reportChance).toBeGreaterThan(one.reportChance);
    expect(five.reportChance).toBeCloseTo(1 - Math.pow(1 - swarmScoutChance({}), 5));
    expect(five.expectedLost).toBeGreaterThan(one.expectedLost);
  });

  it('rolls each scout on its own', () => {
    expect(rollSwarmScouts(5, {}, () => 0.99)).toBe(0);
    expect(rollSwarmScouts(5, {}, () => 0)).toBe(5);
    let i = 0;
    expect(rollSwarmScouts(4, {}, () => [0.1, 0.9, 0.2, 0.8][i++])).toBe(2);
  });

  it('an unscouted swarm shows only a rough size', () => {
    expect(roughSwarmSize(5)).toBe(5);
    expect(roughSwarmSize(89)).toBe(90);
    expect(roughSwarmSize(1234)).toBe(1000);
    expect(roughSwarmSize(1750)).toBe(2000);
  });
});

describe('scouting the swarm: in the world', () => {
  const scoutMission = async () => (await p.get('/api/state')).missions.find((m: any) => m.type === 'scout');

  it('scouting your own colony with no swarm coming is refused', async () => {
    expect(await swarmsAt(c.id).then((r) => r.filter((m: any) => m.status === 'outbound'))).toHaveLength(0);
    await setColony(c.id, { units: { scout: 60 }, defenses: {}, nectar: 5000, last_updated: clock.t });
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: c.coords, units: { scout: 1 } });
    expect(r.ok).not.toBe(true);
    expect(JSON.stringify(r)).toContain('swarm');
  });

  it('before scouting, the colony sees only a rough size and no make-up', async () => {
    await setColony(c.id, { units: { scout: 60, minor_soldier: 80, major_soldier: 30 }, defenses: {}, nectar: 5000, last_updated: clock.t });
    await setPlayer(me.id, { last_active: clock.t });
    await spotNow(c.id);
    const m = (await swarmsAt(c.id)).at(-1);
    // a size that rounds, so the test can tell rough from real
    // every sighting is rolled a size; it stays hidden until scouted
    expect(SWARM.sizes.map((s) => s.id)).toContain(m.result.size);
    await getPool().query(`UPDATE missions SET units = $2, result = '{"size": "war"}'::jsonb WHERE id = $1`, [m.id, JSON.stringify(swarmOfPacks(17))]);
    const inc = (await p.get('/api/state')).incoming.find((i: any) => i.type === 'swarm');
    expect(inc.scouted).toBe(false);
    expect(inc.units).toBeUndefined();
    expect(inc.sizeName).toBeUndefined();
    expect(inc.unitCount).toBe(roughSwarmSize(85));
  });

  it('scouts sent at the colony meet the swarm: a report with its real size, and the card shows it', async () => {
    const sent = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: c.coords, units: { scout: 60 } });
    expect(sent.ok ?? true).not.toBe(false);
    const mission = await scoutMission();
    expect(mission).toBeTruthy();
    const swarm = (await swarmsAt(c.id)).at(-1);
    expect(mission.arriveAt).toBeLessThan(Number(swarm.arrive_at));
    await setPlayer(me.id, { last_active: mission.arriveAt });
    await clock.advance(mission.arriveAt - clock.t + 1);

    const rep = (await getPool().query("SELECT title, data FROM reports WHERE player_id = $1 AND type = 'scout' ORDER BY id DESC LIMIT 1", [me.id])).rows[0];
    // 60 scouts at 30% each: the chance none get back is about one in two billion
    expect(rep.title).toContain('Swarm scouted: a war column, 85 army ants');
    expect(rep.data.swarm.units).toEqual(swarmOfPacks(17));
    expect(rep.data.swarm.sizeName).toBe('War column');
    expect(rep.data.back + rep.data.lost).toBe(60);
    expect(rep.data.back).toBeGreaterThan(0);

    const inc = (await p.get('/api/state')).incoming.find((i: any) => i.type === 'swarm');
    expect(inc.scouted).toBe(true);
    expect(inc.unitCount).toBe(85);
    expect(inc.units).toEqual(swarmOfPacks(17));
    expect(inc.sizeName).toBe('War column');

    // the survivors walk home; the eaten ones don't
    const back = await scoutMission();
    await setPlayer(me.id, { last_active: back.returnAt });
    await clock.advance(back.returnAt - clock.t + 1);
    expect((await p.get('/api/state')).colony.units.scout ?? 0).toBe(rep.data.back);
  });

  it('the scouted swarm still lands as a normal battle', async () => {
    const swarm = (await swarmsAt(c.id)).at(-1);
    await setPlayer(me.id, { last_active: Number(swarm.arrive_at) });
    await clock.advance(Number(swarm.arrive_at) - clock.t + 1);
    expect((await battles()).at(-1).title).toContain(`${SWARM.name} (war column)`);
    expect((await swarmsAt(c.id)).at(-1).status).toBe('done');
  });
});
