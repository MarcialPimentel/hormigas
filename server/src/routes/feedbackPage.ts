// A private page listing in-game feedback, reached by a secret link instead of an admin login
// (same idea as guildie): https://hormigas.marz.gg/api/feedback/private?key=<FEEDBACK_KEY>
// Add &show=all to include feedback already marked handled, &format=json for machine reading.
// No key set on the server (or a short one) = the page doesn't exist.
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db';
import { config } from '../config';
import { notFound } from '../errors';

/** Shorter keys are too easy to guess, so they leave the page switched off. */
export const FEEDBACK_KEY_MIN_LENGTH = 16;

function keyMatches(given: unknown): boolean {
  const expected = config.feedbackKey;
  if (expected.length < FEEDBACK_KEY_MIN_LENGTH || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

interface Item {
  id: number;
  kind: string;
  message: string;
  from: string;
  context: Record<string, unknown>;
  createdAt: number;
  handled: boolean;
}

function page(items: Item[], open: number, all: boolean, key: string) {
  const link = (show: string, label: string) => `<a href="?key=${encodeURIComponent(key)}${show}">${label}</a>`;
  const rows = items
    .map((f) => {
      const c = f.context ?? {};
      const where = [c.screen && `screen: ${c.screen}`, c.colony && `colony: ${c.colony} (${c.coords})`, c.viewport && `viewport: ${c.viewport}`, c.worldSpeed && `speed ×${c.worldSpeed}`]
        .filter(Boolean)
        .join(' · ');
      return `<article class="${f.handled ? 'done' : ''}">
  <header><b>#${f.id}</b> <span class="kind ${esc(f.kind)}">${esc(f.kind)}</span> from <b>${esc(f.from)}</b> · ${new Date(f.createdAt).toISOString().replace('T', ' ').slice(0, 16)} UTC${f.handled ? ' · handled' : ''}</header>
  <p>${esc(f.message)}</p>
  <footer>${esc(where)}${c.userAgent ? `<br>${esc(c.userAgent)}` : ''}</footer>
</article>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Hormigas feedback</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;max-width:52rem;margin:0 auto;padding:1rem;background:#1f1712;color:#f1e6d6}
a{color:#e6b450}h1{font-size:1.3rem;margin:.2rem 0}nav{margin-bottom:1rem;color:#b9a68f}
article{background:#2c2119;border-radius:8px;padding:.7rem .9rem;margin:.6rem 0}article.done{opacity:.55}
header{font-size:.85rem;color:#b9a68f}p{margin:.4rem 0;white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:.75rem;color:#8f7d68;overflow-wrap:anywhere}
.kind{padding:0 .4rem;border-radius:4px;background:#4a3a2c;color:#f1e6d6}.kind.bug{background:#8a2f27}.kind.idea{background:#2f6b3a}.kind.confusing{background:#7a5a12}
</style></head><body>
<h1>Hormigas feedback</h1>
<nav>${open} open · ${all ? `showing all · ${link('', 'show open only')}` : `showing open · ${link('&show=all', 'show all')}`} · mark items handled on the in-game Feedback screen</nav>
${rows || '<p>Nothing here.</p>'}
</body></html>`;
}

export async function feedbackPageRoutes(app: FastifyInstance) {
  app.get('/api/feedback/private', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string>;
    if (!keyMatches(q.key)) throw notFound();
    const all = q.show === 'all';
    const r = await getPool().query(
      `SELECT f.id, f.kind, f.message, f.context, f.created_at, f.handled, p.username
         FROM feedback f JOIN players p ON p.id = f.player_id
        ${all ? '' : 'WHERE NOT f.handled'}
        ORDER BY f.created_at DESC, f.id DESC LIMIT 500`,
    );
    const open = (await getPool().query('SELECT count(*)::int AS n FROM feedback WHERE NOT handled')).rows[0].n as number;
    const items: Item[] = r.rows.map((x: any) => ({
      id: x.id, kind: x.kind, message: x.message, from: x.username, context: x.context, createdAt: Number(x.created_at), handled: x.handled,
    }));
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').header('x-robots-tag', 'noindex');
    if (q.format === 'json') return { open, items };
    return reply.type('text/html; charset=utf-8').send(page(items, open, all, q.key));
  });
}
