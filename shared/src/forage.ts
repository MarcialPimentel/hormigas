// Forage expeditions. Spec: docs/09-missions.md
import { FORMULAS, GATHER_MULTIPLIER, type ResourceId, type Resources } from './data';
import { researchSum, type ResearchLevels } from './economy';
import { res } from './resources';
import { randInt, type Rng } from './rng';

export type ForageOutcome = keyof typeof FORMULAS.forage.outcomes;
export const FORAGE_OUTCOMES = Object.keys(FORMULAS.forage.outcomes) as ForageOutcome[];

/** What one outcome does (formulas.json forage.results). Missing fields = no effect. */
interface ForageResultDef {
  cargoPct?: [number, number];
  firstTripCargoPct?: [number, number];
  mixPct?: Record<ResourceId, number>;
  lossPct?: [number, number];
  returnFactor?: number;
}
const F = FORMULAS.forage as typeof FORMULAS.forage & {
  luck: { shiftPerLevel: number; takeFrom: ForageOutcome[]; keepPct: number; giveToPct: Partial<Record<ForageOutcome, number>> };
  firstTripOutcome: ForageOutcome;
  results: Partial<Record<ForageOutcome, ForageResultDef>>;
};

/** A player's forage luck: the forageLuck effect of Foraging Instinct. */
export const forageLuck = (research: ResearchLevels | undefined): number => researchSum(research, 'forageLuck');

/** Desert Ants in a party (Build 11): every antsPerLuck of them count as one more luck level, up to maxLuck. */
export const desertAntLuck = (units: Partial<Record<string, number>> | undefined): number =>
  Math.min(FORMULAS.desertAnts.maxLuck, Math.floor((units?.desert_ant ?? 0) / FORMULAS.desertAnts.antsPerLuck));

/** A forage party's luck: Foraging Instinct plus the Desert Ants it brings. */
export const partyForageLuck = (research: ResearchLevels | undefined, units?: Partial<Record<string, number>>): number =>
  forageLuck(research) + desertAntLuck(units);

/**
 * Outcome weights after forage luck: each level moves shiftPerLevel points from bad outcomes to good ones,
 * but never removes all the risk (each bad outcome keeps keepPct of its weight).
 */
export function forageWeights(luck: number): Record<ForageOutcome, number> {
  const L = F.luck;
  const w = { ...FORMULAS.forage.outcomes } as Record<ForageOutcome, number>;
  const total = L.shiftPerLevel * Math.max(0, luck);
  let shift = total;
  for (const bad of L.takeFrom) {
    const take = Math.min(shift, w[bad] * (1 - L.keepPct / 100));
    w[bad] -= take;
    shift -= take;
    if (shift <= 0) break;
  }
  const moved = total - Math.max(0, shift);
  for (const [good, pct] of Object.entries(L.giveToPct) as [ForageOutcome, number][]) w[good] += moved * (pct / 100);
  return w;
}

export function rollForageOutcome(rng: Rng, luck: number): ForageOutcome {
  const w = forageWeights(luck);
  const sum = FORAGE_OUTCOMES.reduce((a, k) => a + w[k], 0);
  let x = rng() * sum;
  for (const k of FORAGE_OUTCOMES) {
    x -= w[k];
    if (x < 0) return k;
  }
  return 'nothing';
}

/** Outcome chances in percent (sum 100) after Foraging Instinct luck, for showing players the odds. */
export function forageOdds(luck: number): Record<ForageOutcome, number> {
  const w = forageWeights(luck);
  const sum = FORAGE_OUTCOMES.reduce((a, k) => a + w[k], 0);
  return Object.fromEntries(FORAGE_OUTCOMES.map((k) => [k, (w[k] / sum) * 100])) as Record<ForageOutcome, number>;
}

/** The odds grouped the way players think about them. Percentages, sum 100. */
export function forageOddsSummary(luck: number) {
  const o = forageOdds(luck);
  return {
    food: o.food_cache + o.dead_beetle,
    empty: o.nothing + o.lost_trail,
    losses: o.spider_ambush + o.rainstorm + o.the_boot,
    early: o.shortcut,
  };
}

/** The find cap before the gathering multiplier. */
const baseFindCap = (playerPoints: number, luck: number) => {
  const c = F.findCap;
  return (c.base + c.perPoint * playerPoints) * (1 + (c.luckPctPerLevel / 100) * luck);
};

/** Max resources a single expedition can find, so huge cargo fleets don't break the economy. */
export const forageFindCap = (playerPoints: number, luck: number) => Math.round(baseFindCap(playerPoints, luck) * GATHER_MULTIPLIER);

export interface ForageResult {
  outcome: ForageOutcome;
  found: Resources;
  /** Fraction of the party lost, 0..1 */
  lossFraction: number;
  /** Multiplier on the return trip duration */
  returnTimeFactor: number;
  text: string;
}

const TEXT: Record<ForageOutcome, string[]> = {
  food_cache: ['Your foragers found a fallen fig, split open and sweet.', 'A picnic left crumbs everywhere. The colony feasts.', 'A patch of clover heavy with seeds and dew.'],
  dead_beetle: ['A dead ground beetle, still fresh. The party drags it home piece by piece.', 'A grasshopper that will not jump again. Protein for days.'],
  nothing: ['Dry soil and empty leaves. The foragers return with nothing.', 'The trail went cold under a garden hose.'],
  lost_trail: ['Rain washed the pheromone trail away. The party wanders home slowly.', 'A lawnmower scattered the trail. The way back takes longer.'],
  shortcut: ['A scout found a tunnel under the fence. The party is home early.'],
  spider_ambush: ['A wolf spider waited in the leaf litter. Some foragers did not come back.', 'Webs across the path. The party fought its way through, with losses.'],
  rainstorm: ['A sudden downpour flooded the path. Many foragers were swept away.'],
  the_boot: ['A shadow. A boot. Nothing remains of the party.'],
};

export function resolveForage(
  rng: Rng,
  opts: { cargo: number; playerPoints: number; luck: number; /** a player's first expedition always finds food */ firstTrip?: boolean },
): ForageResult {
  const outcome: ForageOutcome = opts.firstTrip ? F.firstTripOutcome : rollForageOutcome(rng, opts.luck);
  // the roll is on the party's load before the gathering multiplier; the multiplier then fills it up,
  // so small parties come home fuller and big ones can reach the higher find cap, but never more than they carry
  const cap = Math.min(opts.cargo, baseFindCap(opts.playerPoints, opts.luck));
  const most = Math.min(opts.cargo, forageFindCap(opts.playerPoints, opts.luck));
  const def = F.results[outcome] ?? {};
  let found = res();
  // a first trip is a good one (docs/09-missions.md): it uses firstTripCargoPct when the outcome has one
  const range = (opts.firstTrip && def.firstTripCargoPct) || def.cargoPct;
  if (range && def.mixPct) {
    const amount = Math.min(most, cap * (range[0] / 100 + rng() * ((range[1] - range[0]) / 100)) * GATHER_MULTIPLIER);
    const mix = def.mixPct;
    found = res(Math.floor(amount * (mix.foliage / 100)), Math.floor(amount * (mix.protein / 100)), Math.floor(amount * (mix.nectar / 100)));
  }
  // no roll when the range is a single value (The Boot always takes everyone)
  const loss = def.lossPct;
  const lossFraction = !loss ? 0 : loss[0] === loss[1] ? loss[0] / 100 : randInt(rng, loss[0], loss[1]) / 100;
  const returnTimeFactor = def.returnFactor ?? 1;
  const texts = TEXT[outcome];
  return { outcome, found, lossFraction, returnTimeFactor, text: texts[Math.floor(rng() * texts.length)] };
}
