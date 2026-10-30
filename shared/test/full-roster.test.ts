// Build 11, "The full roster" (docs/05-castes-units.md, docs/03-economy.md, docs/09-missions.md).
// Guards the second counter layer (big units and their hunters), trample, instincts, Gardener Minims,
// Desert Ants and Slave-makers. Run `npm run combat` to see the whole picture.
import { describe, expect, it } from 'vitest';
import {
  CASTES, FORMULAS, buyCaste, casteResearchFraction, corpseCarry, createRng, desertAntLuck, gardenerCap, gardenersCounted,
  matchup, partyForageLuck, productionPerHour, simulateBattle, syncColony, total,
  type CasteId, type ColonyState, type UnitCounts,
} from '../src';

const BUDGET = 120000;
const win = (a: CasteId, d: CasteId) => matchup(a, buyCaste(a, BUDGET), d, buyCaste(d, BUDGET), {}, { runs: 40 }).winRate;

describe('big units and their hunters, at equal spend', () => {
  it('Supermajors and Rhinoceros Beetles crush the mid castes', () => {
    for (const big of ['supermajor', 'rhino_beetle'] as CasteId[])
      for (const mid of ['major_soldier', 'acid_sprayer', 'trap_jaw'] as CasteId[])
        expect(win(big, mid), `${big} vs ${mid}`).toBeGreaterThanOrEqual(0.8);
  });

  it('a swarm of Minor Soldiers still pulls the big units down', () => {
    expect(win('minor_soldier', 'supermajor')).toBeGreaterThanOrEqual(0.6);
    expect(win('minor_soldier', 'rhino_beetle')).toBeGreaterThanOrEqual(0.6);
  });

  it('Bullet Ants and Assassin Bugs hunt the big units', () => {
    for (const hunter of ['bullet_ant', 'assassin_bug'] as CasteId[])
      for (const big of ['supermajor', 'rhino_beetle'] as CasteId[])
        expect(win(hunter, big), `${hunter} vs ${big}`).toBeGreaterThanOrEqual(0.8);
  });

  it('and the hunters are fragile against small ants', () => {
    for (const hunter of ['bullet_ant', 'assassin_bug'] as CasteId[])
      for (const small of ['minor_soldier', 'acid_sprayer', 'trap_jaw'] as CasteId[])
        expect(win(small, hunter), `${small} vs ${hunter}`).toBeGreaterThanOrEqual(0.8);
  });
});

describe('trample', () => {
  it('a big killing bite carries on into more ants', () => {
    const minors = { minor_soldier: 300 };
    const killed = (trample: number) => {
      const saved = CASTES.supermajor.trample;
      (CASTES.supermajor as { trample?: number }).trample = trample;
      try {
        const r = simulateBattle({ units: { supermajor: 10 }, research: {} }, { units: minors, research: {} }, createRng(4));
        return r.rounds[0].defenderRemaining;
      } finally {
        (CASTES.supermajor as { trample?: number }).trample = saved;
      }
    };
    // fewer Minors left standing after round 1 with trample than without
    expect(killed(4)).toBeLessThan(killed(0));
  });

  it('units without trample fight exactly as before (no extra random draws)', () => {
    const a = { units: { minor_soldier: 40, major_soldier: 8 }, research: {} };
    const d = { units: { acid_sprayer: 20 }, defenses: { pit_trap: 2 }, research: {} };
    expect(simulateBattle(a, d, createRng(2))).toEqual(simulateBattle(a, d, createRng(2)));
    expect(CASTES.minor_soldier.trample ?? 0).toBe(0);
  });
});

describe('instincts', () => {
  it('boost only their own caste', () => {
    expect(casteResearchFraction({ acid_glands: 3 }, 'acid_sprayer', 'casteAttackPct')).toBeCloseTo(0.15);
    expect(casteResearchFraction({ acid_glands: 3 }, 'minor_soldier', 'casteAttackPct')).toBe(0);
    expect(casteResearchFraction({ armoured_heads: 2, swarm_raiding: 5 }, 'major_soldier', 'casteHealthPct')).toBeCloseTo(0.1);
  });

  it('turn a close fight', () => {
    const minors: UnitCounts = { minor_soldier: 100 };
    const majors: UnitCounts = { major_soldier: 45 };
    const rate = (research: Record<string, number>) => {
      let w = 0;
      for (let i = 0; i < 40; i++) if (simulateBattle({ units: majors, research }, { units: minors, research: {} }, createRng(i)).winner === 'attacker') w++;
      return w / 40;
    };
    expect(rate({ armoured_heads: 10 })).toBeGreaterThan(rate({}) + 0.2);
  });
});

describe('Gardener Minims', () => {
  const chambers = { queen_chamber: 5, leaf_garden: 5, nursery: 8 };
  it('each one at home adds to the Leaf Gardens, up to a cap per Leaf Garden level', () => {
    const none = productionPerHour(chambers, 'grassland', 1, {}, {});
    const ten = productionPerHour(chambers, 'grassland', 1, {}, { gardener_minim: 10 });
    expect(ten.foliage).toBeGreaterThan(none.foliage);
    expect(ten.protein).toBe(none.protein);
    expect(gardenerCap(chambers)).toBe(FORMULAS.gardeners.perLeafGardenLevel * 5);
    expect(gardenersCounted(chambers, { gardener_minim: 999 })).toBe(gardenerCap(chambers));
    const capped = productionPerHour(chambers, 'grassland', 1, {}, { gardener_minim: 999 });
    const atCap = productionPerHour(chambers, 'grassland', 1, {}, { gardener_minim: gardenerCap(chambers) });
    expect(capped.foliage).toBeCloseTo(atCap.foliage);
  });

  it('minims hatching while you are away are paid from the moment they hatch (one big jump = many small steps)', () => {
    const start: ColonyState = {
      terrain: 'grassland', chambers, units: { gardener_minim: 3 }, defenses: {}, research: {},
      resources: { foliage: 0, protein: 0, nectar: 0 }, lastUpdated: 0,
      unitQueue: [
        { kind: 'caste', id: 'worker', count: 2, done: 0, perUnitMs: 600_000, startAt: 0 },
        { kind: 'caste', id: 'gardener_minim', count: 30, done: 0, perUnitMs: 300_000, startAt: null },
      ],
    };
    const end = 6 * 3600_000;
    const jump = syncColony(start, end);
    let step = start;
    for (let t = 60_000; t <= end; t += 60_000) step = syncColony(step, t);
    expect(jump.units.gardener_minim).toBe(step.units.gardener_minim);
    // steps of a minute pay each minim from the end of the minute it hatched in, so allow that much
    expect(Math.abs(jump.resources.foliage - step.resources.foliage)).toBeLessThan(5);
    expect(jump.resources.foliage).toBeGreaterThan(syncColony({ ...start, unitQueue: [] }, end).resources.foliage);
  });
});

describe('Desert Ants and Slave-makers', () => {
  it('Desert Ants add forage luck, every few of them, up to a limit', () => {
    const per = FORMULAS.desertAnts.antsPerLuck;
    expect(desertAntLuck({ desert_ant: per - 1 })).toBe(0);
    expect(desertAntLuck({ desert_ant: per * 2 })).toBe(2);
    expect(desertAntLuck({ desert_ant: 9999 })).toBe(FORMULAS.desertAnts.maxLuck);
    expect(partyForageLuck({ foraging_instinct: 2 }, { desert_ant: per })).toBe(3);
  });

  it('Slave-makers carry corpses; nobody else does', () => {
    expect(corpseCarry({ slave_maker: 10, major_soldier: 50 })).toBe(10 * CASTES.slave_maker.corpseCargo!);
    expect(corpseCarry({ worker: 100 })).toBe(0);
    expect(total(CASTES.slave_maker.cost)).toBeGreaterThan(0);
  });
});
