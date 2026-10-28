// In-game feedback posted to GitHub as issues (server/src/game/feedbackGithub.ts). GitHub itself is faked.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../src/db';
import { config } from '../src/config';
import { feedbackIssue, syncFeedbackToGitHub } from '../src/game/feedbackGithub';
import { setupTest, teardownTest, newPlayer, type Client } from './helpers';

let app: FastifyInstance;
let p: Client;

beforeAll(async () => {
  ({ app } = await setupTest());
  p = await newPlayer(app, 'reporter');
});
afterEach(() => {
  config.feedbackGithubToken = '';
});
afterAll(async () => teardownTest(app));

/** A stand-in for GitHub's create-issue endpoint that records what it was sent. */
function fakeGitHub(status = 201) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  let next = 100;
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ number: next++ }), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const issueOf = async (id: number) => (await getPool().query('SELECT github_issue FROM feedback WHERE id = $1', [id])).rows[0].github_issue;
const lastId = async () => (await getPool().query('SELECT max(id)::int AS id FROM feedback')).rows[0].id as number;

describe('feedback issue text', () => {
  it('keeps player text inert and leaves out names', () => {
    const issue = feedbackIssue({
      id: 7, player_id: 42, kind: 'bug', created_at: 1_800_000_000_000,
      message: 'Hey @someone, look: ```code``` [link](http://x)\nsecond line',
      context: { screen: 'map', viewport: '390x844', userAgent: 'UA @evil', colony: 'Secret Hill', coords: '1:2:3', worldSpeed: 1 },
    });
    expect(issue.title).toBe('Feedback (bug): Hey someone, look: ```code``` [link](http://x) second line');
    expect(issue.labels).toEqual(['feedback', 'bug']);
    expect(issue.body.startsWith('````text\n')).toBe(true); // fence longer than any backtick run in the message
    expect(issue.body).toContain('- **Player:** #42');
    expect(issue.body).toContain('- **Screen:** map');
    expect(issue.body).toContain('- **Browser:** UA  evil');
    expect(issue.body).not.toContain('Secret Hill');
    expect(issue.body).not.toContain('1:2:3');
  });

  it('shortens long titles', () => {
    const issue = feedbackIssue({ id: 1, player_id: 1, kind: 'idea', created_at: 0, message: 'x'.repeat(200), context: {} });
    expect(issue.title.length).toBeLessThanOrEqual('Feedback (idea): '.length + 70);
    expect(issue.labels).toEqual(['feedback', 'enhancement']);
  });
});

describe('posting to GitHub', () => {
  it('does nothing without a token', async () => {
    expect((await p.post('/api/feedback', { kind: 'bug', message: 'Ants are stuck.' })).ok).toBe(true);
    const gh = fakeGitHub();
    expect(await syncFeedbackToGitHub(getPool(), gh.fn)).toBe(0);
    expect(gh.calls).toHaveLength(0);
    expect(await issueOf(await lastId())).toBeNull();
  });

  it('posts unposted feedback once, and remembers the issue number', async () => {
    config.feedbackGithubToken = 'test-token';
    const gh = fakeGitHub();
    expect(await syncFeedbackToGitHub(getPool(), gh.fn)).toBe(1);
    expect(gh.calls[0].url).toBe(`https://api.github.com/repos/${config.feedbackRepo}/issues`);
    expect((gh.calls[0].init.headers as any).authorization).toBe('Bearer test-token');
    expect(gh.calls[0].body.title).toBe('Feedback (bug): Ants are stuck.');
    expect(await issueOf(await lastId())).toBe(100);
    // nothing left to post
    expect(await syncFeedbackToGitHub(getPool(), gh.fn)).toBe(0);
    expect(gh.calls).toHaveLength(1);
  });

  it('keeps feedback for later when GitHub fails, and skips feedback already handled', async () => {
    // sent while no token is set, so the route's own background post can't reach the real GitHub
    expect((await p.post('/api/feedback', { kind: 'idea', message: 'More beetles.' })).ok).toBe(true);
    const idea = await lastId();
    expect((await p.post('/api/feedback', { kind: 'other', message: 'Already sorted.' })).ok).toBe(true);
    const sorted = await lastId();
    await getPool().query('UPDATE feedback SET handled = true WHERE id = $1', [sorted]);
    config.feedbackGithubToken = 'test-token';

    const down = fakeGitHub(503);
    expect(await syncFeedbackToGitHub(getPool(), down.fn)).toBe(0);
    expect(await issueOf(idea)).toBeNull();

    const up = fakeGitHub();
    expect(await syncFeedbackToGitHub(getPool(), up.fn)).toBe(1);
    expect(up.calls.map((c) => c.body.title)).toEqual(['Feedback (idea): More beetles.']);
    expect(await issueOf(idea)).toBe(100);
    expect(await issueOf(sorted)).toBeNull();
  });
});
