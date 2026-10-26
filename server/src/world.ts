import { WORLD, TERRAIN, STARTING_TERRAIN, randInt, createRng, randomSeed } from '@hormigas/shared';
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

/** Pick a free starting spot: least-populated region, random patch, a free Grassland spot. */
export async function pickStartingSpot(q: Q, worldId: number): Promise<{ region: number; patch: number; spot: number; baseSpace: number }> {
  const counts = new Map<number, number>();
  for (let r = 1; r <= WORLD.regions; r++) counts.set(r, 0);
  const rc = await q.query('SELECT region, count(*)::int AS n FROM colonies WHERE world_id = $1 GROUP BY region', [worldId]);
  for (const row of rc.rows) counts.set(row.region, row.n);
  const regions = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([r]) => r);
  const rng = createRng(randomSeed());
  const startSpots = TERRAIN[STARTING_TERRAIN].spots;

  for (const region of regions) {
    for (let tries = 0; tries < 300; tries++) {
      const patch = randInt(rng, 1, WORLD.patchesPerRegion);
      const taken = await q.query('SELECT spot FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3', [worldId, region, patch]);
      const used = new Set(taken.rows.map((r) => r.spot));
      const free = startSpots.filter((s) => !used.has(s));
      if (free.length === 0) continue;
      const spot = free[randInt(rng, 0, free.length - 1)];
      const [lo, hi] = TERRAIN[STARTING_TERRAIN].space;
      return { region, patch, spot, baseSpace: randInt(rng, lo, hi) };
    }
  }
  throw new GameError('world_full', 'The world is full. Please try again later.', 503);
}
