// Missions: dispatch, arrival, return, recall. Each mission type registers its own rules.
import {
  CASTES,
  CASTE_IDS,
  RESOURCE_IDS,
  add,
  canAfford,
  distance,
  groupCargo,
  groupSpeed,
  missionFuel,
  missionSlots,
  forageSlots,
  presentUnits,
  res,
  sub,
  subCounts,
  addCounts,
  total,
  travelSeconds,
  validCoords,
  WILDS_SPOT,
  type CasteId,
  type Coords,
  type Resources,
  type UnitCounts,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { now } from '../clock';
import { GameError, notFound, forbidden } from '../errors';
import { advance, colonyAt, getPlayer, lockColony, lockOwnColony, saveColony, type Colony, type Player } from '../colony';
import { cancelEvent, onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { refreshPoints } from './points';
import { notify } from '../realtime';

export type MissionType = 'transport' | 'relocate' | 'scout' | 'raid' | 'haul' | 'forage';

export interface Mission {
  id: number;
  worldId: number;
  playerId: number;
  type: MissionType;
  originColonyId: number;
  origin: Coords;
  target: Coords;
  targetColonyId: number | null;
  units: UnitCounts;
  cargo: Resources;
  speedPct: number;
  fuel: number;
  departAt: number;
  arriveAt: number;
  returnAt: number | null;
  status: 'outbound' | 'returning' | 'done';
  arriveEventId: number | null;
  returnEventId: number | null;
  result: any;
}

function fromRow(r: any): Mission {
  return {
    id: r.id,
    worldId: r.world_id,
    playerId: r.player_id,
    type: r.type,
    originColonyId: r.origin_colony_id,
    origin: { region: r.origin_region, patch: r.origin_patch, spot: r.origin_spot },
    target: { region: r.target_region, patch: r.target_patch, spot: r.target_spot },
    targetColonyId: r.target_colony_id,
    units: r.units,
    cargo: r.cargo,
    speedPct: r.speed_pct,
    fuel: r.fuel,
    departAt: r.depart_at,
    arriveAt: r.arrive_at,
    returnAt: r.return_at,
    status: r.status,
    arriveEventId: r.arrive_event_id,
    returnEventId: r.return_event_id,
    result: r.result,
  };
}

export async function lockMission(q: Q, id: number): Promise<Mission> {
  const r = await q.query('SELECT * FROM missions WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw notFound('Mission not found.');
  return fromRow(r.rows[0]);
}

async function saveMission(q: Q, m: Mission) {
  await q.query(
    `UPDATE missions SET units=$2, cargo=$3, return_at=$4, status=$5, arrive_event_id=$6, return_event_id=$7, result=$8 WHERE id=$1`,
    [m.id, JSON.stringify(m.units), JSON.stringify(m.cargo), m.returnAt, m.status, m.arriveEventId, m.returnEventId, m.result ? JSON.stringify(m.result) : null],
  );
}

export async function activeMissions(q: Q, playerId: number): Promise<Mission[]> {
  const r = await q.query("SELECT * FROM missions WHERE player_id = $1 AND status <> 'done' ORDER BY id", [playerId]);
  return r.rows.map(fromRow);
}

// ---------- per-type rules ----------

export interface SendContext {
  q: Tx;
  player: Player;
  colony: Colony;
  units: UnitCounts;
  cargo: Resources;
  target: Coords;
  targetColony: Colony | null;
  t: number;
}

export interface ArrivalOutcome {
  /** false = mission ends at the target (relocate, or everyone died) */
  home: boolean;
  /** multiplier on the return trip (forage events) */
  returnFactor?: number;
}

interface TypeRules {
  /** Validate the dispatch; throw GameError to refuse. */
  validate: (ctx: SendContext) => Promise<void>;
  /** Resolve arrival at the target. May mutate m.units / m.cargo / m.result. */
  arrive: (q: Tx, m: Mission, at: number) => Promise<ArrivalOutcome>;
  allowsCargo: boolean;
  allowsWilds?: boolean;
  /** Which slot pool the mission uses. */
  slot: 'mission' | 'forage';
}

const RULES = new Map<MissionType, TypeRules>();
export function defineMission(type: MissionType, rules: TypeRules) {
  RULES.set(type, rules);
}
export const enabledMissionTypes = () => [...RULES.keys()];

// ---------- dispatch ----------

export interface SendInput {
  colonyId: number;
  type: string;
  target: Coords;
  units: Record<string, unknown>;
  cargo?: Record<string, unknown>;
  speedPct?: number;
}

function parseUnits(raw: Record<string, unknown>, home: UnitCounts): UnitCounts {
  const units: UnitCounts = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!CASTE_IDS.includes(k as CasteId) || !CASTES[k as CasteId].mvp) throw new GameError('bad_unit', `Unknown unit ${k}.`);
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new GameError('bad_count', 'Unit counts must be whole numbers.');
    if (n === 0) continue;
    if (n > (home[k as CasteId] ?? 0)) throw new GameError('not_enough_units', `You only have ${home[k as CasteId] ?? 0} ${CASTES[k as CasteId].name} at home.`);
    units[k as CasteId] = n;
  }
  if (presentUnits(units).length === 0) throw new GameError('no_units', 'Pick at least one unit to send.');
  return units;
}

function parseCargo(raw: Record<string, unknown> | undefined): Resources {
  const c = res();
  for (const r of RESOURCE_IDS) {
    const n = Number(raw?.[r] ?? 0);
    if (!Number.isFinite(n) || n < 0) throw new GameError('bad_cargo', 'Cargo must be zero or more.');
    c[r] = Math.floor(n);
  }
  return c;
}

export async function sendMission(q: Tx, playerId: number, input: SendInput): Promise<Mission> {
  const type = input.type as MissionType;
  const rules = RULES.get(type);
  if (!rules) throw new GameError('bad_type', 'Unknown mission type.');
  const t = now();
  const player = await getPlayer(q, playerId, true);
  let colony = await lockOwnColony(q, Number(input.colonyId), playerId);
  colony = advance(colony, t);

  const target = { region: Number(input.target?.region), patch: Number(input.target?.patch), spot: Number(input.target?.spot) };
  if (!validCoords(target, !!rules.allowsWilds)) throw new GameError('bad_target', 'That place does not exist.');
  if (!rules.allowsWilds && target.spot === WILDS_SPOT) throw new GameError('bad_target', 'Nothing lives out in the wilds.');

  const units = parseUnits(input.units, colony.units);
  const cargo = rules.allowsCargo ? parseCargo(input.cargo) : res();
  const speedPct = Number(input.speedPct ?? 100);
  if (!Number.isInteger(speedPct) || speedPct < 10 || speedPct > 100 || speedPct % 10 !== 0)
    throw new GameError('bad_speed', 'Speed must be 10%–100% in steps of 10.');

  const world = await getWorld(q);
  const targetColony = target.spot === WILDS_SPOT ? null : await colonyAt(q, world.id, target.region, target.patch, target.spot);
  await rules.validate({ q, player, colony, units, cargo, target, targetColony, t });

  // slots
  const active = await activeMissions(q, playerId);
  const pool = rules.slot;
  const used = active.filter((m) => (RULES.get(m.type)?.slot ?? 'mission') === pool).length;
  const max = pool === 'forage' ? forageSlots(player.research) : missionSlots(player.research);
  if (used >= max)
    throw new GameError('no_slots', pool === 'forage' ? 'All forage parties are already out.' : `All ${max} mission slots are in use. Research Colony Mind for more.`);

  const origin = { region: colony.region, patch: colony.patch, spot: colony.spot };
  const dist = distance(origin, target);
  const speed = groupSpeed(units, player.research);
  const secs = travelSeconds(dist, speed, speedPct, world.speed);
  const fuel = missionFuel(units, dist, speedPct);

  if (total(cargo) > groupCargo(units)) throw new GameError('over_cargo', 'Your units can’t carry that much.');
  const needed = add(cargo, res(0, 0, fuel));
  if (!canAfford(colony.resources, needed))
    throw new GameError('cant_afford', colony.resources.nectar < fuel ? `Not enough Nectar for the trip (needs ${fuel}).` : 'Not enough resources to load.');

  colony.resources = sub(colony.resources, needed);
  colony.units = subCounts(colony.units, units);
  await saveColony(q, colony);

  return launchMission(q, {
    worldId: world.id, playerId, type, origin: colony, target, targetColony, units, cargo, speedPct, fuel,
    departAt: t, arriveAt: t + secs * 1000, senderName: player.username,
  });
}

/** Write a mission that has already been paid for and schedule its arrival. Used by players and by wild nests. */
export async function launchMission(
  q: Tx,
  o: {
    worldId: number; playerId: number; type: MissionType; origin: Colony; target: Coords; targetColony: Colony | null;
    units: UnitCounts; cargo: Resources; speedPct: number; fuel: number; departAt: number; arriveAt: number;
    /** shown to the target in "incoming" notices */
    senderName: string;
  },
): Promise<Mission> {
  const { origin, target } = o;
  const r = await q.query(
    `INSERT INTO missions (world_id, player_id, type, origin_colony_id, origin_region, origin_patch, origin_spot,
       target_region, target_patch, target_spot, target_colony_id, units, cargo, speed_pct, fuel, depart_at, arrive_at, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'outbound',$16) RETURNING *`,
    [o.worldId, o.playerId, o.type, origin.id, origin.region, origin.patch, origin.spot, target.region, target.patch, target.spot,
      o.targetColony?.id ?? null, JSON.stringify(o.units), JSON.stringify(o.cargo), o.speedPct, o.fuel, o.departAt, o.arriveAt],
  );
  const m = fromRow(r.rows[0]);
  m.arriveEventId = await schedule(q, o.worldId, 'mission_arrive', o.arriveAt, { missionId: m.id });
  await saveMission(q, m);
  if (o.targetColony && o.targetColony.playerId !== o.playerId)
    notify(o.targetColony.playerId, { type: 'incoming', missionType: o.type, from: o.senderName, arriveAt: o.arriveAt, colony: o.targetColony.name });
  return m;
}

// ---------- recall ----------

export async function recallMission(q: Tx, playerId: number, missionId: number): Promise<Mission> {
  const m = await lockMission(q, missionId);
  if (m.playerId !== playerId) throw forbidden();
  const t = now();
  if (m.status !== 'outbound' || t >= m.arriveAt) throw new GameError('too_late', 'This mission can no longer be recalled.');
  if (m.arriveEventId) await cancelEvent(q, m.arriveEventId);
  m.arriveEventId = null;
  m.returnAt = t + (t - m.departAt);
  m.status = 'returning';
  m.result = { recalled: true };
  m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
  await saveMission(q, m);
  return m;
}

// ---------- events ----------

onEvent('mission_arrive', async (q, ev) => {
  const m = await lockMission(q, ev.payload.missionId);
  if (m.status !== 'outbound' || m.arriveEventId !== ev.id) return;
  const rules = RULES.get(m.type);
  if (!rules) throw new Error(`No rules for mission type ${m.type}`);
  const out = await rules.arrive(q, m, ev.due_at);
  const anyone = presentUnits(m.units).length > 0;
  if (out.home && anyone) {
    m.status = 'returning';
    m.returnAt = ev.due_at + Math.round((m.arriveAt - m.departAt) * (out.returnFactor ?? 1));
    m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
  } else {
    m.status = 'done';
  }
  await saveMission(q, m);
  if (m.status === 'done') await refreshPoints(q, m.playerId);
});

onEvent('mission_return', async (q, ev) => {
  const m = await lockMission(q, ev.payload.missionId);
  if (m.status !== 'returning' || m.returnEventId !== ev.id) return;
  let c = await lockColony(q, m.originColonyId);
  c = advance(c, ev.due_at);
  c.units = addCounts(c.units, m.units);
  c.resources = add(c.resources, m.cargo);
  await saveColony(q, c);
  m.status = 'done';
  await saveMission(q, m);
  await refreshPoints(q, m.playerId);
  notify(m.playerId, { type: 'returned', missionType: m.type });
});

// ---------- views ----------

export function missionView(m: Mission) {
  return {
    id: m.id,
    type: m.type,
    originColonyId: m.originColonyId,
    origin: m.origin,
    target: m.target,
    targetColonyId: m.targetColonyId,
    units: m.units,
    cargo: m.cargo,
    speedPct: m.speedPct,
    fuel: m.fuel,
    departAt: m.departAt,
    arriveAt: m.arriveAt,
    returnAt: m.returnAt,
    status: m.status,
    result: m.result,
  };
}

/** Hostile or friendly missions heading to the player's colonies (attacker's units hidden unless scouts). */
export async function incomingMissions(q: Q, playerId: number) {
  const r = await q.query(
    `SELECT m.id, m.type, m.arrive_at, m.target_colony_id, m.origin_region, m.origin_patch, m.origin_spot, m.units,
            CASE WHEN p.is_npc THEN o.name ELSE p.username END AS username, p.is_npc
       FROM missions m JOIN colonies c ON c.id = m.target_colony_id JOIN players p ON p.id = m.player_id
       JOIN colonies o ON o.id = m.origin_colony_id
      WHERE c.player_id = $1 AND m.player_id <> $1 AND m.status = 'outbound' ORDER BY m.arrive_at`,
    [playerId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    type: row.type,
    arriveAt: row.arrive_at,
    targetColonyId: row.target_colony_id,
    origin: { region: row.origin_region, patch: row.origin_patch, spot: row.origin_spot },
    from: row.username,
    /** a wild nest, not a player */
    wild: row.is_npc,
    hostile: row.type === 'raid' || row.type === 'scout',
    unitCount: Object.values(row.units as Record<string, number>).reduce((a, b) => a + b, 0),
  }));
}
