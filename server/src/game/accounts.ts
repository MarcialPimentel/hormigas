import { RESOURCES_DATA, STARTING_TERRAIN, NEW_PLAYER_PROTECTION_MS } from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { hashPassword, verifyPassword, createSession } from '../auth';
import { getWorld, pickStartingSpot } from '../world';
import { ensureNest } from './nests';

export async function register(q: Tx, username: string, password: string) {
  const world = await getWorld(q);
  const exists = await q.query('SELECT 1 FROM players WHERE world_id = $1 AND lower(username) = lower($2)', [world.id, username]);
  if (exists.rowCount) throw new GameError('taken', 'That name is already taken.', 409);
  const t = now();
  const hash = await hashPassword(password);
  const p = await q.query(
    `INSERT INTO players (world_id, username, password_hash, created_at, last_active, protected_until)
     VALUES ($1,$2,$3,$4,$4,$5) RETURNING id`,
    [world.id, username, hash, t, t + NEW_PLAYER_PROTECTION_MS],
  );
  const playerId = p.rows[0].id as number;
  // serialize placement so two sign-ups can't grab the same spot
  await q.query('LOCK TABLE colonies IN SHARE ROW EXCLUSIVE MODE');
  const spot = await pickStartingSpot(q, world.id);
  const start = RESOURCES_DATA.startingResources;
  await q.query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated, chambers, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12)`,
    [world.id, playerId, `${username}'s Nest`, spot.region, spot.patch, spot.spot, STARTING_TERRAIN, spot.baseSpace,
      start.foliage, start.protein, start.nectar, t, JSON.stringify({ queen_chamber: 1 })],
  );
  // every patch with players has a wild nest (docs/17-wild-nests.md)
  await ensureNest(q, world.id, spot.region, spot.patch, t);
  const token = await createSession(q, playerId);
  return { playerId, token };
}

export async function login(q: Tx, username: string, password: string) {
  const world = await getWorld(q);
  const r = await q.query('SELECT id, password_hash FROM players WHERE world_id = $1 AND lower(username) = lower($2)', [world.id, username]);
  const row = r.rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) throw new GameError('bad_login', 'Wrong name or password.', 401);
  const token = await createSession(q, row.id);
  return { playerId: row.id as number, token };
}

export async function logout(q: Tx, token: string | undefined) {
  if (token) await q.query('DELETE FROM sessions WHERE token = $1', [token]);
}
