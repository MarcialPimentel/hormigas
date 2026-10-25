// Scheduled event queue. Everything with a duration (builds, research, missions…) is an event
// resolved in due_at order by processDueEvents(). Handlers run inside a transaction.
import { getPool, tx, type Q, type Tx } from './db';
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
  while (processed < max) {
    const t = now();
    const handled = await tx(async (q) => {
      const r = await q.query(
        'SELECT id, world_id, type, due_at, payload FROM events WHERE NOT done AND due_at <= $1 ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED',
        [t],
      );
      const ev = r.rows[0] as GameEvent | undefined;
      if (!ev) return false;
      const h = handlers.get(ev.type);
      try {
        await q.query('SAVEPOINT ev');
        if (h) await h(q, ev);
        else console.warn(`No handler for event type ${ev.type}`);
        await q.query('RELEASE SAVEPOINT ev');
      } catch (e) {
        // Never let one broken event block the queue: roll back its effects, record the error, move on.
        await q.query('ROLLBACK TO SAVEPOINT ev');
        console.error(`Event ${ev.id} (${ev.type}) failed:`, e);
        await q.query("UPDATE events SET payload = payload || jsonb_build_object('error', $2::text) WHERE id = $1", [ev.id, String(e)]);
      }
      await q.query('UPDATE events SET done = true WHERE id = $1', [ev.id]);
      return true;
    });
    if (!handled) break;
    processed++;
  }
  return processed;
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
