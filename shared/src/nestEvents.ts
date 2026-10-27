// Small random events inside the nest (docs/04-colony.md, "Nest events"). Only good or harmless.
import { NEST_EVENTS_DATA, type ResourceId, type Resources } from './data';
import type { Rng } from './rng';

export interface NestEventDef {
  weight: number;
  resource: ResourceId | null;
  title: string;
  text: string;
}
export const NEST_EVENTS = NEST_EVENTS_DATA.events as unknown as Record<string, NestEventDef>;
export type NestEventId = string;
export const NEST_EVENT_IDS = Object.keys(NEST_EVENTS);

/** Hours (world speed 1) until a colony's next nest event, picked uniformly from everyHours. */
export function nextNestEventHours(rng: Rng): number {
  const [lo, hi] = NEST_EVENTS_DATA.everyHours as [number, number];
  return lo + rng() * (hi - lo);
}

export interface NestEventRoll {
  event: NestEventId;
  resource: ResourceId | null;
  amount: number;
}

/**
 * Pick an event and its gift. Gifts for a resource whose storage is already full are skipped,
 * so a roll never wastes itself; the gift is capped to what still fits.
 * `perHour` is the colony's production per hour at the world's speed.
 */
export function rollNestEvent(rng: Rng, perHour: Resources, have: Resources, cap: Resources): NestEventRoll {
  const options = NEST_EVENT_IDS.filter((id) => {
    const r = NEST_EVENTS[id].resource;
    return r === null || have[r] < cap[r];
  });
  const sum = options.reduce((a, id) => a + NEST_EVENTS[id].weight, 0);
  let x = rng() * sum;
  let event = options[options.length - 1];
  for (const id of options) {
    x -= NEST_EVENTS[id].weight;
    if (x < 0) {
      event = id;
      break;
    }
  }
  const resource = NEST_EVENTS[event].resource;
  if (!resource) return { event, resource: null, amount: 0 };
  const want = Math.max(NEST_EVENTS_DATA.minGift, perHour[resource] * NEST_EVENTS_DATA.giftHours);
  const amount = Math.floor(Math.max(0, Math.min(want, cap[resource] - have[resource])));
  return { event, resource, amount };
}
