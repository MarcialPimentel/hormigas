// A party walks its path by the distance it has covered, and an ant's nose follows the ground ahead of it
// (client/src/components/three/path.ts).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makePath, pitchAhead, pointAlong } from '../src/components/three/path';

describe('party paths', () => {
  const L = makePath([new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0), new THREE.Vector3(3, 0, 4)]);

  it('measures the length of each leg and the whole path', () => {
    expect(L.lens).toEqual([0, 3, 7]);
    expect(L.total).toBe(7);
  });

  it('places a point by distance walked, across a corner, and clamps at both ends', () => {
    const out = new THREE.Vector3(), dir = new THREE.Vector3();
    pointAlong(L, 1.5, out);
    expect(out.x).toBeCloseTo(1.5);
    pointAlong(L, 5, out, dir); // 2 units up the second leg
    expect(out.x).toBeCloseTo(3);
    expect(out.z).toBeCloseTo(2);
    expect(dir.z).toBeCloseTo(1); // unit direction along the second leg
    pointAlong(L, -10, out);
    expect(out.toArray()).toEqual([0, 0, 0]);
    pointAlong(L, 99, out);
    expect(out.toArray()).toEqual([3, 0, 4]);
  });

  it('tilts up a rising ground and levels off on flat ground', () => {
    const rise = (x: number) => x * 0.5; // a slope of 0.5 going +x
    expect(pitchAhead(rise, 0, 0, 1, 0, 0.3, 1.2)).toBeCloseTo(Math.atan2(0.15, 0.3));
    expect(pitchAhead(() => 2, 0, 0, 1, 0, 0.3, 1.2)).toBe(0);
    // steep ground is clamped
    expect(pitchAhead((x) => x * 100, 0, 0, 1, 0, 0.3, 1.2)).toBeCloseTo(1.2);
  });
});
