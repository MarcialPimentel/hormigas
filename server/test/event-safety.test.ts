// A broken event must never leave the game stuck (2026-10-29 architecture review, PR 1):
// a mission whose arrival fails turns for home with its ants, recurring colony events keep coming after a failure,
// and the startup repair fixes missions that lost their event.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool, tx } from '../src/db';
import { processDueEvents } from '../src/events';
import { ALL_MISSION_TYPES, defineMission, enabledMissionTypes, missionRules, repairStuckMissions } from '../src/game/missions';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let worldId: number;

const mission = async (id: number) => (await getPool().query('SELECT * FROM missions WHERE id = $1', [id])).rows[0];
const colonyRow = async (id: number) => (await getPool().query('SELECT units, foliage FROM colonies WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'sender');
  b = await newPlayer(app, 'receiver');
  ca = (await a.get('/api/state')).colony;
  cb = (await b.get('/api/state')).colony;
  worldId = (await getPool().query('SELECT id FROM worlds LIMIT 1')).rows[0].id;
  await setColony(ca.id, { foliage: 50000, protein: 50000, nectar: 50000, last_updated: clock.t, units: { worker: 20 } });
  await setColony(cb.id, { foliage: 1000, protein: 1000, nectar: 1000, last_updated: clock.t });
  await calmWildNests();
  await knowAll();
});
afterAll(async () => teardownTest(app));

describe('mission types', () => {
  it('every MissionType has its rules registered', () => {
    const enabled = new Set(enabledMissionTypes());
    expect(ALL_MISSION_TYPES.filter((t) => !enabled.has(t))).toEqual([]);
  });
});

describe('a mission whose arrival fails', () => {
  it('turns home with its units and cargo instead of staying outbound forever', async () => {
    const real = missionRules('transport')!;
    defineMission('transport', { ...real, arrive: async () => { throw new Error('boom'); } });
    try {
      const r = await a.post('/api/missions', {
        colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 10 }, cargo: { foliage: 5000, protein: 0, nectar: 0 },
      });
      expect(r.ok).toBe(true);
      const id = r.mission.id;
      const oneWay = r.mission.arriveAt - r.mission.departAt;
      expect((await colonyRow(ca.id)).units.worker).toBe(10);
      const receiverFoliage = Number((await colonyRow(cb.id)).foliage);
      const arriveEventId = (await mission(id)).arrive_event_id;

      await clock.advance(oneWay + 10);
      const m = await mission(id);
      expect(m.status).toBe('returning');
      expect(m.result.unresolved).toBe(true);
      expect(m.units).toEqual({ worker: 10 });
      expect(m.cargo.foliage).toBe(5000);
      // nothing was delivered: the failed arrival was rolled back
      expect(Number((await colonyRow(cb.id)).foliage)).toBe(receiverFoliage);
      const ev = (await getPool().query('SELECT done, payload FROM events WHERE id = $1', [arriveEventId])).rows[0];
      expect(ev.done).toBe(true);
      expect(ev.payload.error).toContain('boom');

      await clock.advance(oneWay + 10);
      expect((await mission(id)).status).toBe('done');
      const home = await a.get('/api/state');
      expect(home.colony.units.worker).toBe(20);
      expect(home.colony.resources.foliage).toBeGreaterThanOrEqual(50000);
      expect(home.missions).toHaveLength(0);
    } finally {
      defineMission('transport', real);
    }
  });
});

describe('startup repair', () => {
  it('turns home outbound missions that lost their arrival, reschedules lost returns, and is idempotent', async () => {
    const send = async () =>
      (await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 2 }, cargo: { foliage: 10, protein: 0, nectar: 0 } })).mission;
    const out = await send();
    const back = await send();
    // `out` lost its arrival event; `back` is on its way home but lost its return event
    await getPool().query('UPDATE events SET done = true WHERE id = (SELECT arrive_event_id FROM missions WHERE id = $1)', [out.id]);
    await getPool().query('UPDATE events SET done = true WHERE id = (SELECT arrive_event_id FROM missions WHERE id = $1)', [back.id]);
    await getPool().query("UPDATE missions SET status = 'returning', return_at = $2, return_event_id = NULL WHERE id = $1", [back.id, clock.t + 1000]);

    expect(await tx((q) => repairStuckMissions(q, worldId, clock.t))).toBe(2);
    expect(await tx((q) => repairStuckMissions(q, worldId, clock.t))).toBe(0);
    const o = await mission(out.id);
    expect(o.status).toBe('returning');
    expect(o.result.unresolved).toBe(true);
    const k = await mission(back.id);
    expect(k.status).toBe('returning');
    expect(k.return_event_id).not.toBeNull();

    await clock.advance(2 * (out.arriveAt - out.departAt) + 2000);
    expect((await mission(out.id)).status).toBe('done');
    expect((await mission(back.id)).status).toBe('done');
    expect((await colonyRow(ca.id)).units.worker).toBe(20);
  });
});

describe('recurring colony events', () => {
  it('a nest event that fails still schedules the next one', async () => {
    const pending = async () =>
      (await getPool().query("SELECT id, due_at FROM events WHERE NOT done AND type = 'nest_event' AND (payload->>'colonyId')::int = $1", [ca.id])).rows;
    const [ev] = await pending();
    expect(ev).toBeTruthy();
    // make every nest-event report fail, so the handler throws at its very end
    await getPool().query(`
      CREATE OR REPLACE FUNCTION test_fail_nest_report() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'report store broken'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_fail_nest_report BEFORE INSERT ON reports FOR EACH ROW WHEN (NEW.type = 'nest_event') EXECUTE FUNCTION test_fail_nest_report();`);
    try {
      await getPool().query('UPDATE events SET due_at = $2 WHERE id = $1', [ev.id, clock.t]);
      await getPool().query('UPDATE players SET last_active = $2 WHERE id = (SELECT player_id FROM colonies WHERE id = $1)', [ca.id, clock.t]);
      await processDueEvents();
      const failed = (await getPool().query('SELECT done, payload FROM events WHERE id = $1', [ev.id])).rows[0];
      expect(failed.done).toBe(true);
      expect(failed.payload.error).toContain('report store broken');
      const next = await pending();
      expect(next).toHaveLength(1);
      expect(Number(next[0].due_at)).toBeGreaterThan(clock.t);
    } finally {
      await getPool().query('DROP TRIGGER test_fail_nest_report ON reports; DROP FUNCTION test_fail_nest_report();');
    }
  });

  it('a chain stops quietly when its colony no longer qualifies', async () => {
    // a nest_event aimed at a colony that does not exist: handled without error, and not rearmed
    const r = await getPool().query("INSERT INTO events (world_id, type, due_at, payload) VALUES ($1, 'nest_event', $2, '{\"colonyId\": 999999}') RETURNING id", [worldId, clock.t]);
    await processDueEvents();
    const row = (await getPool().query('SELECT done, payload FROM events WHERE id = $1', [r.rows[0].id])).rows[0];
    expect(row.done).toBe(true);
    expect(row.payload.error).toBeUndefined();
    const again = await getPool().query("SELECT 1 FROM events WHERE NOT done AND type = 'nest_event' AND (payload->>'colonyId')::int = 999999");
    expect(again.rowCount).toBe(0);
  });
});
