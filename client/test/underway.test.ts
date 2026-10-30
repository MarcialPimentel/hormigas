// The Under way bars put each trip where it really is (client/src/components/UnderWay.tsx).
import { describe, expect, it } from 'vitest';
import { tripProgress } from '../src/components/UnderWay';

const raid = { type: 'raid', departAt: 1000, arriveAt: 2000, returnAt: 3000 };

describe('tripProgress', () => {
  it('fills the first half going out, reaching the arrival tick on arrival', () => {
    expect(tripProgress({ ...raid, status: 'outbound' }, 1000).x).toBe(0);
    expect(tripProgress({ ...raid, status: 'outbound' }, 1500).x).toBeCloseTo(0.25);
    expect(tripProgress({ ...raid, status: 'outbound' }, 2000).x).toBeCloseTo(0.5);
  });

  it('fills the second half on the way home', () => {
    expect(tripProgress({ ...raid, status: 'returning' }, 2500)).toMatchObject({ phase: 'back' });
    expect(tripProgress({ ...raid, status: 'returning' }, 2500).x).toBeCloseTo(0.75);
    expect(tripProgress({ ...raid, status: 'returning' }, 9999).x).toBe(1);
  });

  it('uses the whole bar for one-way trips, and stops at the target when holding', () => {
    const colonize = { type: 'colonize', departAt: 1000, arriveAt: 2000, returnAt: null };
    expect(tripProgress({ ...colonize, status: 'outbound' }, 1500)).toMatchObject({ oneWay: true });
    expect(tripProgress({ ...colonize, status: 'outbound' }, 1500).x).toBeCloseTo(0.5);
    expect(tripProgress({ type: 'hold', departAt: 1000, arriveAt: 2000, status: 'holding' }, 5000)).toMatchObject({ phase: 'holding', x: 1 });
  });

  it('never runs off either end of the bar', () => {
    expect(tripProgress({ ...raid, status: 'outbound' }, 0).x).toBe(0);
    expect(tripProgress({ ...raid, status: 'outbound' }, 99999).x).toBeCloseTo(0.5);
  });
});
