// The test scene (docs/test-bed.md): its made-up world follows the server's trip phases, is the same every time for
// the same seed, and the march numbers stay inside their ranges.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MARCH, MARCH_SPEC, marchChanges, resetMarch } from '../src/components/three/march';
import { ORDERS, fakeBattle, send, stateAt, statusOf, PLACES } from '../src/test/fakeWorld';
import { tripProgress } from '../src/components/UnderWay';

const order = (id: string) => ORDERS.find((o) => o.id === id)!;

describe('march.json', () => {
  it('every value sits inside its own min and max', () => {
    for (const group of Object.values(MARCH_SPEC))
      for (const [k, v] of Object.entries(group)) {
        expect(v.min, k).toBeLessThan(v.max);
        expect(v.value, k).toBeGreaterThanOrEqual(v.min);
        expect(v.value, k).toBeLessThanOrEqual(v.max);
        expect(v.label && v.note && v.unit, k).toBeTruthy();
      }
  });
  it('Copy changes lists only what moved, and reset puts it back', () => {
    resetMarch();
    expect(marchChanges()).toEqual({});
    MARCH.yard.spacing = 2;
    expect(marchChanges()).toEqual({ yard: { spacing: 2 } });
    resetMarch();
    expect(MARCH.yard.spacing).toBe(MARCH_SPEC.yard.spacing.value);
  });
});

describe('fake world', () => {
  it('a forage goes out, comes home, then is gone', () => {
    const p = send(order('forage'), 1, 0, 10_000, 20);
    expect(statusOf(p, 5_000)).toBe('outbound');
    expect(statusOf(p, 15_000)).toBe('returning');
    expect(statusOf(p, 20_001)).toBe('done');
    const m = stateAt([p], 15_000).missions[0];
    expect(m.cargo.foliage).toBeGreaterThan(0);
    expect(tripProgress(m, 15_000).x).toBeCloseTo(0.75);
  });
  it('a windfall claim holds, then walks home with its load on the bar from the start', () => {
    const p = send(order('claim'), 1, 0, 10_000, 20);
    expect(statusOf(p, 15_000)).toBe('holding');
    const m = stateAt([p], 25_000).missions[0];
    expect(m.status).toBe('returning');
    // the walk home is timed from when it left the windfall
    expect(tripProgress(m, 25_000)).toMatchObject({ phase: 'back', oneWay: true });
    expect(m.cargo.protein).toBeGreaterThan(0);
  });
  it('a raid on you arrives and is gone, listed as incoming', () => {
    const p = send(order('raid_in'), 1, 0, 10_000, 50);
    const st = stateAt([p], 5_000);
    expect(st.missions).toHaveLength(0);
    expect(st.incoming[0]).toMatchObject({ type: 'raid', hostile: true, targetColonyId: 1, origin: PLACES.rivalFar });
    expect(statusOf(p, 10_001)).toBe('done');
  });
  it('the same seed gives the same battle', () => {
    expect(fakeBattle(PLACES.termites, PLACES.home, 40, 42)).toEqual(fakeBattle(PLACES.termites, PLACES.home, 40, 42));
    expect(fakeBattle(PLACES.termites, PLACES.home, 40, 42)).not.toEqual(fakeBattle(PLACES.termites, PLACES.home, 40, 7));
  });
});

describe('production', () => {
  it('the test scene only loads on a ?test URL, in its own chunk', () => {
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/has\('test'\) \? lazy\(\(\) => import\('\.\/test\/TestScene'\)\)/);
    expect(main).not.toMatch(/^import .*test\/TestScene/m);
  });
});
