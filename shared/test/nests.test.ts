import { describe, expect, it } from 'vitest';
import {
  NEST_SPECIES, NEST_MAX_LEVEL, nestAt, nestLevelFor, nestRaidParty, nestTargets, previewBattle, speciesForTerrain,
  total, unitsValue, type UnitCounts,
} from '../src';

// A fair army for a player whose patch is at each nest level (docs/17-wild-nests.md, tuning check).
const FAIR: Record<number, UnitCounts> = {
  1: { minor_soldier: 8 },
  2: { minor_soldier: 20 },
  3: { minor_soldier: 20, major_soldier: 12 },
  4: { minor_soldier: 80, major_soldier: 10 },
  5: { minor_soldier: 150, major_soldier: 40 },
  6: { minor_soldier: 250, major_soldier: 100 },
};
const half = (u: UnitCounts): UnitCounts => Object.fromEntries(Object.entries(u).map(([k, n]) => [k, Math.floor(n! / 2)]));

describe('wild nests', () => {
  it('terrain picks the species', () => {
    expect(speciesForTerrain('sandy_soil')).toBe('fire');
    expect(speciesForTerrain('rotting_log')).toBe('carpenter');
    expect(speciesForTerrain('sunny_meadow')).toBe('pavement');
    expect(speciesForTerrain('creek_bank')).toBe('pavement');
  });

  it('level follows the patch leader and never drops', () => {
    expect(nestLevelFor(0)).toBe(1);
    expect(nestLevelFor(19)).toBe(1);
    expect(nestLevelFor(20)).toBe(2);
    expect(nestLevelFor(250)).toBe(4);
    expect(nestLevelFor(1e9)).toBe(NEST_MAX_LEVEL);
    expect(nestLevelFor(0, 3)).toBe(3);
  });

  it('regrows in a straight line to full over 24 h, scaled by world speed', () => {
    const state = { species: 'pavement' as const, level: 2, at: 0 };
    const full = nestTargets('pavement', 2);
    const empty = { units: {}, defenses: {}, resources: { foliage: 0, protein: 0, nectar: 0 } };
    const h12 = nestAt(state, empty, 12 * 3600_000);
    expect(h12.units.minor_soldier).toBe(Math.floor(full.units.minor_soldier! / 2));
    expect(h12.resources.foliage).toBeCloseTo(full.resources.foliage / 2, 6);
    expect(nestAt(state, empty, 48 * 3600_000)).toEqual(full);
    expect(nestAt(state, empty, 12 * 3600_000, 2)).toEqual(full);
    // loot carried home above the store stays until someone takes it
    const rich = { ...full, resources: { foliage: 99999, protein: 0, nectar: 0 } };
    expect(nestAt(state, rich, 3600_000).resources.foliage).toBe(99999);
  });

  it('a fair army beats every nest at its level with moderate losses; half of it pays far more', () => {
    for (const species of NEST_SPECIES) {
      for (let level = 1; level <= NEST_MAX_LEVEL; level++) {
        const nest = nestTargets(species, level);
        const defender = { units: nest.units, defenses: nest.defenses, research: {} };
        const fair = previewBattle({ units: FAIR[level], research: {} }, defender, { runs: 60 });
        const lossShare = fair.avgAttackerLossValue / total(unitsValue(FAIR[level]));
        expect(fair.winRate, `${species} L${level}`).toBeGreaterThanOrEqual(0.9);
        expect(lossShare, `${species} L${level} losses`).toBeLessThan(0.45);
        const weakArmy = half(FAIR[level]);
        const weak = previewBattle({ units: weakArmy, research: {} }, defender, { runs: 60 });
        const weakLoss = weak.avgAttackerLossValue / total(unitsValue(weakArmy));
        expect(weakLoss, `${species} L${level} half army losses`).toBeGreaterThan(0.45);
      }
    }
  });

  it('raid parties are a small share of the soldiers, capped by the target, never Workers', () => {
    const home = { worker: 30, minor_soldier: 90, major_soldier: 35 };
    const p = nestRaidParty(home, 1500);
    expect(p.worker).toBeUndefined();
    expect(p.minor_soldier).toBe(27);
    expect(p.major_soldier).toBe(11);
    const weakTarget = nestRaidParty(home, 5); // worth at most 500 resources
    expect(total(unitsValue(weakTarget))).toBeLessThanOrEqual(1000);
    expect(weakTarget.minor_soldier).toBe(2); // the minimum party still goes
    expect(nestRaidParty({ worker: 4 }, 100)).toEqual({});
  });
});
