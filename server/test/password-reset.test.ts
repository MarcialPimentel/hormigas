// Password reset by admin-made one-time code (no emails in this game).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { RESET_CODE_HOURS, RESET_MAX_TRIES } from '../src/game/accounts';
import { setupTest, teardownTest, newPlayer, setPlayer, type Client } from './helpers';

let app: FastifyInstance;
let clock: Awaited<ReturnType<typeof setupTest>>['clock'];
let admin: Client;
let ant: Client;

// Each call from its own address, so the 10-a-minute limit on login routes doesn't trip in this test.
let ip = 0;
const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, headers: cookie ? { cookie } : {}, remoteAddress: `10.0.${Math.floor(++ip / 250)}.${ip % 250}` });
const reset = (code: string, password = 'newpassword1', username = 'forgetful') => post('/api/auth/reset', { username, code, password });
const login = (password: string, username = 'forgetful') => post('/api/auth/login', { username, password });
const playerId = async (name: string) =>
  (await getPool().query('SELECT id FROM players WHERE username = $1', [name])).rows[0].id as number;

beforeAll(async () => {
  ({ app, clock } = await setupTest());
  admin = await newPlayer(app, 'keeper');
  await setPlayer(await playerId('keeper'), { is_admin: true });
  ant = await newPlayer(app, 'forgetful');
});
afterAll(async () => teardownTest(app));

describe('password reset', () => {
  it('only admins can make codes', async () => {
    const r = await ant.post('/api/admin/reset-code', { username: 'keeper' });
    expect(r.status).toBe(403);
    expect((await post('/api/admin/reset-code', { username: 'forgetful' })).statusCode).toBe(401);
  });

  it('says so when the name is unknown', async () => {
    expect((await admin.post('/api/admin/reset-code', { username: 'nobody_here' })).status).toBe(404);
  });

  it('lets the player set a new password once, logs them in and ends old sessions', async () => {
    const r = await admin.post('/api/admin/reset-code', { username: 'FORGETFUL' });
    expect(r.ok).toBe(true);
    expect(r.username).toBe('forgetful');
    expect(r.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

    // typed in lower case, without the dash
    const res = await reset(r.code.toLowerCase().replace('-', ''));
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers['set-cookie']).split(';')[0];
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: { cookie } })).statusCode).toBe(200);

    // the old session is gone, the old password no longer works, the new one does
    expect((await ant.get('/api/state')).status).toBe(401);
    expect((await login('password123')).statusCode).toBe(401);
    expect((await login('newpassword1')).statusCode).toBe(200);

    // the code works only once
    expect((await reset(r.code, 'another_pass1')).statusCode).toBe(401);
  });

  it('a new code replaces the old one', async () => {
    const first = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    const second = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    expect((await reset(first.code)).statusCode).toBe(401);
    expect((await reset(second.code)).statusCode).toBe(200);
  });

  it('a code is void after too many wrong guesses', async () => {
    const r = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    for (let i = 0; i < RESET_MAX_TRIES; i++) expect((await reset('ZZZZ-ZZZZ')).statusCode).toBe(401);
    expect((await reset(r.code)).statusCode).toBe(401);
  });

  it('a code runs out', async () => {
    const r = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    await clock.advance(RESET_CODE_HOURS * 3600_000 + 1000);
    const res = await reset(r.code);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('bad_code');
  });

  it('a code for one player does not open another account', async () => {
    const r = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    expect((await reset(r.code, 'newpassword1', 'keeper')).statusCode).toBe(401);
  });

  it('the new password still has to be 8+ characters', async () => {
    const r = await admin.post('/api/admin/reset-code', { username: 'forgetful' });
    expect((await reset(r.code, 'short')).statusCode).toBe(400);
    expect((await reset(r.code)).statusCode).toBe(200);
  });
});
