import * as THREE from 'three';

// Shared by the 3D scenes that walk a party of ants along a path (the Missions patch and the Whole Yard). Each scene
// still decides how the ground under the path is shaped; this only does the arithmetic of walking it.

/** A polyline with cumulative lengths, so a party can be placed by the distance it has walked along it. */
export interface Path {
  pts: THREE.Vector3[];
  /** distance from the start to each point */
  lens: number[];
  total: number;
}

export function makePath(pts: THREE.Vector3[]): Path {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, lens, total: lens[lens.length - 1] };
}

/**
 * The point `d` world units along the path (clamped to its ends), written into `out`. If `tangent` is given, it gets
 * the unit direction of travel at that point.
 */
export function pointAlong(path: Path, d: number, out: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
  const { pts, lens } = path;
  d = Math.max(0, Math.min(path.total, d));
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i++;
  const a = pts[i - 1], b = pts[i];
  const k = (d - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
  out.lerpVectors(a, b, k);
  if (tangent) {
    tangent.subVectors(b, a);
    if (tangent.lengthSq() > 0) tangent.normalize();
  }
  return out;
}

/**
 * Nose angle for an ant at (x, z) heading (fx, fz): how steeply the ground rises or falls `reach` ahead of it, clamped
 * to ±`limit` radians. Flat ground gives 0.
 */
export function pitchAhead(
  footY: (x: number, z: number) => number,
  x: number, z: number, fx: number, fz: number,
  reach: number, limit: number,
): number {
  const dy = footY(x + fx * reach, z + fz * reach) - footY(x, z);
  return Math.max(-limit, Math.min(limit, Math.atan2(dy, reach)));
}
