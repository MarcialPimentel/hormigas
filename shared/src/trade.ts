// Trade trails (Build 16). Spec: docs/23-supercolonies.md § Trade trails. Numbers: docs/data/trade.json.
//
// A caravan of carriers walks to another colony (one of yours, or a player's you have a truce or a shared scent with)
// and keeps a pheromone trail open there. Every few hours it brings home goods made at the destination, chosen by the
// destination's ground, for a few days; then it walks home and the trail can be renewed. Computed, not ticked: one
// scheduled delivery event at a time, like aphid herds.
import { RESOURCE_IDS, TRADE_DATA, type CasteId, type ResourceId, type Resources, type TerrainId } from './data';
import { res } from './resources';
import { researchSum, type ResearchLevels } from './economy';
import type { Relation } from './diplomacy';

const T = TRADE_DATA;

export const TRADE = {
  trailHours: T.trailHours as number,
  deliverEveryHours: T.deliverEveryHours as number,
  /** deliveries in one trail (the last one sends the caravan home) */
  deliveries: Math.max(1, Math.round(T.trailHours / T.deliverEveryHours)),
  carriers: T.carriers as CasteId[],
  partnerShare: T.partnerShare as number,
};

/** Who a trail goes to: your own colony, a truce partner, or a supercolony mate. */
export type TradeKind = 'own' | 'truce' | 'ally';

/**
 * The kind of trail to a colony, or null if no trail can go there. Truces in their notice period and fading scents
 * don't open new trails; trails already running keep going until the pact is gone (raids are still off).
 */
export function tradeKindFor(own: boolean, relation: Relation | null | undefined): TradeKind | null {
  if (own) return 'own';
  if (relation === 'ally') return 'ally';
  if (relation === 'truce') return 'truce';
  return null;
}

/** Whether a running trail to a player keeps going under this relation (any pact that stops raids). */
export const tradeKeepsGoing = (relation: Relation | null | undefined): boolean => relation != null;

/** How many trails each colony can keep open at once. Research for more comes later (Marz, 5 Nov 2026). */
export const tradeSlots = (_research?: ResearchLevels): number => T.trailsPerColony;

export const tradeEveryMs = (worldSpeed: number) => (T.deliverEveryHours * 3600_000) / Math.max(1, worldSpeed);

/** Hours a trail stays open: trailHours, plus a day a level of the sender's Trophallaxis (docs/23-supercolonies.md § Trade trails). */
export const tradeTrailHours = (research?: ResearchLevels): number => T.trailHours + researchSum(research, 'tradeTrailHours');

/** Deliveries in one trail for this sender (the last one sends the caravan home). Fixed when the trail opens. */
export const tradeDeliveries = (research?: ResearchLevels): number => Math.max(1, Math.round(tradeTrailHours(research) / T.deliverEveryHours));

export const tradeTrailMs = (worldSpeed: number, research?: ResearchLevels) => tradeDeliveries(research) * tradeEveryMs(worldSpeed);

/** What a trail to this ground brings back: the weight on each resource. */
export const tradeGoods = (terrain: TerrainId): Partial<Resources> => (T.goods as Record<TerrainId, Partial<Resources>>)[terrain] ?? {};

/** Longer trails pay more, up to a cap. */
export const tradeDistanceFactor = (dist: number): number =>
  Math.min(T.distance.maxFactor, 1 + (Math.max(0, dist) / 10_000) * T.distance.perTenThousand);

export const tradeShare = (kind: TradeKind): number => (T.share as Record<TradeKind, number>)[kind];

/**
 * One delivery's goods before the caravan's carrying limit: share × the destination's production of each good per hour
 * (at world speed 1) × hours between deliveries × the distance factor. The destination loses nothing.
 */
export function tradePotential(destPerHour: Resources, destTerrain: TerrainId, dist: number, kind: TradeKind): Resources {
  const goods = tradeGoods(destTerrain);
  const f = tradeShare(kind) * T.deliverEveryHours * tradeDistanceFactor(dist);
  const out = res();
  for (const r of RESOURCE_IDS) out[r] = Math.floor((goods[r] ?? 0) * Math.max(0, destPerHour[r]) * f);
  return out;
}

/** A delivery the caravan can carry: the potential, scaled down evenly if it's over the caravan's cargo. */
export function tradeDelivery(potential: Resources, cargo: number): Resources {
  const sum = potential.foliage + potential.protein + potential.nectar;
  if (sum <= cargo) return { ...potential };
  const k = Math.max(0, cargo) / sum;
  const out = res();
  for (const r of RESOURCE_IDS) out[r] = Math.floor(potential[r] * k);
  return out;
}

/** What the host of a player trail gains from one delivery: partnerShare of its total, in the goods of the sender's ground. */
export function tradePartnerGoods(delivered: Resources, senderTerrain: TerrainId): Resources {
  const amount = (delivered.foliage + delivered.protein + delivered.nectar) * TRADE.partnerShare;
  const goods = tradeGoods(senderTerrain);
  const weight = RESOURCE_IDS.reduce((a, r) => a + (goods[r] ?? 0), 0);
  const out = res();
  if (weight <= 0) return out;
  for (const r of RESOURCE_IDS) out[r] = Math.floor((amount * (goods[r] ?? 0)) / weight);
  return out;
}

/** The goods a ground's trail brings, as words: "Foliage", "Foliage, Protein and Nectar". */
export function tradeGoodsNames(terrain: TerrainId): string {
  const names: Record<ResourceId, string> = { foliage: 'Foliage', protein: 'Protein', nectar: 'Nectar' };
  const list = RESOURCE_IDS.filter((r) => (tradeGoods(terrain)[r] ?? 0) > 0).map((r) => names[r]);
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export const TRADE_MESSAGES = {
  carriers_only: 'Only Workers, Media Workers and Haulers can walk a trade trail.',
  needs_pact: 'Trade trails go to your own colonies, or to players you have a truce or a shared scent with. Offer a truce from Allies first.',
  pact_ending: 'Your pact with this player is ending, so no new trails can open. Trails already running keep going until it ends.',
  one_per_colony: (max: number) =>
    max === 1 ? 'This colony already has a trade trail open (or its caravan is still walking home). Each colony keeps one trail.' : `This colony already has ${max} trade trails open. Each colony keeps ${max}.`,
};
