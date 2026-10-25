import { computePoints } from '@hormigas/shared';
import type { Q } from '../db';

/** Recompute a player's points from their assets. Cheap enough to call after any change. */
export async function refreshPoints(q: Q, playerId: number) {
  const p = await q.query('SELECT research FROM players WHERE id = $1', [playerId]);
  if (!p.rows[0]) return;
  const cols = await q.query('SELECT chambers, units, defenses FROM colonies WHERE player_id = $1', [playerId]);
  // units currently away on missions still count (table exists from M5 on)
  const hasMissions = (await q.query("SELECT to_regclass('missions') IS NOT NULL AS ok")).rows[0].ok;
  const away = hasMissions
    ? await q.query("SELECT units FROM missions WHERE player_id = $1 AND status <> 'done'", [playerId])
    : { rows: [] as any[] };
  const colonies = cols.rows.map((r: any) => ({ chambers: r.chambers, units: r.units, defenses: r.defenses }));
  for (const m of away.rows) colonies.push({ chambers: {}, units: m.units, defenses: {} });
  const points = computePoints(colonies, p.rows[0].research);
  await q.query('UPDATE players SET points = $2, points_total = $3 WHERE id = $1', [playerId, JSON.stringify(points), points.total]);
  return points;
}
