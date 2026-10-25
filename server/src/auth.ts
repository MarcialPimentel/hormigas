import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';
import { getPool, type Q } from './db';
import { now } from './clock';
import { GameError } from './errors';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const SESSION_COOKIE = 'hormigas_sid';

export async function createSession(q: Q, playerId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const t = now();
  await q.query('INSERT INTO sessions (token, player_id, created_at, expires_at) VALUES ($1,$2,$3,$4)', [
    token, playerId, t, t + config.sessionDays * 86400_000,
  ]);
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: config.sessionDays * 86400,
  });
}

export async function playerIdFromToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  const r = await getPool().query('SELECT player_id FROM sessions WHERE token = $1 AND expires_at > $2', [token, now()]);
  return r.rows[0]?.player_id ?? null;
}

declare module 'fastify' {
  interface FastifyRequest {
    playerId: number;
  }
}

/** preHandler: requires a valid session; sets request.playerId and touches last_active. */
export async function requireAuth(req: FastifyRequest) {
  const id = await playerIdFromToken(req.cookies[SESSION_COOKIE]);
  if (!id) throw new GameError('unauthorized', 'Please log in.', 401);
  req.playerId = id;
  await getPool().query('UPDATE players SET last_active = $2 WHERE id = $1', [id, now()]);
}

export function validateCredentials(username: unknown, password: unknown): { username: string; password: string } {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username))
    throw new GameError('bad_username', 'Username must be 3–20 letters, numbers or underscores.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200)
    throw new GameError('bad_password', 'Password must be at least 8 characters.');
  return { username, password };
}
