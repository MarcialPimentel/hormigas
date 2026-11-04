import { WORLD, TERRAIN, STARTING_TERRAIN, INACTIVE_AFTER_MS, randInt, createRng, randomSeed, distance, patchNeighbours } from '@hormigas/shared';
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

/** A span of game hours in real milliseconds at world speed `speed` (a ×5 world runs 5 times faster). */
export const gameHoursMs = (hours: number, speed: number): number => (hours * 3600_000) / speed;

/** World speed for synchronous rules code. getWorld() runs at startup and on every sign-up, so the cache is warm. */
export const cachedWorldSpeed = (): number => cached?.speed ?? 1;

export function clearWorldCache() {
  cached = null;
}

/**
 * Pick a starting spot (docs/11-world.md, "Starting placement"): neighbours, but never patch-mates.
 * Sharing a patch made new players fight over the same wild nest, herd and forage.
 * 1. A patch with no players (wild things are fine) next to an active player's patch: one of the hexes
 *    touching it, so each can see the other's patch. Among those, and failing that among all empty patches,
 *    the closest by real travel distance; ties go to world order.
 * 2. With no active players, the next patch without players after the newest player's home.
 * 3. Only when every patch has players: any patch with a free Grassland spot.
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
            count(DISTINCT c.player_id) FILTER (WHERE NOT p.is_npc AND p.last_active > $2)::int AS active
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 GROUP BY c.region, c.patch`,
    [worldId, now() - INACTIVE_AFTER_MS],
  );
  const patches = r.rows.map((x: any) => ({
    region: x.region as number,
    patch: x.patch as number,
    players: x.players as number,
    active: x.active as number,
    free: startSpots.filter((s) => !(x.spots as number[]).includes(s)),
  }));
  // patches holding only wild things (nests, herds, mounds, dens: docs/24-npcs.md) are still open for players
  const used = new Set(patches.filter((p) => p.players > 0).map((p) => idx(p.region, p.patch)));
  const freeIn = (i: number) => {
    const p = patches.find((x) => idx(x.region, x.patch) === i);
    return p ? p.free : startSpots;
  };

  // 1. the empty patch closest to an active player
  const homes = patches.filter((p) => p.active > 0).map((p) => ({ region: p.region, patch: p.patch, spot: 1 }));
  if (homes.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 1; i <= total; i++) {
      if (used.has(i) || freeIn(i).length === 0) continue;
      const here = { ...at(i), spot: 1 };
      const touching = homes.some((h) => h.region === here.region && patchNeighbours(h.patch).includes(here.patch));
      // touching a player's patch beats any distance
      const d = Math.min(...homes.map((h) => distance(h, here))) + (touching ? 0 : 1e9);
      if (d < bestD) [best, bestD] = [i, d];
    }
    if (best) return place(at(best).region, at(best).patch, freeIn(best));
  }

  // 2. a fresh patch beside the newest player
  const newest = await q.query(
    `SELECT c.region, c.patch FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND NOT p.is_npc ORDER BY p.created_at DESC, c.id ASC LIMIT 1`,
    [worldId],
  );
  const from = newest.rows[0] ? idx(newest.rows[0].region, newest.rows[0].patch) : 0;
  for (let k = 1; k <= total; k++) {
    const i = ((from + k - 1) % total) + 1;
    if (!used.has(i) && freeIn(i).length > 0) return place(at(i).region, at(i).patch, freeIn(i));
  }

  // 3. every patch has players: anywhere with room
  const any = patches.find((p) => p.free.length > 0);
  if (any) return place(any.region, any.patch, any.free);
  throw new GameError('world_full', 'The world is full. Please try again later.', 503);
}
