// Build 1: playtest fixes. Scouting the wilds, a guaranteed first forage, in-game feedback.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { QUESTS } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client, admin: Client;
let c: any;
let wilds: any;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'loner');
  admin = await newPlayer(app, 'marz');
  c = (await p.get('/api/state')).colony;
  wilds = { ...c.coords, spot: 13 };
});
afterAll(async () => teardownTest(app));

describe('scouting the wilds', () => {
  beforeAll(async () => {
    await setColony(c.id, { nectar: 1e5, last_updated: clock.t, units: { scout: 3, worker: 50 } });
  });

  it('only Scouts can go', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: wilds, units: { worker: 1 } });
    expect(r.error.code).toBe('scouts_only');
  });

  it('a Scout surveys the wilds, comes home, and counts for the founding task', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: wilds, units: { scout: 1 } });
    expect(r.ok).toBe(true);
    await clock.advance(6 * 3600_000);

    const reports = (await p.get('/api/reports')).reports.filter((x: any) => x.type === 'scout');
    expect(reports).toHaveLength(1);
    const d = reports[0].data;
    expect(d.wilds).toBe(true);
    expect(reports[0].title).toContain(`(${c.coords.region}:${c.coords.patch}:13)`);
    expect(d.odds).toEqual({ food: 50, empty: 30, losses: 15, early: 5 });
    expect(typeof d.text).toBe('string');
    expect(d.colonies).toBeGreaterThanOrEqual(0);

    const s = await p.get('/api/state');
    expect(s.colony.units.scout).toBe(3); // the scout came home
    expect(s.missions).toHaveLength(0);

    // the scout task is now done
    const scoutQuest = QUESTS.find((q) => q.id === 'scout')!;
    expect(scoutQuest.done({ chambers: {}, units: {}, missionsSent: ['scout'] })).toBe(true);
  });

  it('scouting an empty colony spot is still refused', async () => {
    const empty = { ...c.coords, spot: c.coords.spot === 1 ? 2 : 1 };
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'scout', target: empty, units: { scout: 1 } });
    expect(r.error.code).toBe('bad_target');
  });
});

describe('first forage', () => {
  it('a recalled party does not use up the guarantee', async () => {
    expect((await p.get('/api/state')).player.firstForage).toBe(true);
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: wilds, units: { worker: 3 } });
    await p.post(`/api/missions/${r.mission.id}/recall`);
    await clock.advance(6 * 3600_000);
    expect((await p.get('/api/state')).player.firstForage).toBe(true);
  });

  it('the first party to arrive always finds food and loses nobody', async () => {
    const r = await p.post('/api/missions', { colonyId: c.id, type: 'forage', target: wilds, units: { worker: 3 } });
    expect(r.ok).toBe(true);
    await clock.advance(6 * 3600_000);
    const rep = (await p.get('/api/reports')).reports.find((x: any) => x.type === 'forage');
    expect(rep.data.outcome).toBe('food_cache');
    expect(Object.keys(rep.data.lost)).toHaveLength(0);
    const found = rep.data.found.foliage + rep.data.found.protein + rep.data.found.nectar;
    expect(found).toBeGreaterThan(0.7 * 3000 - 5);
    expect((await p.get('/api/state')).player.firstForage).toBe(false);
  });
});

describe('feedback', () => {
  it('players can send feedback with context', async () => {
    const r = await p.post('/api/feedback', {
      kind: 'bug', message: 'The forage button is hard to find.', context: { screen: 'missions', colonyId: c.id, viewport: '390x844', userAgent: 'test', junk: 'x'.repeat(5000) },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects empty and overlong messages', async () => {
    expect((await p.post('/api/feedback', { message: ' ' })).error.code).toBe('too_short');
    expect((await p.post('/api/feedback', { message: 'x'.repeat(2001) })).error.code).toBe('too_long');
  });

  it('limits how much one player can send per hour', async () => {
    for (let i = 0; i < 9; i++) expect((await p.post('/api/feedback', { message: `idea number ${i}` })).ok).toBe(true);
    const r = await p.post('/api/feedback', { message: 'one too many' });
    expect(r.status).toBe(429);
    await clock.advance(3600_000 + 1);
    expect((await p.post('/api/feedback', { message: 'back again' })).ok).toBe(true);
  });

  it('only admins can read it', async () => {
    expect((await p.get('/api/admin/feedback')).status).toBe(403);
    const me = (await admin.get('/api/state')).player;
    expect(me.isAdmin).toBe(false);
    await setPlayer(me.id, { is_admin: true });
    expect((await admin.get('/api/state')).player.isAdmin).toBe(true);

    const list = await admin.get('/api/admin/feedback');
    expect(list.open).toBe(11);
    const bug = list.items.find((x: any) => x.kind === 'bug');
    expect(bug.from).toBe('loner');
    expect(bug.context.screen).toBe('missions');
    expect(bug.context.coords).toBe(`${c.coords.region}:${c.coords.patch}:${c.coords.spot}`);
    expect(bug.context.junk).toBeUndefined();
    expect(bug.context.userAgent).toBe('test');

    expect((await p.post(`/api/admin/feedback/${bug.id}`, { handled: true })).status).toBe(403);
    expect((await admin.post(`/api/admin/feedback/${bug.id}`, { handled: true })).ok).toBe(true);
    const open = await admin.get('/api/admin/feedback');
    expect(open.open).toBe(10);
    expect(open.items.some((x: any) => x.id === bug.id)).toBe(false);
    const all = await admin.get('/api/admin/feedback?show=all');
    expect(all.items.find((x: any) => x.id === bug.id).handled).toBe(true);
  });
});
