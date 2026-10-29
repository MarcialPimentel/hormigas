import type { FastifyInstance } from 'fastify';
import { getPool, closePool } from '../src/db';
import { migrate } from '../src/migrate';
import { buildApp } from '../src/app';
import { setClock, resetClock } from '../src/clock';
import { clearWorldCache } from '../src/world';
import { clearBoostCache } from '../src/game/boost';
import { processDueEvents } from '../src/events';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://hormigas:hormigas@localhost:5432/hormigas_test';

/** Fresh schema + app with a controllable clock. */
export async function setupTest(): Promise<{ app: FastifyInstance; clock: { t: number; advance: (ms: number) => Promise<void> } }> {
  const pool = getPool(TEST_DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  clearWorldCache();
  clearBoostCache();
  const clock = {
    t: 1_800_000_000_000,
    async advance(ms: number) {
      clock.t += ms;
      await processDueEvents();
    },
  };
  setClock(() => clock.t);
  const app = await buildApp();
  return { app, clock };
}

export async function teardownTest(app: FastifyInstance) {
  await app.close();
  resetClock();
  await closePool();
}

export interface Client {
  cookie: string;
  get: (url: string) => Promise<any>;
  post: (url: string, body?: object) => Promise<any>;
  patch: (url: string, body?: object) => Promise<any>;
}

/** Register a player and return a tiny API client bound to their session cookie. */
export async function newPlayer(app: FastifyInstance, username: string): Promise<Client> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password: 'password123' } });
  if (res.statusCode !== 200) throw new Error(`register failed: ${res.body}`);
  const cookie = String(res.headers['set-cookie']).split(';')[0];
  const call = async (method: 'GET' | 'POST' | 'PATCH', url: string, body?: object) => {
    const r = await app.inject({ method, url, payload: body, headers: { cookie } });
    const json = r.body ? JSON.parse(r.body) : {};
    return { status: r.statusCode, ...json };
  };
  return {
    cookie,
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body ?? {}),
    patch: (url, body) => call('PATCH', url, body ?? {}),
  };
}

/** Directly set colony fields for test setup. */
export async function setColony(colonyId: number, fields: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [colonyId];
  for (const [k, v] of Object.entries(fields)) {
    vals.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    sets.push(`${k} = $${vals.length}`);
  }
  await getPool().query(`UPDATE colonies SET ${sets.join(', ')} WHERE id = $1`, vals);
}

export async function setPlayer(playerId: number, fields: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [playerId];
  for (const [k, v] of Object.entries(fields)) {
    vals.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    sets.push(`${k} = $${vals.length}`);
  }
  await getPool().query(`UPDATE players SET ${sets.join(', ')} WHERE id = $1`, vals);
}

/** Stop wild nests from raiding (for tests about player-vs-player combat that run the clock forward). */
/** Stop the wild from attacking test colonies: wild-nest raids and army-ant swarm sightings (call again after new colonies appear). */
export async function calmWildNests() {
  await getPool().query("UPDATE events SET done = true WHERE type IN ('nest_raid', 'swarm_spotted')");
}
