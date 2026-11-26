import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

// ---- Password reset by code (no emails in this game: an admin hands the code over by hand) ----

/** No 0/O, 1/I/L, so a code read out over chat can't be mistyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RESET_CODE_HOURS = 72;
export const RESET_MAX_TRIES = 5;

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code: string) => createHash('sha256').update(normalizeCode(code)).digest('hex');

/** Admin: make (or replace) a one-time reset code for a player. Returns the code, shown once, as XXXX-XXXX. */
export async function makeResetCode(q: Tx, adminId: number, username: string) {
  const world = await getWorld(q);
  const r = await q.query(
    'SELECT id, username FROM players WHERE world_id = $1 AND lower(username) = lower($2) AND NOT is_npc',
    [world.id, username.trim()],
  );
  const row = r.rows[0];
  if (!row) throw new GameError('not_found', 'No player by that name.', 404);
  // 248 is the largest multiple of 31 under 256: drop bytes above it so every letter is equally likely
  let raw = '';
  while (raw.length < 8) for (const b of randomBytes(16)) if (b < 248 && raw.length < 8) raw += CODE_ALPHABET[b % 31];
  const t = now();
  const expiresAt = t + RESET_CODE_HOURS * 3600_000;
  await q.query(
    `INSERT INTO password_resets (player_id, code_hash, created_by, created_at, expires_at, tries) VALUES ($1,$2,$3,$4,$5,0)
     ON CONFLICT (player_id) DO UPDATE SET code_hash = $2, created_by = $3, created_at = $4, expires_at = $5, tries = 0`,
    [row.id, hashCode(raw), adminId, t, expiresAt],
  );
  return { username: row.username as string, code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt };
}

export const BAD_CODE_MESSAGE = 'That code doesn’t work. Ask the game’s keeper for a new one.';

/**
 * Player: name + code + new password. On success sets the password, ends every old session and logs them in.
 * A wrong code returns ok: false (not a throw) so the wrong-guess count is kept when the transaction commits.
 */
export async function resetPassword(q: Tx, username: string, code: string, newPassword: string) {
  const world = await getWorld(q);
  const r = await q.query(
    `SELECT p.id, pr.code_hash, pr.expires_at, pr.tries FROM players p JOIN password_resets pr ON pr.player_id = p.id
      WHERE p.world_id = $1 AND lower(p.username) = lower($2) FOR UPDATE OF pr`,
    [world.id, username.trim()],
  );
  const row = r.rows[0];
  if (!row || Number(row.expires_at) <= now() || row.tries >= RESET_MAX_TRIES) return { ok: false as const };
  const given = Buffer.from(hashCode(code));
  const expected = Buffer.from(row.code_hash as string);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await q.query('UPDATE password_resets SET tries = tries + 1 WHERE player_id = $1', [row.id]);
    return { ok: false as const };
  }
  await q.query('UPDATE players SET password_hash = $2 WHERE id = $1', [row.id, await hashPassword(newPassword)]);
  await q.query('DELETE FROM password_resets WHERE player_id = $1', [row.id]);
  await q.query('DELETE FROM sessions WHERE player_id = $1', [row.id]);
  const token = await createSession(q, row.id);
  return { ok: true as const, playerId: row.id as number, token };
}

export async function logout(q: Tx, token: string | undefined) {
  if (token) await q.query('DELETE FROM sessions WHERE token = $1', [token]);
}
