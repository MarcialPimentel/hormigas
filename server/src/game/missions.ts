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
  missionSlotUsage,
  missionUnitProblem,
  noSlotsMessage,
  isValidSpeedPct,
  recallReturnAt,
  returnLegMs,
  MISSION_TYPES,
  presentUnits,
  res,
  sub,
  subCounts,
  addCounts,
  total,
  travelSeconds,
  validCoords,
  WILDS_SPOT,
  SWARM,
  isHerdState,
  type CasteId,
  type MissionType,
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
import { refreshPointsAfterCommit } from './points';
import { notify } from '../realtime';

export type { MissionType };

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
  /** holding: soldiers stationed at an ally's colony until recalled (docs/23-supercolonies.md) */
  status: 'outbound' | 'returning' | 'holding' | 'done';
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
  /** the units stay at the target as a garrison until recalled (Hold Position) */
  stay?: boolean;
}

/**
 * A mission type's own checks and arrival. Its fixed rules (cargo, wilds, slot pool, which units may go)
 * live in MISSION_TYPES in shared/src/missions.ts, so the Missions screen previews the same rules.
 */
interface TypeRules {
  /** Validate the dispatch; throw GameError to refuse. */
  validate: (ctx: SendContext) => Promise<void>;
  /** Resolve arrival at the target. May mutate m.units / m.cargo / m.result. */
  arrive: (q: Tx, m: Mission, at: number) => Promise<ArrivalOutcome>;
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
  const fixed = MISSION_TYPES[type];
  const t = now();
  const player = await getPlayer(q, playerId, true);
  let colony = await lockOwnColony(q, Number(input.colonyId), playerId);
  colony = advance(colony, t);

  const target = { region: Number(input.target?.region), patch: Number(input.target?.patch), spot: Number(input.target?.spot) };
  // wild sites (aphid herds, termite mounds, spider dens) are real places too (docs/24-npcs.md)
  if (!validCoords(target, fixed.allowsWilds, true)) throw new GameError('bad_target', 'That place does not exist.');
  if (!fixed.allowsWilds && target.spot === WILDS_SPOT) throw new GameError('bad_target', 'Nothing lives out in the wilds.');

  const units = parseUnits(input.units, colony.units);
  const unitProblem = missionUnitProblem(type, units);
  if (unitProblem) throw new GameError(unitProblem.code, unitProblem.message);
  const cargo = fixed.allowsCargo ? parseCargo(input.cargo) : res();
  const speedPct = Number(input.speedPct ?? 100);
  if (!isValidSpeedPct(speedPct)) throw new GameError('bad_speed', 'Speed must be 10%–100% in steps of 10.');

  const world = await getWorld(q);
  const targetColony = target.spot === WILDS_SPOT ? null : await colonyAt(q, world.id, target.region, target.patch, target.spot);
  await rules.validate({ q, player, colony, units, cargo, target, targetColony, t });

  // slots
  const active = await activeMissions(q, playerId);
  const { used, max } = missionSlotUsage(active, fixed.slot, player.research);
  if (used >= max) throw new GameError('no_slots', noSlotsMessage(fixed.slot, max));

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
  // warn whoever is on the receiving end: the colony's owner, or the ants tending a herd (docs/24-npcs.md)
  const warned = isHerdState(o.targetColony?.npc) ? o.targetColony!.npc.tender?.playerId : o.targetColony?.playerId;
  if (o.targetColony && warned && warned !== o.playerId)
    notify(warned, { type: 'incoming', missionType: o.type, from: o.senderName, arriveAt: o.arriveAt, colony: o.targetColony.name });
  return m;
}

/**
 * Ants already out at `from` (a herd's tenders called home) walking back to their colony, carrying `cargo`.
 * Written as a mission that is already returning, so the usual return event brings them home.
 */
export async function launchReturn(
  q: Tx,
  o: { worldId: number; playerId: number; type: MissionType; home: Colony; from: Coords; fromColonyId: number; units: UnitCounts; cargo: Resources; at: number; returnAt: number; result?: any },
): Promise<Mission> {
  const r = await q.query(
    `INSERT INTO missions (world_id, player_id, type, origin_colony_id, origin_region, origin_patch, origin_spot,
       target_region, target_patch, target_spot, target_colony_id, units, cargo, speed_pct, fuel, depart_at, arrive_at, return_at, status, result, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,100,0,$14,$14,$15,'returning',$16,$14) RETURNING *`,
    [o.worldId, o.playerId, o.type, o.home.id, o.home.region, o.home.patch, o.home.spot, o.from.region, o.from.patch, o.from.spot,
      o.fromColonyId, JSON.stringify(o.units), JSON.stringify(o.cargo), o.at, o.returnAt, o.result ? JSON.stringify(o.result) : null],
  );
  const m = fromRow(r.rows[0]);
  m.returnEventId = await schedule(q, o.worldId, 'mission_return', o.returnAt, { missionId: m.id });
  await saveMission(q, m);
  return m;
}

// ---------- recall ----------

export async function recallMission(q: Tx, playerId: number, missionId: number): Promise<Mission> {
  const m = await lockMission(q, missionId);
  if (m.playerId !== playerId) throw forbidden();
  const t = now();
  if (m.status === 'holding') return comeHome(q, m, t, { recalled: true });
  if (m.status !== 'outbound' || t >= m.arriveAt) throw new GameError('too_late', 'This mission can no longer be recalled.');
  if (m.arriveEventId) await cancelEvent(q, m.arriveEventId);
  m.arriveEventId = null;
  m.returnAt = recallReturnAt(m.departAt, t);
  m.status = 'returning';
  m.result = { recalled: true };
  m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
  await saveMission(q, m);
  return m;
}

/** Soldiers holding position walk home: the trip back takes as long as the trip out did. */
async function comeHome(q: Q, m: Mission, t: number, result: object): Promise<Mission> {
  m.status = 'returning';
  m.returnAt = t + returnLegMs(m.departAt, m.arriveAt);
  m.result = { ...(m.result ?? {}), ...result };
  m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
  await saveMission(q, m);
  return m;
}

/** Garrisons (holding or on their way) at a colony, locked: they fight in its battles. */
export async function lockGarrisons(q: Q, colonyId: number): Promise<Mission[]> {
  const r = await q.query("SELECT * FROM missions WHERE target_colony_id = $1 AND type = 'hold' AND status = 'holding' ORDER BY id FOR UPDATE", [colonyId]);
  return r.rows.map(fromRow);
}

/** All allied units holding position at a colony, summed (for scout reports). */
export async function garrisonUnits(q: Q, colonyId: number): Promise<UnitCounts> {
  const r = await q.query("SELECT units FROM missions WHERE target_colony_id = $1 AND type = 'hold' AND status = 'holding'", [colonyId]);
  return r.rows.reduce((sum: UnitCounts, row: any) => addCounts(sum, row.units), {} as UnitCounts);
}

/** Write back a garrison after a battle: survivors stay; if none are left, the mission is over. */
export async function saveGarrison(q: Q, m: Mission) {
  if (presentUnits(m.units).length === 0) m.status = 'done';
  await saveMission(q, m);
}

/**
 * A player's scent left a supercolony: every Hold Position mission between them and `others`
 * (theirs at the others' colonies, and the others' at theirs) turns for home, held or still on the way.
 */
export async function sendGarrisonsHome(q: Q, playerId: number, others: number[], t: number) {
  if (others.length === 0) return;
  const r = await q.query(
    `SELECT m.id FROM missions m JOIN colonies c ON c.id = m.target_colony_id
      WHERE m.type = 'hold' AND m.status IN ('outbound', 'holding')
        AND ((m.player_id = $1 AND c.player_id = ANY($2::int[])) OR (m.player_id = ANY($2::int[]) AND c.player_id = $1))
      ORDER BY m.id`,
    [playerId, others],
  );
  for (const row of r.rows) {
    const m = await lockMission(q, row.id);
    if (m.status === 'holding') await comeHome(q, m, t, { sentHome: true });
    else if (m.status === 'outbound') {
      // still on the way: turn around like a recall
      if (m.arriveEventId) await cancelEvent(q, m.arriveEventId);
      m.arriveEventId = null;
      m.status = 'returning';
      m.returnAt = recallReturnAt(m.departAt, t);
      m.result = { sentHome: true };
      m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
      await saveMission(q, m);
    }
    notify(m.playerId, { type: 'returned', missionType: m.type });
  }
}

// ---------- events ----------

onEvent('mission_arrive', async (q, ev) => {
  const m = await lockMission(q, ev.payload.missionId);
  if (m.status !== 'outbound' || m.arriveEventId !== ev.id) return;
  const rules = RULES.get(m.type);
  if (!rules) throw new Error(`No rules for mission type ${m.type}`);
  const out = await rules.arrive(q, m, ev.due_at);
  const anyone = presentUnits(m.units).length > 0;
  if (out.stay && anyone) {
    m.status = 'holding';
  } else if (out.home && anyone) {
    m.status = 'returning';
    m.returnAt = ev.due_at + returnLegMs(m.departAt, m.arriveAt, out.returnFactor ?? 1);
    m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt, { missionId: m.id });
  } else {
    m.status = 'done';
  }
  await saveMission(q, m);
  if (m.status === 'done') await refreshPointsAfterCommit(q, m.playerId);
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
  await refreshPointsAfterCommit(q, m.playerId);
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
    `SELECT m.id, m.type, m.depart_at, m.arrive_at, m.target_colony_id, m.origin_region, m.origin_patch, m.origin_spot, m.units,
            CASE WHEN m.type = 'swarm' THEN $2 WHEN p.is_npc THEN o.name ELSE p.username END AS username, p.is_npc,
            c.npc->>'kind' = 'herd' AS at_herd, c.region AS t_region, c.patch AS t_patch, c.spot AS t_spot
       FROM missions m JOIN colonies c ON c.id = m.target_colony_id JOIN players p ON p.id = m.player_id
       JOIN colonies o ON o.id = m.origin_colony_id
      WHERE (c.player_id = $1 OR (c.npc->'tender'->>'playerId')::int = $1) AND m.player_id <> $1 AND m.status = 'outbound' ORDER BY m.arrive_at`,
    [playerId, SWARM.name],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    type: row.type,
    /** when it set off, so the nest view can show how far along it is */
    departAt: row.depart_at,
    arriveAt: row.arrive_at,
    targetColonyId: row.target_colony_id,
    origin: { region: row.origin_region, patch: row.origin_patch, spot: row.origin_spot },
    from: row.username,
    /** a wild nest, not a player */
    wild: row.is_npc,
    hostile: row.type === 'raid' || row.type === 'scout' || row.type === 'swarm',
    /** aimed at the ants you keep at an aphid herd, not at a colony (docs/24-npcs.md) */
    herd: row.at_herd ? { region: row.t_region, patch: row.t_patch, spot: row.t_spot } : null,
    unitCount: Object.values(row.units as Record<string, number>).reduce((a, b) => a + b, 0),
  }));
}
