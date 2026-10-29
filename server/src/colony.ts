// Loading, saving and advancing colonies & players.
import {
  canAfford,
  explainShortfall,
  nestAt,
  nestUnitsAt,
  productionPerHour,
  shortfalls,
  storageCapacity,
  syncColony,
  type ChamberId,
  type ColonyState,
  type ResearchId,
  type NpcState,
  herdHoneydewAt,
  isHerdState,
  type ResearchLevels,
  type Resources,
} from '@hormigas/shared';
import type { Q } from './db';
import { notFound, forbidden, GameError } from './errors';
import { cachedWorldSpeed } from './world';

export interface BuildJob {
  chamber: ChamberId;
  level: number;
  startAt: number;
  endAt: number;
  cost: Resources;
  eventId: number;
}

export interface Colony extends ColonyState {
  id: number;
  worldId: number;
  playerId: number;
  name: string;
  region: number;
  patch: number;
  spot: number;
  baseSpace: number;
  buildJob: BuildJob | null;
  createdAt: number;
  /** Set for wild things (NPC colonies: nests, mounds, dens, aphid herds), null for player colonies. */
  npc: NpcState | null;
}

// owner_research: the owner's research, read along with the colony because production and storage depend on it.
// Read-only here: saveColony never writes it (research is saved on the player row).
const COLS = 'id, world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated, chambers, units, defenses, build_job, unit_queue, digest_job, created_at, npc, (SELECT p.research FROM players p WHERE p.id = colonies.player_id) AS owner_research';

function fromRow(r: any): Colony {
  return {
    id: r.id,
    worldId: r.world_id,
    playerId: r.player_id,
    name: r.name,
    region: r.region,
    patch: r.patch,
    spot: r.spot,
    terrain: r.terrain,
    baseSpace: r.base_space,
    resources: { foliage: r.foliage, protein: r.protein, nectar: r.nectar },
    lastUpdated: r.last_updated,
    chambers: r.chambers,
    units: r.units,
    defenses: r.defenses,
    buildJob: r.build_job,
    unitQueue: r.unit_queue,
    digestJob: r.digest_job ?? null,
    createdAt: r.created_at,
    npc: r.npc ?? null,
    research: r.owner_research ?? {},
  };
}

/** Load a colony row-locked for update. */
export async function lockColony(q: Q, id: number): Promise<Colony> {
  const r = await q.query(`SELECT ${COLS} FROM colonies WHERE id = $1 FOR UPDATE`, [id]);
  if (!r.rows[0]) throw notFound('Colony not found.');
  return fromRow(r.rows[0]);
}

export async function lockOwnColony(q: Q, id: number, playerId: number): Promise<Colony> {
  const c = await lockColony(q, id);
  if (c.playerId !== playerId) throw forbidden();
  return c;
}

export async function getColony(q: Q, id: number): Promise<Colony> {
  const r = await q.query(`SELECT ${COLS} FROM colonies WHERE id = $1`, [id]);
  if (!r.rows[0]) throw notFound('Colony not found.');
  return fromRow(r.rows[0]);
}

export async function playerColonies(q: Q, playerId: number): Promise<Colony[]> {
  const r = await q.query(`SELECT ${COLS} FROM colonies WHERE player_id = $1 ORDER BY id`, [playerId]);
  return r.rows.map(fromRow);
}

/** Ids of a player's colonies, in a stable order (for locking them one by one). */
export async function playerColonyIds(q: Q, playerId: number): Promise<number[]> {
  const r = await q.query('SELECT id FROM colonies WHERE player_id = $1 ORDER BY id', [playerId]);
  return r.rows.map((x: any) => x.id);
}

export async function colonyAt(q: Q, worldId: number, region: number, patch: number, spot: number): Promise<Colony | null> {
  const r = await q.query(`SELECT ${COLS} FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND spot = $4`, [worldId, region, patch, spot]);
  return r.rows[0] ? fromRow(r.rows[0]) : null;
}

export async function saveColony(q: Q, c: Colony) {
  await q.query(
    `UPDATE colonies SET name=$2, foliage=$3, protein=$4, nectar=$5, last_updated=$6, chambers=$7, units=$8, defenses=$9,
       build_job=$10, unit_queue=$11, npc=$12, digest_job=$13 WHERE id=$1`,
    [
      c.id, c.name, c.resources.foliage, c.resources.protein, c.resources.nectar, c.lastUpdated,
      JSON.stringify(c.chambers), JSON.stringify(c.units), JSON.stringify(c.defenses),
      c.buildJob ? JSON.stringify(c.buildJob) : null, JSON.stringify(c.unitQueue), c.npc ? JSON.stringify(c.npc) : null,
      c.digestJob ? JSON.stringify(c.digestJob) : null,
    ],
  );
}

/** Bring a colony up to time `to`. Wild nests regrow instead of producing (docs/17-wild-nests.md); herds make honeydew. */
export const advance = (c: Colony, to: number): Colony => {
  if (isHerdState(c.npc)) {
    // aphid herds make honeydew while tended (docs/23-npcs.md); the tenders are the herd's units
    const nectar = herdHoneydewAt(c.npc, c.resources.nectar, to, cachedWorldSpeed());
    return { ...c, resources: { ...c.resources, nectar }, lastUpdated: to, npc: { ...c.npc, at: to } };
  }
  if (c.npc) {
    const live = nestAt(c.npc, c, to, cachedWorldSpeed());
    return { ...c, ...live, lastUpdated: to, npc: { ...c.npc, at: to, unitsAt: nestUnitsAt(c.npc, c, to, cachedWorldSpeed()) } };
  }
  return syncColony(c, to, cachedWorldSpeed());
};

/** Throw a plain-language error if the colony can't pay `cost`. */
export function requireAffordable(c: Colony, cost: Resources) {
  if (canAfford(c.resources, cost)) return;
  const why = explainShortfall(shortfalls(cost, c.resources, storageCapacity(c.chambers, c.research), productionPerHour(c.chambers, c.terrain, cachedWorldSpeed(), c.research)));
  throw new GameError('cant_afford', why || 'Not enough resources.');
}

// ---------- players ----------

export interface ResearchJob {
  research: ResearchId;
  level: number;
  startAt: number;
  endAt: number;
  cost: Resources;
  colonyId: number;
  eventId: number;
}

export interface Player {
  id: number;
  worldId: number;
  username: string;
  createdAt: number;
  lastActive: number;
  protectedUntil: number;
  research: ResearchLevels;
  researchJob: ResearchJob | null;
  points: { total: number; economy: number; research: number; military: number };
  /** Can read player feedback. Set by hand in the database (docs/DEPLOY.md). */
  isAdmin: boolean;
  /** The hidden owner of every wild nest (docs/17-wild-nests.md). */
  isNpc: boolean;
}

const PCOLS = 'id, world_id, username, created_at, last_active, protected_until, research, research_job, points, is_admin, is_npc';

function playerFromRow(r: any): Player {
  return {
    id: r.id,
    worldId: r.world_id,
    username: r.username,
    createdAt: r.created_at,
    lastActive: r.last_active,
    protectedUntil: r.protected_until,
    research: r.research,
    researchJob: r.research_job,
    points: r.points,
    isAdmin: r.is_admin,
    isNpc: r.is_npc,
  };
}

export async function getPlayer(q: Q, id: number, lock = false): Promise<Player> {
  const r = await q.query(`SELECT ${PCOLS} FROM players WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rows[0]) throw notFound('Player not found.');
  return playerFromRow(r.rows[0]);
}

export async function savePlayerResearch(q: Q, p: Player) {
  await q.query('UPDATE players SET research = $2, research_job = $3 WHERE id = $1', [
    p.id, JSON.stringify(p.research), p.researchJob ? JSON.stringify(p.researchJob) : null,
  ]);
}
