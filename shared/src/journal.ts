// The Field Journal: achievements as a naturalist's notebook (docs/26-come-back.md). Entries live in docs/data/journal.json.
import journalJson from '../../docs/data/journal.json';
import { stat, type Stats } from './stats';

export type JournalSection = 'discovery' | 'deeds' | 'oddities';

export interface JournalEntryDef {
  id: string;
  section: JournalSection;
  name: string;
  latin?: string;
  stat: string;
  /** goals for each stage: one for a discovery, three for a deed (sketch, full entry, coloured plate) */
  tiers: number[];
  title: string;
  /** a title per stage, when the page's title grows with it (Termites: Mound-breaker → Termite-hunter → Bane of the Mounds) */
  titles?: string[];
  text: string;
  /** an unwritten page until earned */
  hidden?: boolean;
}

export const JOURNAL_SECTIONS = journalJson.sections as Record<JournalSection, string>;
export const JOURNAL: JournalEntryDef[] = journalJson.entries as JournalEntryDef[];
export const journalEntry = (id: string): JournalEntryDef | undefined => JOURNAL.find((e) => e.id === id);

/** How many stages of an entry a value reaches (0 = not started). */
export function journalTier(e: JournalEntryDef, value: number): number {
  let t = 0;
  for (const goal of e.tiers) if (value >= goal) t++;
  return t;
}

/** Stage names: a one-stage entry is complete as soon as it's earned. */
export function stageName(e: JournalEntryDef, tier: number): string {
  if (tier <= 0) return 'Not yet';
  if (e.tiers.length === 1) return 'Recorded';
  return ['Sketch', 'Full entry', 'Coloured plate'][Math.min(tier, 3) - 1];
}

/**
 * Each entry's stage, never lower than a stage already earned (`kept`): a counter worked out from colonies
 * (like Leaf Garden levels) can drop, but a page once written stays written.
 */
export function journalTiers(stats: Stats, kept: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of JOURNAL) out[e.id] = Math.max(kept[e.id] ?? 0, journalTier(e, stat(stats, e.stat)));
  return out;
}

/** The title a page gives at a stage: its stage's own title when it has one per stage, else its one title. */
export const titleFor = (e: JournalEntryDef, tier: number): string =>
  e.titles?.length ? e.titles[Math.min(Math.max(tier, 1), e.titles.length) - 1] : e.title;

/** Every title a page can give, at any stage. */
export const allTitles = (e: JournalEntryDef): string[] => (e.titles?.length ? e.titles : [e.title]);

/** Titles the player can wear: every entry with at least its first stage, at the stage reached. */
export const earnedTitles = (tiers: Record<string, number>): string[] =>
  JOURNAL.filter((e) => (tiers[e.id] ?? 0) >= 1).map((e) => titleFor(e, tiers[e.id]));
