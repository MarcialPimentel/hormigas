// Late Founding Boost (docs/10-pvp-rules.md): players below the world median build faster.
import { lateFoundingMultiplier } from '@hormigas/shared';
import type { Q } from '../db';

let cache: { worldId: number; median: number; at: number } | null = null;

export async function worldMedianPoints(q: Q, worldId: number, nowMs: number): Promise<number> {
  if (cache && cache.worldId === worldId && nowMs - cache.at < 60_000 && nowMs >= cache.at) return cache.median;
  const r = await q.query(
    'SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY points_total), 0) AS m FROM players WHERE world_id = $1 AND NOT is_npc',
    [worldId],
  );
  cache = { worldId, median: Number(r.rows[0].m), at: nowMs };
  return cache.median;
}

export function clearBoostCache() {
  cache = null;
}

export async function timeMultiplier(q: Q, worldId: number, playerPoints: number, nowMs: number): Promise<number> {
  return lateFoundingMultiplier(playerPoints, await worldMedianPoints(q, worldId, nowMs));
}
