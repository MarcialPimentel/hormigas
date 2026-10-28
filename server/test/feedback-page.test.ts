// The private feedback page reached by a secret link (server/src/routes/feedbackPage.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { config } from '../src/config';
import { setupTest, teardownTest, newPlayer, type Client } from './helpers';

const KEY = 'quiet-ants-carry-leaves-42';
let app: FastifyInstance;
let p: Client;

const open = (query: string) => app.inject({ method: 'GET', url: `/api/feedback/private${query}` });

beforeAll(async () => {
  ({ app } = await setupTest());
  p = await newPlayer(app, 'tester');
  expect((await p.post('/api/feedback', { kind: 'bug', message: 'Ants <b>freeze</b> on desktop', context: { screen: 'colony' } })).ok).toBe(true);
  expect((await p.post('/api/feedback', { kind: 'idea', message: 'More beetles please' })).ok).toBe(true);
  await getPool().query("UPDATE feedback SET handled = true WHERE message = 'More beetles please'");
});
afterEach(() => {
  config.feedbackKey = '';
});
afterAll(async () => teardownTest(app));

describe('private feedback page', () => {
  it('does not exist without a key set on the server, or with a short one', async () => {
    expect((await open('?key=')).statusCode).toBe(404);
    config.feedbackKey = 'short';
    expect((await open('?key=short')).statusCode).toBe(404);
  });

  it('turns away a wrong or missing key', async () => {
    config.feedbackKey = KEY;
    expect((await open('')).statusCode).toBe(404);
    expect((await open('?key=quiet-ants-carry-leaves-43')).statusCode).toBe(404);
    expect((await open(`?key=${KEY}x`)).statusCode).toBe(404);
  });

  it('lists open feedback as a page, with player text escaped', async () => {
    config.feedbackKey = KEY;
    const r = await open(`?key=${KEY}`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toContain('Ants &lt;b&gt;freeze&lt;/b&gt; on desktop');
    expect(r.body).not.toContain('<b>freeze</b>');
    expect(r.body).toContain('from <b>tester</b>');
    expect(r.body).toContain('screen: colony');
    expect(r.body).not.toContain('More beetles please'); // handled
    expect(r.body).toContain('1 open');
  });

  it('can show everything, as JSON too', async () => {
    config.feedbackKey = KEY;
    const all = await open(`?key=${KEY}&show=all`);
    expect(all.body).toContain('More beetles please');
    const json = JSON.parse((await open(`?key=${KEY}&show=all&format=json`)).body);
    expect(json.open).toBe(1);
    expect(json.items.map((x: any) => x.message)).toEqual(['More beetles please', 'Ants <b>freeze</b> on desktop']);
    expect(json.items[0]).toMatchObject({ kind: 'idea', from: 'tester', handled: true });
  });
});
