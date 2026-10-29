import { STARTING_TERRAIN, NEW_PLAYER_PROTECTION_MS } from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { hashPassword, verifyPassword, createSession } from '../auth';
import { getWorld, pickStartingSpot } from '../world';
import { createColony } from './colonies';

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
  await createColony(q, {
    worldId: world.id, playerId, name: `${username}'s Nest`, at: spot, terrain: STARTING_TERRAIN, baseSpace: spot.baseSpace, t,
  });
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
