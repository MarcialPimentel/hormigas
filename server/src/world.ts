import { WORLD, TERRAIN, STARTING_TERRAIN, INACTIVE_AFTER_MS, randInt, createRng, randomSeed } from '@hormigas/shared';
import type { Q } from './db';
import { config } from './config';
import { now } from './clock';
import { GameError } from './errors';

export interface World {
  id: number;
  name: string;
  speed: number;
}

let cached: World | null = null;

/** The single world (MVP). Created on first call. */
export async function getWorld(q: Q): Promise<World> {
  if (cached) return cached;
  let r = await q.query('SELECT id, name, speed FROM worlds ORDER BY id LIMIT 1');
  if (!r.rows[0]) {
    r = await q.query('INSERT INTO worlds (name, speed, created_at) VALUES ($1,$2,$3) RETURNING id, name, speed', [
      config.worldName, config.worldSpeed, now(),
    ]);
  }
  cached = { id: r.rows[0].id, name: r.rows[0].name, speed: Number(r.rows[0].speed) };
  return cached;
}

/** World speed for synchronous rules code. getWorld() runs at startup and on every sign-up, so the cache is warm. */
export const cachedWorldSpeed = (): number => cached?.speed ?? 1;

export function clearWorldCache() {
  cached = null;
}

/**
 * Pick a starting spot (docs/11-world.md, "Starting placement"): players should meet.
 * 1. Join a patch where active players live and a Grassland spot is free, up to `playersPerPatch` players.
 *    Emptiest first, so lone players get neighbours first; then the patch with the weakest leader
 *    (a newcomer faces a smaller wild nest), then world order.
 * 2. Otherwise open the next empty patch after the newest player's home, so new patches sit side by side.
 * 3. Otherwise any patch with a free Grassland spot.
 */
export async function pickStartingSpot(q: Q, worldId: number): Promise<{ region: number; patch: number; spot: number; baseSpace: number }> {
  const rng = createRng(randomSeed());
  const startSpots = TERRAIN[STARTING_TERRAIN].spots;
  const [lo, hi] = TERRAIN[STARTING_TERRAIN].space;
  const P = WORLD.patchesPerRegion;
  const total = WORLD.regions * P;
  const idx = (region: number, patch: number) => (region - 1) * P + patch;
  const at = (i: number) => ({ region: Math.floor((i - 1) / P) + 1, patch: ((i - 1) % P) + 1 });
  const place = (region: number, patch: number, free: number[]) => ({ region, patch, spot: free[randInt(rng, 0, free.length - 1)], baseSpace: randInt(rng, lo, hi) });

  const r = await q.query(
    `SELECT c.region, c.patch, array_agg(c.spot) AS spots,
            count(DISTINCT c.player_id) FILTER (WHERE NOT p.is_npc)::int AS players,
            count(DISTINCT c.player_id) FILTER (WHERE NOT p.is_npc AND p.last_active > $2)::int AS active,
            coalesce(max(p.points_total) FILTER (WHERE NOT p.is_npc), 0)::int AS top
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 GROUP BY c.region, c.patch`,
    [worldId, now() - INACTIVE_AFTER_MS],
  );
  const patches = r.rows.map((x: any) => ({
    region: x.region as number,
    patch: x.patch as number,
    players: x.players as number,
    active: x.active as number,
    top: x.top as number,
    free: startSpots.filter((s) => !(x.spots as number[]).includes(s)),
  }));

  // 1. join players
  const joinable = patches
    .filter((p) => p.active > 0 && p.players < WORLD.playersPerPatch && p.free.length > 0)
    .sort((a, b) => a.players - b.players || a.top - b.top || idx(a.region, a.patch) - idx(b.region, b.patch));
  if (joinable[0]) return place(joinable[0].region, joinable[0].patch, joinable[0].free);

  // 2. a fresh patch beside the newest player
  const used = new Set(patches.map((p) => idx(p.region, p.patch)));
  const newest = await q.query(
    `SELECT c.region, c.patch FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND NOT p.is_npc ORDER BY p.created_at DESC, c.id ASC LIMIT 1`,
    [worldId],
  );
  const from = newest.rows[0] ? idx(newest.rows[0].region, newest.rows[0].patch) : 0;
  for (let k = 1; k <= total; k++) {
    const i = ((from + k - 1) % total) + 1;
    if (!used.has(i)) return place(at(i).region, at(i).patch, startSpots);
  }

  // 3. anywhere with room
  const any = patches.find((p) => p.free.length > 0);
  if (any) return place(any.region, any.patch, any.free);
  throw new GameError('world_full', 'The world is full. Please try again later.', 503);
}
