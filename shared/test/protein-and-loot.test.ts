// Fights pay in loot; research pays part of its Nectar in Protein (Marz, 30 Oct 2026; docs/07-research.md, docs/08-combat.md).
import { describe, expect, it } from 'vitest';
import {
  FORMULAS, RESEARCH, RESEARCH_IDS, computePoints, lootPct, lootable, researchBaseCost, researchCost, researchSeconds, total,
} from '../src';

const { share, proteinPerNectar } = FORMULAS.cost.researchNectarToProtein;

describe('research pays part of its Nectar in Protein', () => {
  it('swaps the configured share of Nectar for Protein, at every level', () => {
    for (const id of RESEARCH_IDS) {
      for (const level of [1, 2, 5]) {
        const base = researchBaseCost(id, level);
        const cost = researchCost(id, level);
        const swapped = Math.floor(base.nectar * share);
        expect(cost.foliage).toBe(base.foliage);
        expect(cost.nectar).toBe(base.nectar - swapped);
        expect(cost.protein).toBe(base.protein + swapped * proteinPerNectar);
      }
    }
  });

  it('Colony Mind 1 example: 0 / 400 / 600 becomes 0 / 1,300 / 300', () => {
    expect(RESEARCH.colony_mind.baseCost).toEqual({ foliage: 0, protein: 400, nectar: 600 });
    expect(researchCost('colony_mind', 1)).toEqual({ foliage: 0, protein: 1300, nectar: 300 });
  });

  it('research takes no longer than before the swap', () => {
    const ctx = { worldSpeed: 1, pheromone: 1 };
    const base = researchBaseCost('colony_mind', 1);
    expect(researchSeconds('colony_mind', 1, ctx)).toBe(Math.max(FORMULAS.buildTime.minimumSeconds, Math.round((base.foliage + base.protein) / (FORMULAS.buildTime.researchDivisor * 2))));
  });

  it("points don't jump: research counts at its pre-swap cost", () => {
    const research = { colony_mind: 2, formic_acid: 1 };
    const expected = (total(researchBaseCost('colony_mind', 1)) + total(researchBaseCost('colony_mind', 2)) + total(researchBaseCost('formic_acid', 1))) / FORMULAS.points.resourcesPerPoint;
    expect(computePoints([], research).research).toBeCloseTo(expected, 0);
  });
});

describe('wild things give up more loot', () => {
  it('75% from wild nests, mounds and dens; 50% from players and herds', () => {
    expect(lootPct({}, true)).toBe(FORMULAS.combat.lootPctOfWild);
    expect(lootPct({})).toBe(FORMULAS.combat.lootPctOfUnprotected);
    expect(FORMULAS.combat.lootPctOfWild).toBe(75);
  });

  it('Raiding Columns stacks on top, but never past everything', () => {
    expect(lootPct({ raiding_columns: 3 }, true)).toBeGreaterThan(lootPct({}, true));
    expect(lootPct({ raiding_columns: 99 }, true)).toBe(100);
  });

  it('a level-3 nest store: 6,000 / 4,200 / 1,800 gives 4,500 / 3,150 / 1,350', () => {
    expect(lootable({ foliage: 6000, protein: 4200, nectar: 1800 }, 0, lootPct({}, true))).toEqual({ foliage: 4500, protein: 3150, nectar: 1350 });
  });
});
