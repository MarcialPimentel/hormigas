// Lifetime counters per player (docs/26-come-back.md, shared/src/stats.ts). Bumped where things happen.
import { derivedStats, type Stats } from '@hormigas/shared';
import type { Q } from '../db';
import { now } from '../clock';
import { advance, playerColonies } from '../colony';

/** Add to a counter. Wild players (NPCs) are skipped by the callers; zero or less does nothing. */
export async function bump(q: Q, playerId: number, key: string, n = 1): Promise<void> {
  if (!(n > 0) || !Number.isFinite(n)) return;
  await q.query(
    `INSERT INTO player_stats (player_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (player_id, key) DO UPDATE SET value = player_stats.value + EXCLUDED.value`,
    [playerId, key, n],
  );
}

/** Bump several counters for the same player. */
export async function bumpAll(q: Q, playerId: number, counts: Record<string, number>): Promise<void> {
  for (const [key, n] of Object.entries(counts)) await bump(q, playerId, key, n);
}

/** Food in a load, all three resources together. */
export const foodIn = (r: { foliage?: number; protein?: number; nectar?: number } | null | undefined): number =>
  Math.floor((r?.foliage ?? 0) + (r?.protein ?? 0) + (r?.nectar ?? 0));

/** Every counter for a player: the stored ones plus the ones worked out from their colonies. */
export async function playerStats(q: Q, playerId: number): Promise<Stats> {
  const out: Stats = {};
  for (const r of (await q.query('SELECT key, value FROM player_stats WHERE player_id = $1', [playerId])).rows) out[r.key] = Number(r.value);
  // brought up to now, so ants that hatched since the colony was last saved count
  const t = now();
  const cols = (await playerColonies(q, playerId)).map((c) => advance(c, t));
  Object.assign(out, derivedStats(cols.map((c) => ({ chambers: c.chambers, raised: c.raised ?? {} }))));
  return out;
}
