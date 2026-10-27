// Wild nests: NPC colonies, one per patch with players (docs/17-wild-nests.md).
// A nest is an ordinary colony row with an `npc` state, owned by one hidden wild player per world.
// Its soldiers and food regrow over time (see advance() in colony.ts); its level follows the patch's leader.
import {
  TERRAIN,
  STARTING_TERRAIN,
  WORLD,
  NEST_RAIDS,
  createRng,
  distance,
  groupSpeed,
  isInactive,
  nestLevelFor,
  nestName,
  nestRaidParty,
  nestTargets,
  nextNestRaidHours,
  randomSeed,
  speciesForTerrain,
  subCounts,
  terrainForSpot,
  travelSeconds,
  type NestState,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { advance, lockColony, saveColony, type Colony } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { launchMission } from './missions';

const HOUR = 3600_000;

/** The hidden player that owns every wild nest in a world. Its name can't be registered or logged into. */
export async function wildPlayerId(q: Q, worldId: number, t: number): Promise<number> {
  const r = await q.query('SELECT id FROM players WHERE world_id = $1 AND is_npc LIMIT 1', [worldId]);
  if (r.rows[0]) return r.rows[0].id;
  const ins = await q.query(
    `INSERT INTO players (world_id, username, password_hash, created_at, last_active, protected_until, is_npc)
     VALUES ($1, '~wild', '!', $2, $2, 0, true) RETURNING id`,
    [worldId, t],
  );
  return ins.rows[0].id;
}

/** Points of the strongest active player with a colony in the patch (0 if none). */
export async function patchLeaderPoints(q: Q, worldId: number, region: number, patch: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT p.points_total, p.protected_until, p.last_active
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3 AND NOT p.is_npc`,
    [worldId, region, patch],
  );
  return leaderOf(r.rows, t);
}

/** Highest points among active players in a list of player rows. */
export function leaderOf(rows: { points_total: number; protected_until: number; last_active: number }[], t: number): number {
  let best = 0;
  for (const p of rows) {
    if (isInactive({ points: p.points_total, protectedUntil: Number(p.protected_until), lastActive: Number(p.last_active) }, t)) continue;
    best = Math.max(best, p.points_total);
  }
  return best;
}

/** Spawn the patch's wild nest if it has none and there is a free spot. Returns the nest's colony id, or null. */
export async function ensureNest(q: Tx, worldId: number, region: number, patch: number, t: number): Promise<number | null> {
  const taken = await q.query('SELECT id, spot, npc FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3', [worldId, region, patch]);
  const existing = taken.rows.find((r: any) => r.npc);
  if (existing) return existing.id;
  const used = new Set(taken.rows.map((r: any) => r.spot));
  const startSpots = new Set(TERRAIN[STARTING_TERRAIN].spots);
  const free: number[] = [];
  for (let s = 1; s <= WORLD.spotsPerPatch; s++) if (!used.has(s) && !startSpots.has(s)) free.push(s);
  if (free.length === 0) return null;

  const rng = createRng(randomSeed());
  const spot = free[Math.floor(rng() * free.length)];
  const terrain = terrainForSpot(spot);
  const species = speciesForTerrain(terrain);
  const level = nestLevelFor(await patchLeaderPoints(q, worldId, region, patch, t));
  const full = nestTargets(species, level);
  const npc: NestState = { species, level, at: t };
  const owner = await wildPlayerId(q, worldId, t);
  const r = await q.query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated,
       chambers, units, defenses, npc, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,'{}',$12,$13,$14,$11) RETURNING id`,
    [worldId, owner, nestName(species), region, patch, spot, terrain, full.resources.foliage, full.resources.protein, full.resources.nectar, t,
      JSON.stringify(full.units), JSON.stringify(full.defenses), JSON.stringify(npc)],
  );
  const id = r.rows[0].id as number;
  const world = await getWorld(q);
  await schedule(q, worldId, 'nest_raid', t + (nextNestRaidHours(rng) * HOUR) / world.speed, { colonyId: id });
  return id;
}

/** Give every patch that has players a nest (run at startup, so patches settled before nests existed get one). */
export async function ensureWildNests(q: Tx, worldId: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT DISTINCT c.region, c.patch FROM colonies c
      WHERE c.world_id = $1 AND c.npc IS NULL
        AND NOT EXISTS (SELECT 1 FROM colonies n WHERE n.world_id = c.world_id AND n.region = c.region AND n.patch = c.patch AND n.npc IS NOT NULL)`,
    [worldId],
  );
  let spawned = 0;
  for (const row of r.rows) if (await ensureNest(q, worldId, row.region, row.patch, t)) spawned++;
  // safety net: a nest whose raid event was lost (or failed) gets a fresh one
  const idle = await q.query(
    `SELECT c.id FROM colonies c WHERE c.world_id = $1 AND c.npc IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM events e WHERE NOT e.done AND e.type = 'nest_raid' AND (e.payload->>'colonyId')::int = c.id)`,
    [worldId],
  );
  const speed = (await getWorld(q)).speed;
  const rng = createRng(randomSeed());
  for (const row of idle.rows) await schedule(q, worldId, 'nest_raid', t + (nextNestRaidHours(rng) * HOUR) / speed, { colonyId: row.id });
  return spawned;
}

/** Bring a nest up to time t and raise its level if the patch's leader has grown. Saves on a level-up. */
export async function syncNest(q: Q, nest: Colony, t: number): Promise<Colony> {
  const c = advance(nest, t);
  if (!c.npc) return c;
  const level = nestLevelFor(await patchLeaderPoints(q, c.worldId, c.region, c.patch, t), c.npc.level);
  if (level > c.npc.level) {
    // values so far were regrowing toward the old level; from now on they grow toward the new one
    c.npc = { ...c.npc, level };
    await saveColony(q, c);
  }
  return c;
}

/** Display name for whoever owns a colony: the nest's name for wild nests. */
export const ownerName = (c: Colony, username: string) => (c.npc ? c.name : username);

// ---------- nests raid back (gently) ----------

onEvent('nest_raid', async (q, ev) => {
  const t = ev.due_at;
  const world = await getWorld(q);
  const rearm = () => schedule(q, ev.world_id, 'nest_raid', t + (nextNestRaidHours(createRng(randomSeed())) * HOUR) / world.speed, { colonyId: ev.payload.colonyId });
  const found = await q.query('SELECT id FROM colonies WHERE id = $1 AND npc IS NOT NULL', [ev.payload.colonyId]);
  if (!found.rows[0]) return; // the nest is gone: stop raiding
  let nest = await syncNest(q, await lockColony(q, ev.payload.colonyId), t);

  const target = await pickNestTarget(q, nest, t);
  if (target) {
    const party = nestRaidParty(nest.units, target.points);
    if (Object.keys(party).length > 0) {
      nest = { ...nest, units: subCounts(nest.units, party) };
      await saveColony(q, nest);
      const dest = { region: target.colony.region, patch: target.colony.patch, spot: target.colony.spot };
      const secs = travelSeconds(distance(nest, dest), groupSpeed(party, {}), NEST_RAIDS.speedPct, world.speed);
      await launchMission(q, {
        worldId: nest.worldId, playerId: nest.playerId, type: 'raid', origin: nest, target: dest, targetColony: target.colony,
        units: party, cargo: { foliage: 0, protein: 0, nectar: 0 }, speedPct: NEST_RAIDS.speedPct, fuel: 0,
        departAt: t, arriveAt: t + secs * 1000, senderName: nest.name,
      });
    }
  }
  await rearm();
});

/**
 * One player colony in the nest's patch, or null. Never: protected or inactive players, anyone a nest raided
 * (or is on its way to raid) in the cooldown. Players who raided this nest recently are likelier picks.
 */
async function pickNestTarget(q: Q, nest: Colony, t: number): Promise<{ colony: Colony; points: number } | null> {
  const cooldown = (NEST_RAIDS.perPlayerCooldownHours * HOUR) / (await getWorld(q)).speed;
  const r = await q.query(
    `SELECT c.id, p.id AS player_id, p.points_total, p.protected_until, p.last_active,
            EXISTS (SELECT 1 FROM raid_log l WHERE l.attacker_id = p.id AND l.colony_id = $4 AND l.at > $5::bigint - $7::bigint) AS raided_us
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3 AND NOT p.is_npc AND p.protected_until <= $5
        AND NOT EXISTS (SELECT 1 FROM raid_log l JOIN colonies lc ON lc.id = l.colony_id
                         WHERE l.attacker_id = $6 AND lc.player_id = p.id AND l.at > $5::bigint - $7::bigint)
        AND NOT EXISTS (SELECT 1 FROM missions m JOIN colonies mc ON mc.id = m.target_colony_id
                         WHERE m.player_id = $6 AND m.status = 'outbound' AND mc.player_id = p.id)`,
    [nest.worldId, nest.region, nest.patch, nest.id, t, nest.playerId, cooldown],
  );
  const candidates = r.rows.filter((row: any) => !isInactive({ points: row.points_total, protectedUntil: Number(row.protected_until), lastActive: Number(row.last_active) }, t));
  if (candidates.length === 0) return null;
  const weights = candidates.map((row: any) => (row.raided_us ? NEST_RAIDS.revengeWeight : 1));
  let x = createRng(randomSeed())() * weights.reduce((a: number, b: number) => a + b, 0);
  let pick = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    x -= weights[i];
    if (x < 0) { pick = candidates[i]; break; }
  }
  const colony = await lockColony(q, pick.id);
  return { colony, points: pick.points_total };
}
