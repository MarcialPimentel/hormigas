// Build 3: small random events inside the nest (docs/04-colony.md, "Nest events").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { NEST_EVENTS, NEST_EVENTS_DATA, createRng, productionPerHour, rollNestEvent, storageCapacity } from '@hormigas/shared';
import { getPool, tx } from '../src/db';
import { ensureNestEvents } from '../src/game/nestEvents';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let me: any;
let speed: number;
let worldId: number;
const H = 3600_000;
const [, maxHours] = NEST_EVENTS_DATA.everyHours;

const pending = async (colonyId: number) =>
  (await getPool().query("SELECT * FROM events WHERE NOT done AND type = 'nest_event' AND (payload->>'colonyId')::int = $1", [colonyId])).rows;
const eventReports = async () => (await p.get('/api/reports?limit=100')).reports.filter((r: any) => r.type === 'nest_event');

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'gardener');
  const s = await p.get('/api/state');
  c = s.colony;
  me = s.player;
  speed = s.world.speed;
  worldId = s.world.id;
});
afterAll(async () => teardownTest(app));

describe('rolling', () => {
  const perHour = { foliage: 100, protein: 50, nectar: 20 };
  const have = { foliage: 0, protein: 0, nectar: 0 };
  const cap = { foliage: 10_000, protein: 10_000, nectar: 10_000 };

  it('gifts about an hour of production, never less than the minimum', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const r = rollNestEvent(rng, perHour, have, cap);
      expect(NEST_EVENTS[r.event]).toBeTruthy();
      if (r.resource) expect(r.amount).toBe(Math.floor(Math.max(NEST_EVENTS_DATA.minGift, perHour[r.resource] * NEST_EVENTS_DATA.giftHours)));
      else expect(r.amount).toBe(0);
    }
  });

  it('never gifts into full storage, and caps to what fits', () => {
    const rng = createRng(2);
    const full = { foliage: 10_000, protein: 10_000, nectar: 9_990 };
    for (let i = 0; i < 200; i++) {
      const r = rollNestEvent(rng, perHour, full, cap);
      expect(r.resource === null || r.resource === 'nectar').toBe(true);
      if (r.resource === 'nectar') expect(r.amount).toBe(10);
    }
  });

  it('is only ever good or harmless', () => {
    for (const def of Object.values(NEST_EVENTS)) expect(def.weight).toBeGreaterThan(0);
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) expect(rollNestEvent(rng, perHour, have, cap).amount).toBeGreaterThanOrEqual(0);
  });
});

describe('in the world', () => {
  it('signing up schedules one nest event', async () => {
    const rows = await pending(c.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].due_at)).toBeLessThanOrEqual(clock.t + (maxHours * H) / speed);
  });

  it('startup gives colonies without one a nest event, and is idempotent', async () => {
    await getPool().query("UPDATE events SET done = true WHERE type = 'nest_event'");
    expect(await tx((q) => ensureNestEvents(q, worldId, clock.t))).toBeGreaterThanOrEqual(1);
    expect(await pending(c.id)).toHaveLength(1);
    expect(await tx((q) => ensureNestEvents(q, worldId, clock.t))).toBe(0);
    // wild nests never get nest events
    const wild = await getPool().query("SELECT count(*)::int AS n FROM events e JOIN colonies c ON c.id = (e.payload->>'colonyId')::int WHERE e.type = 'nest_event' AND c.npc IS NOT NULL");
    expect(wild.rows[0].n).toBe(0);
  });

  it('fires, files a report, adds the gift and schedules the next one', async () => {
    await setColony(c.id, { foliage: 0, protein: 0, nectar: 0, last_updated: clock.t, chambers: { queen_chamber: 1 } });
    const before = (await p.get('/api/state')).colony.resources;
    const t0 = clock.t;
    const due = Number((await pending(c.id))[0].due_at);
    // keep the player active while time passes
    await setPlayer(me.id, { last_active: due });
    await clock.advance(due - clock.t);
    const reps = await eventReports();
    expect(reps).toHaveLength(1);
    const rep = reps[0];
    expect(NEST_EVENTS[rep.data.event].title).toBe(rep.title);
    expect(rep.data.text).toBeTruthy();
    const after = (await p.get('/api/state')).colony.resources;
    const rate = productionPerHour({ queen_chamber: 1 }, c.terrain, speed);
    const elapsedH = (clock.t - t0) / H;
    for (const r of ['foliage', 'protein', 'nectar'] as const) {
      const produced = Math.min(storageCapacity({ queen_chamber: 1 })[r], before[r] + rate[r] * elapsedH);
      expect(after[r]).toBeGreaterThanOrEqual(Math.floor(produced + rep.data.found[r]) - 1);
    }
    const next = await pending(c.id);
    expect(next).toHaveLength(1);
    expect(Number(next[0].due_at)).toBeGreaterThan(clock.t);
  });

  it('inactive players get no events, but the timer keeps going', async () => {
    await setPlayer(me.id, { last_active: clock.t - 30 * 24 * H });
    const n = (await eventReports()).length;
    const due = Number((await pending(c.id))[0].due_at);
    await clock.advance(due - clock.t);
    expect((await eventReports()).length).toBe(n);
    expect(await pending(c.id)).toHaveLength(1);
  });
});
