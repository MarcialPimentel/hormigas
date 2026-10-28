// Posts in-game feedback to GitHub as issues, so it can be read and triaged alongside the code.
// The database stays the record: anything not posted yet (GitHub down, no token) is retried later.
// The repository is public, so issues carry the player's id rather than their name or colony.
import type { Pool } from 'pg';
import { config } from '../config';

const LABELS: Record<string, string[]> = {
  bug: ['feedback', 'bug'],
  idea: ['feedback', 'enhancement'],
  confusing: ['feedback', 'question'],
  other: ['feedback'],
};

export interface FeedbackRow {
  id: number;
  player_id: number;
  kind: string;
  message: string;
  context: Record<string, unknown>;
  created_at: number | string;
}

/** Title, body and labels for one piece of feedback. Pure, for tests. */
export function feedbackIssue(f: FeedbackRow) {
  const oneLine = f.message.replace(/\s+/g, ' ').replace(/@/g, '').trim();
  const title = `Feedback (${f.kind}): ${oneLine.length > 70 ? `${oneLine.slice(0, 67)}...` : oneLine}`;
  // player text goes in a code block: no @-mentions, links or markdown tricks in a public issue
  const longestTicks = Math.max(0, ...(f.message.match(/`+/g) ?? []).map((s) => s.length));
  const fence = '`'.repeat(Math.max(3, longestTicks + 1));
  const ctx = f.context ?? {};
  const facts: [string, unknown][] = [
    ['Kind', f.kind],
    ['Player', `#${f.player_id}`],
    ['Screen', ctx.screen],
    ['Viewport', ctx.viewport],
    ['Browser', ctx.userAgent],
    ['World speed', ctx.worldSpeed != null ? `×${ctx.worldSpeed}` : undefined],
    ['Sent', new Date(Number(f.created_at)).toISOString()],
  ];
  const body = [
    `${fence}text`,
    f.message,
    fence,
    '',
    ...facts.filter(([, v]) => v != null && v !== '').map(([k, v]) => `- **${k}:** ${String(v).replace(/[\r\n`@]/g, ' ')}`),
    '',
    `_Sent from the in-game Feedback button (feedback #${f.id}). Mark it handled on the in-game Feedback screen._`,
  ].join('\n');
  return { title, body, labels: LABELS[f.kind] ?? LABELS.other };
}

let running = false;

/** Post any feedback not on GitHub yet (oldest first, a few at a time). Safe to call often. */
export async function syncFeedbackToGitHub(pool: Pool, fetchFn: typeof fetch = fetch): Promise<number> {
  if (!config.feedbackGithubToken || running) return 0;
  running = true;
  let posted = 0;
  try {
    const r = await pool.query(
      'SELECT id, player_id, kind, message, context, created_at FROM feedback WHERE github_issue IS NULL AND NOT handled ORDER BY id LIMIT 10',
    );
    for (const f of r.rows as FeedbackRow[]) {
      const res = await fetchFn(`https://api.github.com/repos/${config.feedbackRepo}/issues`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.feedbackGithubToken}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'hormigas-server',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify(feedbackIssue(f)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`feedback #${f.id}: GitHub said ${res.status}; will retry later`);
        break;
      }
      const issue = (await res.json()) as { number: number };
      await pool.query('UPDATE feedback SET github_issue = $2 WHERE id = $1', [f.id, issue.number]);
      posted++;
    }
  } catch (e) {
    console.warn('feedback to GitHub failed; will retry later', e);
  } finally {
    running = false;
  }
  return posted;
}
