// Loading, saving and advancing colonies & players.
import {
  syncColony,
  type ChamberId,
  type ColonyState,
  type ResearchId,
  type ResearchLevels,
  type Resources,
} from '@hormigas/shared';
import type { Q } from './db';
import { notFound, forbidden } from './errors';

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
}

const COLS = 'id, world_id, player_id, name, region, patch, spot, terrain, base_space, foliage, protein, nectar, last_updated, chambers, units, defenses, build_job, unit_queue, created_at';

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
    createdAt: r.created_at,
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

export async function colonyAt(q: Q, worldId: number, region: number, patch: number, spot: number): Promise<Colony | null> {
  const r = await q.query(`SELECT ${COLS} FROM colonies WHERE world_id = $1 AND region = $2 AND patch = $3 AND spot = $4`, [worldId, region, patch, spot]);
  return r.rows[0] ? fromRow(r.rows[0]) : null;
}

export async function saveColony(q: Q, c: Colony) {
  await q.query(
    `UPDATE colonies SET name=$2, foliage=$3, protein=$4, nectar=$5, last_updated=$6, chambers=$7, units=$8, defenses=$9,
       build_job=$10, unit_queue=$11 WHERE id=$1`,
    [
      c.id, c.name, c.resources.foliage, c.resources.protein, c.resources.nectar, c.lastUpdated,
      JSON.stringify(c.chambers), JSON.stringify(c.units), JSON.stringify(c.defenses),
      c.buildJob ? JSON.stringify(c.buildJob) : null, JSON.stringify(c.unitQueue),
    ],
  );
}

export const advance = (c: Colony, to: number): Colony => syncColony(c, to);

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
}

const PCOLS = 'id, world_id, username, created_at, last_active, protected_until, research, research_job, points';

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
