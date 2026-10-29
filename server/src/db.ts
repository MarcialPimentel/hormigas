import pg from 'pg';
import { config } from './config';

// int8 (bigint) → JS number. All our bigints are epoch-ms timestamps or ids, well below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric → number
pg.types.setTypeParser(1700, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Q = Pick<pg.PoolClient, 'query'>;

let pool: pg.Pool | null = null;

export function getPool(url = config.databaseUrl): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 10, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined });
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
}

type Task = () => Promise<void>;
const afterCommitTasks = new WeakMap<object, Task[]>();

/** Run `fn` inside a transaction, then any tasks queued with afterCommit() once it has committed. */
export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tasks: Task[] = [];
  afterCommitTasks.set(client, tasks);
  let out: T;
  try {
    await client.query('BEGIN');
    out = await fn(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    afterCommitTasks.delete(client);
    client.release();
  }
  for (const task of tasks) await task();
  return out;
}

/**
 * Run `fn` after the transaction `q` belongs to has committed (right away if `q` isn't in one).
 * Use it for follow-up work that must not take more row locks inside the transaction.
 * The data is already saved by then, so a failing task is logged rather than thrown.
 */
export async function afterCommit(q: Q, fn: () => Promise<unknown>): Promise<void> {
  const task = () => fn().then(() => {}, (e) => console.error('After-commit task failed:', e));
  const tasks = afterCommitTasks.get(q);
  if (tasks) tasks.push(task);
  else await task();
}

/** How many after-commit tasks `q` has queued so far (pair with dropAfterCommitSince around a savepoint). */
export function afterCommitMark(q: Q): number {
  return afterCommitTasks.get(q)?.length ?? 0;
}

/** Forget tasks queued after `mark`: their work was rolled back to a savepoint, so they must not run. */
export function dropAfterCommitSince(q: Q, mark: number) {
  const tasks = afterCommitTasks.get(q);
  if (tasks && tasks.length > mark) tasks.length = mark;
}
