// Build 10, "Castes with a purpose": new castes, the Narrow Tunnel and the fall-back order through the API.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, knowAll, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let a: Client, b: Client;
let ca: any, cb: any;
let aId: number, bId: number;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  a = await newPlayer(app, 'sprayer');
  b = await newPlayer(app, 'holder');
  const sa = await a.get('/api/state');
  const sb = await b.get('/api/state');
  ca = sa.colony;
  cb = sb.colony;
  aId = sa.player.id;
  bId = sb.player.id;
  await calmWildNests();
  await knowAll();
  await setPlayer(aId, { protected_until: 0 });
  await setPlayer(bId, { protected_until: 0 });
});
afterAll(async () => teardownTest(app));

describe('raising the new castes and the Narrow Tunnel', () => {
  it('Acid Sprayers need Brood Hall 2 and Brood Science 1; Trap-jaw Ants Brood Hall 3 and Mandibles 2', async () => {
    await setColony(ca.id, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t, chambers: { queen_chamber: 4, brood_hall: 2 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'acid_sprayer', count: 1 })).error.code).toBeTruthy();
    await setPlayer(aId, { research: { brood_science: 1 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'acid_sprayer', count: 2 })).ok).toBe(true);
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'trap_jaw', count: 1 })).error.code).toBeTruthy();
    await setColony(ca.id, { chambers: { queen_chamber: 4, brood_hall: 3 } });
    await setPlayer(aId, { research: { brood_science: 1, mandibles: 2 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'caste', id: 'trap_jaw', count: 1 })).ok).toBe(true);
  });

  it('only one Narrow Tunnel per colony, after Tunnel Engineering 1', async () => {
    await setColony(ca.id, { unit_queue: [], defenses: {} });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'defense', id: 'narrow_tunnel', count: 1 })).error.code).toBeTruthy();
    await setPlayer(aId, { research: { brood_science: 1, mandibles: 2, tunnel_engineering: 1 } });
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'defense', id: 'narrow_tunnel', count: 2 })).error.code).toBeTruthy();
    expect((await a.post(`/api/colonies/${ca.id}/brood`, { kind: 'defense', id: 'narrow_tunnel', count: 1 })).ok).toBe(true);
  });
});

describe('fall-back order on raids', () => {
  it('refuses orders that are not on the list', async () => {
    await setColony(ca.id, { nectar: 1e6, last_updated: clock.t, unit_queue: [], units: { minor_soldier: 60 } });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { minor_soldier: 60 }, retreatPct: 30 });
    expect(r.error.code).toBe('bad_retreat');
  });

  it('raiders who meet their counter fall back, keep the rest of the army, and both reports say so', async () => {
    await setColony(cb.id, { foliage: 20000, protein: 20000, nectar: 2000, last_updated: clock.t, units: { acid_sprayer: 40 }, defenses: {} });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'raid', target: cb.coords, units: { minor_soldier: 60 }, retreatPct: 25 });
    expect(r.ok).toBe(true);
    expect(r.mission.retreatPct).toBe(25);
    await clock.advance(r.mission.arriveAt - clock.t + 10);
    const rep = (await a.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(rep.data.retreatPct).toBe(25);
    expect(rep.data.retreatedAfterRound).toBeGreaterThanOrEqual(1);
    expect(rep.data.winner).toBe('defender');
    expect(rep.title).toContain('fell back');
    expect(rep.data.attacker.lost.minor_soldier).toBeLessThan(60);
    const dRep = (await b.get('/api/reports')).reports.find((x: any) => x.type === 'battle');
    expect(dRep.title).toContain('the raiders fell back');
  });

  it('other missions ignore the order', async () => {
    await setColony(ca.id, { nectar: 1e6, last_updated: clock.t, units: { worker: 2 } });
    const r = await a.post('/api/missions', { colonyId: ca.id, type: 'transport', target: cb.coords, units: { worker: 1 }, retreatPct: 50 });
    expect(r.ok).toBe(true);
    expect(r.mission.retreatPct).toBe(0);
  });
});
