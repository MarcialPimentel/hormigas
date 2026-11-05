import type { FastifyInstance } from 'fastify';
import { getPool, closePool } from '../src/db';
import { migrate } from '../src/migrate';
import { buildApp } from '../src/app';
import { setClock, resetClock } from '../src/clock';
import { clearWorldCache } from '../src/world';
import { clearBoostCache } from '../src/game/boost';
import { processDueEvents } from '../src/events';
import { TERRAIN, STARTING_TERRAIN, SITE_SPOTS, WORLD, wildThingsAround } from '@hormigas/shared';

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

/**
 * Register a player and move their first colony onto a free Grassland spot in `host`'s patch.
 * Real sign-ups never share a patch (docs/11-world.md); many tests still want two players side by side.
 * Wild things that only the newcomer's real patch brought are removed, so the area looks as if they spawned here.
 */
export async function newPlayerBeside(app: FastifyInstance, username: string, host: Client): Promise<Client> {
  const at = (await host.get('/api/state')).colony.coords;
  const who = await newPlayer(app, username);
  const mine = (await who.get('/api/state')).colony;
  const pool = getPool();
  const taken = (await pool.query('SELECT spot FROM colonies WHERE region = $1 AND patch = $2', [at.region, at.patch])).rows.map((r) => r.spot);
  const spot = TERRAIN[STARTING_TERRAIN].spots.find((s) => !taken.includes(s));
  if (spot === undefined) throw new Error(`no free Grassland spot in ${at.region}:${at.patch}`);
  await pool.query('UPDATE colonies SET region = $2, patch = $3, spot = $4 WHERE id = $1', [mine.id, at.region, at.patch, spot]);
  // keep only the wild things some player's patch calls for
  const homes = (await pool.query('SELECT DISTINCT c.region, c.patch FROM colonies c JOIN players p ON p.id = c.player_id WHERE NOT p.is_npc')).rows;
  const wanted = new Set(homes.flatMap((h) => wildThingsAround(h.region, h.patch).map((w) => `${w.region}:${w.patch}:${w.thing}`)));
  const thingAt = (spot: number) =>
    spot <= WORLD.spotsPerPatch ? 'nest' : (Object.entries(SITE_SPOTS).find(([, s]) => s === spot)?.[0] ?? 'other');
  const wild = (await pool.query('SELECT id, region, patch, spot FROM colonies WHERE npc IS NOT NULL')).rows;
  const extra = wild.filter((c) => !wanted.has(`${c.region}:${c.patch}:${thingAt(c.spot)}`)).map((c) => c.id);
  if (extra.length) {
    await pool.query("DELETE FROM events WHERE (payload->>'colonyId')::int = ANY($1)", [extra]);
    await pool.query('DELETE FROM known_colonies WHERE colony_id = ANY($1)', [extra]);
    await pool.query('DELETE FROM colonies WHERE id = ANY($1)', [extra]);
  }
  return who;
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
  await getPool().query("UPDATE events SET done = true WHERE type IN ('nest_raid', 'swarm_spotted', 'windfall_drop', 'windfall_wild')");
}

/** No nest events (gifts) either, for tests that count resources exactly over many hours. */
export async function calmNestEvents() {
  await getPool().query("UPDATE events SET done = true WHERE type = 'nest_event'");
}

/**
 * Every player has scouted every other colony (docs/22-discovery.md), for tests that aren't about discovery.
 * Call again after new players or colonies appear.
 */
export async function knowAll() {
  await exploreAll();
  await getPool().query(
    `INSERT INTO known_colonies (player_id, colony_id, via, first_at, discovered_at)
     SELECT p.id, c.id, 'scouted', 0, 0 FROM players p JOIN colonies c ON c.player_id <> p.id WHERE NOT p.is_npc
     ON CONFLICT (player_id, colony_id) DO UPDATE SET discovered_at = 0`,
  );
}

/**
 * Every player has explored every patch that holds anything, and still sees it as it is now (fog of war,
 * docs/22-discovery.md), for tests that aren't about fog. Call again after new colonies appear in new patches.
 */
export async function exploreAll() {
  await getPool().query(
    `INSERT INTO explored_patches (player_id, region, patch, seen_at)
     SELECT p.id, c.region, c.patch, 9000000000000000 FROM players p CROSS JOIN (SELECT DISTINCT region, patch FROM colonies) c WHERE NOT p.is_npc
     ON CONFLICT (player_id, region, patch) DO UPDATE SET seen_at = EXCLUDED.seen_at`,
  );
}
