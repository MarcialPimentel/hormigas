import { describe, expect, it } from 'vitest';
import {
  CHAMBERS, CHAMBER_IDS, CASTES, CASTE_IDS, DEFENSES, DEFENSE_IDS, RESEARCH, RESEARCH_IDS, TERRAIN, TERRAIN_IDS,
  chamberCost, chamberBuildSeconds, researchCost, researchSeconds, unitSeconds,
  workforce, productionPerHour, storageCapacity, protectedAmount, accrue,
  spaceUsed, spaceMax, missingRequirements, isUnlocked, res, shortfalls, explainShortfall,
} from '../src';

describe('data integrity', () => {
  it('id lists match data files exactly', () => {
    expect(Object.keys(CHAMBERS).sort()).toEqual([...CHAMBER_IDS].sort());
    expect(Object.keys(CASTES).sort()).toEqual([...CASTE_IDS].sort());
    expect(Object.keys(DEFENSES).sort()).toEqual([...DEFENSE_IDS].sort());
    expect(Object.keys(RESEARCH).sort()).toEqual([...RESEARCH_IDS].sort());
    expect(Object.keys(TERRAIN).sort()).toEqual([...TERRAIN_IDS].sort());
  });
  it('every requirement key points at a real chamber or research', () => {
    const all = [...Object.values(CHAMBERS), ...Object.values(CASTES), ...Object.values(DEFENSES), ...Object.values(RESEARCH)];
    for (const def of all) {
      for (const key of Object.keys(def.unlock)) {
        if (key.startsWith('research.')) expect(RESEARCH_IDS).toContain(key.slice(9));
        else expect(CHAMBER_IDS).toContain(key);
      }
    }
  });
  it('terrain covers spots 1..12 exactly once', () => {
    const spots = TERRAIN_IDS.flatMap((t) => TERRAIN[t].spots).sort((a, b) => a - b);
    expect(spots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('costs and times', () => {
  it('chamber cost grows by costFactor', () => {
    expect(chamberCost('leaf_garden', 1)).toEqual(res(60, 15, 0));
    expect(chamberCost('leaf_garden', 2)).toEqual(res(90, 22.5, 0));
    expect(chamberCost('queen_chamber', 3)).toEqual(res(1000, 500, 0));
  });
  it('research cost doubles', () => {
    expect(researchCost('mandibles', 3)).toEqual(res(3200, 800, 0));
  });
  it('founding boost speeds up levels 1-3 and respects minimum', () => {
    const ctx = { worldSpeed: 1, excavation: 0, terrain: 'grassland' as const };
    // L1 leaf garden: 75 / 2.5 = 30s * 0.25 = 7.5 -> 8
    expect(chamberBuildSeconds('leaf_garden', 1, ctx)).toBe(8);
    // L4: (60+15)*1.5^3 = 253.125 / 2.5 = 101s
    expect(chamberBuildSeconds('leaf_garden', 4, ctx)).toBe(101);
    expect(chamberBuildSeconds('leaf_garden', 1, { ...ctx, worldSpeed: 100 })).toBe(5);
  });
  it('excavation, sandy soil and world speed reduce time', () => {
    const base = chamberBuildSeconds('leaf_garden', 10, { worldSpeed: 1, excavation: 0, terrain: 'grassland' });
    expect(chamberBuildSeconds('leaf_garden', 10, { worldSpeed: 1, excavation: 1, terrain: 'grassland' })).toBe(Math.round(base / 2));
    expect(chamberBuildSeconds('leaf_garden', 10, { worldSpeed: 1, excavation: 0, terrain: 'sandy_soil' })).toBe(Math.round(base * 0.9));
    expect(chamberBuildSeconds('leaf_garden', 10, { worldSpeed: 5, excavation: 0, terrain: 'grassland' })).toBe(Math.round(base / 5));
  });
  it('pacing target: level 10 production chamber takes ~20 minutes at speed 1', () => {
    const t = chamberBuildSeconds('leaf_garden', 10, { worldSpeed: 1, excavation: 0, terrain: 'grassland' });
    expect(t).toBeGreaterThan(15 * 60);
    expect(t).toBeLessThan(25 * 60);
  });
  it('research and unit times', () => {
    expect(researchSeconds('mandibles', 1, { worldSpeed: 1, pheromone: 1 })).toBe(500);
    expect(unitSeconds(CASTES.worker.cost, { worldSpeed: 1, broodHall: 1 })).toBe(80);
  });
});

describe('workforce and production', () => {
  it('base income with no chambers', () => {
    expect(productionPerHour({}, 'grassland')).toEqual(res(60, 30, 0));
    expect(productionPerHour({}, 'grassland', 5)).toEqual(res(300, 150, 0));
  });
  it('production scales with level and terrain', () => {
    const p = productionPerHour({ leaf_garden: 1, nursery: 1 }, 'grassland');
    expect(p.foliage).toBeCloseTo(60 + 30 * 1.1, 5);
    const sunny = productionPerHour({ leaf_garden: 1, nursery: 1 }, 'sunny_meadow');
    expect(sunny.foliage).toBeCloseTo(60 + 30 * 1.1 * 1.2, 5);
  });
  it('workforce shortage reduces production proportionally', () => {
    const wf = workforce({ leaf_garden: 5, hunting_grounds: 5 });
    expect(wf.ratio).toBeLessThan(1);
    const p = productionPerHour({ leaf_garden: 5, hunting_grounds: 5 }, 'grassland');
    expect(p.foliage).toBeCloseTo(60 + 30 * 5 * Math.pow(1.1, 5) * wf.ratio, 5);
  });
});

describe('shortfalls', () => {
  it('explains storage, missing income, and waiting', () => {
    const caps = res(10000, 10000, 10000);
    const rate = res(100, 50, 0);
    expect(explainShortfall(shortfalls(res(20000, 0, 0), res(0, 0, 0), caps, rate))).toBe("Costs 20.0k Foliage, but your Granary only holds 10.0k.");
    expect(explainShortfall(shortfalls(res(0, 0, 100), res(0, 0, 0), caps, rate))).toBe("Needs 100 more Nectar. You don't produce Nectar yet.");
    expect(explainShortfall(shortfalls(res(200, 0, 0), res(100, 0, 0), caps, rate))).toBe('Needs 100 more Foliage (about 1h).');
    expect(shortfalls(res(1, 1, 1), res(5, 5, 5), caps, rate)).toEqual([]);
  });
});

describe('storage and accrual', () => {
  it('capacity grows by 1.8x per level', () => {
    expect(storageCapacity({}).foliage).toBe(10000);
    expect(storageCapacity({ granary: 1 }).foliage).toBe(18000);
  });
  it('honeypot protection', () => {
    expect(protectedAmount({})).toBe(0);
    expect(protectedAmount({ honeypot_gallery: 1 })).toBe(1600);
  });
  it('accrue stops at cap but never reduces overflow', () => {
    const caps = res(100, 100, 100);
    expect(accrue(res(0, 50, 500), res(3600, 3600, 3600), caps, 60)).toEqual(res(60, 100, 500));
  });
});

describe('space and unlocks', () => {
  it('space', () => {
    expect(spaceUsed({ leaf_garden: 3, nursery: 2 })).toBe(5);
    expect(spaceMax(160, { deep_digging: 2 })).toBe(170);
  });
  it('requirements', () => {
    expect(isUnlocked(CHAMBERS.granary.unlock, { queen_chamber: 1 }, {})).toBe(false);
    expect(isUnlocked(CHAMBERS.granary.unlock, { queen_chamber: 2 }, {})).toBe(true);
    const missing = missingRequirements(CASTES.major_soldier.unlock, { brood_hall: 2 }, {});
    expect(missing.map((m) => m.key)).toEqual(['research.brood_science']);
  });
});
