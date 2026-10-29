// Rules written once in shared/ for both the server and the client (2026-10-29 architecture review, fix PR 3).
import { describe, expect, it } from 'vitest';
import {
  CHAMBER_IDS,
  MISSION_TYPES,
  PLAYER_MISSIONS,
  broodBlocker,
  chamberBlocker,
  chamberOutputPerHour,
  chamberStorage,
  foundColonyBlocker,
  isValidSpeedPct,
  lvl,
  missionSlotUsage,
  missionTimes,
  missionUnitProblem,
  productionPerHour,
  recallReturnAt,
  researchBlocker,
  returnLegMs,
  storageCapacity,
  workforce,
  CASTES,
  DEFENSES,
  type ChamberLevels,
} from '../src';

describe('per-chamber numbers match the colony totals', () => {
  const chambers: ChamberLevels = { queen_chamber: 5, leaf_garden: 8, hunting_grounds: 6, aphid_pasture: 4, nursery: 2, granary: 3 };
  const research = { fungus_farming: 3, group_hunting: 2, aphid_husbandry: 4, repletes: 2 };

  it('chamber outputs plus base income add up to productionPerHour, with research and workforce', () => {
    const { ratio } = workforce(chambers);
    expect(ratio).toBeLessThan(1); // understaffed, so the ratio matters
    const total = productionPerHour(chambers, 'grassland', 3, research);
    const sum = { foliage: 0, protein: 0, nectar: 0 };
    for (const id of CHAMBER_IDS) {
      const made = chamberOutputPerHour(id, lvl(chambers, id), 'grassland', research, 3, ratio);
      if (made) sum[made.resource] += made.amount;
    }
    const base = productionPerHour({}, 'grassland', 3, research);
    expect(total.foliage).toBeCloseTo(sum.foliage + base.foliage, 6);
    expect(total.protein).toBeCloseTo(sum.protein + base.protein, 6);
    expect(total.nectar).toBeCloseTo(sum.nectar + base.nectar, 6);
  });

  it('research raises a chamber’s output', () => {
    const plain = chamberOutputPerHour('leaf_garden', 5, 'grassland')!.amount;
    const farmed = chamberOutputPerHour('leaf_garden', 5, 'grassland', { fungus_farming: 2 })!.amount;
    expect(farmed).toBeCloseTo(plain * 1.1, 6);
    expect(chamberOutputPerHour('granary', 5, 'grassland')).toBeNull();
  });

  it('chamberStorage includes Repletes, and matches storageCapacity', () => {
    expect(storageCapacity(chambers, research).foliage).toBeCloseTo(chamberStorage(3, research), 6);
    expect(chamberStorage(3, { repletes: 2 })).toBeCloseTo(chamberStorage(3) * 1.2, 6);
  });
});

describe('blockers', () => {
  const player = { research: {}, researchJob: null };

  it('chambers: locked first, then busy, space, Brood Hall and Pheromone Chamber rules', () => {
    const c = { chambers: { queen_chamber: 1 } as ChamberLevels, buildJob: null, unitQueue: [], baseSpace: 100 };
    expect(chamberBlocker('leaf_garden', c, player)).toBeNull();
    expect(chamberBlocker('pheromone_chamber', c, player)?.code).toBe('locked');
    expect(chamberBlocker('leaf_garden', { ...c, buildJob: { chamber: 'leaf_garden' } }, player)?.short).toBe('Digging now');
    expect(chamberBlocker('nursery', { ...c, buildJob: { chamber: 'leaf_garden' } }, player)?.short).toBe('Diggers are busy');
    expect(chamberBlocker('leaf_garden', { ...c, baseSpace: 1 }, player)?.code).toBe('no_space');
    const big = { ...c, chambers: { queen_chamber: 5, brood_hall: 1, pheromone_chamber: 1, aphid_pasture: 1 } };
    const queue = [{ kind: 'caste' as const, id: 'worker' as const, count: 1, done: 0, perUnitMs: 1, startAt: 0 }];
    expect(chamberBlocker('brood_hall', { ...big, unitQueue: queue }, player)?.code).toBe('busy');
    expect(chamberBlocker('pheromone_chamber', big, { research: {}, researchJob: { research: 'mandibles' } })?.code).toBe('busy');
  });

  it('research: no "ready" while the Pheromone Chamber is being enlarged', () => {
    const c = { chambers: { queen_chamber: 3, pheromone_chamber: 2 } as ChamberLevels, buildJob: null };
    expect(researchBlocker('mandibles', c, player)).toBeNull();
    expect(researchBlocker('mandibles', { ...c, buildJob: { chamber: 'pheromone_chamber' } }, player)?.short).toBe('Pheromone Chamber is being enlarged');
    expect(researchBlocker('mandibles', c, { research: {}, researchJob: { research: 'mandibles' } })?.short).toBe('Researching now');
    expect(researchBlocker('mandibles', c, { research: {}, researchJob: { research: 'chitin' } })?.short).toBe('Another research is running');
  });

  it('brood: needs a Brood Hall, not mid-enlargement, and capped defenses', () => {
    const c = { chambers: { queen_chamber: 5, brood_hall: 2 } as ChamberLevels, buildJob: null, unitQueue: [], defenses: {} };
    expect(broodBlocker('caste', 'worker', CASTES.worker, 1, { ...c, chambers: { queen_chamber: 5 } }, player)?.code).toBe('locked');
    expect(broodBlocker('caste', 'worker', CASTES.worker, 1, c, player)).toBeNull();
    expect(broodBlocker('caste', 'worker', CASTES.worker, 1, { ...c, buildJob: { chamber: 'brood_hall' } }, player)?.code).toBe('busy');
    const capped = Object.entries(DEFENSES).find(([, d]) => (d as { max?: number }).max)!;
    const [id, def] = capped as [string, { name: string; unlock: Record<string, number>; max: number }];
    const rich = { ...c, chambers: { queen_chamber: 30, brood_hall: 30, pheromone_chamber: 30 } };
    const research = Object.fromEntries(Object.keys(def.unlock).filter((k) => k.startsWith('research.')).map((k) => [k.slice(9), 30]));
    expect(broodBlocker('defense', id, def, def.max, rich, { research })).toBeNull();
    expect(broodBlocker('defense', id, def, def.max + 1, rich, { research })?.short).toBe('Over the limit');
    expect(broodBlocker('defense', id, def, 1, { ...rich, defenses: { [id]: def.max } }, { research })?.short).toBe(`Limit ${def.max} per colony`);
  });
});

describe('mission types', () => {
  it('every player mission has a label, and swarms are not player-sent', () => {
    for (const t of PLAYER_MISSIONS) expect(MISSION_TYPES[t].playerSent).toBe(true);
    expect(MISSION_TYPES.swarm.playerSent).toBe(false);
    expect(PLAYER_MISSIONS).not.toContain('swarm');
  });

  it('unit rules: Scouts only, exactly one Winged Queen', () => {
    expect(missionUnitProblem('scout', { scout: 3 })).toBeNull();
    expect(missionUnitProblem('scout', { scout: 3, worker: 1 })?.code).toBe('scouts_only');
    expect(missionUnitProblem('colonize', { winged_queen: 1, worker: 10 })).toBeNull();
    expect(missionUnitProblem('colonize', { winged_queen: 2 })?.code).toBe('one_queen');
    expect(missionUnitProblem('colonize', { worker: 2 })?.code).toBe('one_queen');
    expect(missionUnitProblem('raid', { worker: 2 })).toBeNull();
  });

  it('slot pools: forage parties apart from mission slots', () => {
    const out = [{ type: 'forage' }, { type: 'raid' }, { type: 'tend' }];
    expect(missionSlotUsage(out, 'forage', {}).used).toBe(1);
    expect(missionSlotUsage(out, 'mission', {}).used).toBe(2);
  });

  it('speed steps and trip times', () => {
    expect(isValidSpeedPct(10)).toBe(true);
    expect(isValidSpeedPct(100)).toBe(true);
    expect(isValidSpeedPct(55)).toBe(false);
    expect(isValidSpeedPct(0)).toBe(false);
    expect(returnLegMs(1000, 5000)).toBe(4000);
    expect(returnLegMs(1000, 5000, 1.5)).toBe(6000);
    expect(recallReturnAt(1000, 3000)).toBe(5000);
    expect(missionTimes('raid', 0, 60)).toEqual({ arriveAt: 60_000, returnAt: 120_000 });
    expect(missionTimes('relocate', 0, 60)).toEqual({ arriveAt: 60_000, returnAt: null });
  });

  it('founding: the colony cap, then a queen at home or one this colony can raise', () => {
    const colony = { chambers: { queen_chamber: 5, brood_hall: 4 } as ChamberLevels, units: {} };
    expect(foundColonyBlocker(colony, {}, 1)?.code).toBe('colony_cap');
    expect(foundColonyBlocker({ ...colony, units: { winged_queen: 1 } }, { nuptial_flight: 1 }, 1)).toBeNull();
    expect(foundColonyBlocker(colony, { nuptial_flight: 1 }, 1)?.code).toBe('no_queen');
    expect(foundColonyBlocker({ ...colony, chambers: { queen_chamber: 5, brood_hall: 2 } }, { nuptial_flight: 1 }, 1)?.code).toBe('locked');
    expect(foundColonyBlocker({ ...colony, units: { winged_queen: 1 } }, { nuptial_flight: 1 }, 2)?.code).toBe('colony_cap');
  });
});
