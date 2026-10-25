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
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 10 });
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
}

/** Run `fn` inside a transaction. */
export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
