// Brood Hall: raising castes and building defenses.
import {
  CASTES,
  CASTE_IDS,
  DEFENSES,
  DEFENSE_IDS,
  canAfford,
  lvl,
  missingRequirements,
  queuedCounts,
  scale,
  sub,
  unitSeconds,
  type CasteId,
  type DefenseId,
  type QueueItem,
} from '@hormigas/shared';
import type { Tx } from '../db';
import { now } from '../clock';
import { GameError } from '../errors';
import { advance, getPlayer, lockOwnColony, saveColony } from '../colony';
import { getWorld } from '../world';
import { timeMultiplier } from './boost';

export const MAX_BATCH = 100_000;

export async function enqueueUnits(q: Tx, playerId: number, colonyId: number, kind: string, id: string, count: number) {
  if (kind !== 'caste' && kind !== 'defense') throw new GameError('bad_kind', 'Unknown kind.');
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
  if (broodHall < 1) throw new GameError('locked', 'Build a Brood Hall first.');
  if (c.buildJob?.chamber === 'brood_hall') throw new GameError('busy', 'The Brood Hall is being enlarged.');
  const missing = missingRequirements(def.unlock, c.chambers, player.research);
  if (missing.length) throw new GameError('locked', `Requires ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}.`);

  if (kind === 'defense' && 'max' in def && def.max) {
    const have = lvl(c.defenses, id as DefenseId) + (queuedCounts(c.unitQueue)[id] ?? 0);
    if (have + count > def.max) throw new GameError('max', `You can only have ${def.max} ${def.name}.`);
  }

  const cost = scale(def.cost, count);
  if (!canAfford(c.resources, cost)) throw new GameError('cant_afford', 'Not enough resources.');

  const world = await getWorld(q);
  const perUnitMs = Math.round(
    unitSeconds(def.cost, { worldSpeed: world.speed, broodHall, timeMultiplier: await timeMultiplier(q, world.id, player.points.total, t) }) * 1000,
  );
  const item: QueueItem = { kind, id: id as CasteId | DefenseId, count, done: 0, perUnitMs, startAt: c.unitQueue.length === 0 ? t : null };
  c.resources = sub(c.resources, cost);
  c.unitQueue = [...c.unitQueue, item];
  await saveColony(q, c);
  return c;
}
