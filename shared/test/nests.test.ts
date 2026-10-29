import { describe, expect, it } from 'vitest';
import {
  NEST_SPECIES, NEST_MAX_LEVEL, nestAt, nestUnitsAt, nestLevelFor, nestRaidParty, nestTargets, previewBattle, speciesForTerrain,
  total, unitsValue, maxLevel, regrowHours, nestRaidsBack, speciesOfKind, SPECIES, NPC_DATA,
  herdHoneydewAt, herdLevelFor, herdNectarPerHour, herdStoreCap, wildThingsAround, isSiteSpot, validCoords,
  type UnitCounts, type NestSpecies, CASTES,
} from '../src';

// A fair army for a player whose patch is at each nest level (docs/17-wild-nests.md, tuning check).
const FAIR: Record<number, UnitCounts> = {
  1: { minor_soldier: 8 },
  2: { minor_soldier: 20 },
  3: { minor_soldier: 20, major_soldier: 12 },
  4: { minor_soldier: 80, major_soldier: 10 },
  5: { minor_soldier: 150, major_soldier: 40 },
  6: { minor_soldier: 250, major_soldier: 100 },
};
const half = (u: UnitCounts): UnitCounts => Object.fromEntries(Object.entries(u).map(([k, n]) => [k, Math.floor(n! / 2)]));

describe('wild nests', () => {
  it('terrain picks the species', () => {
    expect(NEST_SPECIES).toEqual(['pavement', 'fire', 'carpenter', 'honeypot', 'trapjaw']);
    // with a random pick, new species turn up on their terrains
    const seen = new Set<NestSpecies>();
    for (let i = 0; i < 20; i++) seen.add(speciesForTerrain('sandy_soil', () => i / 20));
    expect([...seen].sort()).toEqual(['fire', 'honeypot']);
    expect(speciesForTerrain('sandy_soil')).toBe('fire');
    expect(speciesForTerrain('rotting_log')).toBe('carpenter');
    expect(speciesForTerrain('sunny_meadow')).toBe('pavement');
    expect(speciesForTerrain('creek_bank')).toBe('pavement');
  });

  it('level follows the patch leader and never drops', () => {
    expect(nestLevelFor(0)).toBe(1);
    expect(nestLevelFor(19)).toBe(1);
    expect(nestLevelFor(20)).toBe(2);
    expect(nestLevelFor(250)).toBe(4);
    expect(nestLevelFor(1e9)).toBe(NEST_MAX_LEVEL);
    expect(nestLevelFor(0, 3)).toBe(3);
  });

  it('regrows in a straight line to full over 24 h, scaled by world speed', () => {
    const state = { species: 'pavement' as const, level: 2, at: 0 };
    const full = nestTargets('pavement', 2);
    const empty = { units: {}, defenses: {}, resources: { foliage: 0, protein: 0, nectar: 0 } };
    const h12 = nestAt(state, empty, 12 * 3600_000);
    expect(h12.units.minor_soldier).toBe(Math.floor(full.units.minor_soldier! / 2));
    expect(h12.resources.foliage).toBeCloseTo(full.resources.foliage / 2, 6);
    expect(nestAt(state, empty, 48 * 3600_000)).toEqual(full);
    expect(nestAt(state, empty, 12 * 3600_000, 2)).toEqual(full);
    // loot carried home above the store stays until someone takes it
    const rich = { ...full, resources: { foliage: 99999, protein: 0, nectar: 0 } };
    expect(nestAt(state, rich, 3600_000).resources.foliage).toBe(99999);
  });

  it('a nest saved every hour (scouted, raided) still regrows fully in 24 h', () => {
    const full = nestTargets('pavement', 1);
    let state: { species: 'pavement'; level: number; at: number; unitsAt?: number } = { species: 'pavement', level: 1, at: 0 };
    let saved = { units: {}, defenses: {}, resources: { foliage: 0, protein: 0, nectar: 0 } };
    for (let h = 1; h <= 24; h++) {
      const t = h * 3600_000;
      const unitsAt = nestUnitsAt(state, saved, t);
      saved = nestAt(state, saved, t) as typeof saved;
      state = { ...state, at: t, unitsAt };
    }
    expect(saved.units).toEqual(full.units);
  });

  it('a fair army beats every nest at its level with moderate losses; half of it pays far more', () => {
    for (const species of NEST_SPECIES) {
      for (let level = 1; level <= NEST_MAX_LEVEL; level++) {
        const nest = nestTargets(species, level);
        const defender = { units: nest.units, defenses: nest.defenses, research: {} };
        const fair = previewBattle({ units: FAIR[level], research: {} }, defender, { runs: 60 });
        const lossShare = fair.avgAttackerLossValue / total(unitsValue(FAIR[level]));
        expect(fair.winRate, `${species} L${level}`).toBeGreaterThanOrEqual(0.9);
        expect(lossShare, `${species} L${level} losses`).toBeLessThan(0.45);
        const weakArmy = half(FAIR[level]);
        const weak = previewBattle({ units: weakArmy, research: {} }, defender, { runs: 60 });
        const weakLoss = weak.avgAttackerLossValue / total(unitsValue(weakArmy));
        expect(weakLoss, `${species} L${level} half army losses`).toBeGreaterThan(0.45);
      }
    }
  });

  it('raid parties are a small share of the soldiers, capped by the target, never Workers', () => {
    const home = { worker: 30, minor_soldier: 90, major_soldier: 35 };
    const p = nestRaidParty(home, 1500);
    expect(p.worker).toBeUndefined();
    expect(p.minor_soldier).toBe(27);
    expect(p.major_soldier).toBe(11);
    const weakTarget = nestRaidParty(home, 5); // worth at most 500 resources
    expect(total(unitsValue(weakTarget))).toBeLessThanOrEqual(1000);
    expect(weakTarget.minor_soldier).toBe(2); // the minimum party still goes
    expect(nestRaidParty({ worker: 4 }, 100)).toEqual({});
  });
});

// Termite mounds and spider dens (docs/23-npcs.md, tuning check). The armies a player is expected to bring.
const MOUND_FAIR: UnitCounts[] = [
  { minor_soldier: 120, major_soldier: 40 },
  { minor_soldier: 250, major_soldier: 110 },
  { minor_soldier: 450, major_soldier: 220 },
];
const DEN_FAIR: UnitCounts[] = [
  { minor_soldier: 250, major_soldier: 100 }, // a solo player around day 30 (the level-6 fair army)
  { minor_soldier: 450, major_soldier: 220 }, // a bigger army, or several players together later (Alliances)
];

describe('termite mounds and spider dens', () => {
  const fight = (army: UnitCounts, species: NestSpecies, level: number) => {
    const t = nestTargets(species, level);
    const r = previewBattle({ units: army, research: {} }, { units: t.units, defenses: t.defenses, research: {} }, { runs: 40 });
    return { win: r.winRate, loss: r.avgAttackerLossValue / total(unitsValue(army)) };
  };

  it('have their own tiers, stores and slow regrowth, and never raid', () => {
    const mound = speciesOfKind('mound');
    const den = speciesOfKind('den');
    expect([mound, den]).toEqual(['termite', 'spider']);
    expect(maxLevel(mound)).toBe(3);
    expect(maxLevel(den)).toBe(2);
    expect(regrowHours(mound)).toBe(72);
    expect(regrowHours(den)).toBe(168);
    expect(regrowHours('pavement')).toBe(24);
    expect(nestRaidsBack(mound) || nestRaidsBack(den)).toBe(false);
    expect(nestRaidsBack('pavement')).toBe(true);
    // tiers follow their own thresholds and never drop
    expect(nestLevelFor(0, 1, mound)).toBe(1);
    expect(nestLevelFor(700, 1, mound)).toBe(2);
    expect(nestLevelFor(1e9, 1, mound)).toBe(3);
    expect(nestLevelFor(1e9, 1, den)).toBe(2);
    expect(nestLevelFor(0, 2, den)).toBe(2);
    // a mound holds far more than a nest of the level its fair army beats
    expect(total(nestTargets(mound, 1).resources)).toBeGreaterThan(3 * total(nestTargets('pavement', 4).resources));
    // honeypot ants hoard Nectar
    expect(nestTargets('honeypot', 3).resources.nectar).toBeGreaterThan(2 * nestTargets('pavement', 3).resources.nectar);
  });

  it('a fair army takes a mound with real losses; half of it is wiped out', () => {
    MOUND_FAIR.forEach((army, i) => {
      const fair = fight(army, 'termite', i + 1);
      expect(fair.win, `mound ${i + 1}`).toBeGreaterThanOrEqual(0.9);
      expect(fair.loss, `mound ${i + 1} losses`).toBeLessThan(0.45);
      expect(fight(half(army), 'termite', i + 1).win, `mound ${i + 1} half`).toBeLessThan(0.2);
    });
  });

  it('the spider is a boss: a fair army brings her down, half of it never does', () => {
    DEN_FAIR.forEach((army, i) => {
      const fair = fight(army, 'spider', i + 1);
      expect(fair.win, `den ${i + 1}`).toBeGreaterThanOrEqual(0.9);
      expect(fair.loss, `den ${i + 1} losses`).toBeLessThan(0.4);
      expect(fight(half(army), 'spider', i + 1).win, `den ${i + 1} half`).toBeLessThan(0.1);
    });
    // a day-14 army (level-5 fair) can't take even the first tier alone
    expect(fight(FAIR[5], 'spider', 1).win).toBeLessThan(0.1);
    // tier 2 is out of reach for one day-30 army: a target for several players
    expect(fight(DEN_FAIR[0], 'spider', 2).win).toBeLessThan(0.1);
  });

  it('every unit a wild thing fields exists, and the NPC-only ones are never raised by players', () => {
    for (const s of Object.keys(SPECIES) as NestSpecies[])
      for (const l of SPECIES[s].levels)
        for (const id of Object.keys(l.units)) {
          const def = (CASTES as any)[id];
          expect(def, `${s} ${id}`).toBeTruthy();
          if (def.npcOnly) expect(def.mvp).toBe(false);
        }
    void NPC_DATA;
  });
});

describe('aphid herds', () => {
  it('make honeydew only while tended, up to the store cap, faster at higher world speed', () => {
    const state = { kind: 'herd' as const, level: 3, at: 0, tender: { playerId: 1, colonyId: 1, since: 0 }, untendedSince: null };
    const rate = herdNectarPerHour(3);
    expect(herdHoneydewAt(state, 0, 2 * 3600_000)).toBeCloseTo(2 * rate, 6);
    expect(herdHoneydewAt(state, 0, 2 * 3600_000, 5)).toBeCloseTo(10 * rate, 6);
    expect(herdHoneydewAt(state, 0, 1000 * 3600_000)).toBe(herdStoreCap(3));
    expect(herdHoneydewAt({ ...state, tender: null }, 7, 1000 * 3600_000)).toBe(7);
  });

  it('yield grows with the area leader like nest levels, and stays a side income', () => {
    expect(herdLevelFor(0)).toBe(1);
    expect(herdLevelFor(250)).toBe(4);
    expect(herdLevelFor(0, 5)).toBe(5);
    for (let l = 2; l <= 6; l++) expect(herdNectarPerHour(l)).toBeGreaterThan(herdNectarPerHour(l - 1));
    // at the end of the pacing run an engaged colony makes ~520 Nectar/h (docs/16-milestones.md); a top herd is well under half
    expect(herdNectarPerHour(6)).toBeLessThan(520 / 2);
  });
});

describe('where wild things live', () => {
  it('a nest and herd within 2 patches, a mound every 5 patches, a den every 10, all in the same region', () => {
    const around = wildThingsAround(2, 10);
    const of = (thing: string) => around.filter((w) => w.thing === thing).map((w) => w.patch);
    expect(of('nest')).toEqual([8, 9, 10, 11, 12]);
    expect(of('herd')).toEqual([8, 9, 10, 11, 12]);
    expect(of('mound')).toEqual([8]);
    expect(of('den')).toEqual([8]);
    expect(around.every((w) => w.region === 2)).toBe(true);
    // every patch has a den within reach, edges included
    for (let p = 1; p <= 100; p++) expect(wildThingsAround(1, p).some((w) => w.thing === 'den'), `patch ${p}`).toBe(true);
    for (let p = 1; p <= 100; p++) expect(wildThingsAround(1, p).some((w) => w.thing === 'mound'), `patch ${p}`).toBe(true);
  });

  it('sites are extra spots in the wilds, never colony spots', () => {
    expect(isSiteSpot(14) && isSiteSpot(15) && isSiteSpot(16)).toBe(true);
    expect(isSiteSpot(12) || isSiteSpot(13)).toBe(false);
    expect(validCoords({ region: 1, patch: 1, spot: 15 })).toBe(false);
    expect(validCoords({ region: 1, patch: 1, spot: 15 }, false, true)).toBe(true);
    expect(validCoords({ region: 1, patch: 1, spot: 17 }, true, true)).toBe(false);
  });
});
