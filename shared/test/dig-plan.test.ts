// The dig plan's shared rules (docs/04-colony.md): what can be planned, which level it reaches, what it waits for.
import { describe, expect, it } from 'vitest';
import { DIG_PLAN, chamberCost, digPlanSlots, digPlanWait, planBlocker, plannedLevel, spaceUsed, type ChamberLevels } from '../src';

const chambers: ChamberLevels = { queen_chamber: 4, leaf_garden: 5, hunting_grounds: 5, nursery: 6, granary: 5, larder: 5, brood_hall: 2 };
const colony = {
  chambers,
  terrain: 'grassland' as const,
  resources: { foliage: 50_000, protein: 50_000, nectar: 50_000 },
  units: {},
  unitQueue: [],
  baseSpace: 160,
  research: {},
};
const player = { research: {}, researchJob: null };
const T = 1_000_000;

describe('dig plan rules', () => {
  it("unlocks with Queen's Chamber 4 and holds one dig (from docs/data/formulas.json)", () => {
    expect(DIG_PLAN.slots).toBe(1);
    expect(digPlanSlots({ queen_chamber: 3 }, {})).toBe(0);
    expect(digPlanSlots({ queen_chamber: 4 }, {})).toBe(1);
  });

  it('counts the dig in progress when working out the planned level', () => {
    const c = { ...colony, buildJob: { chamber: 'leaf_garden' }, digPlan: { chambers: ['leaf_garden' as const] } };
    expect(plannedLevel(c, 0)).toBe(7);
    const other = { ...colony, buildJob: { chamber: 'nursery' }, digPlan: { chambers: ['leaf_garden' as const] } };
    expect(plannedLevel(other, 0)).toBe(6);
  });

  it('reserves space for the dig in progress', () => {
    const tight = { ...colony, baseSpace: spaceUsed(chambers) + 1, buildJob: { chamber: 'nursery' } };
    expect(planBlocker('leaf_garden', tight, player)?.code).toBe('no_space');
    expect(planBlocker('leaf_garden', { ...tight, baseSpace: tight.baseSpace + 1 }, player)).toBeNull();
  });

  it("refuses a dig the stores could never pay for", () => {
    const c = { ...colony, chambers: { ...chambers, queen_chamber: 12 }, buildJob: { chamber: 'nursery' } };
    expect(chamberCost('queen_chamber', 13).foliage).toBeGreaterThan(1_000_000);
    expect(planBlocker('queen_chamber', c, player)?.code).toBe('storage');
  });

  it('a planned Brood Hall waits for the units being raised, without spinning', () => {
    const queue = [{ kind: 'caste' as const, id: 'minor_soldier' as const, count: 5, done: 0, perUnitMs: 60_000, startAt: T }];
    const c = { ...colony, unitQueue: queue, buildJob: null, digPlan: { chambers: ['brood_hall' as const] } };
    const w = digPlanWait(c, player, 1, T);
    expect(w?.kind).toBe('busy');
    expect(w && 'until' in w ? w.until : null).toBe(T + 5 * 60_000);
    // a timer that has already run out still waits at least a second
    const late = digPlanWait(c, player, 1, T + 5 * 60_000);
    expect(late && 'until' in late ? late.until : null).toBeGreaterThan(T + 5 * 60_000);
  });

  it('waits for resources until production covers the cost', () => {
    const c = { ...colony, resources: { foliage: 0, protein: 0, nectar: 0 }, buildJob: null, digPlan: { chambers: ['leaf_garden' as const] } };
    const w = digPlanWait(c, player, 1, T);
    expect(w?.kind).toBe('resources');
    expect(w && 'until' in w ? w.until : 0).toBeGreaterThan(T);
    expect(digPlanWait({ ...c, resources: colony.resources }, player, 1, T)?.kind).toBe('ready');
  });
});
