// Wild ants come for windfalls, and the new kinds (docs/25-windfalls.md#wild-ants-come-for-windfalls).
import { describe, expect, it } from 'vitest';
import {
  WINDFALLS, WINDFALL_KINDS, WILD_PARTIES, eatsWindfall, wildCarry, wildPartiesFor, wildWindfallParty, windfallLastsHours, windfallLoadCap,
} from '../src';

describe('who comes for what', () => {
  it('each species goes for the food it really eats', () => {
    expect(eatsWindfall('honeypot', 'fig')).toBe(true);
    expect(eatsWindfall('termite', 'fig')).toBe(false);
    expect(eatsWindfall('termite', 'branch')).toBe(true);
    expect(eatsWindfall('fire', 'grasshopper')).toBe(true);
    expect(eatsWindfall('honeypot', 'sugar')).toBe(true);
    // anyone comes for a lizard or a picnic, but spiders never leave the den
    for (const s of ['pavement', 'termite', 'honeypot']) expect(eatsWindfall(s, 'picnic')).toBe(true);
    for (const k of WINDFALL_KINDS) expect(eatsWindfall('spider', k)).toBe(false);
    // every kind has somebody who eats it
    for (const k of WINDFALL_KINDS) expect(WINDFALLS.kinds[k].eaters.length).toBeGreaterThan(0);
  });

  it('a picnic always draws several parties; the rest one, by chance', () => {
    expect(wildPartiesFor('picnic', () => 0.99)).toBe(WINDFALLS.kinds.picnic.parties);
    expect(wildPartiesFor('grasshopper', () => 0)).toBe(1);
    expect(wildPartiesFor('grasshopper', () => 0.99)).toBe(WILD_PARTIES.chance >= 0.99 ? 1 : 0);
  });

  it('a party is a share of each kind the nest has', () => {
    expect(wildWindfallParty({ minor_soldier: 50, worker: 20, scout: 1 })).toEqual({
      minor_soldier: Math.floor(50 * WILD_PARTIES.partyShare), worker: Math.floor(20 * WILD_PARTIES.partyShare),
    });
    expect(wildWindfallParty({ minor_soldier: 1 })).toEqual({});
    // termites carry nothing as a caste, so wild holders carry by the mouthful
    expect(wildCarry({ termite_worker: 10 })).toBe(10 * WILD_PARTIES.carryEach);
  });
});

describe('new kinds', () => {
  it('sugar dries fast, a beetle is slow to strip, the rest keep the usual rules', () => {
    expect(windfallLastsHours('sugar')).toBeLessThan(windfallLastsHours('grasshopper'));
    expect(windfallLastsHours('grasshopper')).toBe(WINDFALLS.lastsHours);
    expect(windfallLoadCap('beetle', 1000)).toBe(500);
    expect(windfallLoadCap('fig', 1000)).toBe(1000);
    expect(windfallLoadCap(undefined, 1000)).toBe(1000);
  });
});
