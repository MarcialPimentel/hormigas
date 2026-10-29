// Brood Hall: raising castes and building defenses.
import {
  CASTES,
  CASTE_IDS,
  DEFENSES,
  DEFENSE_IDS,
  broodBlocker,
  lvl,
  scale,
  sub,
  unitSeconds,
  fedCost,
  feedingTimeFactor,
  isFeeding,
  digestPlan,
  digestUndigested,
  DIGEST_RULES,
  res,
  add,
  type Feeding,
  type CasteId,
  type DefenseId,
  type QueueItem,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, requireAffordable, getPlayer, lockOwnColony, saveColony } from '../colony';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';

export const MAX_BATCH = 100_000;

export async function enqueueUnits(q: Tx, playerId: number, colonyId: number, kind: string, id: string, count: number, feedRaw: unknown = 'normal') {
  if (kind !== 'caste' && kind !== 'defense') throw new GameError('bad_kind', 'Unknown kind.');
  const feed: Feeding = feedRaw == null || feedRaw === '' ? 'normal' : isFeeding(feedRaw) ? feedRaw : (() => { throw new GameError('bad_feed', 'Unknown feeding.'); })();
  if (feed !== 'normal' && kind !== 'caste') throw new GameError('bad_feed', 'Only castes can be fed extra Protein.');
  const def =
    kind === 'caste'
      ? CASTE_IDS.includes(id as CasteId) && CASTES[id as CasteId].mvp ? CASTES[id as CasteId] : null
      : DEFENSE_IDS.includes(id as DefenseId) && DEFENSES[id as DefenseId].mvp ? DEFENSES[id as DefenseId] : null;
  if (!def) throw new GameError('bad_unit', 'Unknown unit.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) throw new GameError('bad_count', `Raise between 1 and ${MAX_BATCH.toLocaleString()} at a time.`);

  const t = now();
  const player = await getPlayer(q, playerId, true);
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);

  const broodHall = lvl(c.chambers, 'brood_hall');
  // same checks the Brood screen uses to grey out the button
  const blocked = broodBlocker(kind, id, def, count, c, player);
  if (blocked) throw new GameError(blocked.code, blocked.message);

  // Feeding the brood (docs/05-castes-units.md): extra Protein per unit, raised faster
  const cost = scale(fedCost(def.cost, feed), count);
  requireAffordable(c, cost);

  const world = await getWorld(q);
  const perUnitMs = Math.round(
    unitSeconds(def.cost, { worldSpeed: world.speed, broodHall, research: player.research, timeMultiplier: await timeMultiplier(q, world.id, player.points.total, t) }) * feedingTimeFactor(feed) * 1000,
  );
  const item: QueueItem = { kind, id: id as CasteId | DefenseId, count, done: 0, perUnitMs, startAt: c.unitQueue.length === 0 ? t : null, ...(feed !== 'normal' ? { feed } : {}) };
  c.resources = sub(c.resources, cost);
  c.unitQueue = [...c.unitQueue, item];
  await saveColony(q, c);
  return c;
}

// ---------- larval digestion (docs/03-economy.md) ----------

/** Larvae digest Protein and feed Nectar-like liquid food back to the workers, at a poor rate and over time. */
export async function startDigestion(q: Tx, playerId: number, colonyId: number, protein: number) {
  if (!Number.isInteger(protein) || protein < DIGEST_RULES.minProtein) throw new GameError('bad_amount', `Digest at least ${DIGEST_RULES.minProtein} Protein.`);
  const t = now();
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);
  const broodHall = lvl(c.chambers, 'brood_hall');
  if (broodHall < DIGEST_RULES.unlockBroodHall) throw new GameError('locked', `Larval digestion needs Brood Hall ${DIGEST_RULES.unlockBroodHall}.`);
  if (c.digestJob) throw new GameError('busy', 'The larvae are already digesting. Wait for them to finish or stop them first.');
  const cost = res(0, protein, 0);
  requireAffordable(c, cost);
  const world = await getWorld(q);
  const plan = digestPlan(protein, broodHall, world.speed);
  c.resources = sub(c.resources, cost);
  c.digestJob = { protein, nectar: plan.nectar, delivered: 0, startAt: t, endAt: t + plan.ms };
  await saveColony(q, c);
  return c;
}

/** Stop digesting: the Nectar made so far stays, the undigested Protein comes back. */
export async function stopDigestion(q: Tx, playerId: number, colonyId: number) {
  const t = now();
  let c = await lockOwnColony(q, colonyId, playerId);
  c = advance(c, t);
  if (!c.digestJob) throw new GameError('idle', 'The larvae are not digesting anything.');
  c.resources = add(c.resources, res(0, digestUndigested(c.digestJob, t), 0));
  c.digestJob = null;
  await saveColony(q, c);
  return c;
}
