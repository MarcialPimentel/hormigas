// The design numbers in docs/data/*.json drive the game. These tests catch a typo in the data
// (which would otherwise turn into NaN in players' resources) and check the code really reads the data.
import { describe, expect, it } from 'vitest';
import {
  CASTES, CASTE_IDS, CHAMBERS, CHAMBER_IDS, DEFENSES, DEFENSE_IDS, FORMULAS, NEST_EVENTS_DATA, NEST_RAIDS, NPC_DATA, QUESTS, RESEARCH,
  RESOURCES_DATA, RESOURCE_IDS, SPECIES, SWARM, TERRAIN, distance, maxColonies, missionSlots, protectedForLevel, storageCapacity, storageForLevel, unitSpeed,
} from '../src';

/** Every number inside a JSON value, with its path, so a failure names the bad field. */
function numbers(v: unknown, path: string, out: [string, number][] = []): [string, number][] {
  if (typeof v === 'number') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => numbers(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) numbers(x, `${path}.${k}`, out);
  return out;
}

describe('data numbers', () => {
  it('every number in the data files is a real, non-negative number (research *Pct effects may be negative)', () => {
    const all = [
      ...numbers(FORMULAS, 'formulas'), ...numbers(RESOURCES_DATA, 'resources'), ...numbers(CHAMBERS, 'chambers'),
      ...numbers(CASTES, 'castes'), ...numbers(DEFENSES, 'defenses'), ...numbers(RESEARCH, 'research'),
    ];
    expect(all.length).toBeGreaterThan(100);
    const bad = all.filter(([p, n]) => !Number.isFinite(n) || (n < 0 && !/^research\.\w+\.effect\.\w+Pct$/.test(p))).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it('terrain, wild nests, swarms and nest events have real numbers too (only *Pct bonuses may be negative)', () => {
    const all = [...numbers(TERRAIN, 'terrain'), ...numbers(NPC_DATA, 'npc'), ...numbers(NEST_EVENTS_DATA, 'nestEvents')];
    expect(all.length).toBeGreaterThan(50);
    const bad = all.filter(([p, n]) => !Number.isFinite(n) || (n < 0 && !/Pct$/.test(p))).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it('swarm numbers make sense', () => {
    expect(SWARM.everyHours[0]).toBeLessThanOrEqual(SWARM.everyHours[1]);
    expect(SWARM.warningHours).toBeGreaterThan(0);
    expect(SWARM.minPacks).toBeGreaterThanOrEqual(1);
    expect(SWARM.minPacks).toBeLessThanOrEqual(SWARM.maxPacks);
    expect(SWARM.defenderWinRate).toBeGreaterThan(0);
    expect(SWARM.defenderWinRate).toBeLessThanOrEqual(1);
    for (const id of Object.keys(SWARM.pack)) expect(CASTES[id as keyof typeof CASTES], id).toBeTruthy();
  });

  it('the formula numbers the code reads are present', () => {
    const f = FORMULAS;
    const needed = [
      f.cost.researchCostFactor, f.production.levelGrowth, f.storage.capacityGrowth, f.storage.protectedBase,
      f.storage.protectedGrowth, f.buildTime.chamberDivisor, f.buildTime.unitDivisor, f.buildTime.researchDivisor,
      f.distance.sameSpot, f.distance.samePatchBase, f.distance.samePatchPerSpot, f.distance.sameRegionBase,
      f.distance.sameRegionPerPatch, f.distance.otherRegionPerRegion, f.travel.baseSeconds, f.travel.timeScale,
      f.travel.fuelDivisor, f.scouting.detectionPerUnitPerScout, f.scouting.detectionScentBase,
      f.pvp.lateFoundingMinMultiplier, f.points.resourcesPerPoint, f.missions.baseSlots, f.missions.baseForageSlots,
      f.colonies.base,
    ];
    for (const n of needed) expect(Number.isFinite(n)).toBe(true);
    // divisors must not be zero
    for (const d of [f.buildTime.chamberDivisor, f.buildTime.unitDivisor, f.buildTime.researchDivisor, f.travel.fuelDivisor, f.points.resourcesPerPoint])
      expect(d).toBeGreaterThan(0);
  });

  it('caste and defense frenzy targets are real castes or defenses', () => {
    const ids = new Set<string>([...CASTE_IDS, ...DEFENSE_IDS]);
    const all = [...CASTE_IDS.map((id) => [id, CASTES[id].frenzy] as const), ...DEFENSE_IDS.map((id) => [id, DEFENSES[id].frenzy] as const)];
    for (const [id, frenzy] of all) for (const target of Object.keys(frenzy ?? {})) expect(ids.has(target), `${id}.frenzy.${target}`).toBe(true);
  });

  it('wild nest species only use real castes and defenses', () => {
    for (const [species, def] of Object.entries(SPECIES)) {
      def.levels.forEach((l, i) => {
        for (const k of Object.keys(l.units)) expect(CASTE_IDS as readonly string[], `${species} level ${i + 1} unit ${k}`).toContain(k);
        for (const k of Object.keys(l.defenses)) expect(DEFENSE_IDS as readonly string[], `${species} level ${i + 1} defense ${k}`).toContain(k);
      });
      for (const k of Object.keys(def.stockPct ?? {})) expect(RESOURCE_IDS as readonly string[], `${species}.stockPct.${k}`).toContain(k);
    }
    for (const k of Object.keys(NEST_RAIDS.minParty)) expect(CASTE_IDS as readonly string[], `raids.minParty.${k}`).toContain(k);
  });

  it('nest events give real resources (or nothing)', () => {
    for (const [id, e] of Object.entries(NEST_EVENTS_DATA.events)) {
      if (e.resource !== null) expect(RESOURCE_IDS as readonly string[], `${id}.resource`).toContain(e.resource);
    }
  });

  it('forage tuning names real outcomes and resources', () => {
    const f = FORMULAS.forage;
    const outcomes = Object.keys(f.outcomes);
    for (const k of [...f.luck.takeFrom, ...Object.keys(f.luck.giveToPct), f.firstTripOutcome]) expect(outcomes, k).toContain(k);
    expect(Object.values(f.luck.giveToPct).reduce((a, b) => a + b, 0)).toBe(100);
    for (const [k, r] of Object.entries(f.results)) {
      if (k.startsWith('_')) continue;
      expect(outcomes, k).toContain(k);
      const def = r as Record<string, unknown>;
      for (const range of ['cargoPct', 'firstTripCargoPct', 'lossPct']) {
        const v = def[range] as [number, number] | undefined;
        if (v) expect(v[0], `${k}.${range}`).toBeLessThanOrEqual(v[1]);
      }
      const mix = def.mixPct as Record<string, number> | undefined;
      if (mix) expect(Object.keys(mix).sort(), `${k}.mixPct`).toEqual([...RESOURCE_IDS].sort());
    }
  });

  it('founding tasks name real chambers and castes, with unique ids and full rewards', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(Object.keys(q.reward).sort(), q.id).toEqual([...RESOURCE_IDS].sort());
      const g = q.goal;
      if ('chamber' in g) expect(CHAMBER_IDS as readonly string[], q.id).toContain(g.chamber);
      else if ('units' in g) expect(CASTE_IDS as readonly string[], q.id).toContain(g.units);
      else if ('missionSent' in g) expect(g.missionSent, q.id).toBeTruthy();
      else expect(g.wildRaidsWon, q.id).toBeGreaterThan(0);
    }
  });

  it('every resource has exactly one storage chamber', () => {
    const stores = CHAMBER_IDS.filter((id) => CHAMBERS[id].effect.type === 'storage').map((id) => CHAMBERS[id].effect.resource);
    expect([...stores].sort()).toEqual([...RESOURCE_IDS].sort());
  });
});

describe('the game reads the data (change a number, the result changes)', () => {
  /** Temporarily set a number in the loaded data, run `fn`, then put it back. */
  function withValue<T extends object, K extends keyof T>(obj: T, key: K, value: T[K], fn: () => void) {
    const before = obj[key];
    obj[key] = value;
    try { fn(); } finally { obj[key] = before; }
  }

  it('storage, protection and distance', () => {
    withValue(FORMULAS.storage, 'capacityGrowth', 2, () => expect(storageForLevel(3)).toBe(RESOURCES_DATA.baseStorage * 8));
    withValue(FORMULAS.storage, 'protectedBase', 500, () => expect(protectedForLevel(1)).toBeCloseTo(500 * FORMULAS.storage.protectedGrowth));
    withValue(FORMULAS.distance, 'otherRegionPerRegion', 1, () =>
      expect(distance({ region: 1, patch: 1, spot: 1 }, { region: 3, patch: 1, spot: 1 })).toBe(2));
    expect(storageCapacity({ granary: 1 }).foliage).toBe(storageForLevel(1));
  });

  it('research effects and slots', () => {
    const base = unitSpeed('worker', { pheromone_trails: 2 });
    withValue(RESEARCH.pheromone_trails.effect, 'speedPct', 50, () =>
      expect(unitSpeed('worker', { pheromone_trails: 2 })).toBeCloseTo(CASTES.worker.speed * 2));
    expect(unitSpeed('worker', { pheromone_trails: 2 })).toBe(base);
    withValue(FORMULAS.missions, 'baseSlots', 5, () => expect(missionSlots({})).toBe(5));
    withValue(FORMULAS.colonies, 'base', 3, () => expect(maxColonies({})).toBe(3));
  });
});
