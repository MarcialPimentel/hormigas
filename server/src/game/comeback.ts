// Build 12, reasons to come back (docs/26-come-back.md): colony needs (daily tasks), the Field Journal and
// "Yesterday in the colony". All three read the counters in ./stats.ts.
import {
  JOURNAL,
  NEEDS_RULES,
  add,
  daySummary,
  journalEntry,
  journalTiers,
  needDay,
  needDayStart,
  needDef,
  needProgress,
  needReward,
  needSeed,
  needTarget,
  needTitle,
  pickNeeds,
  productionPerHour,
  res,
  stat,
  type Resources,
  type Stats,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, getPlayer, lockOwnColony, playerColonies, saveColony } from '../colony';
import { getWorld } from '../world';
import { questInput } from './quests';
import { bump, playerStats } from './stats';

// ---------- the day ----------

/** Today's number for this world, and when the next day starts. */
async function today(q: Q, t: number) {
  const world = await getWorld(q);
  const day = needDay(t, world.speed);
  return { day, speed: world.speed, endsAt: needDayStart(day + 1, world.speed) };
}

/** The player's whole production per hour, every colony together (needs pay a share of it). */
async function totalProduction(q: Q, playerId: number, speed: number, t: number): Promise<Resources> {
  let sum = res();
  for (const c of await playerColonies(q, playerId)) {
    const a = advance(c, t);
    sum = add(sum, productionPerHour(a.chambers, a.terrain, speed, a.research, a.units));
  }
  return sum;
}

/**
 * The first look of a day: keep a snapshot of the counters (for "Yesterday in the colony") and give the day's needs.
 * Safe to call on every visit and from two tabs at once.
 */
async function startDay(q: Q, playerId: number, day: number, stats: Stats) {
  await q.query('INSERT INTO player_days (player_id, day, stats) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [playerId, day, JSON.stringify(stats)]);
  const have = await q.query('SELECT 1 FROM player_needs WHERE player_id = $1 AND day = $2 LIMIT 1', [playerId, day]);
  if (have.rows[0]) return;
  const input = await questInput(q, playerId);
  const queen = input.chambers.queen_chamber ?? 0;
  // yesterday's unfinished needs are still showing: don't give the same ones again today
  const showing = (await q.query('SELECT need_id FROM player_needs WHERE player_id = $1 AND day >= $2 AND claimed_at IS NULL', [playerId, day - NEEDS_RULES.keepDays + 1])).rows.map((r: any) => r.need_id);
  let picks = pickNeeds({ chambers: input.chambers, units: input.units, stats }, needSeed(playerId, day), NEEDS_RULES.perDay, showing);
  if (picks.length < NEEDS_RULES.perDay) picks = pickNeeds({ chambers: input.chambers, units: input.units, stats }, needSeed(playerId, day), NEEDS_RULES.perDay);
  for (const [slot, def] of picks.entries())
    await q.query('INSERT INTO player_needs (player_id, day, slot, need_id, base, target) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [
      playerId, day, slot, def.id, stat(stats, def.stat), needTarget(def, queen),
    ]);
}

// ---------- colony needs ----------

export interface NeedView {
  day: number;
  slot: number;
  id: string;
  title: string;
  hint: string;
  screen: string;
  done: number;
  target: number;
  ready: boolean;
  claimed: boolean;
  /** from an earlier day: still open until expiresAt */
  carried: boolean;
  expiresAt: number;
}

export async function needsStatus(q: Q, playerId: number) {
  const t = now();
  const { day, speed, endsAt } = await today(q, t);
  const stats = await playerStats(q, playerId);
  await startDay(q, playerId, day, stats);
  const oldest = day - NEEDS_RULES.keepDays + 1;
  const rows = (
    await q.query(
      `SELECT day, slot, need_id, base, target, claimed_at FROM player_needs
        WHERE player_id = $1 AND (day = $2 OR (day >= $3 AND claimed_at IS NULL)) ORDER BY day DESC, slot`,
      [playerId, day, oldest],
    )
  ).rows;
  const needs: NeedView[] = [];
  for (const r of rows) {
    const def = needDef(r.need_id);
    if (!def) continue;
    const p = needProgress(Number(r.base), Number(r.target), stat(stats, def.stat));
    needs.push({
      day: r.day, slot: r.slot, id: def.id, title: needTitle(def, Number(r.target)), hint: def.hint, screen: def.screen,
      done: p.done, target: Number(r.target), ready: p.ready, claimed: r.claimed_at != null,
      carried: r.day < day, expiresAt: needDayStart(r.day + NEEDS_RULES.keepDays, speed),
    });
  }
  const p = await q.query('SELECT reroll_day FROM players WHERE id = $1', [playerId]);
  // Yesterday in the colony: today's first snapshot against the one before it
  const snaps = (await q.query('SELECT day, stats FROM player_days WHERE player_id = $1 AND day <= $2 ORDER BY day DESC LIMIT 2', [playerId, day])).rows;
  const yesterday = snaps.length === 2 ? { days: day - snaps[1].day, rows: daySummary(snaps[0].stats, snaps[1].stats) } : null;
  return {
    day,
    endsAt,
    needs,
    reward: needReward(await totalProduction(q, playerId, speed, t)),
    canReroll: p.rows[0]?.reroll_day !== day && needs.some((n) => !n.carried && !n.claimed),
    yesterday,
  };
}

async function lockNeed(q: Tx, playerId: number, day: number, slot: number) {
  const r = await q.query('SELECT need_id, base, target, claimed_at FROM player_needs WHERE player_id = $1 AND day = $2 AND slot = $3 FOR UPDATE', [playerId, day, slot]);
  const row = r.rows[0];
  if (!row) throw new GameError('no_need', 'That need is gone.');
  if (row.claimed_at != null) throw new GameError('claimed', 'You already collected that reward.');
  return row;
}

export async function claimNeed(q: Tx, playerId: number, day: number, slot: number, colonyId: number) {
  await getPlayer(q, playerId, true); // lock order: player, then colony
  const t = now();
  const { day: current, speed } = await today(q, t);
  if (!Number.isInteger(day) || day < current - NEEDS_RULES.keepDays + 1 || day > current) throw new GameError('expired', 'That need has faded.');
  const row = await lockNeed(q, playerId, day, slot);
  const def = needDef(row.need_id);
  if (!def) throw new GameError('no_need', 'That need is gone.');
  const stats = await playerStats(q, playerId);
  if (!needProgress(Number(row.base), Number(row.target), stat(stats, def.stat)).ready) throw new GameError('not_done', 'The colony still needs that.');
  const reward = needReward(await totalProduction(q, playerId, speed, t));
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);
  c.resources = add(c.resources, reward);
  await saveColony(q, c);
  await q.query('UPDATE player_needs SET claimed_at = $4 WHERE player_id = $1 AND day = $2 AND slot = $3', [playerId, day, slot, t]);
  await bump(q, playerId, 'needs_done');
  return reward;
}

/** Swap one of today's needs for another, once a day. The new one counts from now. */
export async function rerollNeed(q: Tx, playerId: number, slot: number) {
  await getPlayer(q, playerId, true);
  const t = now();
  const { day } = await today(q, t);
  const p = await q.query('SELECT reroll_day FROM players WHERE id = $1', [playerId]);
  if (p.rows[0]?.reroll_day === day) throw new GameError('rerolled', 'You already swapped a need today. Tomorrow brings new ones.');
  await lockNeed(q, playerId, day, slot);
  const stats = await playerStats(q, playerId);
  const input = await questInput(q, playerId);
  const showing = (await q.query('SELECT need_id FROM player_needs WHERE player_id = $1 AND day >= $2 AND claimed_at IS NULL', [playerId, day - NEEDS_RULES.keepDays + 1])).rows.map((r: any) => r.need_id);
  const [def] = pickNeeds({ chambers: input.chambers, units: input.units, stats }, needSeed(playerId, day, 1), 1, showing);
  if (!def) throw new GameError('no_other', 'There is nothing else the colony needs right now.');
  await q.query('UPDATE player_needs SET need_id = $4, base = $5, target = $6 WHERE player_id = $1 AND day = $2 AND slot = $3', [
    playerId, day, slot, def.id, stat(stats, def.stat), needTarget(def, input.chambers.queen_chamber ?? 0),
  ]);
  await q.query('UPDATE players SET reroll_day = $2 WHERE id = $1', [playerId, day]);
  return def;
}

// ---------- the Field Journal ----------

/** Work out every entry's stage, write down any newly reached ones, and say how many are new since the last look. */
export async function journalStatus(q: Q, playerId: number) {
  const t = now();
  const stats = await playerStats(q, playerId);
  const kept: Record<string, number> = {};
  const at: Record<string, number> = {};
  for (const r of (await q.query('SELECT entry_id, tier, at FROM player_journal WHERE player_id = $1', [playerId])).rows) {
    kept[r.entry_id] = r.tier;
    at[r.entry_id] = Number(r.at);
  }
  const tiers = journalTiers(stats, kept);
  for (const e of JOURNAL) {
    if ((tiers[e.id] ?? 0) <= (kept[e.id] ?? 0)) continue;
    await q.query(
      `INSERT INTO player_journal (player_id, entry_id, tier, at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (player_id, entry_id) DO UPDATE SET tier = GREATEST(player_journal.tier, EXCLUDED.tier), at = EXCLUDED.at`,
      [playerId, e.id, tiers[e.id], t],
    );
    at[e.id] = t;
  }
  const p = (await q.query('SELECT title, journal_seen_at FROM players WHERE id = $1', [playerId])).rows[0];
  const seenAt = Number(p?.journal_seen_at ?? 0);
  const entries = JOURNAL.map((e) => {
    const tier = tiers[e.id] ?? 0;
    return {
      id: e.id,
      tier,
      value: Math.floor(stat(stats, e.stat)),
      next: e.tiers[tier] ?? null,
      fresh: tier > 0 && (at[e.id] ?? 0) > seenAt,
    };
  });
  return { title: p?.title ?? null, entries, fresh: entries.filter((e) => e.fresh).length };
}

export async function markJournalSeen(q: Q, playerId: number) {
  await q.query('UPDATE players SET journal_seen_at = $2 WHERE id = $1', [playerId, now()]);
}

/** Wear an earned title (by its entry), or none. */
export async function setTitle(q: Q, playerId: number, entryId: string | null) {
  if (entryId == null || entryId === '') {
    await q.query('UPDATE players SET title = NULL WHERE id = $1', [playerId]);
    return null;
  }
  const e = journalEntry(entryId);
  if (!e) throw new GameError('no_entry', 'No such journal entry.');
  const r = await q.query('SELECT tier FROM player_journal WHERE player_id = $1 AND entry_id = $2', [playerId, entryId]);
  if (!(r.rows[0]?.tier >= 1)) throw new GameError('not_earned', 'Earn that page of the journal first.');
  await q.query('UPDATE players SET title = $2 WHERE id = $1', [playerId, e.title]);
  return e.title;
}
