// Trade trails (Build 16, docs/23-supercolonies.md § Trade trails): what a trail brings, by ground, pact and distance.
import { describe, expect, it } from 'vitest';
import {
  MISSION_TYPES,
  TERRAIN_IDS,
  TRADE,
  distance,
  missionSlotUsage,
  res,
  tradeDelivery,
  tradeDistanceFactor,
  tradeGoodsNames,
  tradeKindFor,
  tradePartnerGoods,
  tradePotential,
} from '../src';

const PROD = res(1000, 600, 300);

describe('trade trails', () => {
  it('every ground sends something; Meadow and Sandy Soil Foliage, Log Protein, Creek Nectar, Grassland all three (Marz, 5 Nov 2026)', () => {
    for (const t of TERRAIN_IDS) expect(tradeGoodsNames(t)).not.toBe('');
    expect(tradeGoodsNames('sunny_meadow')).toBe('Foliage');
    expect(tradeGoodsNames('sandy_soil')).toBe('Foliage');
    expect(tradeGoodsNames('rotting_log')).toBe('Protein');
    expect(tradeGoodsNames('creek_bank')).toBe('Nectar');
    expect(tradeGoodsNames('grassland')).toBe('Foliage, Protein and Nectar');
    const creek = tradePotential(PROD, 'creek_bank', 1000, 'own');
    expect(creek.foliage).toBe(0);
    expect(creek.nectar).toBeGreaterThan(0);
  });

  it('peace pays: own < truce < supercolony mate', () => {
    const sum = (k: 'own' | 'truce' | 'ally') => Object.values(tradePotential(PROD, 'grassland', 3000, k)).reduce((a, b) => a + b, 0);
    expect(sum('own')).toBeLessThan(sum('truce'));
    expect(sum('truce')).toBeLessThan(sum('ally'));
  });

  it('longer trails pay more, up to a cap', () => {
    const near = distance({ region: 1, patch: 1, spot: 1 }, { region: 1, patch: 1, spot: 5 });
    const far = distance({ region: 1, patch: 1, spot: 1 }, { region: 3, patch: 1, spot: 5 });
    expect(tradeDistanceFactor(near)).toBeLessThan(tradeDistanceFactor(far));
    expect(tradeDistanceFactor(1e9)).toBe(2);
  });

  it('a delivery never weighs more than the caravan carries, and keeps its mix', () => {
    const p = res(9000, 3000, 0);
    const d = tradeDelivery(p, 6000);
    expect(d.foliage + d.protein + d.nectar).toBeLessThanOrEqual(6000);
    expect(d.foliage / d.protein).toBeCloseTo(3, 1);
    expect(tradeDelivery(p, 1e9)).toEqual(p);
  });

  it('the host gains a share in the goods of the sender’s ground', () => {
    const got = tradePartnerGoods(res(1000, 0, 0), 'creek_bank');
    expect(got).toEqual(res(0, 0, 1000 * TRADE.partnerShare));
  });

  it('only own colonies and active pacts open trails; any raid-stopping pact keeps one going', () => {
    expect(tradeKindFor(true, null)).toBe('own');
    expect(tradeKindFor(false, 'truce')).toBe('truce');
    expect(tradeKindFor(false, 'ally')).toBe('ally');
    expect(tradeKindFor(false, 'truce_ending')).toBeNull();
    expect(tradeKindFor(false, 'fading')).toBeNull();
    expect(tradeKindFor(false, null)).toBeNull();
  });

  it('trails are carriers only, stay at the target, and use each colony’s own trail slot', () => {
    expect(MISSION_TYPES.trade.onlyUnits).toEqual(['worker', 'media_worker', 'hauler']);
    expect(MISSION_TYPES.trade.oneWay).toBe(true);
    const missions = [{ type: 'trade', originColonyId: 1 }, { type: 'raid', originColonyId: 1 }];
    expect(missionSlotUsage(missions, 'trade', {}, 1)).toEqual({ used: 1, max: 1 });
    expect(missionSlotUsage(missions, 'trade', {}, 2)).toEqual({ used: 0, max: 1 });
    expect(missionSlotUsage(missions, 'mission', {}, 1).used).toBe(1);
  });
});
