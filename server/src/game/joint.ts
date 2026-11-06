// Joint raids and the members' board (Build 19, docs/23-supercolonies.md § Joint raids).
//
// A supercolony member opens a joint raid on a wild target (a wild nest, termite mound or spider den) by sending an
// army with a landing time. Other members join by sending armies that can get there by then. Their raids are ordinary
// missions with joint_raid_id set; instead of their own arrival event they wait on the joint raid's 'joint_raid_land'
// event (it is their arrive_event_id, so the startup repair sees a pending event). At the landing time that one event
// fights the battle for everyone, splits the loot by army worth and sends each army home with its own survivors.
import {
  BOARD,
  JOINT_MESSAGES,
  JOINT_RAID,
  armyWorth,
  boardPostProblem,
  coordsKey,
  corpseCarry,
  corpseProtein,
  createRng,
  fillCargo,
  groupCargo,
  isHeldState,
  jointLeadOptionMs,
  lootPct,
  lootable,
  minRaidPlayers,
  presentUnits,
  protectedAmount,
  randomSeed,
  rebuildDefenses,
  res,
  addCounts,
  add,
  simulateBattle,
  applyRescueResearch,
  corpseRotDelayHours,
  corpseRotStartsAt,
  splitLoot,
  sub,
  subCounts,
  type Coords,
  type Resources,
  type UnitCounts,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError, notFound } from '../errors';
import { getColony, getPlayer, lockColony, saveColony, type Colony, type Player } from '../colony';
import { cancelEvent, onEvent, schedule, type GameEvent } from '../events';
import { getWorld } from '../world';
import { notify } from '../realtime';
import { syncNest } from './nests';
import { lockMission, saveMission, setJointHooks, type JointInput, type Mission } from './missions';
import { addCorpses } from './combat';
import { memberIds, membershipOf } from './diplomacy';
import { discover } from './discovery';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { bump } from './stats';
import { explore } from './fog';

const nonZero = <T extends Record<string, number | undefined>>(u: T): T => Object.fromEntries(Object.entries(u).filter(([, n]) => (n ?? 0) > 0)) as T;
const unitCount = (u: UnitCounts) => Object.values(u).reduce((a, b) => a + (b ?? 0), 0);

export interface JointRaid {
  id: number;
  worldId: number;
  supercolonyId: number;
  leaderId: number;
  targetColonyId: number;
  target: Coords;
  landAt: number;
  retreatPct: number;
  status: 'open' | 'fought' | 'called_off' | 'cancelled' | 'failed';
  eventId: number | null;
  result: any;
}

const fromRow = (r: any): JointRaid => ({
  id: Number(r.id),
  worldId: r.world_id,
  supercolonyId: Number(r.supercolony_id),
  leaderId: r.leader_id,
  targetColonyId: Number(r.target_colony_id),
  target: { region: r.target_region, patch: r.target_patch, spot: r.target_spot },
  landAt: Number(r.land_at),
  retreatPct: r.retreat_pct,
  status: r.status,
  eventId: r.event_id == null ? null : Number(r.event_id),
  result: r.result,
});

async function lockJoint(q: Q, id: number): Promise<JointRaid | null> {
  const r = await q.query('SELECT * FROM joint_raids WHERE id = $1 FOR UPDATE', [id]);
  return r.rows[0] ? fromRow(r.rows[0]) : null;
}

async function saveJoint(q: Q, j: JointRaid) {
  await q.query('UPDATE joint_raids SET status=$2, event_id=$3, result=$4 WHERE id=$1', [j.id, j.status, j.eventId, j.result ? JSON.stringify(j.result) : null]);
}

/** A wild thing a joint raid can go to: a wild nest, a termite mound or a spider den (not an aphid herd or windfall). */
export const isJointTarget = (c: Colony | null): boolean => !!c?.npc && !isHeldState(c.npc);

/** How many players a joint raid on this colony needs (spider dens 2 or 3; everything else 1). */
export const playersNeeded = (c: Colony): number => (c.npc && !isHeldState(c.npc) && 'species' in c.npc ? minRaidPlayers(c.npc.species, c.npc.level) : 1);

const fmtWait = (ms: number) => {
  const m = Math.ceil(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

// ---------- the board ----------

/** A note the game writes on a supercolony's board; keeps only the newest BOARD.keep posts. */
export async function boardNote(q: Q, worldId: number, supercolonyId: number, playerId: number | null, kind: string, text: string, data: object | null, t: number) {
  await q.query('INSERT INTO board_posts (world_id, supercolony_id, player_id, kind, text, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    worldId, supercolonyId, playerId, kind, text, data ? JSON.stringify(data) : null, t,
  ]);
  await q.query(
    'DELETE FROM board_posts WHERE supercolony_id = $1 AND id NOT IN (SELECT id FROM board_posts WHERE supercolony_id = $1 ORDER BY id DESC LIMIT $2)',
    [supercolonyId, BOARD.keep],
  );
  for (const id of await memberIds(q, supercolonyId)) notify(id, { type: 'board' });
}

async function requireMember(q: Q, playerId: number) {
  const m = await membershipOf(q, playerId);
  if (!m) throw new GameError('not_member', JOINT_MESSAGES.not_member);
  return m;
}

export async function postToBoard(q: Tx, playerId: number, raw: string, t: number) {
  const m = await requireMember(q, playerId);
  const problem = boardPostProblem(String(raw ?? ''));
  if (problem) throw new GameError('bad_post', problem);
  const me = await getPlayer(q, playerId);
  await boardNote(q, me.worldId, m.supercolonyId, playerId, 'post', String(raw).trim(), null, t);
}

/** The members' board: newest posts first, and the supercolony's open joint raids. */
export async function boardView(q: Q, playerId: number) {
  const m = await membershipOf(q, playerId);
  if (!m) return { supercolony: null, posts: [], jointRaids: [] };
  const posts = await q.query(
    `SELECT b.id, b.player_id, p.username, b.kind, b.text, b.data, b.created_at
       FROM board_posts b LEFT JOIN players p ON p.id = b.player_id
      WHERE b.supercolony_id = $1 ORDER BY b.id DESC LIMIT $2`,
    [m.supercolonyId, BOARD.keep],
  );
  return {
    supercolony: { id: m.supercolonyId, name: m.name },
    posts: posts.rows.map((r: any) => ({ id: Number(r.id), playerId: r.player_id, username: r.username, kind: r.kind, text: r.text, data: r.data, at: Number(r.created_at) })),
    jointRaids: await openJointRaids(q, m.supercolonyId, playerId),
  };
}

/** A supercolony's open joint raids, with who has joined so far. */
export async function openJointRaids(q: Q, supercolonyId: number, playerId: number) {
  const r = await q.query(
    `SELECT j.*, c.name AS target_name, c.npc, p.username AS leader_name
       FROM joint_raids j JOIN colonies c ON c.id = j.target_colony_id JOIN players p ON p.id = j.leader_id
      WHERE j.supercolony_id = $1 AND j.status = 'open' ORDER BY j.land_at`,
    [supercolonyId],
  );
  if (!r.rows.length) return [];
  const armies = await q.query(
    `SELECT m.joint_raid_id, m.player_id, p.username, m.units, m.origin_colony_id FROM missions m JOIN players p ON p.id = m.player_id
      WHERE m.joint_raid_id = ANY($1::bigint[]) AND m.status = 'outbound' ORDER BY m.id`,
    [r.rows.map((x: any) => x.id)],
  );
  return r.rows.map((row: any) => {
    const j = fromRow(row);
    const joined = armies.rows
      .filter((a: any) => Number(a.joint_raid_id) === j.id)
      .map((a: any) => ({ playerId: a.player_id, username: a.username, units: a.units, unitCount: unitCount(a.units), worth: armyWorth(a.units) }));
    const players = new Set(joined.map((a: any) => a.playerId));
    const npc = row.npc;
    return {
      id: j.id,
      leaderId: j.leaderId,
      leaderName: row.leader_name,
      target: j.target,
      targetColonyId: j.targetColonyId,
      targetName: row.target_name,
      kind: npc?.species ? (npc.species === 'spider' ? 'den' : npc.species === 'termite' ? 'mound' : 'nest') : 'nest',
      level: npc?.level ?? 1,
      playersNeeded: npc?.species ? minRaidPlayers(npc.species, npc.level) : 1,
      landAt: j.landAt,
      retreatPct: j.retreatPct,
      joined,
      playerCount: players.size,
      mine: players.has(playerId),
    };
  });
}

// ---------- opening and joining (called by sendMission) ----------

export interface PreparedJoint {
  id: number;
  landAt: number;
  eventId: number;
  retreatPct: number;
}

/**
 * Check a raid that opens or joins a joint raid, and open it if asked. The raid's arrival becomes the landing time and
 * its arrival event the joint raid's event. `travelMs` is how long this army takes to get there.
 */
export async function prepareJoint(
  q: Tx,
  o: { player: Player; colony: Colony; targetColony: Colony | null; joint: JointInput; travelMs: number; retreatPct: number; t: number },
): Promise<PreparedJoint> {
  const { player, targetColony, joint, travelMs, t } = o;
  const m = await requireMember(q, player.id);
  if (!targetColony || !isJointTarget(targetColony)) throw new GameError('wild_only', JOINT_MESSAGES.wild_only);
  const world = await getWorld(q);

  if (joint.id != null) {
    const j = await lockJoint(q, Number(joint.id));
    if (!j || j.status !== 'open' || j.supercolonyId !== m.supercolonyId || t >= j.landAt) throw new GameError('joint_gone', JOINT_MESSAGES.gone);
    if (j.targetColonyId !== targetColony.id) throw new GameError('bad_target', JOINT_MESSAGES.other_colony);
    if (t + travelMs > j.landAt) throw new GameError('too_far', JOINT_MESSAGES.too_far(fmtWait(t + travelMs - j.landAt)));
    const mine = await q.query("SELECT 1 FROM missions WHERE joint_raid_id = $1 AND player_id = $2 AND status = 'outbound'", [j.id, player.id]);
    if (mine.rows[0]) throw new GameError('one_army', JOINT_MESSAGES.one_army);
    // members who join know what they're walking into: the opener's scouts shared the scent
    await discover(q, player.id, targetColony.id, 'ally', t);
    return { id: j.id, landAt: j.landAt, eventId: j.eventId!, retreatPct: j.retreatPct };
  }

  const hours = Number(joint.open);
  if (!JOINT_RAID.leadOptions.includes(hours)) throw new GameError('bad_lead', JOINT_MESSAGES.bad_lead);
  const landAt = t + jointLeadOptionMs(hours, world.speed);
  if (t + travelMs > landAt) throw new GameError('too_far', JOINT_MESSAGES.too_far(fmtWait(t + travelMs - landAt)));
  const taken = await q.query("SELECT 1 FROM joint_raids WHERE supercolony_id = $1 AND target_colony_id = $2 AND status = 'open'", [m.supercolonyId, targetColony.id]);
  if (taken.rows[0]) throw new GameError('open_here', JOINT_MESSAGES.open_here);
  const r = await q.query(
    `INSERT INTO joint_raids (world_id, supercolony_id, leader_id, target_colony_id, target_region, target_patch, target_spot, land_at, retreat_pct, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [world.id, m.supercolonyId, player.id, targetColony.id, targetColony.region, targetColony.patch, targetColony.spot, landAt, o.retreatPct, t],
  );
  const j = fromRow(r.rows[0]);
  j.eventId = await schedule(q, world.id, 'joint_raid_land', landAt, { jointRaidId: j.id });
  await saveJoint(q, j);
  const members = await memberIds(q, m.supercolonyId);
  // every member can see the target now, so they can join without scouting it first
  for (const id of members) await discover(q, id, targetColony.id, 'ally', t);
  const need = playersNeeded(targetColony);
  const data = { jointRaidId: j.id, target: j.target, colony: targetColony.name, landAt, leader: player.username, playersNeeded: need };
  await boardNote(q, world.id, m.supercolonyId, player.id, 'joint_open', `${player.username} opened a joint raid on ${targetColony.name} (${coordsKey(j.target)}).`, data, t);
  for (const id of members)
    if (id !== player.id) await addReport(q, world.id, id, 'joint', `${player.username} opened a joint raid on ${targetColony.name}: join before it lands`, { opened: true, ...data }, t);
  return { id: j.id, landAt, eventId: j.eventId, retreatPct: j.retreatPct };
}

// ---------- turning back ----------

/** The walk home for an army in a joint raid that turns back at `t`: no longer than its walk there, and no longer than it has been out. */
const turnBackMs = (m: Mission, t: number) => Math.max(0, Math.min(t - m.departAt, m.result?.travelMs ?? t - m.departAt));

/** A joint raid army that turns back before the fight (recalled, called off, cancelled). */
export async function turnJointArmyBack(q: Q, m: Mission, t: number, result: object, atTarget = false) {
  m.arriveEventId = null;
  m.status = 'returning';
  m.returnAt = t + (atTarget ? m.result?.travelMs ?? 0 : turnBackMs(m, t));
  m.result = { ...(m.result ?? {}), ...result };
  m.returnEventId = await schedule(q, m.worldId, 'mission_return', m.returnAt!, { missionId: m.id });
  await saveMission(q, m);
  notify(m.playerId, { type: 'returned', missionType: m.type });
}

async function lockArmies(q: Q, jointId: number): Promise<Mission[]> {
  const r = await q.query("SELECT id FROM missions WHERE joint_raid_id = $1 AND status = 'outbound' ORDER BY id", [jointId]);
  const out: Mission[] = [];
  for (const row of r.rows) out.push(await lockMission(q, row.id));
  return out;
}

/** The opener calls a joint raid off before it lands: every army turns back. */
export async function cancelJointRaid(q: Tx, playerId: number, jointId: number, t: number) {
  const j = await lockJoint(q, jointId);
  if (!j) throw notFound('Joint raid not found.');
  if (j.leaderId !== playerId) throw new GameError('not_leader', JOINT_MESSAGES.not_leader, 403);
  if (j.status !== 'open' || t >= j.landAt) throw new GameError('joint_gone', JOINT_MESSAGES.gone);
  if (j.eventId) await cancelEvent(q, j.eventId);
  const leader = await getPlayer(q, playerId);
  const target = await getColony(q, j.targetColonyId);
  for (const m of await lockArmies(q, j.id)) {
    await turnJointArmyBack(q, m, t, { jointCancelled: true });
    if (m.playerId !== playerId)
      await addReport(q, j.worldId, m.playerId, 'joint', `${leader.username} called off the joint raid on ${target.name}`, { cancelled: true, colony: target.name, target: j.target, returnAt: m.returnAt }, t);
  }
  j.status = 'cancelled';
  j.eventId = null;
  await saveJoint(q, j);
  await boardNote(q, j.worldId, j.supercolonyId, playerId, 'joint_cancelled', `${leader.username} called off the joint raid on ${target.name}.`, { jointRaidId: j.id }, t);
}

// ---------- landing ----------

onEvent('joint_raid_land', land, { onFail: landFailed });
setJointHooks({ prepare: prepareJoint, turnBack: (q, m, t, result) => turnJointArmyBack(q, m, t, result) });

async function land(q: Tx, ev: GameEvent<{ jointRaidId: number }>) {
  const j = await lockJoint(q, ev.payload.jointRaidId);
  if (!j || j.status !== 'open' || j.eventId !== ev.id) return;
  const at = ev.due_at;
  const armies = await lockArmies(q, j.id);
  // armies of players who left the supercolony since don't fight with it
  const members = new Set(await memberIds(q, j.supercolonyId));
  const fighting: Mission[] = [];
  for (const m of armies) {
    await explore(q, m.playerId, m.target.region, m.target.patch, at);
    if (members.has(m.playerId)) fighting.push(m);
    else await turnJointArmyBack(q, m, at, { jointLeft: true }, true);
  }
  let target = await lockColony(q, j.targetColonyId);
  target = await syncNest(q, target, at);
  const need = playersNeeded(target);
  const players = [...new Set(fighting.map((m) => m.playerId))];
  if (players.length < need || fighting.length === 0) {
    // not enough colonies came: nobody fights, and everyone walks home
    const why = fighting.length === 0 ? 'Nobody came.' : `Only ${players.length} ${players.length === 1 ? 'colony' : 'colonies'} came, and ${target.name} only fights a joint raid of at least ${need}.`;
    for (const m of fighting) {
      await turnJointArmyBack(q, m, at, { jointCalledOff: true }, true);
      await addReport(q, j.worldId, m.playerId, 'joint', `The joint raid on ${target.name} was called off`, { calledOff: true, colony: target.name, target: j.target, why, returnAt: m.returnAt }, at);
    }
    j.status = 'called_off';
    j.result = { why };
    j.eventId = null;
    await saveJoint(q, j);
    await boardNote(q, j.worldId, j.supercolonyId, null, 'joint_called_off', `The joint raid on ${target.name} was called off. ${why}`, { jointRaidId: j.id }, at);
    return;
  }
  await fight(q, j, fighting, target, at);
}

async function fight(q: Tx, j: JointRaid, armies: Mission[], target: Colony, at: number) {
  const players = await Promise.all(armies.map((m) => getPlayer(q, m.playerId)));
  const defender = await getPlayer(q, target.playerId);
  const seed = randomSeed();
  const rng = createRng(seed);
  const start = armies.map((m) => nonZero(m.units));
  const startDefender = nonZero(target.units);
  const startDefenses = nonZero(target.defenses);
  // the whole joint army fights as one side; the opener's fall-back order holds for everyone
  const attackerSide = { units: {}, research: {}, retreatPct: j.retreatPct, allies: armies.map((m, i) => ({ units: start[i], research: players[i].research })) };
  const result = simulateBattle(
    attackerSide,
    { units: startDefender, defenses: target.defenses, groundDefensePct: 0, research: defender.research },
    rng,
  );
  const rebuilt = rebuildDefenses(result.defensesDestroyed, rng);
  // Rescue research: each member's own level saves some of their own fallen, after the battle (docs/08-combat.md § Rescue)
  const carriedHome = applyRescueResearch(result, attackerSide).allies.map((u) => nonZero(u));
  target.units = nonZero(result.defenderSurvivors);
  target.defenses = nonZero(addCounts(subCounts(target.defenses, result.defensesDestroyed), rebuilt));
  const survivors = result.attackerAlliesSurvivors.map((u) => nonZero(u));
  const lost = result.attackerAlliesLost.map((u) => nonZero(u));

  // loot: what the den gives up, split by each army's worth when it set out, as much as each can carry
  let shares: Resources[] = armies.map(() => res());
  if (result.winner === 'attacker') {
    const pct = Math.max(...players.map((p) => lootPct(p.research, true)));
    const cargos = survivors.map((u) => groupCargo(u));
    const available = fillCargo(lootable(target.resources, protectedAmount(target.chambers, defender.research), pct), cargos.reduce((a, b) => a + b, 0));
    shares = splitLoot(available, start.map((u, i) => ({ worth: armyWorth(u), cargo: cargos[i] })));
    target.resources = sub(target.resources, shares.reduce((s, x) => add(s, x), res()));
  }
  // corpses: Slave-makers carry some home at once; the rest stay on the field
  let corpses = corpseProtein(result.defenderLost, ...result.attackerAlliesLost);
  const field = corpses;
  const carried = armies.map((_, i) => {
    if (result.winner !== 'attacker') return 0;
    const k = Math.min(corpses, corpseCarry(survivors[i]));
    corpses -= k;
    return k;
  });
  const rotDelay = corpseRotDelayHours(defender.research, ...players.map((p) => p.research));
  await addCorpses(q, j.worldId, j.target, corpses, at, rotDelay);
  await saveColony(q, target);

  const sum = (list: UnitCounts[]) => list.reduce((s, u) => addCounts(s, u), {} as UnitCounts);
  const totalLoot = shares.reduce((s, x) => add(s, x), res());
  const sc = (await q.query('SELECT name FROM supercolonies WHERE id = $1', [j.supercolonyId])).rows[0];
  const memberLines = armies.map((m, i) => ({
    name: players[i].username,
    units: start[i],
    lost: lost[i],
    loot: shares[i],
    ...(carried[i] > 0 ? { corpsesCarried: carried[i] } : {}),
    ...(Object.keys(carriedHome[i]).length ? { carriedHome: carriedHome[i], rescueLevel: players[i].research.rescue ?? 0 } : {}),
  }));
  const leader = armies.find((m) => m.playerId === j.leaderId) ?? armies[0];
  const data = {
    winner: result.winner,
    seed,
    ...(j.retreatPct ? { retreatPct: j.retreatPct } : {}),
    ...(result.retreatedAfterRound != null ? { retreatedAfterRound: result.retreatedAfterRound } : {}),
    at: coordsKey(j.target),
    target: j.target,
    attacker: {
      name: `${sc?.name ?? 'Supercolony'} (joint raid)`,
      wild: false,
      origin: leader.origin,
      units: sum(start),
      lost: sum(lost),
      bonuses: {},
    },
    defender: {
      name: target.name,
      wild: true,
      colony: target.name,
      units: startDefender,
      defenses: startDefenses,
      lost: nonZero(result.defenderLost),
      defensesDestroyed: nonZero(result.defensesDestroyed),
      defensesRebuilt: nonZero(rebuilt),
      bonuses: {},
    },
    rounds: result.rounds,
    loot: totalLoot,
    corpses: field,
    ...(result.rescued ? { rescued: result.rescued } : {}),
    ...(corpses > 0 ? { corpsesRotAt: corpseRotStartsAt(at, rotDelay), ...(rotDelay > 0 ? { rotDelayHours: rotDelay } : {}) } : {}),
    joint: { id: j.id, supercolony: sc?.name ?? null, members: memberLines },
  };
  const verb = result.retreatedAfterRound != null ? 'fell back' : result.winner === 'attacker' ? 'won' : result.winner === 'defender' ? 'lost' : 'drew';
  const species = (target.npc as { species?: string }).species;
  for (const [i, m] of armies.entries()) {
    m.units = survivors[i];
    m.cargo = add(shares[i], res(0, carried[i], 0));
    m.result = { ...(m.result ?? {}), winner: result.winner, loot: shares[i], corpses: field, joint: j.id };
    m.arriveEventId = null;
    if (presentUnits(m.units).length > 0) {
      m.status = 'returning';
      const back = at + (m.result.travelMs ?? 0);
      m.returnAt = back;
      m.returnEventId = await schedule(q, m.worldId, 'mission_return', back, { missionId: m.id });
    } else m.status = 'done';
    await saveMission(q, m);
    await q.query('INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES ($1,$2,$3,$4,$5)', [m.worldId, m.playerId, target.id, result.winner, at]);
    await addReport(q, m.worldId, m.playerId, 'battle', `Joint raid on ${target.name} (${coordsKey(j.target)}): you ${verb}`, { ...data, perspective: 'attacker', jointIndex: i }, at);
    if (result.winner === 'attacker') {
      // every member who took part gets the credit (the Spider-slayer page and title for a den)
      await bump(q, m.playerId, 'wild_won');
      await bump(q, m.playerId, 'joint_won');
      if (species) await bump(q, m.playerId, `beat:${species}`);
    }
    await refreshPointsAfterCommit(q, m.playerId);
  }
  j.status = 'fought';
  j.eventId = null;
  j.result = { winner: result.winner, members: memberLines.map((x) => ({ name: x.name, lost: x.lost, loot: x.loot })) };
  await saveJoint(q, j);
  const names = memberLines.map((x) => x.name).join(', ');
  await boardNote(
    q, j.worldId, j.supercolonyId, null, 'joint_result',
    result.winner === 'attacker' ? `${names} took ${target.name} together.` : `${names} ${verb === 'fell back' ? 'fell back from' : verb === 'drew' ? 'fought to a draw at' : 'were beaten at'} ${target.name}.`,
    { jointRaidId: j.id, winner: result.winner, loot: totalLoot },
    at,
  );
}

/** The landing failed (a bug, rolled back): every army walks home with what it set out with. */
async function landFailed(q: Tx, ev: GameEvent<{ jointRaidId: number }>) {
  const j = await lockJoint(q, ev.payload.jointRaidId);
  if (!j || j.status !== 'open' || j.eventId !== ev.id) return;
  for (const m of await lockArmies(q, j.id)) await turnJointArmyBack(q, m, ev.due_at, { unresolved: true }, true);
  j.status = 'failed';
  j.eventId = null;
  await saveJoint(q, j);
}

export { lockJoint };
export type { UnitCounts };
