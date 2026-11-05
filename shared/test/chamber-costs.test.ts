// Chamber cost review (Marz, 5 Nov 2026; docs/04-colony.md#what-chambers-cost).
import { describe, expect, it } from 'vitest';
import { CHAMBERS, chamberCost, total, workforce } from '../src';

describe('chamber costs', () => {
  it('each store costs Foliage plus the resource it stores, nothing else', () => {
    expect(CHAMBERS.granary.baseCost).toEqual({ foliage: 1000, protein: 0, nectar: 0 });
    expect(CHAMBERS.larder.baseCost.nectar).toBe(0);
    expect(CHAMBERS.larder.baseCost.protein).toBeGreaterThan(0);
    expect(CHAMBERS.nectar_cellar.baseCost).toEqual({ foliage: 1000, protein: 0, nectar: 1000 });
  });

  it("the Nectar Cellar and Pheromone Chamber kept their totals, so nobody's points moved", () => {
    expect(total(chamberCost('nectar_cellar', 1))).toBe(2000);
    expect(total(chamberCost('pheromone_chamber', 1))).toBe(800);
  });

  it('the Pheromone Chamber costs like research: Protein and Nectar above Foliage', () => {
    const c = CHAMBERS.pheromone_chamber.baseCost;
    expect(c.protein).toBeGreaterThan(c.foliage);
    expect(c.nectar).toBeGreaterThan(c.foliage);
  });

  it('a Nursery at the same level as the Leaf Garden and Hunting Grounds keeps both staffed', () => {
    expect((CHAMBERS.nursery.effect as { base: number }).base).toBe(30);
    for (const l of [5, 10, 15, 20]) {
      const wf = workforce({ leaf_garden: l, hunting_grounds: l, nursery: l });
      expect(wf.ratio).toBe(1);
    }
  });
});
