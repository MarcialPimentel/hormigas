import type { Q } from '../db';

export type ReportType = 'transport' | 'relocate' | 'scout' | 'scouted' | 'battle' | 'haul' | 'forage' | 'return' | 'milestone';

export async function addReport(q: Q, worldId: number, playerId: number, type: ReportType, title: string, data: object, at: number) {
  const r = await q.query(
    'INSERT INTO reports (world_id, player_id, type, title, data, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [worldId, playerId, type, title, JSON.stringify(data), at],
  );
  onReport?.(playerId, { id: r.rows[0].id, type, title });
  return r.rows[0].id as number;
}

/** Hook for realtime push (set in M8). */
export let onReport: ((playerId: number, r: { id: number; type: string; title: string }) => void) | null = null;
export function setReportListener(fn: typeof onReport) {
  onReport = fn;
}
