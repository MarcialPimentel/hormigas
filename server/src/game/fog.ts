// Fog of war (docs/22-discovery.md#fog-of-war): what each player can see of the world.
// - In sight: patches with your colonies and the patches next to them, and patches where your ants are stationed
//   (soldiers holding an ally's colony, ants tending an aphid herd or holding a windfall). Supercolony mates share
//   their sight and their explored patches.
// - Explored: a patch your ants have reached before. It shows as you last saw it: colonies founded since stay hidden.
// - Unexplored: only its outline.
// Every map route and mission check asks here instead of reading explored_patches directly.
import { FOG_MESSAGES, patchNeighbours, type FogState } from '@hormigas/shared';
import type { Q } from '../db';
import { GameError } from '../errors';

const key = (region: number, patch: number) => `${region}:${patch}`;

export interface Sight {
  /** patches in sight right now, as "region:patch" */
  visible: Set<string>;
  /** explored patches, as "region:patch", with when they were last in sight */
  seen: Map<string, number>;
}

/** The player and their supercolony mates: they share what they see. */
async function sharers(q: Q, playerId: number): Promise<number[]> {
  const r = await q.query(
    `SELECT DISTINCT o.player_id FROM supercolony_members me
       JOIN supercolony_members o ON o.supercolony_id = me.supercolony_id
      WHERE me.player_id = $1 AND me.status = 'member' AND o.status = 'member'`,
    [playerId],
  );
  return [...new Set([playerId, ...r.rows.map((x: any) => x.player_id as number)])];
}

/** What `playerId` can see at time `t`. Also keeps "last seen" fresh on patches where their own ants are stationed. */
export async function sightOf(q: Q, playerId: number, t: number): Promise<Sight> {
  const who = await sharers(q, playerId);
  const visible = new Set<string>();
  const homes = await q.query('SELECT DISTINCT region, patch FROM colonies WHERE npc IS NULL AND player_id = ANY($1::int[])', [who]);
  for (const h of homes.rows) {
    visible.add(key(h.region, h.patch));
    for (const n of patchNeighbours(h.patch)) visible.add(key(h.region, n));
  }
  // stationed ants: tenders at a herd or windfall (kept on the site itself), soldiers holding an ally's colony
  const posts = await q.query(
    `SELECT DISTINCT region, patch, (npc->'tender'->>'playerId')::int AS player_id FROM colonies
      WHERE npc IS NOT NULL AND (npc->'tender'->>'playerId')::int = ANY($1::int[])
     UNION
     SELECT DISTINCT target_region, target_patch, player_id FROM missions WHERE status = 'holding' AND player_id = ANY($1::int[])`,
    [who],
  );
  const mine: [number, number][] = [];
  for (const p of posts.rows) {
    visible.add(key(p.region, p.patch));
    if (p.player_id === playerId) mine.push([p.region, p.patch]);
  }
  for (const [region, patch] of mine) await explore(q, playerId, region, patch, t);
  const seen = new Map<string, number>();
  const rows = await q.query(
    'SELECT region, patch, max(seen_at) AS seen_at FROM explored_patches WHERE player_id = ANY($1::int[]) GROUP BY region, patch',
    [who],
  );
  for (const r of rows.rows) seen.set(key(r.region, r.patch), Number(r.seen_at));
  return { visible, seen };
}

/** How `sight` sees one patch, and when it was last in sight (explored patches only). */
export function fogOf(sight: Sight, region: number, patch: number): { fog: FogState; seenAt: number | null } {
  const k = key(region, patch);
  if (sight.visible.has(k)) return { fog: 'visible', seenAt: null };
  const at = sight.seen.get(k);
  return at === undefined ? { fog: 'unexplored', seenAt: null } : { fog: 'explored', seenAt: at };
}

/** Whether a colony created at `createdAt` shows on a patch seen this way: on an explored patch, only if it was there last time. */
export function showsThrough(f: { fog: FogState; seenAt: number | null }, createdAt: number): boolean {
  return f.fog === 'visible' || (f.fog === 'explored' && createdAt <= (f.seenAt ?? 0));
}

/** `playerId`'s ants have reached this patch (or are still there) at time `at`: it's explored, last seen then. */
export async function explore(q: Q, playerId: number, region: number, patch: number, at: number) {
  await q.query(
    `INSERT INTO explored_patches (player_id, region, patch, seen_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (player_id, region, patch) DO UPDATE SET seen_at = GREATEST(explored_patches.seen_at, EXCLUDED.seen_at)`,
    [playerId, region, patch, at],
  );
}

/** Missions into a patch you've never explored: only Scouts (or a forage party) surveying its wilds may go. */
export async function requireExploredFor(q: Q, playerId: number, target: { region: number; patch: number }, surveyingWilds: boolean, t: number) {
  if (surveyingWilds) return;
  const f = fogOf(await sightOf(q, playerId, t), target.region, target.patch);
  if (f.fog === 'unexplored') throw new GameError('unexplored', FOG_MESSAGES.unexplored);
}
