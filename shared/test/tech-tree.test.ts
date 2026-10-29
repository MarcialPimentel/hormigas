// The tech tree (docs/21-tech-tree.md): the shape of research.json, and every new effect really changes the game.
import { describe, expect, it } from 'vitest';
import {
  CASTES,
  CHAMBERS,
  DEFENSES,
  FORMULAS,
  RESEARCH,
  RESEARCH_BRANCHES,
  RESEARCH_BRANCH_IDS,
  RESEARCH_IDS,
  chamberBuildSeconds,
  createRng,
  lootPct,
  lootable,
  missingRequirements,
  productionPerHour,
  protectedAmount,
  researchFactor,
  researchMaxLevel,
  researchSeconds,
  researchSum,
  scoutDetectionChance,
  simulateBattle,
  storageCapacity,
  syncColony,
  unitSeconds,
  type ResearchId,
} from '../src';

const prereqs = (id: ResearchId): ResearchId[] =>
  Object.keys(RESEARCH[id].unlock).filter((k) => k.startsWith('research.')).map((k) => k.slice(9) as ResearchId);

describe('tech tree shape', () => {
  it('research.json and RESEARCH_IDS list the same research', () => {
    expect(Object.keys(RESEARCH).sort()).toEqual([...RESEARCH_IDS].sort());
  });

  it('every research has a known branch, and every branch has a name and some research', () => {
    for (const id of RESEARCH_IDS) expect(RESEARCH_BRANCH_IDS, id).toContain(RESEARCH[id].branch);
    for (const b of RESEARCH_BRANCH_IDS) {
      expect(RESEARCH_BRANCHES[b].name).toBeTruthy();
      expect(RESEARCH_IDS.filter((id) => RESEARCH[id].branch === b).length, b).toBeGreaterThanOrEqual(4);
    }
  });

  it('every prerequisite names a real chamber or research, at a reachable level', () => {
    for (const id of RESEARCH_IDS) {
      for (const [key, need] of Object.entries(RESEARCH[id].unlock)) {
        expect(need, `${id} → ${key}`).toBeGreaterThanOrEqual(1);
        if (key.startsWith('research.')) {
          const other = key.slice(9) as ResearchId;
          expect(RESEARCH[other], `${id} → ${key}`).toBeTruthy();
          expect(need, `${id} → ${key}`).toBeLessThanOrEqual(researchMaxLevel(other));
        } else expect(CHAMBERS[key as keyof typeof CHAMBERS], `${id} → ${key}`).toBeTruthy();
      }
    }
  });

  it('has no loops, and nothing playable depends on research that is not in the game yet', () => {
    const state: Record<string, 'visiting' | 'done'> = {};
    const visit = (id: ResearchId, path: string[]) => {
      expect(state[id], `loop: ${[...path, id].join(' → ')}`).not.toBe('visiting');
      if (state[id] === 'done') return;
      state[id] = 'visiting';
      for (const p of prereqs(id)) visit(p, [...path, id]);
      state[id] = 'done';
    };
    for (const id of RESEARCH_IDS) visit(id, []);
    for (const id of RESEARCH_IDS.filter((r) => RESEARCH[r].mvp))
      for (const p of prereqs(id)) expect(RESEARCH[p].mvp, `${id} needs ${p}`).toBe(true);
  });

  it('research-to-research prerequisites are checked', () => {
    const chambers = { pheromone_chamber: 5 };
    expect(missingRequirements(RESEARCH.formic_acid.unlock, chambers, { mandibles: 3 }).map((m) => m.name)).toEqual(['Chitin']);
    expect(missingRequirements(RESEARCH.formic_acid.unlock, chambers, { mandibles: 3, chitin: 2 })).toEqual([]);
  });

  it('caps: capped research stops, uncapped research does not', () => {
    expect(researchMaxLevel('brood_science')).toBe(2);
    expect(researchMaxLevel('mandibles')).toBe(Infinity);
  });
});

describe('tech tree effects', () => {
  it('effects with the same key add up across research', () => {
    expect(researchSum({ fungus_farming: 3 }, 'foliagePct')).toBe(3 * Number(RESEARCH.fungus_farming.effect.foliagePct));
    expect(researchSum({}, 'foliagePct')).toBe(0);
    expect(researchSum(undefined, 'foliagePct')).toBe(0);
    expect(researchFactor({ tunnel_engineering: 6 }, 'buildTimePct')).toBeCloseTo(0.7);
  });

  it('Fungus Farming, Group Hunting and Aphid Husbandry raise chamber output', () => {
    const chambers = { leaf_garden: 5, hunting_grounds: 5, aphid_pasture: 5, nursery: 10 };
    const plain = productionPerHour(chambers, 'grassland', 1);
    const tech = productionPerHour(chambers, 'grassland', 1, { fungus_farming: 2, group_hunting: 2, aphid_husbandry: 2 });
    for (const r of ['foliage', 'protein', 'nectar'] as const) expect(tech[r]).toBeGreaterThan(plain[r]);
    // the base income trickle is not boosted, only chamber output
    const none = productionPerHour({}, 'grassland', 1, { fungus_farming: 5 });
    expect(none).toEqual(productionPerHour({}, 'grassland', 1));
  });

  it('colonies earn at the research rate while you are away', () => {
    const colony = {
      terrain: 'grassland' as const, chambers: { leaf_garden: 5, nursery: 10, granary: 10 }, units: {}, defenses: {},
      resources: { foliage: 0, protein: 0, nectar: 0 }, lastUpdated: 0, unitQueue: [],
    };
    const plain = syncColony(colony, 3_600_000).resources.foliage;
    const tech = syncColony({ ...colony, research: { fungus_farming: 4 } }, 3_600_000).resources.foliage;
    expect(tech).toBeGreaterThan(plain);
  });

  it('Repletes raise storage and Nest Plugging raises protected storage', () => {
    expect(storageCapacity({ granary: 3 }, { repletes: 2 }).foliage).toBeCloseTo(storageCapacity({ granary: 3 }).foliage * 1.2);
    expect(protectedAmount({ honeypot_gallery: 2 }, { nest_plugging: 2 })).toBeCloseTo(protectedAmount({ honeypot_gallery: 2 }) * 1.5);
    expect(protectedAmount({}, { nest_plugging: 3 })).toBe(0);
  });

  it('Tunnel Engineering, Nurse Workers and Tandem Running cut times', () => {
    const ctx = { worldSpeed: 1, excavation: 0, terrain: 'grassland' as const };
    expect(chamberBuildSeconds('granary', 6, { ...ctx, research: { tunnel_engineering: 4 } }))
      .toBeLessThan(chamberBuildSeconds('granary', 6, ctx));
    expect(unitSeconds(CASTES.major_soldier.cost, { worldSpeed: 1, broodHall: 2, research: { nurse_workers: 2 } }))
      .toBeCloseTo(unitSeconds(CASTES.major_soldier.cost, { worldSpeed: 1, broodHall: 2 }) * 0.9);
    expect(researchSeconds('mandibles', 6, { worldSpeed: 1, pheromone: 3, research: { tandem_running: 3 } }))
      .toBeLessThan(researchSeconds('mandibles', 6, { worldSpeed: 1, pheromone: 3 }));
  });

  it('Formic Acid strengthens defenses but not units', () => {
    // Acid Sentries alone against the same attackers: with Formic Acid, they kill more of them.
    const attackers = { major_soldier: 40 };
    const fight = (research: Record<string, number>) => {
      let killed = 0;
      for (let i = 0; i < 20; i++) {
        const r = simulateBattle({ units: attackers, research: {} }, { units: {}, defenses: { acid_sentry: 10 }, research }, createRng(i + 1));
        killed += r.attackerLost.major_soldier ?? 0;
      }
      return killed;
    };
    expect(fight({ formic_acid: 5 })).toBeGreaterThan(fight({}));
    // units with Formic Acid fight the same as without (same seed, same result)
    const a = simulateBattle({ units: { minor_soldier: 20 }, research: { formic_acid: 5 } }, { units: { worker: 30 }, research: {} }, createRng(7));
    const b = simulateBattle({ units: { minor_soldier: 20 }, research: {} }, { units: { worker: 30 }, research: {} }, createRng(7));
    expect(a.attackerLost).toEqual(b.attackerLost);
    expect(DEFENSES.acid_sentry).toBeTruthy();
  });

  it('Raiding Columns raise the share of loot, capped by maxLevel', () => {
    const base = FORMULAS.combat.lootPctOfUnprotected;
    expect(lootPct({})).toBe(base);
    expect(lootPct({ raiding_columns: 3 })).toBe(base + 3 * Number(RESEARCH.raiding_columns.effect.lootPct));
    const stores = { foliage: 10000, protein: 10000, nectar: 10000 };
    expect(lootable(stores, 0, lootPct({ raiding_columns: 2 })).foliage).toBeGreaterThan(lootable(stores, 0).foliage);
  });

  it('Chemical Mimicry halves the chance scouts are spotted, per level', () => {
    const plain = scoutDetectionChance(100, 1, 2, 2);
    expect(scoutDetectionChance(100, 1, 2, 2, 1)).toBeCloseTo(plain / 2);
    expect(scoutDetectionChance(100, 1, 2, 2, 3)).toBeCloseTo(plain / 8);
  });
});
