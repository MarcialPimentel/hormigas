import { computePoints } from '@hormigas/shared';
import type { Q } from '../db';
import { now } from '../clock';
import { advance, playerColonies } from '../colony';

/** Recompute a player's points from their assets (incl. units finished in the queue and units away on missions). */
export async function refreshPoints(q: Q, playerId: number) {
  const p = await q.query('SELECT research FROM players WHERE id = $1', [playerId]);
  if (!p.rows[0]) return;
  const t = now();
  const colonies = (await playerColonies(q, playerId)).map((c) => {
    const s = advance(c, t);
    return { chambers: s.chambers, units: s.units, defenses: s.defenses };
  });
  const hasMissions = (await q.query("SELECT to_regclass('missions') IS NOT NULL AS ok")).rows[0].ok;
  if (hasMissions) {
    const away = await q.query("SELECT units FROM missions WHERE player_id = $1 AND status <> 'done'", [playerId]);
    for (const m of away.rows) colonies.push({ chambers: {}, units: m.units, defenses: {} });
  }
  const points = computePoints(colonies, p.rows[0].research);
  await q.query('UPDATE players SET points = $2, points_total = $3 WHERE id = $1', [playerId, JSON.stringify(points), points.total]);
  return points;
}

/** Periodic refresh for everyone (rankings, protection checks). */
export async function refreshAllPoints(q: Q) {
  const r = await q.query('SELECT id FROM players');
  for (const row of r.rows) await refreshPoints(q, row.id);
}
