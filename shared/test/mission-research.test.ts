// Build 20: research for the missions players already run (docs/07-research.md § Research for missions).
import { describe, expect, it } from 'vitest';
import {
  FORMULAS,
  RESEARCH,
  TRADE,
  WINDFALLS,
  applyRescueResearch,
  corpseDecayFactor,
  corpseFieldAmount,
  corpseRotDelayHours,
  corpseRotStartsAt,
  createRng,
  fuelCutPct,
  herdBonusPct,
  herdDeliveryFactor,
  missionFuel,
  researchMaxLevel,
  simulateBattle,
  tradeDeliveries,
  tradeTrailHours,
  tradeTrailMs,
  windfallDeliverEveryHours,
  windfallLoadCutPct,
  type BattleResult,
} from '../src';

const H = 3600_000;

describe('the new research', () => {
  it('sit in the branches and caps Marz approved (6 Nov 2026)', () => {
    expect([RESEARCH.rescue.branch, researchMaxLevel('rescue'), RESEARCH.rescue.effect.rescuePct]).toEqual(['jaws', 3, 5]);
    expect([RESEARCH.social_stomach.branch, researchMaxLevel('social_stomach'), RESEARCH.social_stomach.effect.fuelPct]).toEqual(['scent', 5, -5]);
    expect([RESEARCH.recruitment_trails.branch, researchMaxLevel('recruitment_trails'), RESEARCH.recruitment_trails.effect.windfallLoadTimePct]).toEqual(['harvest', 3, -10]);
    expect([RESEARCH.necrophoresis.branch, researchMaxLevel('necrophoresis'), RESEARCH.necrophoresis.effect.corpseRotDelayHours]).toEqual(['nest', 2, 12]);
    expect([RESEARCH.trophallaxis.branch, researchMaxLevel('trophallaxis'), RESEARCH.trophallaxis.effect.tradeTrailHours]).toEqual(['harvest', 2, 24]);
    // mid-tree: Pheromone Chamber 3–5
    for (const id of ['rescue', 'social_stomach', 'recruitment_trails', 'necrophoresis', 'trophallaxis'] as const) {
      expect(RESEARCH[id].unlock.pheromone_chamber).toBeGreaterThanOrEqual(3);
      expect(RESEARCH[id].unlock.pheromone_chamber).toBeLessThanOrEqual(5);
    }
  });
});

describe('Social Stomach', () => {
  it('burns 5% less fuel a level, 25% at the cap', () => {
    const units = { minor_soldier: 500, major_soldier: 100 };
    const base = missionFuel(units, 20_000);
    expect(missionFuel(units, 20_000, {})).toBe(base);
    expect(missionFuel(units, 20_000, { social_stomach: 2 })).toBe(Math.round(base * 0.9));
    expect(missionFuel(units, 20_000, { social_stomach: 5 })).toBeCloseTo(base * 0.75, -1);
    expect(fuelCutPct({ social_stomach: 5 })).toBe(25);
    expect(fuelCutPct({})).toBe(0);
    // never below 1
    expect(missionFuel({ scout: 1 }, 1, { social_stomach: 5 })).toBe(1);
  });
});

describe('Rescue', () => {
  const big = { minor_soldier: 400, major_soldier: 150 };
  const defender = { units: { minor_soldier: 300, major_soldier: 100 }, research: {} };

  it('never changes the battle itself: same seed, same fight, with or without it', () => {
    const plain = simulateBattle({ units: big, research: {} }, defender, createRng(7));
    const withIt = simulateBattle({ units: big, research: { rescue: 3 } }, defender, createRng(7));
    expect(withIt).toEqual(plain);
  });

  it('after the battle, 5% of each caste’s fallen a level come home if anyone is left to carry them', () => {
    const result = simulateBattle({ units: big, research: { rescue: 3 } }, defender, createRng(7));
    const lostBefore = { ...result.attackerLost };
    const survivorsBefore = { ...result.attackerSurvivors };
    const saved = applyRescueResearch(result, { units: big, research: { rescue: 3 } }).main;
    expect(Object.keys(saved).length).toBeGreaterThan(0);
    for (const [id, k] of Object.entries(lostBefore)) {
      const n = Math.floor((k! * 15) / 100);
      expect(saved[id as keyof typeof saved] ?? 0).toBe(n);
      expect((result.attackerLost[id as keyof typeof lostBefore] ?? 0) + n).toBe(k);
      expect(result.attackerSurvivors[id as keyof typeof lostBefore]).toBe((survivorsBefore[id as keyof typeof lostBefore] ?? 0) + n);
    }
  });

  it('nobody to carry them: a wiped-out army saves no one', () => {
    const result: BattleResult = {
      winner: 'defender', rounds: [], attackerLost: { minor_soldier: 100 }, attackerSurvivors: { minor_soldier: 0 }, defenderLost: {}, defenderSurvivors: {},
      defensesDestroyed: {}, alliesLost: [], alliesSurvivors: [], attackerAlliesLost: [], attackerAlliesSurvivors: [],
    };
    expect(applyRescueResearch(result, { units: { minor_soldier: 100 }, research: { rescue: 3 } }).main).toEqual({});
    expect(result.attackerLost).toEqual({ minor_soldier: 100 });
  });

  it('works on a lost fight too, and in a joint raid each member uses their own level', () => {
    const result: BattleResult = {
      winner: 'defender', rounds: [], attackerLost: {}, attackerSurvivors: {}, defenderLost: {}, defenderSurvivors: {},
      defensesDestroyed: {}, alliesLost: [], alliesSurvivors: [],
      attackerAlliesLost: [{ minor_soldier: 100 }, { minor_soldier: 100 }], attackerAlliesSurvivors: [{ minor_soldier: 5 }, { minor_soldier: 5 }],
    };
    const saved = applyRescueResearch(result, { units: {}, research: {}, allies: [{ units: {}, research: { rescue: 2 } }, { units: {}, research: {} }] });
    expect(saved.allies).toEqual([{ minor_soldier: 10 }, {}]);
    expect(result.attackerAlliesLost).toEqual([{ minor_soldier: 90 }, { minor_soldier: 100 }]);
    expect(result.attackerAlliesSurvivors[0]).toEqual({ minor_soldier: 15 });
  });
});

describe('Necrophoresis', () => {
  const start = FORMULAS.combat.corpseDecay.startAfterHours;

  it('the field takes the best level of anyone who fought there', () => {
    expect(corpseRotDelayHours({}, { necrophoresis: 1 }, { necrophoresis: 2 })).toBe(24);
    expect(corpseRotDelayHours({}, undefined)).toBe(0);
  });

  it('rot starts that many hours later', () => {
    expect(corpseRotStartsAt(0, 12)).toBe((start + 12) * H);
    expect(corpseDecayFactor(0, (start + 10) * H)).toBeLessThan(1);
    expect(corpseDecayFactor(0, (start + 10) * H, 12)).toBe(1);
    expect(corpseFieldAmount(1000, 0, (start + 13) * H, 12)).toBe(Math.floor(1000 * (1 - FORMULAS.combat.corpseDecay.pctPerHour / 100)));
  });
});

describe('Recruitment Trails', () => {
  it('windfall loads come 10% sooner a level', () => {
    expect(windfallDeliverEveryHours({})).toBe(WINDFALLS.deliverEveryHours);
    expect(windfallDeliverEveryHours({ recruitment_trails: 3 })).toBeCloseTo(WINDFALLS.deliverEveryHours * 0.7, 9);
    expect(windfallLoadCutPct({ recruitment_trails: 2 })).toBe(20);
  });
});

describe('Aphid Husbandry on herds', () => {
  it('boosts herd deliveries by its Nectar percentage', () => {
    expect(herdDeliveryFactor({})).toBe(1);
    expect(herdDeliveryFactor({ aphid_husbandry: 4 })).toBeCloseTo(1.2, 9);
    expect(herdBonusPct({ aphid_husbandry: 4 })).toBe(20);
  });
});

describe('Trophallaxis', () => {
  it('keeps a trail open a day longer a level', () => {
    expect(tradeTrailHours({})).toBe(TRADE.trailHours);
    expect(tradeTrailHours({ trophallaxis: 2 })).toBe(TRADE.trailHours + 48);
    expect(tradeDeliveries({})).toBe(TRADE.deliveries);
    expect(tradeDeliveries({ trophallaxis: 1 })).toBe(TRADE.deliveries + 24 / TRADE.deliverEveryHours);
    expect(tradeTrailMs(1, { trophallaxis: 2 })).toBe((TRADE.trailHours + 48) * H);
  });
});
