import { describe, expect, it } from 'vitest';
import {
  distance, travelSeconds, missionFuel, groupSpeed, groupCargo, missionSlots, speedForReturnIn,
  scoutDetail, terrainForSpot, validCoords, canRaid, lateFoundingMultiplier, NEW_PLAYER_PROTECTION_MS,
  INACTIVE_AFTER_MS, computePoints, rollForageOutcome, resolveForage, forageWeights, createRng, FORAGE_OUTCOMES,
} from '../src';

describe('map', () => {
  it('distance tiers', () => {
    expect(distance({ region: 1, patch: 1, spot: 1 }, { region: 1, patch: 1, spot: 1 })).toBe(5);
    expect(distance({ region: 1, patch: 1, spot: 1 }, { region: 1, patch: 1, spot: 4 })).toBe(1015);
    expect(distance({ region: 1, patch: 1, spot: 1 }, { region: 1, patch: 11, spot: 4 })).toBe(3650);
    expect(distance({ region: 1, patch: 1, spot: 1 }, { region: 3, patch: 1, spot: 1 })).toBe(40000);
  });
  it('terrain and coordinate validation', () => {
    expect(terrainForSpot(1)).toBe('sunny_meadow');
    expect(terrainForSpot(6)).toBe('grassland');
    expect(terrainForSpot(12)).toBe('creek_bank');
    expect(validCoords({ region: 1, patch: 1, spot: 13 })).toBe(false);
    expect(validCoords({ region: 1, patch: 1, spot: 13 }, true)).toBe(true);
    expect(validCoords({ region: 6, patch: 1, spot: 1 })).toBe(false);
  });
});

describe('travel', () => {
  it('same-patch trip takes minutes at full speed, world speed divides it', () => {
    const t = travelSeconds(1015, 5000, 100, 1);
    expect(t).toBeGreaterThan(5 * 60);
    expect(t).toBeLessThan(10 * 60);
    expect(travelSeconds(1015, 5000, 100, 5)).toBe(Math.round(t / 5));
  });
  it('slower speed takes longer and costs less fuel', () => {
    expect(travelSeconds(3650, 5000, 50, 1)).toBeGreaterThan(travelSeconds(3650, 5000, 100, 1));
    expect(missionFuel({ worker: 100 }, 3650, 50)).toBeLessThan(missionFuel({ worker: 100 }, 3650, 100));
  });
  it('group speed is the slowest unit, boosted by pheromone trails', () => {
    expect(groupSpeed({ worker: 5, minor_soldier: 5 }, {})).toBe(5000);
    expect(groupSpeed({ minor_soldier: 5 }, { pheromone_trails: 2 })).toBeCloseTo(15000);
    expect(groupSpeed({}, {})).toBe(0);
  });
  it('cargo and slots', () => {
    expect(groupCargo({ worker: 2, hauler: 1 })).toBe(10500);
    expect(missionSlots({ colony_mind: 3 })).toBe(5);
  });
  it('return-at picker never returns before the requested time', () => {
    const want = 4 * 3600;
    const pct = speedForReturnIn(want, 3650, 5000, 1);
    expect(2 * travelSeconds(3650, 5000, pct, 1)).toBeLessThanOrEqual(want);
  });
  it('scout detail', () => {
    expect(scoutDetail(0, 2, 1)).toBe('resources');
    expect(scoutDetail(1, 1, 1)).toBe('units');
    expect(scoutDetail(3, 1, 1)).toBe('defenses');
    expect(scoutDetail(2, 0, 5)).toBe('full');
  });
});

describe('pvp', () => {
  const now = 1_000_000_000_000;
  const active = (points: number, extra = {}) => ({ points, protectedUntil: 0, lastActive: now, ...extra });
  it('new player protection', () => {
    expect(canRaid(active(100), active(100, { protectedUntil: now + NEW_PLAYER_PROTECTION_MS }), now, 0)).toBe('target_protected');
  });
  it('strength protection, but inactive players are fair game', () => {
    expect(canRaid(active(1000), active(150), now, 0)).toBe('target_too_weak');
    expect(canRaid(active(1000), active(250), now, 0)).toBe(null);
    expect(canRaid(active(1000), active(10, { lastActive: now - INACTIVE_AFTER_MS }), now, 0)).toBe(null);
  });
  it('weaker players can always hit stronger ones', () => {
    expect(canRaid(active(10), active(100000), now, 0)).toBe(null);
  });
  it('bash limit', () => {
    expect(canRaid(active(100), active(100), now, 4)).toBe('bash_limit');
  });
  it('late founding boost', () => {
    expect(lateFoundingMultiplier(0, 1000)).toBe(0.5);
    expect(lateFoundingMultiplier(500, 1000)).toBe(0.75);
    expect(lateFoundingMultiplier(5000, 1000)).toBe(1);
  });
});

describe('points', () => {
  it('counts chambers, research and military', () => {
    const p = computePoints([{ chambers: { queen_chamber: 1 }, units: { worker: 10 }, defenses: {} }], { mandibles: 1 });
    expect(p.economy).toBe(0); // 600 / 1000 floored
    expect(p.military).toBe(4);
    expect(p.research).toBe(1);
    expect(p.total).toBe(5);
  });
});

describe('forage', () => {
  it('weights stay positive and luck improves good outcomes', () => {
    const base = forageWeights(0);
    const lucky = forageWeights(10);
    expect(lucky.food_cache).toBeGreaterThan(base.food_cache);
    expect(lucky.the_boot).toBeGreaterThan(0);
    const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(lucky)).toBeCloseTo(sum(base), 6);
  });
  it('outcome distribution roughly matches the table', () => {
    const rng = createRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) {
      const o = rollForageOutcome(rng, 0);
      counts[o] = (counts[o] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual([...FORAGE_OUTCOMES].sort());
    expect(counts.food_cache / 20000).toBeGreaterThan(0.32);
    expect(counts.food_cache / 20000).toBeLessThan(0.38);
  });
  it('finds are capped by cargo', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const r = resolveForage(rng, { cargo: 500, playerPoints: 1000, luck: 0 });
      expect(r.found.foliage + r.found.protein + r.found.nectar).toBeLessThanOrEqual(500);
    }
  });
});
