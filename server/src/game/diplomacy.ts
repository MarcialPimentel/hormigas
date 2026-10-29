// Contact, truces and supercolonies (docs/23-supercolonies.md).
// Every other system asks here how two players stand (relationsOf / raidBlock) instead of reading the tables.
import {
  DIPLOMACY_MESSAGES,
  SUPERCOLONY_MAX_MEMBERS,
  canJoinSupercolony,
  raidBlockMessage,
  scentFadeMs,
  supercolonyNameProblem,
  truceNoticeMs,
  type RelationInfo,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { now } from '../clock';
import { GameError, notFound } from '../errors';
import { getPlayer, type Player } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { notify } from '../realtime';
import { addReport } from './reports';
import { discover } from './discovery';
import { sendGarrisonsHome } from './missions';

const pair = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x]);

// ---------- reading relations ----------

/**
 * Have these two players met? One of them has scouted (or otherwise come to know) a colony of the other.
 * Discovery is one way, but contact works both ways: the scouted player can answer a truce offer.
 */
export async function inContact(q: Q, a: number, b: number): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 FROM known_colonies k JOIN colonies c ON c.id = k.colony_id
      WHERE k.discovered_at IS NOT NULL
        AND ((k.player_id = $1 AND c.player_id = $2) OR (k.player_id = $2 AND c.player_id = $1))
      LIMIT 1`,
    [a, b],
  );
  return r.rows.length > 0;
}

/** Players `playerId` has met, both ways (for the Allies screen). */
export async function contactsOf(q: Q, playerId: number): Promise<number[]> {
  const r = await q.query(
    `SELECT DISTINCT c.player_id AS id FROM known_colonies k JOIN colonies c ON c.id = k.colony_id
      WHERE k.player_id = $1 AND k.discovered_at IS NOT NULL AND c.player_id <> $1
     UNION
     SELECT DISTINCT k.player_id AS id FROM known_colonies k JOIN colonies c ON c.id = k.colony_id
      WHERE c.player_id = $1 AND k.discovered_at IS NOT NULL AND k.player_id <> $1`,
    [playerId],
  );
  const ids = r.rows.map((x: any) => x.id as number);
  if (ids.length === 0) return [];
  const real = await q.query('SELECT id FROM players WHERE id = ANY($1::int[]) AND NOT is_npc', [ids]);
  return real.rows.map((x: any) => x.id);
}

/**
 * How each of `others` stands with `playerId` right now. Players with no relation are left out.
 * A supercolony beats a truce (it's the stronger pact); a fading scent and an ending truce carry `until`.
 */
export async function relationsOf(q: Q, playerId: number, others: number[], t = now()): Promise<Map<number, RelationInfo>> {
  const out = new Map<number, RelationInfo>();
  const ids = others.filter((x) => x !== playerId);
  if (ids.length === 0) return out;
  const tr = await q.query(
    `SELECT CASE WHEN player_a = $1 THEN player_b ELSE player_a END AS other, status, ends_at FROM truces
      WHERE (player_a = $1 AND player_b = ANY($2::int[]) OR player_b = $1 AND player_a = ANY($2::int[]))
        AND (status = 'active' OR (status = 'ending' AND ends_at > $3))`,
    [playerId, ids, t],
  );
  for (const row of tr.rows)
    out.set(row.other, row.status === 'active' ? { relation: 'truce' } : { relation: 'truce_ending', until: Number(row.ends_at) });
  // Both still carry the supercolony's scent: members, or fading members whose fade hasn't run out.
  const sc = await q.query(
    `SELECT o.player_id AS other, me.status AS my_status, o.status AS their_status, me.fade_until AS my_fade, o.fade_until AS their_fade
       FROM supercolony_members me JOIN supercolony_members o ON o.supercolony_id = me.supercolony_id
      WHERE me.player_id = $1 AND o.player_id = ANY($2::int[])
        AND me.status IN ('member', 'fading') AND o.status IN ('member', 'fading')
        AND (me.fade_until IS NULL OR me.fade_until > $3) AND (o.fade_until IS NULL OR o.fade_until > $3)`,
    [playerId, ids, t],
  );
  for (const row of sc.rows) {
    if (row.my_status === 'member' && row.their_status === 'member') out.set(row.other, { relation: 'ally' });
    else {
      const fades = [row.my_fade, row.their_fade].filter((x) => x != null).map(Number);
      out.set(row.other, { relation: 'fading', until: Math.min(...fades) });
    }
  }
  return out;
}

export async function relationOf(q: Q, playerId: number, other: number, t = now()): Promise<RelationInfo | null> {
  return (await relationsOf(q, playerId, [other], t)).get(other) ?? null;
}

/** The player-facing reason `attackerId` can't raid `defenderId`, or null if pacts don't stop it. */
export async function raidBlock(q: Q, attackerId: number, defenderId: number, t = now()): Promise<{ code: string; message: string } | null> {
  const r = await relationOf(q, attackerId, defenderId, t);
  return r ? { code: `pact_${r.relation}`, message: raidBlockMessage(r) } : null;
}

/** Supercolony tags of these players (current members only), for the map. */
export async function supercolonyTags(q: Q, playerIds: number[]): Promise<Map<number, { id: number; name: string }>> {
  const out = new Map<number, { id: number; name: string }>();
  if (playerIds.length === 0) return out;
  const r = await q.query(
    `SELECT m.player_id, s.id, s.name FROM supercolony_members m JOIN supercolonies s ON s.id = m.supercolony_id
      WHERE m.player_id = ANY($1::int[]) AND m.status = 'member'`,
    [playerIds],
  );
  for (const row of r.rows) out.set(row.player_id, { id: Number(row.id), name: row.name });
  return out;
}

/** The supercolony this player is a member of (not fading), or null. */
export async function membershipOf(q: Q, playerId: number): Promise<{ supercolonyId: number; name: string; founderId: number } | null> {
  const r = await q.query(
    `SELECT s.id, s.name, s.founder_id FROM supercolony_members m JOIN supercolonies s ON s.id = m.supercolony_id
      WHERE m.player_id = $1 AND m.status = 'member'`,
    [playerId],
  );
  const row = r.rows[0];
  return row ? { supercolonyId: Number(row.id), name: row.name, founderId: row.founder_id } : null;
}

/** Are these two players current members of the same supercolony? (Hold Position needs this.) */
export async function areAllies(q: Q, a: number, b: number): Promise<boolean> {
  return (await relationOf(q, a, b))?.relation === 'ally';
}

// ---------- truces ----------

async function otherPlayer(q: Q, me: Player, otherId: number): Promise<Player> {
  if (!Number.isInteger(otherId) || otherId <= 0 || otherId === me.id) throw new GameError('bad_player', 'Pick another player.');
  const other = await getPlayer(q, otherId).catch(() => null);
  if (!other || other.isNpc || other.worldId !== me.worldId) throw new GameError('bad_player', 'That player is not in this world.');
  return other;
}

async function lockTruce(q: Q, id: number) {
  const r = await q.query('SELECT * FROM truces WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw notFound('Truce not found.');
  return r.rows[0];
}

/** Both sides get the same report, written for each. */
async function reportBoth(q: Q, worldId: number, a: Player, b: Player, title: (me: Player, them: Player) => string, data: object, at: number) {
  for (const [me, them] of [[a, b], [b, a]] as const) {
    await addReport(q, worldId, me.id, 'diplomacy', title(me, them), { ...data, with: them.username }, at);
    notify(me.id, { type: 'diplomacy' });
  }
}

export async function proposeTruce(q: Tx, playerId: number, otherId: number) {
  const t = now();
  const me = await getPlayer(q, playerId);
  const other = await otherPlayer(q, me, otherId);
  if (!(await inContact(q, me.id, other.id))) throw new GameError('no_contact', DIPLOMACY_MESSAGES.no_contact);
  const rel = await relationOf(q, me.id, other.id, t);
  if (rel?.relation === 'ally' || rel?.relation === 'fading') throw new GameError('already_allied', 'You already share a supercolony scent.');
  const [a, b] = pair(me.id, other.id);
  const open = await q.query("SELECT status FROM truces WHERE player_a = $1 AND player_b = $2 AND status IN ('proposed','active','ending')", [a, b]);
  if (open.rows[0])
    throw new GameError('truce_exists', open.rows[0].status === 'proposed' ? 'A truce offer is already waiting between you.' : 'You already have a truce.');
  const r = await q.query(
    "INSERT INTO truces (world_id, player_a, player_b, proposed_by, status, created_at) VALUES ($1,$2,$3,$4,'proposed',$5) RETURNING id",
    [me.worldId, a, b, me.id, t],
  );
  await addReport(q, me.worldId, other.id, 'diplomacy', `${me.username} offers a truce`, { event: 'truce_offered', with: me.username, truceId: Number(r.rows[0].id) }, t);
  notify(other.id, { type: 'diplomacy' });
  return Number(r.rows[0].id);
}

export async function answerTruce(q: Tx, playerId: number, truceId: number, answer: 'accept' | 'decline' | 'withdraw') {
  const t = now();
  const row = await lockTruce(q, truceId);
  if (row.player_a !== playerId && row.player_b !== playerId) throw notFound('Truce not found.');
  if (row.status !== 'proposed') throw new GameError('too_late', 'That offer has already been answered.');
  const mine = row.proposed_by === playerId;
  if (answer === 'withdraw' ? !mine : mine)
    throw new GameError('bad_answer', answer === 'withdraw' ? 'Only the side that offered can withdraw it.' : "You can't answer your own offer.");
  const me = await getPlayer(q, playerId);
  const other = await getPlayer(q, row.player_a === playerId ? row.player_b : row.player_a);
  if (answer === 'accept') {
    await q.query("UPDATE truces SET status = 'active', accepted_at = $2 WHERE id = $1", [truceId, t]);
    await reportBoth(q, me.worldId, me, other, (_m, them) => `Truce with ${them.username}`, { event: 'truce_active' }, t);
  } else {
    await q.query('UPDATE truces SET status = $2, closed_at = $3 WHERE id = $1', [truceId, answer === 'decline' ? 'declined' : 'withdrawn', t]);
    if (answer === 'decline') {
      await addReport(q, me.worldId, other.id, 'diplomacy', `${me.username} turned down your truce`, { event: 'truce_declined', with: me.username }, t);
      notify(other.id, { type: 'diplomacy' });
    }
  }
}

/** Give notice: the truce ends after the notice period, and raids stay off until then. */
export async function endTruce(q: Tx, playerId: number, truceId: number) {
  const t = now();
  const row = await lockTruce(q, truceId);
  if (row.player_a !== playerId && row.player_b !== playerId) throw notFound('Truce not found.');
  if (row.status !== 'active') throw new GameError('not_active', row.status === 'ending' ? 'Notice has already been given.' : 'That truce is not active.');
  const world = await getWorld(q);
  const endsAt = Math.round(t + truceNoticeMs(world.speed));
  await q.query("UPDATE truces SET status = 'ending', ends_at = $2 WHERE id = $1", [truceId, endsAt]);
  await schedule(q, row.world_id, 'truce_end', endsAt, { truceId });
  const me = await getPlayer(q, playerId);
  const other = await getPlayer(q, row.player_a === playerId ? row.player_b : row.player_a);
  await reportBoth(
    q, row.world_id, me, other,
    (m, them) => (m.id === me.id ? `You gave notice on your truce with ${them.username}` : `${me.username} is ending your truce`),
    { event: 'truce_ending', endsAt, by: me.username }, t,
  );
}

onEvent('truce_end', async (q, ev) => {
  const row = await lockTruce(q, ev.payload.truceId).catch(() => null);
  if (!row || row.status !== 'ending') return;
  await q.query("UPDATE truces SET status = 'ended', closed_at = $2 WHERE id = $1", [row.id, ev.due_at]);
  const a = await getPlayer(q, row.player_a);
  const b = await getPlayer(q, row.player_b);
  await reportBoth(q, row.world_id, a, b, (_m, them) => `Your truce with ${them.username} has ended`, { event: 'truce_ended' }, ev.due_at);
});

// ---------- supercolonies ----------

async function lockSupercolony(q: Q, id: number) {
  const r = await q.query('SELECT * FROM supercolonies WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0] || r.rows[0].dissolved_at != null) throw notFound('That supercolony is gone.');
  return r.rows[0];
}

/** Current members (not fading), oldest first. */
async function memberIds(q: Q, supercolonyId: number): Promise<number[]> {
  const r = await q.query("SELECT player_id FROM supercolony_members WHERE supercolony_id = $1 AND status = 'member' ORDER BY joined_at, id", [supercolonyId]);
  return r.rows.map((x: any) => x.player_id);
}

/** Seats taken: members plus those still fading (their scent is still part of it). */
async function seatsTaken(q: Q, supercolonyId: number): Promise<number> {
  const r = await q.query("SELECT count(*)::int AS n FROM supercolony_members WHERE supercolony_id = $1 AND status IN ('member', 'fading')", [supercolonyId]);
  return r.rows[0].n;
}

async function requireFree(q: Q, playerId: number) {
  const r = await q.query("SELECT status, fade_until FROM supercolony_members WHERE player_id = $1 AND status IN ('member', 'fading')", [playerId]);
  const row = r.rows[0];
  if (!row) return;
  if (row.status === 'member') throw new GameError('in_supercolony', 'You already belong to a supercolony. Leave it first.');
  throw new GameError('still_fading', 'Your old supercolony scent is still fading. You can join another once it has worn off.');
}

async function tellMembers(q: Q, worldId: number, supercolonyId: number, title: string, data: object, at: number, except: number[] = []) {
  for (const id of await memberIds(q, supercolonyId)) {
    if (except.includes(id)) continue;
    await addReport(q, worldId, id, 'diplomacy', title, data, at);
    notify(id, { type: 'diplomacy' });
  }
}

/** Members know each other's colonies: a shared scent hides nothing between them. */
async function shareScent(q: Q, playerId: number, supercolonyId: number, at: number) {
  await q.query(
    `INSERT INTO known_colonies (player_id, colony_id, via, first_at, discovered_at)
     SELECT a.player_id, c.id, 'ally', $3, $3
       FROM supercolony_members a JOIN supercolony_members b ON b.supercolony_id = a.supercolony_id AND b.player_id <> a.player_id
       JOIN colonies c ON c.player_id = b.player_id
      WHERE a.supercolony_id = $2 AND a.status = 'member' AND b.status = 'member' AND (a.player_id = $1 OR b.player_id = $1)
     ON CONFLICT (player_id, colony_id) DO UPDATE SET discovered_at = COALESCE(known_colonies.discovered_at, EXCLUDED.discovered_at)`,
    [playerId, supercolonyId, at],
  );
}

/** A member founded a new colony: the others know it at once. */
export async function shareNewColony(q: Q, ownerId: number, colonyId: number, at: number) {
  const m = await membershipOf(q, ownerId);
  if (!m) return;
  for (const id of await memberIds(q, m.supercolonyId)) if (id !== ownerId) await discover(q, id, colonyId, 'ally', at);
}

export async function foundSupercolony(q: Tx, playerId: number, rawName: string) {
  const t = now();
  const me = await getPlayer(q, playerId, true);
  if (!canJoinSupercolony(me.research)) throw new GameError('locked', DIPLOMACY_MESSAGES.needs_research);
  await requireFree(q, me.id);
  const problem = supercolonyNameProblem(String(rawName ?? ''));
  if (problem) throw new GameError('bad_name', problem);
  const name = String(rawName).trim().replace(/\s+/g, ' ');
  const taken = await q.query('SELECT 1 FROM supercolonies WHERE world_id = $1 AND lower(name) = lower($2) AND dissolved_at IS NULL', [me.worldId, name]);
  if (taken.rows[0]) throw new GameError('name_taken', 'Another supercolony already has that name.');
  const r = await q.query('INSERT INTO supercolonies (world_id, name, founder_id, created_at) VALUES ($1,$2,$3,$4) RETURNING id', [me.worldId, name, me.id, t]);
  const id = Number(r.rows[0].id);
  await q.query("INSERT INTO supercolony_members (supercolony_id, player_id, status, joined_at) VALUES ($1,$2,'member',$3)", [id, me.id, t]);
  await q.query('DELETE FROM supercolony_invites WHERE player_id = $1', [me.id]);
  await addReport(q, me.worldId, me.id, 'diplomacy', `You founded the supercolony ${name}`, { event: 'founded', supercolony: name }, t);
  return id;
}

export async function invite(q: Tx, playerId: number, otherId: number) {
  const t = now();
  const me = await getPlayer(q, playerId);
  const m = await membershipOf(q, me.id);
  if (!m) throw new GameError('not_member', 'Found or join a supercolony first.');
  const other = await otherPlayer(q, me, otherId);
  if (!(await inContact(q, me.id, other.id))) throw new GameError('no_contact', DIPLOMACY_MESSAGES.no_contact);
  const sc = await lockSupercolony(q, m.supercolonyId);
  if ((await memberIds(q, sc.id)).includes(other.id)) throw new GameError('already_member', `${other.username} is already in ${sc.name}.`);
  if ((await seatsTaken(q, sc.id)) >= SUPERCOLONY_MAX_MEMBERS) throw new GameError('full', `A supercolony holds at most ${SUPERCOLONY_MAX_MEMBERS} players.`);
  await q.query(
    `INSERT INTO supercolony_invites (supercolony_id, player_id, invited_by, created_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (supercolony_id, player_id) DO UPDATE SET invited_by = EXCLUDED.invited_by, created_at = EXCLUDED.created_at`,
    [sc.id, other.id, me.id, t],
  );
  await addReport(q, me.worldId, other.id, 'diplomacy', `${me.username} invites you to join ${sc.name}`, { event: 'invited', supercolony: sc.name, with: me.username }, t);
  notify(other.id, { type: 'diplomacy' });
}

export async function withdrawInvite(q: Tx, playerId: number, otherId: number) {
  const m = await membershipOf(q, playerId);
  if (!m) throw new GameError('not_member', 'You are not in a supercolony.');
  await q.query('DELETE FROM supercolony_invites WHERE supercolony_id = $1 AND player_id = $2', [m.supercolonyId, otherId]);
}

export async function answerInvite(q: Tx, playerId: number, supercolonyId: number, accept: boolean) {
  const t = now();
  const inv = await q.query('SELECT * FROM supercolony_invites WHERE supercolony_id = $1 AND player_id = $2', [supercolonyId, playerId]);
  if (!inv.rows[0]) throw notFound('That invitation is gone.');
  if (!accept) {
    await q.query('DELETE FROM supercolony_invites WHERE supercolony_id = $1 AND player_id = $2', [supercolonyId, playerId]);
    return;
  }
  const me = await getPlayer(q, playerId, true);
  if (!canJoinSupercolony(me.research)) throw new GameError('locked', DIPLOMACY_MESSAGES.needs_research);
  await requireFree(q, me.id);
  const sc = await lockSupercolony(q, supercolonyId);
  if ((await seatsTaken(q, sc.id)) >= SUPERCOLONY_MAX_MEMBERS) throw new GameError('full', `${sc.name} is full (${SUPERCOLONY_MAX_MEMBERS} players).`);
  await q.query("INSERT INTO supercolony_members (supercolony_id, player_id, status, joined_at) VALUES ($1,$2,'member',$3)", [sc.id, me.id, t]);
  await q.query('DELETE FROM supercolony_invites WHERE player_id = $1', [me.id]);
  await shareScent(q, me.id, sc.id, t);
  await tellMembers(q, me.worldId, sc.id, `${me.username} joined ${sc.name}`, { event: 'joined', supercolony: sc.name, with: me.username }, t, [me.id]);
  await addReport(q, me.worldId, me.id, 'diplomacy', `You joined the supercolony ${sc.name}`, { event: 'joined', supercolony: sc.name }, t);
}

/** Leave (or be removed): the scent starts to fade, and soldiers holding position on either side go home. */
async function startFade(q: Tx, playerId: number, supercolonyId: number, by: Player | null) {
  const t = now();
  const sc = await lockSupercolony(q, supercolonyId);
  const world = await getWorld(q);
  const fadeUntil = Math.round(t + scentFadeMs(world.speed));
  const r = await q.query(
    "UPDATE supercolony_members SET status = 'fading', fade_until = $3 WHERE supercolony_id = $1 AND player_id = $2 AND status = 'member' RETURNING id",
    [sc.id, playerId, fadeUntil],
  );
  if (!r.rows[0]) throw new GameError('not_member', 'Not a member of that supercolony.');
  await schedule(q, sc.world_id, 'scent_faded', fadeUntil, { memberRowId: Number(r.rows[0].id) });
  const leaver = await getPlayer(q, playerId);
  const rest = await memberIds(q, sc.id);
  await sendGarrisonsHome(q, playerId, rest, t);
  // The founder's role passes to the longest-standing member. With nobody left, the supercolony dissolves.
  if (sc.founder_id === playerId) {
    if (rest.length > 0) await q.query('UPDATE supercolonies SET founder_id = $2 WHERE id = $1', [sc.id, rest[0]]);
    else {
      await q.query('UPDATE supercolonies SET dissolved_at = $2 WHERE id = $1', [sc.id, t]);
      await q.query('DELETE FROM supercolony_invites WHERE supercolony_id = $1', [sc.id]);
    }
  }
  const data = { event: by ? 'removed' : 'left', supercolony: sc.name, with: leaver.username, fadeUntil };
  await tellMembers(q, sc.world_id, sc.id, by ? `${by.username} removed ${leaver.username} from ${sc.name}` : `${leaver.username} left ${sc.name}`, data, t, [by?.id ?? 0]);
  await addReport(
    q, sc.world_id, playerId, 'diplomacy',
    by ? `${by.username} removed you from ${sc.name}` : `You left ${sc.name}`,
    data, t,
  );
  notify(playerId, { type: 'diplomacy' });
}

export async function leaveSupercolony(q: Tx, playerId: number) {
  const m = await membershipOf(q, playerId);
  if (!m) throw new GameError('not_member', 'You are not in a supercolony.');
  await startFade(q, playerId, m.supercolonyId, null);
}

export async function removeMember(q: Tx, playerId: number, memberId: number) {
  const m = await membershipOf(q, playerId);
  if (!m) throw new GameError('not_member', 'You are not in a supercolony.');
  if (m.founderId !== playerId) throw new GameError('not_founder', 'Only the founder can remove members.');
  if (memberId === playerId) throw new GameError('bad_player', 'To go, leave the supercolony instead.');
  if (!(await memberIds(q, m.supercolonyId)).includes(memberId)) throw new GameError('bad_player', 'That player is not a member.');
  await startFade(q, memberId, m.supercolonyId, await getPlayer(q, playerId));
}

onEvent('scent_faded', async (q, ev) => {
  const r = await q.query('SELECT * FROM supercolony_members WHERE id = $1 FOR UPDATE', [ev.payload.memberRowId]);
  const row = r.rows[0];
  if (!row || row.status !== 'fading') return;
  await q.query("UPDATE supercolony_members SET status = 'gone', left_at = $2 WHERE id = $1", [row.id, ev.due_at]);
  const sc = (await q.query('SELECT * FROM supercolonies WHERE id = $1', [row.supercolony_id])).rows[0];
  const p = await getPlayer(q, row.player_id);
  const data = { event: 'faded', supercolony: sc.name, with: p.username };
  await addReport(q, sc.world_id, p.id, 'diplomacy', `The ${sc.name} scent has faded from your colonies`, data, ev.due_at);
  notify(p.id, { type: 'diplomacy' });
  if (sc.dissolved_at == null) await tellMembers(q, sc.world_id, sc.id, `${p.username}'s colonies no longer smell of ${sc.name}`, data, ev.due_at);
});

// ---------- the Allies screen ----------

export async function diplomacyView(q: Q, playerId: number) {
  const t = now();
  const me = await getPlayer(q, playerId);
  const membership = await q.query(
    "SELECT supercolony_id, status, fade_until FROM supercolony_members WHERE player_id = $1 AND status IN ('member', 'fading')",
    [playerId],
  );
  const mine = membership.rows[0];
  let supercolony: any = null;
  if (mine) {
    const sc = (await q.query('SELECT * FROM supercolonies WHERE id = $1', [mine.supercolony_id])).rows[0];
    const rows = (
      await q.query(
        `SELECT m.player_id, m.status, m.joined_at, m.fade_until, p.username, p.points_total
           FROM supercolony_members m JOIN players p ON p.id = m.player_id
          WHERE m.supercolony_id = $1 AND m.status IN ('member', 'fading') ORDER BY m.joined_at, m.id`,
        [sc.id],
      )
    ).rows;
    const cols = await q.query(
      'SELECT player_id, id, name, region, patch, spot FROM colonies WHERE player_id = ANY($1::int[]) ORDER BY id',
      [rows.map((x: any) => x.player_id)],
    );
    const invites = await q.query(
      'SELECT i.player_id, p.username, i.created_at FROM supercolony_invites i JOIN players p ON p.id = i.player_id WHERE i.supercolony_id = $1 ORDER BY i.created_at',
      [sc.id],
    );
    supercolony = {
      id: Number(sc.id),
      name: sc.name,
      founderId: sc.founder_id,
      myStatus: mine.status,
      myFadeUntil: mine.fade_until == null ? null : Number(mine.fade_until),
      members: rows.map((x: any) => ({
        playerId: x.player_id,
        username: x.username,
        points: x.points_total,
        status: x.status,
        joinedAt: Number(x.joined_at),
        fadeUntil: x.fade_until == null ? null : Number(x.fade_until),
        founder: x.player_id === sc.founder_id,
        me: x.player_id === playerId,
        colonies: cols.rows.filter((c: any) => c.player_id === x.player_id).map((c: any) => ({ id: c.id, name: c.name, coords: { region: c.region, patch: c.patch, spot: c.spot } })),
      })),
      invited: invites.rows.map((x: any) => ({ playerId: x.player_id, username: x.username, at: Number(x.created_at) })),
    };
  }
  const invitesForMe = (
    await q.query(
      `SELECT s.id, s.name, p.username AS from_name, i.created_at,
              (SELECT count(*)::int FROM supercolony_members m WHERE m.supercolony_id = s.id AND m.status IN ('member', 'fading')) AS seats
         FROM supercolony_invites i JOIN supercolonies s ON s.id = i.supercolony_id JOIN players p ON p.id = i.invited_by
        WHERE i.player_id = $1 AND s.dissolved_at IS NULL ORDER BY i.created_at`,
      [playerId],
    )
  ).rows.map((x: any) => ({ supercolonyId: Number(x.id), name: x.name, from: x.from_name, at: Number(x.created_at), seats: x.seats }));
  const truces = (
    await q.query(
      `SELECT t.id, t.status, t.proposed_by, t.created_at, t.accepted_at, t.ends_at, p.id AS other_id, p.username
         FROM truces t JOIN players p ON p.id = CASE WHEN t.player_a = $1 THEN t.player_b ELSE t.player_a END
        WHERE (t.player_a = $1 OR t.player_b = $1) AND t.status IN ('proposed', 'active', 'ending') ORDER BY t.id`,
      [playerId],
    )
  ).rows.map((x: any) => ({
    id: Number(x.id),
    status: x.status,
    otherId: x.other_id,
    username: x.username,
    proposedByMe: x.proposed_by === playerId,
    createdAt: Number(x.created_at),
    acceptedAt: x.accepted_at == null ? null : Number(x.accepted_at),
    endsAt: x.ends_at == null ? null : Number(x.ends_at),
  }));
  const contactIds = await contactsOf(q, playerId);
  const rel = await relationsOf(q, playerId, contactIds, t);
  const tags = await supercolonyTags(q, contactIds);
  const people = contactIds.length
    ? (await q.query('SELECT id, username, points_total FROM players WHERE id = ANY($1::int[]) ORDER BY points_total DESC, id', [contactIds])).rows
    : [];
  const contacts = people.map((x: any) => ({
    playerId: x.id,
    username: x.username,
    points: x.points_total,
    supercolony: tags.get(x.id)?.name ?? null,
    relation: rel.get(x.id) ?? null,
    truce: truces.find((tr) => tr.otherId === x.id) ?? null,
    invited: !!supercolony?.invited.some((i: any) => i.playerId === x.id),
  }));
  return { canFound: canJoinSupercolony(me.research), supercolony, invitesForMe, truces, contacts };
}
