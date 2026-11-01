// Build 12: colony needs, the Field Journal and Yesterday in the colony (docs/26-come-back.md).
import { describe, expect, it } from 'vitest';
import {
  CASTES,
  JOURNAL,
  NEEDS,
  NEEDS_RULES,
  STORED_STATS,
  daySummary,
  derivedStats,
  earnedTitles,
  journalTier,
  journalTiers,
  needDay,
  needDayStart,
  needProgress,
  needReward,
  needSeed,
  needTarget,
  needTitle,
  needUnlocked,
  pickNeeds,
  syncColony,
  type ColonyState,
  type NeedInput,
} from '../src';

const fresh: NeedInput = { chambers: { queen_chamber: 1 }, units: {}, stats: {} };
const grown: NeedInput = {
  chambers: { queen_chamber: 8, brood_hall: 4, pheromone_chamber: 3 },
  units: { worker: 40, scout: 2, minor_soldier: 30 },
  stats: { wild_won: 3, herds_claimed: 1 },
};
/** Every stat a need or journal entry may read: stored, per-outcome / per-kind / per-species, or derived. */
const knownStat = (s: string) =>
  (STORED_STATS as readonly string[]).includes(s) || /^(forage|windfall|beat|level|raised):/.test(s) || ['raised', 'castes_raised', 'colonies'].includes(s);

describe('colony needs', () => {
  it('only gives what the player can already do', () => {
    const ids = NEEDS.filter((n) => needUnlocked(n, fresh)).map((n) => n.id);
    expect(ids).toEqual(['digs']);
    const all = NEEDS.filter((n) => needUnlocked(n, grown)).map((n) => n.id);
    expect(all).toEqual(NEEDS.map((n) => n.id));
  });

  it('picks different needs, the same ones for the same seed', () => {
    const a = pickNeeds(grown, needSeed(7, 100), 3).map((n) => n.id);
    expect(new Set(a).size).toBe(3);
    expect(pickNeeds(grown, needSeed(7, 100), 3).map((n) => n.id)).toEqual(a);
    // never one that is already showing
    const b = pickNeeds(grown, needSeed(7, 101), 3, a).map((n) => n.id);
    for (const id of b) expect(a).not.toContain(id);
  });

  it('gives fewer when fewer are possible, never a repeat', () => {
    expect(pickNeeds(fresh, needSeed(1, 1), 3).map((n) => n.id)).toEqual(['digs']);
  });

  it('goals grow with the colony', () => {
    const raise = NEEDS.find((n) => n.id === 'raise')!;
    expect(needTarget(raise, 1)).toBe(10);
    expect(needTarget(raise, 5)).toBe(25);
    expect(needTarget(raise, 13)).toBe(120);
    expect(needTitle(raise, 1200)).toBe('Raise 1,200 ants');
  });

  it('counts from the moment the need was given', () => {
    expect(needProgress(10, 3, 11)).toEqual({ done: 1, ready: false });
    expect(needProgress(10, 3, 20)).toEqual({ done: 3, ready: true });
    expect(needProgress(10, 3, 5)).toEqual({ done: 0, ready: false });
  });

  it('pays a share of production, never less than the floor', () => {
    expect(needReward({ foliage: 0, protein: 0, nectar: 0 })).toEqual(NEEDS_RULES.minReward);
    const r = needReward({ foliage: 10_000, protein: 4_000, nectar: 1_000 });
    expect(r).toEqual({ foliage: 10_000 * NEEDS_RULES.rewardHours, protein: 4_000 * NEEDS_RULES.rewardHours, nectar: 1_000 * NEEDS_RULES.rewardHours });
  });

  it('days start at the same hour every day, shorter at higher world speed', () => {
    const d = needDay(1_800_000_000_000);
    expect(needDay(needDayStart(d))).toBe(d);
    expect(needDay(needDayStart(d) - 1)).toBe(d - 1);
    expect(needDayStart(d + 1) - needDayStart(d)).toBe(86_400_000);
    expect(needDayStart(d + 1, 5) - needDayStart(d, 5)).toBe(86_400_000 / 5);
  });

  it('every need reads a counter that exists', () => {
    for (const n of NEEDS) expect(knownStat(n.stat), n.id).toBe(true);
  });
});

describe('the Field Journal', () => {
  it('entries have unique ids and titles, and read counters that exist', () => {
    expect(new Set(JOURNAL.map((e) => e.id)).size).toBe(JOURNAL.length);
    expect(new Set(JOURNAL.map((e) => e.title)).size).toBe(JOURNAL.length);
    for (const e of JOURNAL) {
      expect(knownStat(e.stat), e.id).toBe(true);
      expect([1, 3]).toContain(e.tiers.length);
      expect([...e.tiers].sort((a, b) => a - b)).toEqual(e.tiers);
    }
  });

  it('nothing hidden is a deed, and no entry depends on a ground', () => {
    for (const e of JOURNAL) {
      if (e.hidden) expect(e.section).toBe('oddities');
      expect(e.stat).not.toMatch(/^terrain|sunny_meadow|sandy_soil|grassland|rotting_log|creek_bank/);
    }
  });

  it('the roster can be completed with castes a player can raise', () => {
    const roster = JOURNAL.find((e) => e.id === 'roster')!;
    const raisable = Object.values(CASTES).filter((c) => c.role !== 'wild').length;
    expect(roster.tiers[roster.tiers.length - 1]).toBeLessThanOrEqual(raisable);
  });

  it('fills in stage by stage, and never goes back', () => {
    const gardener = JOURNAL.find((e) => e.id === 'gardener')!;
    expect(journalTier(gardener, 9)).toBe(0);
    expect(journalTier(gardener, 10)).toBe(1);
    expect(journalTier(gardener, 60)).toBe(3);
    expect(journalTiers({ 'level:leaf_garden': 5 }, { gardener: 2 }).gardener).toBe(2);
    expect(earnedTitles(journalTiers({ 'level:leaf_garden': 12 }))).toEqual(['Gardener']);
  });

  it('counts chambers and ants across every colony', () => {
    const s = derivedStats([
      { chambers: { leaf_garden: 20 }, raised: { worker: 30, scout: 2 } },
      { chambers: { leaf_garden: 15 }, raised: { worker: 10, minor_soldier: 5, termite_worker: 99 } },
    ]);
    expect(s['level:leaf_garden']).toBe(35);
    expect(s.raised).toBe(47); // wild castes don't count
    expect(s['raised:worker']).toBe(40);
    expect(s.castes_raised).toBe(3);
    expect(s.colonies).toBe(2);
  });
});

describe('ants raised', () => {
  it('a colony counts the ants as they hatch', () => {
    const start = 1_000_000;
    const state: ColonyState = {
      terrain: 'grassland', chambers: {}, units: {}, defenses: {}, resources: { foliage: 0, protein: 0, nectar: 0 }, lastUpdated: start,
      unitQueue: [{ kind: 'caste', id: 'worker', count: 5, done: 0, perUnitMs: 1000, startAt: start }],
      raised: { worker: 2 },
    };
    const later = syncColony(state, start + 3_500);
    expect(later.units.worker).toBe(3);
    expect(later.raised?.worker).toBe(5);
    // wild nests have no tally and get none
    const { raised: _r, ...wild } = state;
    expect('raised' in syncColony(wild, start + 3_500)).toBe(false);
  });
});

describe('Yesterday in the colony', () => {
  it('lists what went up, in plain words', () => {
    const rows = daySummary({ food_home: 2500, raised: 13, digs: 4, scouted: 1 }, { food_home: 1000, raised: 12, digs: 4 });
    expect(rows.map((r) => r.text)).toEqual(['1,500 food carried home', '1 ant raised', '1 place scouted']);
  });
});
