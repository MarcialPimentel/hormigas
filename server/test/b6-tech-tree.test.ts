// Build 6: the expanded tech tree (docs/21-tech-tree.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { productionPerHour, storageCapacity } from '@hormigas/shared';
import { setupTest, teardownTest, newPlayer, setColony, setPlayer, calmWildNests, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let p: Client;
let colonyId: number;
let playerId: number;
const H = 3600_000;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  p = await newPlayer(app, 'treeclimber');
  const s = await p.get('/api/state');
  colonyId = s.colony.id;
  playerId = s.player.id;
  await calmWildNests();
});
afterAll(async () => teardownTest(app));

const rich = () => setColony(colonyId, { foliage: 1e6, protein: 1e6, nectar: 1e6, last_updated: clock.t });

describe('research prerequisites', () => {
  it('locks research behind other research, and says what is missing', async () => {
    await setColony(colonyId, { chambers: { queen_chamber: 5, pheromone_chamber: 5 } });
    await setPlayer(playerId, { research: { mandibles: 3 } });
    await rich();
    const no = await p.post('/api/research', { colonyId, research: 'formic_acid' });
    expect(no.error.code).toBe('locked');
    expect(no.error.message).toContain('Chitin 2');
    await setPlayer(playerId, { research: { mandibles: 3, chitin: 2 } });
    const yes = await p.post('/api/research', { colonyId, research: 'formic_acid' });
    expect(yes.ok).toBe(true);
    await p.post('/api/research/cancel');
  });

  it('stops at the highest level', async () => {
    await setPlayer(playerId, { research: { brood_science: 2 } });
    await rich();
    const r = await p.post('/api/research', { colonyId, research: 'brood_science' });
    expect(r.error.code).toBe('max');
  });

  it('Symbiosis (in the game since Build 11) waits for its prerequisites', async () => {
    const r = await p.post('/api/research', { colonyId, research: 'symbiosis' });
    expect(r.error.code).toBe('locked');
  });
});

describe('production research', () => {
  it('the state shows production and storage with research, and new rates count only from completion', async () => {
    const chambers = { queen_chamber: 5, pheromone_chamber: 5, leaf_garden: 8, nursery: 12, granary: 12 };
    await setColony(colonyId, { chambers, foliage: 1e5, protein: 1e6, nectar: 1e6, last_updated: clock.t, unit_queue: [] });
    await setPlayer(playerId, { research: { aphid_husbandry: 2 }, research_job: null });
    const s = await p.get('/api/state');
    expect(s.colony.research).toEqual({ aphid_husbandry: 2 });

    const start = await p.post('/api/research', { colonyId, research: 'fungus_farming' });
    expect(start.error).toBeUndefined();
    const job = (await p.get('/api/state')).player.researchJob;
    await setColony(colonyId, { foliage: 0, last_updated: clock.t });
    const t0 = clock.t;

    // Run to the end of the research, then one more hour.
    await clock.advance(job.endAt - t0 + 1);
    await clock.advance(H);
    const after = await p.get('/api/state');
    expect(after.player.research.fungus_farming).toBe(1);

    const speed = after.world.speed;
    const oldRate = productionPerHour(chambers, after.colony.terrain, speed, { aphid_husbandry: 2 }).foliage;
    const newRate = productionPerHour(chambers, after.colony.terrain, speed, { aphid_husbandry: 2, fungus_farming: 1 }).foliage;
    expect(newRate).toBeGreaterThan(oldRate);
    const hoursOld = (job.endAt - t0) / H;
    const hoursNew = (clock.t - job.endAt) / H;
    const expected = oldRate * hoursOld + newRate * hoursNew;
    expect(after.colony.resources.foliage).toBeCloseTo(expected, -1);
    expect(storageCapacity(chambers, after.colony.research).foliage).toBeGreaterThan(expected);
  });
});
