// Build 12, reasons to come back (docs/26-come-back.md): colony needs, the Field Journal, Yesterday in the colony,
// and the counters behind them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { NEEDS_RULES, needDayStart } from '@hormigas/shared';
import { getPool } from '../src/db';
import { setupTest, teardownTest, newPlayer, setColony, calmWildNests, calmNestEvents, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let c: any;
let playerId: number;

const GROWN = { queen_chamber: 8, leaf_garden: 12, hunting_grounds: 10, nursery: 8, granary: 6, larder: 6, brood_hall: 4, pheromone_chamber: 3, aphid_pasture: 3 };
const state = () => p.get('/api/state');
const stat = async (key: string) => Number((await getPool().query('SELECT value FROM player_stats WHERE player_id = $1 AND key = $2', [playerId, key])).rows[0]?.value ?? 0);
const setStat = (key: string, value: number) =>
  getPool().query('INSERT INTO player_stats (player_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (player_id, key) DO UPDATE SET value = $3', [playerId, key, value]);
/** Jump to just after the start of the next day (world speed from the test world). */
async function nextDay() {
  const s = await state();
  await clock.advance(s.needs.endsAt - clock.t + 1000);
  await calmWildNests();
  await calmNestEvents();
}

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'attentive');
  const s = await state();
  c = s.colony;
  playerId = s.player.id;
  await calmWildNests();
  await calmNestEvents();
});
afterAll(async () => teardownTest(app));

describe('colony needs', () => {
  it('a brand-new colony only gets what it can do', async () => {
    const s = await state();
    expect(s.needs.needs.map((n: any) => n.id)).toEqual(['digs']);
    expect(s.needs.yesterday).toBeNull();
    expect(s.needs.endsAt).toBeGreaterThan(clock.t);
  });

  it('a grown colony gets a full day of needs, all different', async () => {
    await setColony(c.id, { chambers: GROWN, units: { worker: 40, scout: 2, minor_soldier: 30 }, foliage: 0, protein: 0, nectar: 0, last_updated: clock.t });
    await nextDay();
    const s = await state();
    const today = s.needs.needs.filter((n: any) => !n.carried);
    expect(today).toHaveLength(NEEDS_RULES.perDay);
    expect(new Set(today.map((n: any) => n.id)).size).toBe(NEEDS_RULES.perDay);
    // yesterday's unfinished dig need is still there, counted as carried over
    const carried = s.needs.needs.filter((n: any) => n.carried);
    expect(carried.map((n: any) => n.id)).toEqual(['digs']);
    expect(today.map((n: any) => n.id)).not.toContain('digs');
  });

  it('finishing digs makes the need ready; the reward is paid once, into the colony picked', async () => {
    const s0 = await state();
    const need = s0.needs.needs.find((n: any) => n.id === 'digs');
    expect(need.ready).toBe(false);
    const early = await p.post('/api/needs/claim', { day: need.day, slot: need.slot, colonyId: c.id });
    expect(early.error.code).toBe('not_done');

    await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t });
    for (let i = 0; i < need.target; i++) {
      const b = await p.post(`/api/colonies/${c.id}/build`, { chamber: 'leaf_garden' });
      expect(b.ok).toBe(true);
      await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    }
    expect(await stat('digs')).toBeGreaterThanOrEqual(need.target);
    const s1 = await state();
    const ready = s1.needs.needs.find((n: any) => n.day === need.day && n.slot === need.slot);
    expect(ready.ready).toBe(true);

    await setColony(c.id, { foliage: 0, protein: 0, nectar: 0, last_updated: clock.t });
    const r = await p.post('/api/needs/claim', { day: need.day, slot: need.slot, colonyId: c.id });
    expect(r.ok).toBe(true);
    expect(r.reward.foliage).toBeGreaterThanOrEqual(NEEDS_RULES.minReward.foliage);
    const after = (await state()).colony.resources;
    expect(after.foliage).toBeGreaterThanOrEqual(r.reward.foliage);
    expect(await stat('needs_done')).toBe(1);
    const again = await p.post('/api/needs/claim', { day: need.day, slot: need.slot, colonyId: c.id });
    expect(again.status).toBe(400);
  });

  it('one swap a day', async () => {
    const s = await state();
    const open = s.needs.needs.find((n: any) => !n.carried && !n.claimed);
    expect(s.needs.canReroll).toBe(true);
    const r = await p.post('/api/needs/reroll', { slot: open.slot });
    expect(r.ok).toBe(true);
    expect(r.need).not.toBe(open.id);
    const s2 = await state();
    expect(s2.needs.canReroll).toBe(false);
    const ids = s2.needs.needs.map((n: any) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const twice = await p.post('/api/needs/reroll', { slot: open.slot });
    expect(twice.error.code).toBe('rerolled');
  });

  it('unfinished needs keep for two days, then fade, with nothing lost', async () => {
    const before = (await state()).needs.needs.filter((n: any) => !n.claimed && !n.carried);
    await nextDay();
    const next = (await state()).needs.needs;
    for (const n of before) expect(next.find((x: any) => x.day === n.day && x.slot === n.slot)?.carried).toBe(true);
    await nextDay();
    const later = (await state()).needs.needs;
    for (const n of before) expect(later.find((x: any) => x.day === n.day && x.slot === n.slot)).toBeUndefined();
    // a faded need can't be claimed, and there is no penalty: today's needs are as usual
    const gone = await p.post('/api/needs/claim', { day: before[0].day, slot: before[0].slot, colonyId: c.id });
    expect(gone.error.code).toBe('expired');
    expect(later.filter((n: any) => !n.carried)).toHaveLength(NEEDS_RULES.perDay);
  });
});

describe('Yesterday in the colony', () => {
  it('sums up what happened since the day before', async () => {
    await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t });
    const b = await p.post(`/api/colonies/${c.id}/build`, { chamber: 'hunting_grounds' });
    await clock.advance(b.colony.buildJob.endAt - clock.t + 1);
    await nextDay();
    const y = (await state()).needs.yesterday;
    expect(y.days).toBe(1);
    expect(y.rows.map((r: any) => r.text)).toContain('1 dig finished');
  });
});

describe('counters', () => {
  it('a forage party coming home counts the trip and the food', async () => {
    await setColony(c.id, { units: { worker: 4 }, foliage: 0, protein: 0, nectar: 1000, last_updated: clock.t });
    const tripsBefore = await stat('forage_home');
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: { ...c.coords, spot: 13 }, units: { worker: 4 } });
    expect(r.ok).toBe(true);
    const m = (await state()).missions.find((x: any) => x.type === 'forage');
    await clock.advance(m.arriveAt - clock.t + 1);
    const back = (await state()).missions.find((x: any) => x.type === 'forage');
    const food = back.cargo.foliage + back.cargo.protein + back.cargo.nectar;
    expect(food).toBeGreaterThan(0); // the first trip always finds food
    const foodBefore = await stat('food_home');
    await clock.advance(back.returnAt - clock.t + 1);
    expect(await stat('forage_home')).toBe(tripsBefore + 1);
    expect((await stat('food_home')) - foodBefore).toBe(Math.floor(food));
    expect(await stat('forage:food_cache')).toBe(1);
  });

  it('ants raised count as they hatch', async () => {
    await setColony(c.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t });
    const before = (await getPool().query('SELECT raised FROM colonies WHERE id = $1', [c.id])).rows[0].raised.worker ?? 0;
    const q = await p.post(`/api/colonies/${c.id}/brood`, { kind: 'caste', id: 'worker', count: 3 });
    expect(q.ok).toBe(true);
    await clock.advance(24 * 3600_000);
    await p.post(`/api/colonies/${c.id}/build/cancel`); // any write saves the colony; the stats read it live anyway
    const j = await p.get('/api/journal');
    const nurse = j.entries.find((e: any) => e.id === 'nurse');
    expect(nurse.value).toBeGreaterThanOrEqual(before + 3);
  });
});

describe('the Field Journal', () => {
  it('fills in pages from the counters and marks them new until looked at', async () => {
    await setStat('beat:pavement', 1);
    await setStat('scouted', 6);
    const j = await p.get('/api/journal');
    const pavement = j.entries.find((e: any) => e.id === 'pavement');
    expect(pavement.tier).toBe(1);
    expect(pavement.fresh).toBe(true);
    const path = j.entries.find((e: any) => e.id === 'pathfinder');
    expect(path.tier).toBe(1);
    expect(path.next).toBe(25);
    expect((await state()).journal.fresh).toBeGreaterThan(0);
    await p.post('/api/journal/seen');
    expect((await state()).journal.fresh).toBe(0);
  });

  it('a page once written stays written', async () => {
    await setStat('scouted', 0);
    const j = await p.get('/api/journal');
    expect(j.entries.find((e: any) => e.id === 'pathfinder').tier).toBe(1);
  });

  it('titles can only be worn once earned, and show in the rankings', async () => {
    const no = await p.post('/api/journal/title', { entryId: 'spider' });
    expect(no.error.code).toBe('not_earned');
    const yes = await p.post('/api/journal/title', { entryId: 'pavement' });
    expect(yes.title).toBe('Border Warrior');
    expect((await state()).journal.title).toBe('Border Warrior');
    const ranks = await p.get('/api/rankings');
    expect(ranks.rows.find((r: any) => r.me).title).toBe('Border Warrior');
    const off = await p.post('/api/journal/title', { entryId: null });
    expect(off.title).toBeNull();
  });
});

describe('the day', () => {
  it('starts at the configured hour', () => {
    const start = needDayStart(20_000);
    expect(new Date(start).getUTCHours()).toBe(NEEDS_RULES.dayStartsUtcHour);
  });
});
