import { afterCommit, type Q } from '../db';

export type ReportType = 'transport' | 'relocate' | 'scout' | 'scouted' | 'battle' | 'haul' | 'forage' | 'return' | 'milestone' | 'nest_event' | 'colonize' | 'diplomacy' | 'hold';

export async function addReport(q: Q, worldId: number, playerId: number, type: ReportType, title: string, data: object, at: number) {
  const r = await q.query(
    'INSERT INTO reports (world_id, player_id, type, title, data, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [worldId, playerId, type, title, JSON.stringify(data), at],
  );
  // `kind` lets open tabs animate what happened (e.g. which nest event or forage outcome)
  const d = data as { event?: string; outcome?: string };
  // tell open tabs only once the report is saved: a rolled-back report must not pop up
  const push = { id: r.rows[0].id, type, title, kind: d.event ?? d.outcome };
  await afterCommit(q, async () => onReport?.(playerId, push));
  return r.rows[0].id as number;
}

/** Hook for realtime push (set in M8). */
export let onReport: ((playerId: number, r: { id: number; type: string; title: string; kind?: string }) => void) | null = null;
export function setReportListener(fn: typeof onReport) {
  onReport = fn;
}
