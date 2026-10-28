// The event loop must never lose an event to a temporary database error (deadlock, lock timeout),
// must keep events in due_at order when it retries, and must leave event types it doesn't know alone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { MAX_ATTEMPTS, onEvent, processDueEvents, schedule, unknownPendingEventTypes } from '../src/events';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let worldId: number;

const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });

async function eventRow(id: number) {
  return (await getPool().query('SELECT done, payload FROM events WHERE id = $1', [id])).rows[0];
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  await newPlayer(app, 'setup'); // creates the world
  await calmWildNests();
  worldId = (await getPool().query('SELECT id FROM worlds LIMIT 1')).rows[0].id;
});
afterAll(async () => teardownTest(app));

describe('event loop retries', () => {
  it('retries an event that hit a deadlock instead of dropping it', async () => {
    let calls = 0;
    onEvent('test_flaky_once', async () => {
      calls++;
      if (calls === 1) throw deadlock();
    });
    const id = await schedule(getPool(), worldId, 'test_flaky_once', clock.t, {});

    await processDueEvents();
    expect(calls).toBe(1);
    const after1 = await eventRow(id);
    expect(after1.done).toBe(false);
    expect(after1.payload.attempts).toBe(1);

    await processDueEvents();
    expect(calls).toBe(2);
    const after2 = await eventRow(id);
    expect(after2.done).toBe(true);
    expect(after2.payload.error).toBeUndefined();
  });

  it('keeps due_at order while retrying', async () => {
    const order: string[] = [];
    let firstCalls = 0;
    onEvent('test_order_first', async () => {
      firstCalls++;
      if (firstCalls === 1) throw deadlock();
      order.push('first');
    });
    onEvent('test_order_second', async () => {
      order.push('second');
    });
    await schedule(getPool(), worldId, 'test_order_first', clock.t - 2000, {});
    await schedule(getPool(), worldId, 'test_order_second', clock.t - 1000, {});

    await processDueEvents();
    expect(order).toEqual([]); // the second event waits behind the retried first one
    await processDueEvents();
    expect(order).toEqual(['first', 'second']);
  });

  it(`gives up after ${MAX_ATTEMPTS} temporary errors and moves on`, async () => {
    onEvent('test_always_deadlocks', async () => {
      throw deadlock();
    });
    const id = await schedule(getPool(), worldId, 'test_always_deadlocks', clock.t, {});
    for (let i = 0; i < MAX_ATTEMPTS; i++) await processDueEvents();
    const row = await eventRow(id);
    expect(row.done).toBe(true);
    expect(row.payload.error).toContain('deadlock');
  });

  it('marks a broken event done straight away and still runs the rest of the queue', async () => {
    let ranAfter = false;
    onEvent('test_broken', async () => {
      throw new Error('bad payload');
    });
    onEvent('test_after_broken', async () => {
      ranAfter = true;
    });
    const bad = await schedule(getPool(), worldId, 'test_broken', clock.t - 1000, {});
    await schedule(getPool(), worldId, 'test_after_broken', clock.t, {});
    await processDueEvents();
    expect((await eventRow(bad)).done).toBe(true);
    expect((await eventRow(bad)).payload.error).toContain('bad payload');
    expect(ranAfter).toBe(true);
  });

  it('leaves event types it has no handler for pending, without blocking the queue', async () => {
    let ran = false;
    onEvent('test_known', async () => {
      ran = true;
    });
    const mystery = await schedule(getPool(), worldId, 'test_from_a_newer_build', clock.t - 1000, {});
    await schedule(getPool(), worldId, 'test_known', clock.t, {});
    await processDueEvents();
    expect(ran).toBe(true);
    expect((await eventRow(mystery)).done).toBe(false);
    expect(await unknownPendingEventTypes(getPool())).toContain('test_from_a_newer_build');
    await getPool().query('UPDATE events SET done = true WHERE id = $1', [mystery]);
  });
});

describe('lock order', () => {
  /** Wait until some query is blocked waiting for a row lock. */
  async function waitForLockWait() {
    for (let i = 0; i < 250; i++) {
      const r = await getPool().query('SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted');
      if (r.rows[0].n > 0) return;
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('nothing ever waited for a lock');
  }

  it('a mission coming home while its player is busy does not deadlock or lose the ants', async () => {
    const a = await newPlayer(app, 'homing');
    const b = await newPlayer(app, 'host');
    const ca = (await a.get('/api/state')).colony;
    const cb = (await b.get('/api/state')).colony;
    await setColony(ca.id, { foliage: 50000, protein: 50000, nectar: 50000, last_updated: clock.t, units: { worker: 20 } });
    await calmWildNests();
    const playerId = (await getPool().query('SELECT player_id FROM colonies WHERE id = $1', [ca.id])).rows[0].player_id;

    const sent = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 10 }, cargo: {}, speedPct: 100 });
    expect(sent.ok).toBe(true);
    const oneWay = sent.mission.arriveAt - sent.mission.departAt;
    await clock.advance(oneWay + 10); // arrives, starts home
    clock.t += oneWay + 10; // the return is now due, but nothing has resolved it yet

    // A player action holds the player row, as every action does (player first, then colony)...
    const action = await getPool().connect();
    try {
      await action.query('BEGIN');
      await action.query('SELECT id FROM players WHERE id = $1 FOR UPDATE', [playerId]);
      // ...while the event loop brings the mission home...
      const run = processDueEvents();
      await waitForLockWait();
      // ...and then the action reaches for the colony. Before the fix, the handler held the colony
      // and waited for the player, so this deadlocked and the return event was dropped.
      await action.query('SELECT id FROM colonies WHERE id = $1 FOR UPDATE', [ca.id]);
      await action.query('COMMIT');
      await run;
    } finally {
      action.release();
    }

    const s = await a.get('/api/state');
    expect(s.colony.units.worker).toBe(20);
    expect(s.missions).toHaveLength(0);
    const failed = await getPool().query("SELECT count(*)::int AS n FROM events WHERE type LIKE 'mission_%' AND (payload ? 'error' OR payload ? 'attempts')");
    expect(failed.rows[0].n).toBe(0);
  });
});
