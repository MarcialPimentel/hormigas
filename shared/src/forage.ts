// Forage expeditions. Spec: docs/09-missions.md
import { FORMULAS, type Resources } from './data';
import { res } from './resources';
import { randInt, type Rng } from './rng';

export type ForageOutcome = keyof typeof FORMULAS.forage.outcomes;
export const FORAGE_OUTCOMES = Object.keys(FORMULAS.forage.outcomes) as ForageOutcome[];

/** Outcome weights after Foraging Instinct luck: each level moves 2 points from bad outcomes to good ones. */
export function forageWeights(luck: number): Record<ForageOutcome, number> {
  const w = { ...FORMULAS.forage.outcomes } as Record<ForageOutcome, number>;
  let shift = 2 * Math.max(0, luck);
  for (const bad of ['nothing', 'lost_trail', 'spider_ambush', 'rainstorm', 'the_boot'] as ForageOutcome[]) {
    // never fully remove risk: keep at least a quarter of each bad outcome
    const take = Math.min(shift, w[bad] * 0.75);
    w[bad] -= take;
    shift -= take;
    if (shift <= 0) break;
  }
  const moved = 2 * Math.max(0, luck) - Math.max(0, shift);
  w.food_cache += moved * 0.7;
  w.dead_beetle += moved * 0.3;
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

/** Max resources a single expedition can find, so huge cargo fleets don't break the economy. */
export const forageFindCap = (playerPoints: number, luck: number) => Math.round((3000 + 25 * playerPoints) * (1 + 0.1 * luck));

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

export function resolveForage(rng: Rng, opts: { cargo: number; playerPoints: number; luck: number }): ForageResult {
  const outcome = rollForageOutcome(rng, opts.luck);
  const cap = Math.min(opts.cargo, forageFindCap(opts.playerPoints, opts.luck));
  let found = res();
  let lossFraction = 0;
  let returnTimeFactor = 1;
  switch (outcome) {
    case 'food_cache': {
      const amount = cap * (0.4 + rng() * 0.6);
      // mostly foliage, some protein, a little nectar
      found = res(Math.floor(amount * 0.55), Math.floor(amount * 0.3), Math.floor(amount * 0.15));
      break;
    }
    case 'dead_beetle':
      found = res(0, Math.floor(cap * (0.6 + rng() * 0.4)), 0);
      break;
    case 'lost_trail':
      returnTimeFactor = 1.5;
      break;
    case 'shortcut':
      returnTimeFactor = 0.5;
      break;
    case 'spider_ambush':
      lossFraction = randInt(rng, 10, 30) / 100;
      break;
    case 'rainstorm':
      lossFraction = randInt(rng, 20, 50) / 100;
      break;
    case 'the_boot':
      lossFraction = 1;
      break;
  }
  const texts = TEXT[outcome];
  return { outcome, found, lossFraction, returnTimeFactor, text: texts[Math.floor(rng() * texts.length)] };
}
