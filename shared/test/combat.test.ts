import { describe, expect, it } from 'vitest';
import {
  simulateBattle, rebuildDefenses, corpseProtein, lootable, fillCargo, previewBattle, createRng, groupCargo, res,
} from '../src';

describe('combat engine', () => {
  it('is deterministic for a seed', () => {
    const a = simulateBattle({ units: { minor_soldier: 50 }, research: {} }, { units: { worker: 40 }, research: {} }, createRng(42));
    const b = simulateBattle({ units: { minor_soldier: 50 }, research: {} }, { units: { worker: 40 }, research: {} }, createRng(42));
    expect(a).toEqual(b);
  });
  it('attacker vs empty colony wins with zero rounds', () => {
    const r = simulateBattle({ units: { minor_soldier: 1 }, research: {} }, { units: {}, research: {} }, createRng(1));
    expect(r.winner).toBe('attacker');
    expect(r.rounds).toHaveLength(0);
  });
  it('overwhelming force wins', () => {
    const r = simulateBattle({ units: { major_soldier: 200 }, research: {} }, { units: { minor_soldier: 20 }, research: {} }, createRng(3));
    expect(r.winner).toBe('attacker');
    expect(r.defenderSurvivors.minor_soldier).toBe(0);
  });
  it('glance rule: workers cannot hurt a soil wall', () => {
    // worker attack 5 < 1% of 2000 guard = 20
    const r = simulateBattle({ units: { worker: 500 }, research: {} }, { units: {}, defenses: { soil_wall: 1 }, research: {} }, createRng(5));
    expect(r.defensesDestroyed.soil_wall ?? 0).toBe(0);
    expect(r.winner).not.toBe('attacker');
  });
  it('battle lasts at most 6 rounds, ending in a draw if both survive', () => {
    const r = simulateBattle({ units: { scout: 5 }, research: {} }, { units: {}, defenses: { soil_wall: 1 }, research: {} }, createRng(9));
    expect(r.rounds.length).toBeLessThanOrEqual(6);
  });
  it('research bonuses matter', () => {
    const runs = 30;
    let winsPlain = 0;
    let winsResearched = 0;
    const rng = createRng(11);
    for (let i = 0; i < runs; i++) {
      if (simulateBattle({ units: { minor_soldier: 100 }, research: {} }, { units: { minor_soldier: 100 }, research: {} }, rng).winner === 'attacker') winsPlain++;
      if (simulateBattle({ units: { minor_soldier: 100 }, research: { mandibles: 5, chitin: 5, guard_formation: 5 } }, { units: { minor_soldier: 100 }, research: {} }, rng).winner === 'attacker') winsResearched++;
    }
    expect(winsResearched).toBeGreaterThan(winsPlain);
  });
  it('frenzy: major soldiers shred minors efficiently', () => {
    const r = simulateBattle({ units: { major_soldier: 50 }, research: {} }, { units: { minor_soldier: 300 }, research: {} }, createRng(21));
    expect(r.rounds[0].attackerShots).toBeGreaterThan(50);
  });
});

describe('aftermath', () => {
  it('defenses rebuild about 70% of the time', () => {
    const rb = rebuildDefenses({ pit_trap: 10000 }, createRng(2));
    expect(rb.pit_trap! / 10000).toBeGreaterThan(0.67);
    expect(rb.pit_trap! / 10000).toBeLessThan(0.73);
  });
  it('corpses are 30% of foliage+protein of lost units, as protein', () => {
    // 10 workers = 3000 F + 1000 P = 4000 → 1200
    expect(corpseProtein({ worker: 10 })).toBe(1200);
    expect(corpseProtein({ worker: 10 }, { minor_soldier: 10 })).toBe(2400);
  });
  it('loot takes 50% of the unprotected part', () => {
    expect(lootable(res(10000, 2000, 500), 1000)).toEqual(res(4500, 500, 0));
  });
  it('fillCargo spreads evenly and never exceeds availability or cargo', () => {
    expect(fillCargo(res(9000, 9000, 9000), 3000)).toEqual(res(1000, 1000, 1000));
    expect(fillCargo(res(100, 9000, 9000), 3000)).toEqual(res(100, 1450, 1450));
    const t = fillCargo(res(5, 5, 5), 1000);
    expect(t).toEqual(res(5, 5, 5));
    const odd = fillCargo(res(1000, 1000, 1000), 1001);
    expect(odd.foliage + odd.protein + odd.nectar).toBe(1001);
  });
  it('preview gives sane probabilities and loot estimate', () => {
    const p = previewBattle(
      { units: { major_soldier: 100, hauler: 10 }, research: {} },
      { units: { minor_soldier: 10 }, research: {} },
      { runs: 20, defenderResources: res(50000, 50000, 10000), protectedEach: 0, cargoOf: (u) => groupCargo(u) },
    );
    expect(p.winRate + p.drawRate + p.lossRate).toBeCloseTo(1);
    expect(p.winRate).toBeGreaterThan(0.9);
    expect(p.avgLootOnWin).toBeGreaterThan(0);
  });
});

describe('allied defenders (Hold Position, docs/23-supercolonies.md)', () => {
  it('a battle without allies runs exactly as before', () => {
    const plain = simulateBattle({ units: { minor_soldier: 50 }, research: {} }, { units: { worker: 40 }, research: {} }, createRng(42));
    const empty = simulateBattle({ units: { minor_soldier: 50 }, research: {} }, { units: { worker: 40 }, research: {}, allies: [] }, createRng(42));
    expect(empty).toEqual(plain);
    expect(plain.alliesLost).toEqual([]);
  });

  it('allies fight on the defending side and are counted per group, with their own research', () => {
    const attacker = { units: { minor_soldier: 60 }, research: {} };
    const alone = simulateBattle(attacker, { units: {}, research: {} }, createRng(5));
    expect(alone.winner).toBe('attacker');
    const r = simulateBattle(attacker, { units: {}, research: {}, allies: [{ units: { minor_soldier: 80 }, research: { chitin: 5 } }, { units: { worker: 10 }, research: {} }] }, createRng(5));
    expect(r.winner).not.toBe('attacker');
    expect(r.alliesLost).toHaveLength(2);
    expect((r.alliesSurvivors[0].minor_soldier ?? 0) + (r.alliesLost[0].minor_soldier ?? 0)).toBe(80);
    expect((r.alliesSurvivors[1].worker ?? 0) + (r.alliesLost[1].worker ?? 0)).toBe(10);
    // the host's own counts stay separate
    expect(r.defenderLost).toEqual({});
  });
});
