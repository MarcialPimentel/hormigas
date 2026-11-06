// Joint raids (Build 19, docs/23-supercolonies.md § Joint raids): several players' armies fighting as one side.
import { describe, expect, it } from 'vitest';
import { createRng, simulateBattle, splitLoot, armyWorth, res, jointLeadMs, boardPostProblem, BOARD, JOINT_RAID, total } from '../src';

const A = { minor_soldier: 200, major_soldier: 60 };
const B = { minor_soldier: 100 };
const NEST = { units: { minor_soldier: 150, major_soldier: 40 }, research: {} };

describe('joint raids', () => {
  it('each member fights as their own group and gets their own losses and survivors back', () => {
    const r = simulateBattle({ units: {}, research: {}, allies: [{ units: A, research: {} }, { units: B, research: { mandibles: 3 } }] }, NEST, createRng(7));
    expect(r.attackerAlliesLost).toHaveLength(2);
    for (const [i, start] of [A, B].entries())
      for (const [id, n] of Object.entries(start))
        expect((r.attackerAlliesLost[i] as any)[id] ?? 0).toBe(n - ((r.attackerAlliesSurvivors[i] as any)[id] ?? 0));
    expect(r.attackerLost).toEqual({});
  });

  it('fights exactly like one army when everyone has the same research', () => {
    const joint = simulateBattle({ units: {}, research: {}, allies: [{ units: A, research: {} }, { units: B, research: {} }] }, NEST, createRng(3));
    const solo = simulateBattle({ units: { minor_soldier: 300, major_soldier: 60 }, research: {} }, NEST, createRng(3));
    expect(joint.winner).toBe(solo.winner);
  });

  it('battles without groups run as before: no attacker groups in the result', () => {
    const r = simulateBattle({ units: A, research: {} }, NEST, createRng(1));
    expect(r.attackerAlliesLost).toEqual([]);
  });

  it('loot is split by army worth, and nobody takes more than they can carry', () => {
    const loot = res(9000, 3000, 0);
    const [a, b] = splitLoot(loot, [{ worth: armyWorth(A), cargo: 1e9 }, { worth: armyWorth(B), cargo: 1e9 }]);
    expect(total(a) / total(b)).toBeCloseTo(armyWorth(A) / armyWorth(B), 1);
    const [c] = splitLoot(loot, [{ worth: 1, cargo: 500 }]);
    expect(total(c)).toBe(500);
  });

  it('a joint raid lands 2 to 24 hours ahead, faster on a fast world; board posts are short', () => {
    expect(jointLeadMs(1)).toEqual([JOINT_RAID.leadHours[0] * 3600_000, JOINT_RAID.leadHours[1] * 3600_000]);
    expect(jointLeadMs(5)[1]).toBe(jointLeadMs(1)[1] / 5);
    expect(boardPostProblem('  ')).not.toBeNull();
    expect(boardPostProblem('x'.repeat(BOARD.postLength + 1))).not.toBeNull();
    expect(boardPostProblem('Spider den at 1:68:16, landing tonight')).toBeNull();
  });
});
