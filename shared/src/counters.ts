// Who beats whom (docs/05-castes-units.md, "Counters"). Read straight from the frenzy numbers in
// docs/data, so the Brood Hall and battle reports always match the combat rules.
import { CASTES, CASTE_IDS, DEFENSES, DEFENSE_IDS, type CasteId, type DefenseId } from './data';
import type { DefenseCounts, UnitCounts } from './economy';

export type FighterId = CasteId | DefenseId;

/** Castes players can raise, plus defenses: the things a counter hint may mention. */
const PLAYER_FIGHTERS: FighterId[] = [
  ...CASTE_IDS.filter((id) => CASTES[id].mvp && !CASTES[id].npcOnly),
  ...DEFENSE_IDS.filter((id) => DEFENSES[id].mvp && !DEFENSES[id].chokepoint),
];

/** Frenzy this high or more counts as a counter. Lower frenzy (×2) is an edge, not a counter. */
export const COUNTER_MIN_FRENZY = 3;

type Fighter = { frenzy?: Record<string, number>; outnumbers?: string[]; overpowers?: string[] };
const statsOf = (id: string): Fighter | undefined => (CASTES as Record<string, Fighter>)[id] ?? (DEFENSES as Record<string, Fighter>)[id];
/** Does `a` counter `b`: strong frenzy against it, or beats it by numbers (outnumbers) or by toughness (overpowers). */
export const counters = (a: string, b: string): boolean => (statsOf(a)?.frenzy?.[b] ?? 1) >= COUNTER_MIN_FRENZY || !!statsOf(a)?.outnumbers?.includes(b) || !!statsOf(a)?.overpowers?.includes(b);
export const fighterName = (id: string): string => (CASTES as Record<string, { name: string }>)[id]?.name ?? (DEFENSES as Record<string, { name: string }>)[id]?.name ?? id;
const isCaste = (id: string) => CASTE_IDS.includes(id as CasteId);

/** What `id` counters, scouts left out: everything kills scouts. */
export function strongAgainst(id: FighterId): FighterId[] {
  return PLAYER_FIGHTERS.filter((t) => t !== 'scout' && t !== id && counters(id, t));
}

/** The player castes and defenses that counter `id`. */
export function weakAgainst(id: FighterId): FighterId[] {
  return PLAYER_FIGHTERS.filter((f) => f !== id && counters(f, id));
}

/** Player castes (not defenses) that counter `id`: what to raise to beat it. */
export const castesThatCounter = (id: FighterId): CasteId[] => weakAgainst(id).filter(isCaste) as CasteId[];

export interface CounterHint {
  /** your caste that took losses */
  lost: CasteId;
  /** enemy castes or defenses in the fight that strike it again and again */
  by: FighterId[];
  /** your castes that would counter those */
  answer: CasteId[];
}

/**
 * Why a side lost ants, in counter terms: for each of `lost`'s castes, the enemy fighters present that
 * counter it, and the castes that counter those. Empty when nothing in the fight was a counter.
 */
export function counterHints(lost: UnitCounts, enemyUnits: UnitCounts, enemyDefenses: DefenseCounts = {}): CounterHint[] {
  const present = [
    ...Object.entries(enemyUnits).filter(([, n]) => (n ?? 0) > 0).map(([id]) => id),
    ...Object.entries(enemyDefenses).filter(([, n]) => (n ?? 0) > 0).map(([id]) => id),
  ];
  const hints: CounterHint[] = [];
  for (const [id, n] of Object.entries(lost)) {
    if (!n || id === 'scout') continue;
    const by = present.filter((e) => counters(e, id)) as FighterId[];
    if (by.length === 0) continue;
    const answer = [...new Set(by.flatMap((e) => castesThatCounter(e)))].filter((c) => c !== id);
    hints.push({ lost: id as CasteId, by, answer });
  }
  return hints;
}

/** One plain sentence per hint, e.g. "Acid Sprayers cut down your Minor Soldiers. Major Soldiers counter Acid Sprayers." */
export function counterHintText(h: CounterHint): string {
  const plural = (s: string) => (s.endsWith('y') ? `${s.slice(0, -1)}ies` : `${s}s`);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const by = list(h.by.map((b) => plural(fighterName(b))));
  const lost = plural(fighterName(h.lost));
  const answer = h.answer.length ? ` ${list(h.answer.map((a) => plural(fighterName(a))))} counter ${h.by.length > 1 ? 'them' : by}.` : '';
  return `${by} cut down your ${lost}.${answer}`;
}
