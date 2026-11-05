// Fights pay in loot (Marz, 30 Oct 2026); research pays its listed total split by branch, Protein + Nectar heavy (Marz, 5 Nov 2026). docs/07-research.md, docs/08-combat.md.
import { describe, expect, it } from 'vitest';
import {
  CHAMBERS, FORMULAS, RESEARCH, RESEARCH_IDS, computePoints, lootPct, lootable, researchBaseCost, researchCost, researchSeconds, total,
} from '../src';

const { roundTo, byBranch } = FORMULAS.cost.researchSplit;

describe('research pays by its branch ratio', () => {
  it('splits the listed total by the branch ratio, at every level', () => {
    for (const id of RESEARCH_IDS) {
      const w = byBranch[RESEARCH[id].branch as keyof typeof byBranch];
      for (const level of [1, 2, 5]) {
        const sum = total(researchBaseCost(id, level));
        const cost = researchCost(id, level);
        // the total is kept, give or take rounding
        expect(Math.abs(total(cost) - sum)).toBeLessThanOrEqual(roundTo * 1.5);
        // Protein and Nectar each outweigh Foliage, so research is the Protein + Nectar sink
        if (sum >= 1000) {
          expect(cost.protein).toBeGreaterThan(cost.foliage);
          expect(cost.nectar).toBeGreaterThan(cost.foliage);
        }
        expect(cost.protein / sum).toBeCloseTo(w.protein / (w.foliage + w.protein + w.nectar), 1);
      }
    }
  });

  it('every branch has a ratio', () => {
    for (const id of RESEARCH_IDS) expect(byBranch[RESEARCH[id].branch as keyof typeof byBranch]).toBeDefined();
  });

  it('examples: Nurse Workers 1 and Nuptial Flight 1', () => {
    // Nest branch, 1 : 1.75 : 1.75
    expect(researchCost('nurse_workers', 1)).toEqual({ foliage: 620, protein: 1090, nectar: 1090 });
    expect(researchCost('nuptial_flight', 1)).toEqual({ foliage: 3560, protein: 6220, nectar: 6220 });
  });

  it("research time comes from the listed cost, so the split doesn't change it", () => {
    const ctx = { worldSpeed: 1, pheromone: 1 };
    const base = researchBaseCost('colony_mind', 1);
    expect(researchSeconds('colony_mind', 1, ctx)).toBe(Math.max(FORMULAS.buildTime.minimumSeconds, Math.round((base.foliage + base.protein) / (FORMULAS.buildTime.researchDivisor * 2))));
  });

  it('Aphid Pastures make 2.5x their old Nectar (base 25), and fuel keeps its hours (divisor 1,750)', () => {
    const e = CHAMBERS.aphid_pasture.effect as { base: number };
    expect(e.base).toBe(25);
    expect(FORMULAS.travel.fuelDivisor).toBe(1750);
  });

  it("points don't jump: research counts at its listed cost", () => {
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
