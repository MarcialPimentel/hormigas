// The battle replay reads a report's numbers faithfully (client/src/components/patch3d/battle.ts).
import { describe, expect, it } from 'vitest';
import { TIMING, drawnFor, momentAt, planBattle, replayLength } from '../src/components/patch3d/battle';

const report = (o: any = {}) => ({
  winner: 'defender',
  perspective: 'defender',
  target: { region: 1, patch: 2, spot: 3 },
  attacker: { name: 'Raider', wild: false, origin: { region: 1, patch: 2, spot: 7 }, units: { minor_soldier: 80, worker: 20 } },
  defender: { name: 'Me', colony: 'My Hill', units: { major_soldier: 30, worker: 10 }, defenses: { pit_trap: 10 } },
  rounds: [
    { round: 1, attackerRemaining: 70, defenderRemaining: 45 },
    { round: 2, attackerRemaining: 30, defenderRemaining: 40 },
    { round: 3, attackerRemaining: 0, defenderRemaining: 38 },
  ],
  ...o,
});

describe('planBattle', () => {
  it('reads both sides, the rounds and the winner', () => {
    const p = planBattle(report())!;
    expect(p.attacker.start).toBe(100);
    expect(p.defender.start).toBe(50); // units plus defenses
    expect(p.attacker.left).toEqual([70, 30, 0]);
    expect(p.defender.left).toEqual([45, 40, 38]);
    expect(p.winner).toBe('defender');
    expect(p.attacker.soldiers).toBeCloseTo(0.8);
    expect(p.defender.name).toBe('My Hill');
  });

  it('calls your own raiders "Your raiders", not your username', () => {
    expect(planBattle(report({ perspective: 'attacker' }))!.attacker.name).toBe('Your raiders');
    expect(planBattle(report())!.attacker.name).toBe('Raider');
  });

  it('knows a swarm by its name', () => {
    expect(planBattle(report({ attacker: { name: 'Army ant swarm', wild: true, units: { minor_soldier: 40, major_soldier: 10 } } }))!.attacker.swarm).toBe(true);
  });

  it('counts allied soldiers holding position with the defender', () => {
    const p = planBattle(report({ defender: { colony: 'My Hill', units: { worker: 10 }, allies: [{ units: { major_soldier: 25 } }] }, rounds: [{ round: 1, attackerRemaining: 60, defenderRemaining: 30 }] }))!;
    expect(p.defender.start).toBe(35);
  });

  it('never lets the remaining count rise or pass the start', () => {
    const p = planBattle(report({ rounds: [{ round: 1, attackerRemaining: 150, defenderRemaining: 20 }, { round: 2, attackerRemaining: 90, defenderRemaining: 25 }] }))!;
    expect(p.attacker.left).toEqual([100, 90]);
    expect(p.defender.left).toEqual([20, 20]);
  });

  it('has nothing to show for a raid that turned back or a report without rounds', () => {
    expect(planBattle({ turnedBack: true, target: { region: 1, patch: 1, spot: 1 } })).toBeNull();
    expect(planBattle(report({ rounds: [] }))).toBeNull();
    expect(planBattle(null)).toBeNull();
  });
});

describe('momentAt', () => {
  const p = planBattle(report())!;
  it('marches in at full strength, then ends each round on the report\'s numbers', () => {
    expect(momentAt(p, 0)).toMatchObject({ phase: 'approach', attackers: 100, defenders: 50 });
    const endOfRound2 = TIMING.approach + 2 * TIMING.round - 1e-6;
    expect(momentAt(p, endOfRound2)).toMatchObject({ phase: 'fight', round: 2, attackers: 30, defenders: 40 });
    expect(momentAt(p, TIMING.approach + 3 * TIMING.round + 0.1)).toMatchObject({ phase: 'outcome', attackers: 0, defenders: 38 });
    expect(momentAt(p, replayLength(p) + 1).phase).toBe('done');
  });

  it('only ever loses ants during a fight', () => {
    let a = Infinity, d = Infinity;
    for (let t = 0; t < replayLength(p) + 1; t += 0.05) {
      const m = momentAt(p, t);
      expect(m.attackers).toBeLessThanOrEqual(a);
      expect(m.defenders).toBeLessThanOrEqual(d);
      a = m.attackers;
      d = m.defenders;
    }
  });
});

describe('drawnFor', () => {
  it('scales the drawn ants with the real ones, and shows at least one while any are alive', () => {
    expect(drawnFor(1000, 1000, 300)).toBe(300);
    expect(drawnFor(500, 1000, 300)).toBe(150);
    expect(drawnFor(1, 1000, 300)).toBe(1);
    expect(drawnFor(0, 1000, 300)).toBe(0);
  });
});
