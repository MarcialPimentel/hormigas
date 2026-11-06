// Trade trails (Build 16, docs/23-supercolonies.md § Trade trails). A caravan of carriers walks to another colony and
// keeps a trail open there (the mission is "holding"). Every few hours one scheduled event brings home goods made at
// the destination; after the last delivery the caravan walks home. Computed, not ticked, like aphid herds.
import {
  add,
  distance,
  groupCargo,
  productionPerHour,
  res,
  TRADE,
  TRADE_MESSAGES,
  tradeDelivery,
  tradeDistanceFactor,
  tradeEveryMs,
  tradeGoodsNames,
  tradeKeepsGoing,
  tradeKindFor,
  tradePartnerGoods,
  tradePotential,
  tradeDeliveries,
  type Resources,
  type TradeKind,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError } from '../errors';
import { advance, colonyAt, getColony, getPlayer, lockColony, saveColony, type Colony } from '../colony';
import { onEvent, schedule } from '../events';
import { getWorld } from '../world';
import { notify } from '../realtime';
import { comeHome, defineMission, lockMission, saveMission, type Mission } from './missions';
import { requireKnown } from './discovery';
import { relationOf } from './diplomacy';
import { addReport } from './reports';
import { bump, foodIn } from './stats';

/** What a running trail keeps on its mission row. */
interface TradeResult {
  trading: true;
  kind: TradeKind;
  /** the next delivery's number (1-based); the pending trade_deliver event carries the same */
  next: number;
  /** deliveries in this trail, fixed when it opens (Trophallaxis adds some); missing on trails opened before Build 20 */
  deliveries?: number;
  endsAt: number;
  /** totals so far: what the sender got, and what the host got (player trails) */
  delivered: Resources;
  partnerGot: Resources;
}

/**
 * The kind of trail `playerId` can open to `dest` right now, or a GameError saying why not. A colony of yours is
 * always fine; a player's needs contact and a truce or a shared scent.
 */
async function openKind(q: Q, playerId: number, from: Colony, dest: Colony | null): Promise<TradeKind> {
  if (!dest || dest.npc) throw new GameError('bad_target', 'Trade trails go to colonies: yours, or a player’s.');
  if (dest.id === from.id) throw new GameError('bad_target', 'Pick a different colony.');
  if (dest.playerId === playerId) return 'own';
  await requireKnown(q, playerId, dest.id, 'send');
  const rel = (await relationOf(q, playerId, dest.playerId))?.relation ?? null;
  const kind = tradeKindFor(false, rel);
  if (kind) return kind;
  throw new GameError(rel ? 'pact_ending' : 'needs_pact', rel ? TRADE_MESSAGES.pact_ending : TRADE_MESSAGES.needs_pact);
}

/** The kind a running trail pays under the pact as it stands now, or null if the trail must close. */
async function runningKind(q: Q, m: Mission, dest: Colony, t: number): Promise<TradeKind | null> {
  if (dest.playerId === m.playerId) return 'own';
  const rel = (await relationOf(q, m.playerId, dest.playerId, t))?.relation ?? null;
  if (!tradeKeepsGoing(rel)) return null;
  return rel === 'ally' ? 'ally' : 'truce';
}

/** The destination's own production per hour at world speed 1: what its trail goods are a share of. */
const destPerHour = (dest: Colony) => productionPerHour(dest.chambers, dest.terrain, 1, dest.research, dest.units);

defineMission('trade', {
  async validate({ q, player, colony, targetColony }) {
    // only carriers may go: checked from MISSION_TYPES before this runs
    await openKind(q, player.id, colony, targetColony);
  },
  async arrive(q, m, at) {
    const dest = m.targetColonyId ? await getColony(q, m.targetColonyId).catch(() => null) : null;
    const kind = dest ? await runningKind(q, m, dest, at) : null;
    if (!dest || !kind) {
      m.result = { turnedBack: true };
      await addReport(q, m.worldId, m.playerId, 'trade', `Your caravan turned back from ${dest?.name ?? 'the trail'}`, {
        colony: dest?.name ?? null, target: m.target, turnedBack: true, why: dest ? 'Your pact with them had ended.' : 'The colony was gone.',
      }, at);
      return { home: true };
    }
    const speed = (await getWorld(q)).speed;
    const sender = await getPlayer(q, m.playerId);
    // Trophallaxis keeps the trail open longer: set when it opens, like other time research (docs/23-supercolonies.md)
    const deliveries = tradeDeliveries(sender.research);
    const extraDays = (deliveries - TRADE.deliveries) * TRADE.deliverEveryHours / 24;
    const result: TradeResult = { trading: true, kind, next: 1, deliveries, endsAt: at + deliveries * tradeEveryMs(speed), delivered: res(), partnerGot: res() };
    m.result = result;
    await schedule(q, m.worldId, 'trade_deliver', at + tradeEveryMs(speed), { missionId: m.id, n: 1 });
    const home = await getColony(q, m.originColonyId);
    const perDelivery = tradeDelivery(tradePotential(destPerHour(dest), dest.terrain, distance(m.origin, m.target), kind), groupCargo(m.units));
    await addReport(q, m.worldId, m.playerId, 'trade', `Your caravan opened a trade trail to ${dest.name}`, {
      opened: true, colony: dest.name, from: home.name, kind, units: m.units, goods: tradeGoodsNames(dest.terrain), perDelivery,
      everyHours: TRADE.deliverEveryHours, everyMs: tradeEveryMs(speed), deliveries, endsAt: result.endsAt, ...(extraDays > 0 ? { extraDays } : {}),
    }, at);
    if (dest.playerId !== m.playerId) {
      await addReport(q, m.worldId, dest.playerId, 'trade', `${sender.username}'s caravan opened a trade trail to ${dest.name}`, {
        opened: true, host: true, colony: dest.name, from: sender.username, fromColony: home.name, kind,
        goods: tradeGoodsNames(home.terrain), partnerPerDelivery: tradePartnerGoods(perDelivery, home.terrain),
        everyHours: TRADE.deliverEveryHours, everyMs: tradeEveryMs(speed), deliveries, endsAt: result.endsAt,
      }, at);
    }
    return { home: true, stay: true };
  },
});

/** Close a trail: the caravan walks home, and both sides get a report with what it brought. */
async function closeTrail(q: Tx, m: Mission, dest: Colony | null, t: number, why: 'done' | 'pact_ended' | 'gone') {
  const r = m.result as TradeResult;
  await comeHome(q, m, t, { trading: false, closed: why });
  const title =
    why === 'done' ? `Your trade trail to ${dest?.name} has run its course` : why === 'pact_ended' ? `Your trade trail to ${dest?.name} closed: your pact ended` : 'Your trade trail closed: the colony was gone';
  await addReport(q, m.worldId, m.playerId, 'trade', title, {
    closed: why, colony: dest?.name ?? null, kind: r.kind, delivered: r.delivered, deliveries: r.next - 1, partnerGot: r.partnerGot, returnAt: m.returnAt,
  }, t);
  if (dest && dest.playerId !== m.playerId) {
    const sender = await getPlayer(q, m.playerId);
    await addReport(q, m.worldId, dest.playerId, 'trade', `${sender.username}'s trade trail to ${dest.name} closed`, {
      closed: why, host: true, colony: dest.name, from: sender.username, kind: r.kind, partnerGot: r.partnerGot, deliveries: r.next - 1,
    }, t);
  }
  notify(m.playerId, { type: 'returned', missionType: m.type });
}

onEvent('trade_deliver', async (q, ev) => {
  const t = ev.due_at;
  const m = await lockMission(q, ev.payload.missionId);
  const r = m.result as TradeResult | null;
  // recalled, closed, or an old event: nothing to do
  if (m.type !== 'trade' || m.status !== 'holding' || !r?.trading || r.next !== ev.payload.n) return;
  const dest = m.targetColonyId ? await getColony(q, m.targetColonyId).catch(() => null) : null;
  if (!dest || dest.npc) return closeTrail(q, m, null, t, 'gone');
  const kind = await runningKind(q, m, dest, t);
  if (!kind) return closeTrail(q, m, dest, t, 'pact_ended');

  // the goods: a share of what the destination makes, never more than the caravan carries; the destination loses nothing
  const goods = tradeDelivery(tradePotential(destPerHour(dest), dest.terrain, distance(m.origin, m.target), kind), groupCargo(m.units));
  const home = advance(await lockColony(q, m.originColonyId), t);
  home.resources = add(home.resources, goods);
  await saveColony(q, home);
  await bump(q, m.playerId, 'food_home', foodIn(goods));
  let partner = res();
  if (dest.playerId !== m.playerId) {
    // both sides gain on a player trail: the host gets a share in the goods of the sender's ground
    partner = tradePartnerGoods(goods, home.terrain);
    const host = advance(await lockColony(q, dest.id), t);
    host.resources = add(host.resources, partner);
    await saveColony(q, host);
    await bump(q, dest.playerId, 'food_home', foodIn(partner));
  }
  r.delivered = add(r.delivered, goods);
  r.partnerGot = add(r.partnerGot, partner);
  r.kind = kind;
  r.next += 1;
  m.result = r;
  if (r.next > (r.deliveries ?? TRADE.deliveries)) return closeTrail(q, m, dest, t, 'done');
  await saveMission(q, m);
  const speed = (await getWorld(q)).speed;
  await schedule(q, m.worldId, 'trade_deliver', t + tradeEveryMs(speed), { missionId: m.id, n: r.next });
});

/**
 * What a trail from `colonyId` to `target` would bring, for the send card: the kind of trail, the goods per delivery
 * before the caravan's carrying limit (the card caps it), and what the host gains. `problem` says why it can't go.
 */
export async function tradePreview(q: Q, playerId: number, colonyId: number, target: { region: number; patch: number; spot: number }) {
  const from = await getColony(q, colonyId);
  if (from.playerId !== playerId) throw new GameError('bad_colony', 'That is not your colony.');
  const dest = await colonyAt(q, from.worldId, target.region, target.patch, target.spot);
  let kind: TradeKind;
  try {
    kind = await openKind(q, playerId, from, dest);
  } catch (e) {
    if (e instanceof GameError) return { problem: e.message };
    throw e;
  }
  const dist = distance(from, target);
  const deliveries = tradeDeliveries((await getPlayer(q, playerId)).research);
  const potential = tradePotential(destPerHour(dest!), dest!.terrain, dist, kind);
  return {
    kind,
    terrain: dest!.terrain,
    goods: tradeGoodsNames(dest!.terrain),
    potential,
    /** what the host would gain per delivery if the caravan carries the whole potential */
    partner: kind === 'own' ? null : tradePartnerGoods(potential, from.terrain),
    partnerGoods: kind === 'own' ? null : tradeGoodsNames(from.terrain),
    distanceFactor: tradeDistanceFactor(dist),
    everyHours: TRADE.deliverEveryHours,
    deliveries,
    /** extra deliveries from Trophallaxis, for the send card */
    extraDeliveries: deliveries - TRADE.deliveries,
  };
}
