// Wild things: NPC colonies near players (docs/17-wild-nests.md, docs/24-npcs.md).
// Each is an ordinary colony row with an `npc` state, owned by one hidden wild player per world: wild nests on colony
// spots, and aphid herds, termite mounds and spider dens on wild sites in the patch's wilds.
// Nests regrow over time (see advance() in colony.ts); levels follow the strongest player nearby.
import {
  AREA_RANGE,
  HERDS,
  SITE_SPOTS,
  herdLevelFor,
  isHerdState,
  nestRaidsBack,
  res,
  speciesOfKind,
  wildThingsAround,
  type HerdState,
  type NpcState,
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

/**
 * Points that set a wild thing's level (docs/24-npcs.md): the strongest active player in its own patch, or, in a
 * patch with no active players, the strongest within AREA_RANGE patches. A patch's own wild nest keeps following its
 * own players, as before.
 */
export async function areaLeaderPoints(q: Q, worldId: number, region: number, patch: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT c.patch, p.points_total, p.protected_until, p.last_active
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND c.region = $2 AND c.patch BETWEEN $3::int - $4::int AND $3::int + $4::int AND NOT p.is_npc`,
    [worldId, region, patch, AREA_RANGE],
  );
  const own = leaderOf(r.rows.filter((x: any) => x.patch === patch), t);
  return own > 0 ? own : leaderOf(r.rows, t);
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

async function insertWild(
  q: Tx, worldId: number, at: { region: number; patch: number; spot: number }, name: string, terrain: string,
  full: { units: object; defenses: object; resources: { foliage: number; protein: number; nectar: number } }, npc: NpcState, t: number,
): Promise<number> {
  const owner = await wildPlayerId(q, worldId, t);
  const r = await q.query(
    `INSERT INTO colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated,
       chambers, units, defenses, npc, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,'{}',$12,$13,$14,$11)
     ON CONFLICT (world_id, region, patch, spot) DO NOTHING RETURNING id`,
    [worldId, owner, name, at.region, at.patch, at.spot, terrain, full.resources.foliage, full.resources.protein, full.resources.nectar, t,
      JSON.stringify(full.units), JSON.stringify(full.defenses), JSON.stringify(npc)],
  );
  return r.rows[0]?.id ?? 0;
}

/** Spawn the patch's wild nest if it has none and there is a free spot. Returns the nest's colony id, or null. */
export async function ensureNest(q: Tx, worldId: number, region: number, patch: number, t: number): Promise<number | null> {
  const taken = await q.query('SELECT id, spot, npc FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3', [worldId, region, patch]);
  // the wild nest lives on a colony spot; herds, mounds and dens live on wild sites (docs/24-npcs.md)
  const existing = taken.rows.find((r: any) => r.npc && r.spot <= WORLD.spotsPerPatch);
  if (existing) return existing.id;
  const used = new Set(taken.rows.map((r: any) => r.spot));
  const startSpots = new Set(TERRAIN[STARTING_TERRAIN].spots);
  const free: number[] = [];
  for (let s = 1; s <= WORLD.spotsPerPatch; s++) if (!used.has(s) && !startSpots.has(s)) free.push(s);
  if (free.length === 0) return null;

  const rng = createRng(randomSeed());
  const spot = free[Math.floor(rng() * free.length)];
  const terrain = terrainForSpot(spot);
  const species = speciesForTerrain(terrain, rng);
  const level = nestLevelFor(await areaLeaderPoints(q, worldId, region, patch, t));
  const npc: NestState = { species, level, at: t };
  const id = await insertWild(q, worldId, { region, patch, spot }, nestName(species), terrain, nestTargets(species, level), npc, t);
  if (!id) return null;
  const world = await getWorld(q);
  await schedule(q, worldId, 'nest_raid', t + (nextNestRaidHours(rng) * HOUR) / world.speed, { colonyId: id });
  return id;
}

/** Spawn a termite mound or spider den on its wild site, if the site is empty. They never raid, so no events. */
export async function ensureBigNest(q: Tx, worldId: number, region: number, patch: number, kind: 'mound' | 'den', t: number): Promise<number | null> {
  const spot = SITE_SPOTS[kind];
  const here = await q.query('SELECT id FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND spot = $4', [worldId, region, patch, spot]);
  if (here.rows[0]) return null;
  const species = speciesOfKind(kind);
  const level = nestLevelFor(await areaLeaderPoints(q, worldId, region, patch, t), 1, species);
  const npc: NestState = { species, level, at: t };
  return (await insertWild(q, worldId, { region, patch, spot }, nestName(species), 'wilds', nestTargets(species, level), npc, t)) || null;
}

/** Spawn an aphid herd on the patch's herd site, if the site is empty. It starts untended and waits there. */
export async function ensureHerd(q: Tx, worldId: number, region: number, patch: number, t: number): Promise<number | null> {
  const spot = SITE_SPOTS.herd;
  const here = await q.query('SELECT id FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND spot = $4', [worldId, region, patch, spot]);
  if (here.rows[0]) return null;
  const level = herdLevelFor(await areaLeaderPoints(q, worldId, region, patch, t));
  // An untended herd that nobody has found yet stays put: it only wanders once someone has tended it and left.
  const npc: HerdState = { kind: 'herd', level, at: t, tender: null, untendedSince: null };
  return (await insertWild(q, worldId, { region, patch, spot }, HERDS.name, 'wilds', { units: {}, defenses: {}, resources: res() }, npc, t)) || null;
}

/**
 * Fill the area around a patch where a player lives (docs/24-npcs.md): a wild nest and an aphid herd in every patch
 * within range, plus the termite mounds and spider dens in reach. Returns how many wild things were spawned.
 */
export async function ensureArea(q: Tx, worldId: number, region: number, patch: number, t: number): Promise<number> {
  let n = 0;
  for (const w of wildThingsAround(region, patch)) {
    let id: number | null = null;
    if (w.thing === 'nest') {
      const before = await q.query('SELECT 1 FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND npc IS NOT NULL AND spot <= $4', [worldId, w.region, w.patch, WORLD.spotsPerPatch]);
      if (before.rows[0]) continue;
      id = await ensureNest(q, worldId, w.region, w.patch, t);
    } else if (w.thing === 'herd') id = await ensureHerd(q, worldId, w.region, w.patch, t);
    else id = await ensureBigNest(q, worldId, w.region, w.patch, w.thing, t);
    if (id) n++;
  }
  return n;
}

/** Fill the area around every patch that has players (run at startup, so areas settled before this build fill in). */
export async function ensureWildNests(q: Tx, worldId: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT DISTINCT c.region, c.patch FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND NOT p.is_npc ORDER BY c.region, c.patch`,
    [worldId],
  );
  let spawned = 0;
  for (const row of r.rows) spawned += await ensureArea(q, worldId, row.region, row.patch, t);
  // safety net: a nest whose raid event was lost (or failed) gets a fresh one. Mounds, dens and herds never raid.
  const idle = await q.query(
    `SELECT c.id, c.npc FROM colonies c WHERE c.world_id = $1 AND c.npc IS NOT NULL AND c.spot <= $2
        AND NOT EXISTS (SELECT 1 FROM events e WHERE NOT e.done AND e.type = 'nest_raid' AND (e.payload->>'colonyId')::int = c.id)`,
    [worldId, WORLD.spotsPerPatch],
  );
  const speed = (await getWorld(q)).speed;
  const rng = createRng(randomSeed());
  for (const row of idle.rows) {
    if (isHerdState(row.npc) || !nestRaidsBack(row.npc.species)) continue;
    await schedule(q, worldId, 'nest_raid', t + (nextNestRaidHours(rng) * HOUR) / speed, { colonyId: row.id });
  }
  return spawned;
}

/**
 * Bring a wild thing up to time t and raise its level if its area's leader has grown. Saves on a level-up.
 * Works for wild nests, mounds, dens and aphid herds.
 */
export async function syncNest(q: Q, nest: Colony, t: number): Promise<Colony> {
  const c = advance(nest, t);
  if (!c.npc) return c;
  const leader = await areaLeaderPoints(q, c.worldId, c.region, c.patch, t);
  if (isHerdState(c.npc)) {
    const level = herdLevelFor(leader, c.npc.level);
    if (level > c.npc.level) {
      c.npc = { ...c.npc, level };
      await saveColony(q, c);
    }
    return c;
  }
  const level = nestLevelFor(leader, c.npc.level, c.npc.species);
  if (level > c.npc.level) {
    // values so far were regrowing toward the old level; from now on they grow toward the new one
    c.npc = { ...c.npc, level };
    await saveColony(q, c);
  }
  return c;
}

/** Display name for whoever owns a colony: the nest's name for wild nests. */
export const ownerName = (c: Colony, username: string) => (c.npc ? c.name : username);

/** The wild nest-like state of a colony (nest, mound or den), or null for players' colonies and aphid herds. */
export const nestStateOf = (c: Colony): NestState | null => (c.npc && !isHerdState(c.npc) ? c.npc : null);

// ---------- nests raid back (gently) ----------

onEvent('nest_raid', async (q, ev) => {
  const t = ev.due_at;
  const world = await getWorld(q);
  const rearm = () => schedule(q, ev.world_id, 'nest_raid', t + (nextNestRaidHours(createRng(randomSeed())) * HOUR) / world.speed, { colonyId: ev.payload.colonyId });
  const found = await q.query('SELECT id, npc FROM colonies WHERE id = $1 AND npc IS NOT NULL', [ev.payload.colonyId]);
  if (!found.rows[0]) return; // the nest is gone: stop raiding
  if (isHerdState(found.rows[0].npc) || !nestRaidsBack(found.rows[0].npc.species)) return; // herds, mounds and dens never raid
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
