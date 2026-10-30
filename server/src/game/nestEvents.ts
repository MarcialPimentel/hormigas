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
import { advance, getPlayer, lockColony, saveColony } from '../colony';
import { recurringColonyEvent } from '../recurring';
import { getWorld } from '../world';
import { addReport } from './reports';

const nestEvents = recurringColonyEvent('nest_event', {
  where: 'c.npc IS NULL',
  gapHours: () => nextNestEventHours(createRng(randomSeed())),
  async run(q, ev, colony) {
    const t = ev.due_at;
    let c = await lockColony(q, colony.id);
    const player = await getPlayer(q, c.playerId);
    // abandoned colonies get nothing, so they don't pile up free loot for raiders
    if (isInactive({ points: player.points.total, protectedUntil: Number(player.protectedUntil), lastActive: Number(player.lastActive) }, t)) return;

    c = advance(c, t);
    const world = await getWorld(q);
    const roll = rollNestEvent(createRng(randomSeed()), productionPerHour(c.chambers, c.terrain, world.speed, c.research, c.units), c.resources, storageCapacity(c.chambers, c.research));
    const def = NEST_EVENTS[roll.event];
    const gift = { foliage: 0, protein: 0, nectar: 0 };
    if (roll.resource && roll.amount > 0) {
      gift[roll.resource] = roll.amount;
      c = { ...c, resources: { ...c.resources, [roll.resource]: c.resources[roll.resource] + roll.amount } };
    }
    await saveColony(q, c);
    await addReport(q, ev.world_id, c.playerId, 'nest_event', def.title, { event: roll.event, text: def.text, found: gift, colonyId: c.id }, t);
  },
});

/** Schedule a colony's next nest event, counted from time t. */
export const scheduleNestEvent = nestEvents.scheduleNext;

/** Give every player colony without a pending nest event one (run at startup; covers colonies made before Build 3). */
export const ensureNestEvents = nestEvents.ensure;
