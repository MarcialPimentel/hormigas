// Fog of war (docs/22-discovery.md#fog-of-war): which patches a player can see right now, which they have only seen
// before, and which they have never explored. The server decides; these are the shared rules both sides use.
import { WORLD } from './world';

/** visible: in sight now · explored: seen before, shown as last seen · unexplored: only its outline */
export type FogState = 'visible' | 'explored' | 'unexplored';

/** Patches per row of a region's grid (a region is 10 × 10 patches). */
export const PATCHES_PER_ROW = 10;

/**
 * The patches touching `patch` inside its region, as the map draws them: rows of 10 hexes, every odd row shifted
 * half a patch to the right. Regions don't share neighbours (crossing to another region is a long trip).
 */
export function patchNeighbours(patch: number): number[] {
  const row = Math.floor((patch - 1) / PATCHES_PER_ROW), col = (patch - 1) % PATCHES_PER_ROW;
  const rows = Math.ceil(WORLD.patchesPerRegion / PATCHES_PER_ROW);
  const odd = row % 2 === 1;
  const steps: [number, number][] = [
    [0, -1], [0, 1],
    [-1, odd ? 0 : -1], [-1, odd ? 1 : 0],
    [1, odd ? 0 : -1], [1, odd ? 1 : 0],
  ];
  const out: number[] = [];
  for (const [dr, dc] of steps) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= rows || c < 0 || c >= PATCHES_PER_ROW) continue;
    const p = r * PATCHES_PER_ROW + c + 1;
    if (p <= WORLD.patchesPerRegion) out.push(p);
  }
  return out;
}

export const FOG_MESSAGES = {
  unexplored: "You haven't explored that patch yet. Send Scouts to survey its wilds first.",
} as const;
