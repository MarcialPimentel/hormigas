// Small random events inside the nest (docs/04-colony.md, "Nest events"). Only good or harmless.
// Each player colony has one pending `nest_event` in the events queue; when it fires it rolls an event,
// files a report, and schedules the next one.
import {
  NEST_EVENTS,
  createRng,
  isInactive,
  nextNestEventHours,
  productionPerHour,
  randomSeed,
  rollNestEvent,
  storageCapacity,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { advance, getPlayer, lockColony, saveColony } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { addReport } from './reports';

const HOUR = 3600_000;

/** Schedule a colony's next nest event, counted from time t. */
export async function scheduleNestEvent(q: Q, worldId: number, colonyId: number, t: number) {
  const speed = (await getWorld(q)).speed;
  await schedule(q, worldId, 'nest_event', t + (nextNestEventHours(createRng(randomSeed())) * HOUR) / speed, { colonyId });
}

/** Give every player colony without a pending nest event one (run at startup; covers colonies made before Build 3). */
export async function ensureNestEvents(q: Tx, worldId: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT c.id FROM colonies c WHERE c.world_id = $1 AND c.npc IS NULL
        AND NOT EXISTS (SELECT 1 FROM events e WHERE NOT e.done AND e.type = 'nest_event' AND (e.payload->>'colonyId')::int = c.id)`,
    [worldId],
  );
  for (const row of r.rows) await scheduleNestEvent(q, worldId, row.id, t);
  return r.rows.length;
}

onEvent('nest_event', async (q, ev) => {
  const t = ev.due_at;
  const colonyId = ev.payload.colonyId;
  const found = await q.query('SELECT id FROM colonies WHERE id = $1 AND npc IS NULL', [colonyId]);
  if (!found.rows[0]) return; // colony gone: stop
  const rearm = () => scheduleNestEvent(q, ev.world_id, colonyId, t);

  let c = await lockColony(q, colonyId);
  const player = await getPlayer(q, c.playerId);
  // abandoned colonies get nothing, so they don't pile up free loot for raiders
  if (isInactive({ points: player.points.total, protectedUntil: Number(player.protectedUntil), lastActive: Number(player.lastActive) }, t)) {
    await rearm();
    return;
  }

  c = advance(c, t);
  const world = await getWorld(q);
  const roll = rollNestEvent(createRng(randomSeed()), productionPerHour(c.chambers, c.terrain, world.speed), c.resources, storageCapacity(c.chambers));
  const def = NEST_EVENTS[roll.event];
  const gift = { foliage: 0, protein: 0, nectar: 0 };
  if (roll.resource && roll.amount > 0) {
    gift[roll.resource] = roll.amount;
    c = { ...c, resources: { ...c.resources, [roll.resource]: c.resources[roll.resource] + roll.amount } };
  }
  await saveColony(q, c);
  await addReport(q, ev.world_id, c.playerId, 'nest_event', def.title, { event: roll.event, text: def.text, found: gift, colonyId: c.id }, t);
  await rearm();
});
