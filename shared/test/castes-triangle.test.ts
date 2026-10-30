// Build 10, "Castes with a purpose" (docs/05-castes-units.md, docs/06-defense.md, docs/08-combat.md).
// Guards the counter triangle, the defenses and the fall-back order. If a number in docs/data changes
// and this fails, re-tune or update the docs on purpose.
import { describe, expect, it } from 'vitest';
import {
  CASTES, DEFENSES, counterHintText, counterHints, createRng, isValidRetreatPct, previewBattle, simulateBattle, strongAgainst, weakAgainst,
  type CasteId, type DefenseCounts, type UnitCounts,
} from '../src';

const BUDGET = 44000;
const worth = (id: CasteId) => CASTES[id].cost.foliage + CASTES[id].cost.protein + CASTES[id].cost.nectar;
/** As many of a caste as `budget` buys. */
const buy = (id: CasteId, budget = BUDGET): UnitCounts => ({ [id]: Math.round(budget / worth(id)) });
const MIX: UnitCounts = { ...buy('minor_soldier', BUDGET / 3), ...buy('major_soldier', BUDGET / 3), ...buy('acid_sprayer', BUDGET / 3) };
const fight = (a: UnitCounts, d: UnitCounts, defenses: DefenseCounts = {}, retreatPct = 0) =>
  previewBattle({ units: a, research: {}, retreatPct }, { units: d, defenses, research: {} }, { runs: 60, seed: 11 });

describe('the counter triangle, at equal spend', () => {
  it('Minor Soldiers overwhelm Major Soldiers, Majors crush Acid Sprayers, Sprayers mow down Minors', () => {
    expect(fight(buy('minor_soldier'), buy('major_soldier')).winRate).toBeGreaterThanOrEqual(0.8);
    expect(fight(buy('major_soldier'), buy('acid_sprayer')).winRate).toBeGreaterThanOrEqual(0.8);
    expect(fight(buy('acid_sprayer'), buy('minor_soldier')).winRate).toBeGreaterThanOrEqual(0.8);
  });

  it('and the other way round each loses', () => {
    expect(fight(buy('major_soldier'), buy('minor_soldier')).winRate).toBeLessThanOrEqual(0.2);
    expect(fight(buy('acid_sprayer'), buy('major_soldier')).winRate).toBeLessThanOrEqual(0.2);
    expect(fight(buy('minor_soldier'), buy('acid_sprayer')).winRate).toBeLessThanOrEqual(0.2);
  });

  it('no single caste crushes an even mix: the mix is the safe middle', () => {
    for (const id of ['minor_soldier', 'major_soldier', 'acid_sprayer'] as CasteId[]) {
      expect(fight(buy(id), MIX).winRate, `${id} attacking a mix`).toBeLessThanOrEqual(0.75);
      expect(fight(MIX, buy(id)).winRate, `a mix attacking ${id}`).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('Trap-jaw Ants are fragile against every soldier caste', () => {
    for (const id of ['minor_soldier', 'major_soldier', 'acid_sprayer'] as CasteId[])
      expect(fight(buy('trap_jaw'), buy(id)).winRate, `trap-jaws vs ${id}`).toBeLessThanOrEqual(0.1);
  });
});

describe('defenses', () => {
  const NEST: DefenseCounts = { soil_wall: 1, pit_trap: 8, acid_sentry: 5 };

  it('Trap-jaw Ants break defenses far more cheaply than any soldier caste', () => {
    const jaws = fight(buy('trap_jaw'), {}, NEST);
    expect(jaws.winRate).toBeGreaterThanOrEqual(0.9);
    for (const id of ['minor_soldier', 'major_soldier', 'acid_sprayer'] as CasteId[])
      expect(fight(buy(id), {}, NEST).avgAttackerLossValue, id).toBeGreaterThan(jaws.avgAttackerLossValue * 1.5);
  });

  it('a defended nest makes a Major Soldier raid cost more than the defender loses after free rebuilds', () => {
    const r = fight(buy('major_soldier'), {}, NEST);
    expect(r.avgAttackerLossValue).toBeGreaterThan(r.avgDefenderLossValue * 0.3); // 70% of destroyed defenses rebuild
  });

  it('Pit Traps catch small ants: Minors lose more to pits than Majors do, for the same spend', () => {
    const pits: DefenseCounts = { pit_trap: 15 };
    const minors = fight(buy('minor_soldier', 20000), {}, pits);
    const majors = fight(buy('major_soldier', 20000), {}, pits);
    expect(minors.avgAttackerLossValue).toBeGreaterThan(majors.avgAttackerLossValue);
  });

  it('the Soil Wall shields the other defenses', () => {
    const raid = buy('minor_soldier', 8000);
    const destroyed = (defenses: DefenseCounts) => {
      let n = 0;
      for (let i = 0; i < 40; i++) n += simulateBattle({ units: raid, research: {} }, { units: {}, defenses, research: {} }, createRng(i)).defensesDestroyed.pit_trap ?? 0;
      return n;
    };
    expect(destroyed({ pit_trap: 6, soil_wall: 1 })).toBeLessThan(destroyed({ pit_trap: 6 }) * 0.8);
  });

  it('the Narrow Tunnel halves the raiders who fight in round 1, and is never destroyed', () => {
    const raid = { minor_soldier: 200 };
    const shots = (defenses: DefenseCounts) => simulateBattle({ units: raid, research: {} }, { units: { major_soldier: 30 }, defenses, research: {} }, createRng(5));
    const open = shots({});
    const tunnel = shots({ narrow_tunnel: 1 });
    expect(tunnel.rounds[0].attackerShots).toBeLessThan(open.rounds[0].attackerShots * 0.65);
    expect(tunnel.rounds[0].attackerShots).toBeGreaterThan(open.rounds[0].attackerShots * 0.35);
    expect(tunnel.defensesDestroyed.narrow_tunnel).toBeUndefined();
    // a colony with only a tunnel has nobody to fight: the raiders walk in
    expect(simulateBattle({ units: raid, research: {} }, { units: {}, defenses: { narrow_tunnel: 1 }, research: {} }, createRng(1)).winner).toBe('attacker');
    expect(DEFENSES.narrow_tunnel.max).toBe(1);
  });
});

describe('fall-back order', () => {
  it('raiders break off after losing the chosen share, which counts as the defender holding, and they lose less', () => {
    const attackers = { minor_soldier: 60 };
    const defenders = { acid_sprayer: 40 };
    let fellBack = 0;
    for (let i = 0; i < 20; i++) {
      const r = simulateBattle({ units: attackers, research: {}, retreatPct: 25 }, { units: defenders, research: {} }, createRng(i));
      if (r.retreatedAfterRound != null) {
        fellBack++;
        expect(r.winner).toBe('defender');
        expect(r.rounds.length).toBe(r.retreatedAfterRound);
        expect(Object.values(r.attackerSurvivors).reduce((s, n) => s + (n ?? 0), 0)).toBeGreaterThan(0);
      }
    }
    expect(fellBack).toBeGreaterThan(10);
    const stay = fight(attackers, defenders);
    const back = fight(attackers, defenders, {}, 25);
    expect(back.retreatRate).toBeGreaterThan(0.5);
    expect(back.avgAttackerLossValue).toBeLessThan(stay.avgAttackerLossValue);
  });

  it('only the listed orders are allowed', () => {
    expect(isValidRetreatPct(0)).toBe(true);
    expect(isValidRetreatPct(25)).toBe(true);
    expect(isValidRetreatPct(50)).toBe(true);
    expect(isValidRetreatPct(30)).toBe(false);
  });

  it('without an order, battles run exactly as before (same RNG draws)', () => {
    const a = { units: { minor_soldier: 30, major_soldier: 5 }, research: {} };
    const d = { units: { minor_soldier: 20 }, defenses: { pit_trap: 2 }, research: {} };
    expect(simulateBattle({ ...a, retreatPct: 0 }, d, createRng(9))).toEqual(simulateBattle(a, d, createRng(9)));
  });
});

describe('counters are readable (pillar 5)', () => {
  it('the Brood Hall shows the triangle', () => {
    expect(strongAgainst('minor_soldier')).toContain('major_soldier');
    expect(strongAgainst('major_soldier')).toContain('acid_sprayer');
    expect(strongAgainst('acid_sprayer')).toContain('minor_soldier');
    expect(strongAgainst('trap_jaw')).toEqual(expect.arrayContaining(['pit_trap', 'acid_sentry', 'soil_wall']));
    expect(weakAgainst('minor_soldier')).toEqual(expect.arrayContaining(['acid_sprayer', 'pit_trap']));
    expect(weakAgainst('minor_soldier')).not.toContain('major_soldier');
    expect(weakAgainst('major_soldier')).toContain('minor_soldier');
  });

  it('a battle report explains what cut your ants down and what counters it', () => {
    const hints = counterHints({ minor_soldier: 40 }, { acid_sprayer: 30 }, { pit_trap: 2 });
    expect(hints).toHaveLength(1);
    expect(hints[0].by).toEqual(['acid_sprayer', 'pit_trap']);
    expect(hints[0].answer).toEqual(expect.arrayContaining(['major_soldier', 'trap_jaw']));
    expect(counterHintText(counterHints({ minor_soldier: 1 }, { acid_sprayer: 1 })[0])).toBe(
      'Acid Sprayers cut down your Minor Soldiers. Major Soldiers counter Acid Sprayers.',
    );
    // nothing to explain when the enemy had no counter to what you lost
    expect(counterHints({ major_soldier: 3 }, { major_soldier: 10 })).toEqual([]);
  });
});
