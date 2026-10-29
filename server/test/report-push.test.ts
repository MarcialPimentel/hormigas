// Open tabs hear about a report only once it is saved: a report from an event that failed and was rolled
// back must never pop up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { onEvent, processDueEvents, schedule } from '../src/events';
import { addReport, onReport, setReportListener } from '../src/game/reports';
import { setupTest, teardownTest, newPlayer, calmWildNests } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let worldId: number;
let playerId: number;
const pushed: string[] = [];
let previous: typeof onReport;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  const p = await newPlayer(app, 'listener');
  playerId = (await p.get('/api/state')).player.id;
  await calmWildNests();
  worldId = (await getPool().query('SELECT id FROM worlds LIMIT 1')).rows[0].id;
  previous = onReport;
  setReportListener((_pid, r) => pushed.push(r.title));
});
afterAll(async () => {
  setReportListener(previous);
  await teardownTest(app);
});

describe('report push', () => {
  it('pushes a report from an event that succeeded', async () => {
    onEvent('test_report_ok', async (q, ev) => {
      await addReport(q, ev.world_id, playerId, 'milestone', 'saved report', {}, ev.due_at);
    });
    await schedule(getPool(), worldId, 'test_report_ok', clock.t, {});
    await processDueEvents();
    expect(pushed).toContain('saved report');
  });

  it('does not push a report from an event that failed and was rolled back', async () => {
    onEvent('test_report_then_fail', async (q, ev) => {
      await addReport(q, ev.world_id, playerId, 'milestone', 'phantom report', {}, ev.due_at);
      throw new Error('boom');
    });
    await schedule(getPool(), worldId, 'test_report_then_fail', clock.t, {});
    await processDueEvents();
    expect(pushed).not.toContain('phantom report');
    const saved = await getPool().query("SELECT 1 FROM reports WHERE title = 'phantom report'");
    expect(saved.rowCount).toBe(0);
  });
});
