// Fast pure tests: the Brood Hall queue, corpse field decay and the founding-task chain.
import { describe, expect, it } from 'vitest';
import {
  FORMULAS, QUESTS, advanceUnitQueue, corpseDecayFactor, corpseFieldAmount, nextQuest, queueEndsAt, queuedCounts, questGoalMet,
  type QuestProgressInput, type QueueItem,
} from '../src';

const item = (over: Partial<QueueItem> = {}): QueueItem => ({ kind: 'caste', id: 'worker', count: 3, done: 0, perUnitMs: 1000, startAt: 0, ...over });

describe('advanceUnitQueue', () => {
  it('a unit comes out exactly when its time is up, not a millisecond before', () => {
    expect(advanceUnitQueue([item()], 999).castes).toEqual({});
    expect(advanceUnitQueue([item()], 1000).castes).toEqual({ worker: 1 });
    expect(advanceUnitQueue([item()], 2999).castes).toEqual({ worker: 2 });
  });

  it('only reports units finished since the last advance', () => {
    const first = advanceUnitQueue([item()], 1500);
    expect(first.queue[0].done).toBe(1);
    const second = advanceUnitQueue(first.queue, 2500);
    expect(second.castes).toEqual({ worker: 1 });
    expect(advanceUnitQueue(second.queue, 2500).castes).toEqual({});
  });

  it('a finished item leaves the queue and the next one starts the moment it ended', () => {
    const q = [item(), item({ kind: 'defense', id: 'pit_trap', count: 2, perUnitMs: 500, startAt: null })];
    const r = advanceUnitQueue(q, 3000);
    expect(r.castes).toEqual({ worker: 3 });
    expect(r.defenses).toEqual({});
    expect(r.queue).toHaveLength(1);
    expect(r.queue[0].startAt).toBe(3000);
    expect(advanceUnitQueue(r.queue, 3500).defenses).toEqual({ pit_trap: 1 });
  });

  it('can finish several items in one advance, and an empty queue stays empty', () => {
    const q = [item({ count: 1 }), item({ id: 'scout', count: 2, startAt: null })];
    const r = advanceUnitQueue(q, 10_000);
    expect(r.castes).toEqual({ worker: 1, scout: 2 });
    expect(r.queue).toEqual([]);
    expect(advanceUnitQueue([], 10_000)).toEqual({ queue: [], castes: {}, defenses: {} });
  });

  it('never counts time before the item started', () => {
    expect(advanceUnitQueue([item({ startAt: 5000 })], 1000).castes).toEqual({});
  });

  it('does not change the queue it was given', () => {
    const q = [item()];
    advanceUnitQueue(q, 5000);
    expect(q[0]).toEqual(item());
  });
});

describe('queueEndsAt and queuedCounts', () => {
  it('the queue ends after every item, counted from the head start', () => {
    expect(queueEndsAt([])).toBeNull();
    expect(queueEndsAt([item({ startAt: null })])).toBeNull();
    expect(queueEndsAt([item({ startAt: 100 })])).toBe(3100);
    expect(queueEndsAt([item({ startAt: 100 }), item({ count: 2, perUnitMs: 50, startAt: null })])).toBe(3200);
  });

  it('ends exactly when the last unit comes out', () => {
    const q = [item(), item({ id: 'scout', count: 2, perUnitMs: 700, startAt: null })];
    const end = queueEndsAt(q)!;
    expect(advanceUnitQueue(q, end - 1).queue).toHaveLength(1);
    expect(advanceUnitQueue(q, end).queue).toHaveLength(0);
  });

  it('counts what is still waiting, by id', () => {
    expect(queuedCounts([item({ done: 1 }), item({ count: 4, startAt: null })])).toEqual({ worker: 6 });
  });
});

describe('corpse field decay', () => {
  const d = FORMULAS.combat.corpseDecay;
  const H = 3600_000;

  it('stays whole until decay starts, then loses pctPerHour of the original each hour, down to nothing', () => {
    expect(corpseDecayFactor(0, 0)).toBe(1);
    expect(corpseDecayFactor(0, d.startAfterHours * H)).toBe(1);
    expect(corpseDecayFactor(0, (d.startAfterHours + 1) * H)).toBeCloseTo(1 - d.pctPerHour / 100);
    expect(corpseDecayFactor(0, (d.startAfterHours + 100 / d.pctPerHour) * H)).toBe(0);
    expect(corpseDecayFactor(0, (d.startAfterHours + 1000) * H)).toBe(0);
  });

  it('a field never grows, even for a time before it was made', () => {
    expect(corpseDecayFactor(10 * H, 0)).toBe(1);
  });

  it('the amount is the protein times the factor, rounded down', () => {
    const t = (d.startAfterHours + 2.5) * H;
    expect(corpseFieldAmount(1000, 0, t)).toBe(Math.floor(1000 * corpseDecayFactor(0, t)));
    expect(corpseFieldAmount(999, 0, 0)).toBe(999);
    expect(corpseFieldAmount(1000, 0, (d.startAfterHours + 1000) * H)).toBe(0);
  });
});

describe('founding tasks', () => {
  const none: QuestProgressInput = { chambers: {}, units: {}, missionsSent: [], wildRaidsWon: 0 };

  it('hands out tasks in order, skipping claimed ones, and ends with null', () => {
    expect(nextQuest([])?.id).toBe(QUESTS[0].id);
    expect(nextQuest([QUESTS[0].id])?.id).toBe(QUESTS[1].id);
    // the next task is the first unclaimed one, even if a later one was claimed
    expect(nextQuest([QUESTS[1].id])?.id).toBe(QUESTS[0].id);
    expect(nextQuest(QUESTS.map((q) => q.id))).toBeNull();
  });

  it('no task is done at the start', () => {
    for (const q of QUESTS) expect(q.done(none), q.id).toBe(false);
  });

  it('each kind of goal is checked', () => {
    expect(questGoalMet({ chamber: 'leaf_garden', level: 3 }, { ...none, chambers: { leaf_garden: 2 } })).toBe(false);
    expect(questGoalMet({ chamber: 'leaf_garden', level: 3 }, { ...none, chambers: { leaf_garden: 3 } })).toBe(true);
    expect(questGoalMet({ units: 'worker', count: 3 }, { ...none, units: { worker: 2 } })).toBe(false);
    expect(questGoalMet({ units: 'worker', count: 3 }, { ...none, units: { worker: 3 } })).toBe(true);
    expect(questGoalMet({ missionSent: 'forage' }, { ...none, missionsSent: ['scout'] })).toBe(false);
    expect(questGoalMet({ missionSent: 'forage' }, { ...none, missionsSent: ['forage'] })).toBe(true);
    expect(questGoalMet({ wildRaidsWon: 1 }, { ...none, wildRaidsWon: undefined })).toBe(false);
    expect(questGoalMet({ wildRaidsWon: 1 }, { ...none, wildRaidsWon: 1 })).toBe(true);
  });

  it('the chain still leads to the Nectar milestone', () => {
    const nectar = QUESTS.find((q) => q.milestone);
    expect(nectar?.id).toBe('nectar');
    expect(nectar?.done({ ...none, chambers: { aphid_pasture: 1 } })).toBe(true);
  });
});
