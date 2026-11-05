// The Matabele Ant (docs/05-castes-units.md#planned-the-matabele-ant): earned by beating termite mounds, strong
// against termites, an ordinary soldier against everything else. The Termites journal page grows with it.
import { describe, expect, it } from 'vitest';
import {
  CASTES, DEED_COUNTERS, FAIR_MOUND_ARMIES, PLAYER_SOLDIERS, broodBlocker, buyCaste, createRng, evenMix, journalEntry, matchup,
  missingRequirements, nestCheck, simulateBattle, titleFor, total, unitsValue,
} from '../src';

describe('Matabele Ant', () => {
  it('unlocks after 3 termite mounds beaten, not by research', () => {
    const chambers = { brood_hall: 2 };
    expect(DEED_COUNTERS).toContain('beat:termite');
    expect(missingRequirements(CASTES.matabele.unlock, chambers, {}).map((m) => m.key)).toEqual(['deed.beat:termite']);
    expect(missingRequirements(CASTES.matabele.unlock, chambers, {}, { 'beat:termite': 2 })[0]).toMatchObject({ need: 3, have: 2 });
    expect(missingRequirements(CASTES.matabele.unlock, chambers, {}, { 'beat:termite': 3 })).toEqual([]);
    const colony = { chambers, resources: { foliage: 1e6, protein: 1e6, nectar: 1e6 }, unitQueue: [] } as any;
    expect(broodBlocker('caste', 'matabele', CASTES.matabele, 1, colony, { research: {}, deeds: { 'beat:termite': 1 } })?.short).toBe('Needs Termite mounds beaten: 1/3');
    expect(broodBlocker('caste', 'matabele', CASTES.matabele, 1, colony, { research: {}, deeds: { 'beat:termite': 3 } })).toBeNull();
  });

  it('beats termite mounds losing well under half of what Major Soldiers lose', () => {
    for (const [i, army] of FAIR_MOUND_ARMIES.entries()) {
      const spend = total(unitsValue(army));
      const mat = nestCheck('termite', i + 1, buyCaste('matabele', spend), 50).fair;
      const maj = nestCheck('termite', i + 1, buyCaste('major_soldier', spend), 50).fair;
      expect(mat.winRate).toBeGreaterThanOrEqual(0.95);
      expect(mat.lossShare).toBeLessThan(maj.lossShare / 2);
      expect(mat.lossShare).toBeGreaterThan(0.02); // a mound still costs something
    }
  });

  it('is no better than a Major Soldier against ants (pillar 3)', () => {
    const budget = 44000;
    const vsMix = (id: 'matabele' | 'major_soldier') => matchup(id, buyCaste(id, budget), 'mix', evenMix(budget, PLAYER_SOLDIERS), {}, { runs: 50 }).defenderLost;
    expect(vsMix('matabele')).toBeLessThanOrEqual(vsMix('major_soldier') * 1.1);
    // Majors crush Acid Sprayers; Matabele Ants don't
    expect(matchup('m', buyCaste('matabele', budget), 'a', buyCaste('acid_sprayer', budget), {}, { runs: 50 }).winRate).toBeLessThan(0.2);
  });

  it('carries its wounded home only from won fights against termites', () => {
    const vsTermites = simulateBattle({ units: { matabele: 100 }, research: {} }, { units: { termite_worker: 300, termite_soldier: 60 }, research: {} }, createRng(1));
    expect(vsTermites.winner).toBe('attacker');
    expect(vsTermites.rescued?.matabele ?? 0).toBeGreaterThan(0);
    // rescued ants are survivors, not losses
    expect((vsTermites.attackerSurvivors.matabele ?? 0) + (vsTermites.attackerLost.matabele ?? 0)).toBe(100);
    const vsAnts = simulateBattle({ units: { matabele: 100 }, research: {} }, { units: { minor_soldier: 60 }, research: {} }, createRng(1));
    expect(vsAnts.attackerLost.matabele ?? 0).toBeGreaterThan(0);
    expect(vsAnts.winner).toBe('attacker');
    expect(vsAnts.rescued).toBeUndefined();
  });
});

describe('Termites journal page', () => {
  it('grows over three stages, with a title for each', () => {
    const e = journalEntry('termite')!;
    expect(e.tiers).toEqual([1, 10, 50]);
    expect([1, 2, 3].map((t) => titleFor(e, t))).toEqual(['Mound-breaker', 'Termite-hunter', 'Bane of the Mounds']);
    // pages without stage titles keep their one title
    expect(titleFor(journalEntry('spider')!, 1)).toBe('Spider-slayer');
  });
});
