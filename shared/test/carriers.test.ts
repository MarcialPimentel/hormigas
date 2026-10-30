// The carrier ladder (docs/05-castes-units.md, Marz 30 Oct 2026): Worker → Media Worker → Hauler → Carrion Beetle.
// The Media Worker fills the jump from Workers straight to Haulers, with no research needed.
import { describe, expect, it } from 'vitest';
import { CASTES, total, type CasteId } from '../src';

const carryPerCost = (id: CasteId) => CASTES[id].cargo / total(CASTES[id].cost);

describe('carrier ladder', () => {
  it('each step carries more, and more per resource spent', () => {
    const ladder: CasteId[] = ['worker', 'media_worker', 'hauler', 'carrion_beetle'];
    for (let i = 1; i < ladder.length; i++) {
      const [lo, hi] = [ladder[i - 1], ladder[i]];
      expect(CASTES[hi].cargo, `${hi} carries more than ${lo}`).toBeGreaterThan(CASTES[lo].cargo);
      expect(carryPerCost(hi), `${hi} carries more per resource than ${lo}`).toBeGreaterThan(carryPerCost(lo));
    }
  });

  it('the Media Worker needs no research, and can haul corpses', () => {
    const m = CASTES.media_worker;
    expect(Object.keys(m.unlock).filter((k) => k.startsWith('research.'))).toEqual([]);
    expect(m.unlock.brood_hall).toBe(2);
    expect(m.role).toBe('carrier');
    expect(m.canHaulCorpses).toBe(true);
  });

  it('is no cheap tank: health follows the usual cost rule', () => {
    const m = CASTES.media_worker;
    expect(m.health).toBe((m.cost.foliage + m.cost.protein) / 10);
    expect(m.attack).toBeLessThanOrEqual(CASTES.worker.attack);
  });
});
