// Scheduled event queue. Everything with a duration (builds, research, missions…) is an event
// resolved in due_at order by processDueEvents(). Handlers run inside a transaction.
import { getPool, tx, type Q, type Tx, afterCommitMark, dropAfterCommitSince } from './db';
import { now } from './clock';

export interface GameEvent {
  id: number;
  world_id: number;
  type: string;
  due_at: number;
  payload: any;
}

type Handler = (q: Tx, ev: GameEvent) => Promise<void>;
const handlers = new Map<string, Handler>();

export function onEvent(type: string, handler: Handler) {
  handlers.set(type, handler);
}

export async function schedule(q: Q, worldId: number, type: string, dueAt: number, payload: object): Promise<number> {
  const r = await q.query('INSERT INTO events (world_id, type, due_at, payload) VALUES ($1,$2,$3,$4) RETURNING id', [
    worldId, type, Math.round(dueAt), payload,
  ]);
  return r.rows[0].id;
}

export async function cancelEvent(q: Q, id: number) {
  await q.query('UPDATE events SET done = true WHERE id = $1', [id]);
}

export async function rescheduleEvent(q: Q, id: number, dueAt: number) {
  await q.query('UPDATE events SET due_at = $2 WHERE id = $1 AND NOT done', [id, Math.round(dueAt)]);
}

/**
 * Postgres errors that mean "try again", not "this event is broken":
 * serialization failure, deadlock, lock not available.
 */
const TEMPORARY_ERRORS = new Set(['40001', '40P01', '55P03']);
const isTemporary = (e: unknown) => TEMPORARY_ERRORS.has(String((e as { code?: unknown } | null)?.code));

/** How many times an event may hit a temporary error before it is given up on like any other failure. */
export const MAX_ATTEMPTS = 5;

let running: Promise<number> | null = null;

/**
 * Resolve every event that is due, one per transaction, oldest first.
 * Concurrent callers share one run, so API requests and the background loop never race.
 */
export function processDueEvents(max = 500): Promise<number> {
  if (!running) running = runDue(max).finally(() => { running = null; });
  return running;
}

async function runDue(max: number): Promise<number> {
  let processed = 0;
  // Only pick types this server knows. An unknown type (say, from a newer build that was rolled back)
  // stays pending for a server that can handle it instead of being thrown away.
  const known = [...handlers.keys()];
  while (processed < max) {
    const t = now();
    const outcome = await tx(async (q): Promise<'empty' | 'done' | 'retry'> => {
      const r = await q.query(
        'SELECT id, world_id, type, due_at, payload FROM events WHERE NOT done AND due_at <= $1 AND type = ANY($2::text[]) ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED',
        [t, known],
      );
      const ev = r.rows[0] as GameEvent | undefined;
      if (!ev) return 'empty';
      const mark = afterCommitMark(q);
      try {
        await q.query('SAVEPOINT ev');
        await handlers.get(ev.type)!(q, ev);
        await q.query('RELEASE SAVEPOINT ev');
      } catch (e) {
        await q.query('ROLLBACK TO SAVEPOINT ev');
        // whatever the failed handler asked to do after commit (reports to push, points to refresh) is void now
        dropAfterCommitSince(q, mark);
        const attempts = (Number(ev.payload?.attempts) || 0) + 1;
        if (isTemporary(e) && attempts < MAX_ATTEMPTS) {
          // e.g. a deadlock with a player action: nothing is wrong with the event, so keep it for the next run.
          console.warn(`Event ${ev.id} (${ev.type}) hit a temporary error, will retry (attempt ${attempts}):`, e);
          await q.query("UPDATE events SET payload = payload || jsonb_build_object('attempts', $2::int) WHERE id = $1", [ev.id, attempts]);
          return 'retry';
        }
        // Never let one broken event block the queue: roll back its effects, record the error, move on.
        console.error(`Event ${ev.id} (${ev.type}) failed:`, e);
        await q.query("UPDATE events SET payload = payload || jsonb_build_object('error', $2::text) WHERE id = $1", [ev.id, String(e)]);
      }
      await q.query('UPDATE events SET done = true WHERE id = $1', [ev.id]);
      return 'done';
    });
    if (outcome === 'empty') break;
    // A retried event is still first in line. Stop here so the next run starts with it and events stay in order.
    if (outcome === 'retry') break;
    processed++;
  }
  return processed;
}

/** Event types with pending rows that no handler on this server knows (logged at startup). */
export async function unknownPendingEventTypes(q: Q): Promise<string[]> {
  const r = await q.query('SELECT DISTINCT type FROM events WHERE NOT done AND NOT (type = ANY($1::text[]))', [[...handlers.keys()]]);
  return r.rows.map((row) => row.type as string);
}

/** Background loop. Returns a stop function. */
export function startEventLoop(intervalMs = 500): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await processDueEvents();
    } catch (e) {
      console.error('Event loop error:', e);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);
  return () => { stopped = true; };
}

export async function pendingEventCount(): Promise<number> {
  const r = await getPool().query('SELECT count(*)::int AS n FROM events WHERE NOT done');
  return r.rows[0].n;
}
