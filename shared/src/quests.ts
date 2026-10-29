// Founding tasks (docs/02-progression.md, docs/16-milestones.md). The list lives in docs/data/quests.json.
// The chain builds toward the first big milestone — discovering Nectar — then teaches castes and missions.
import questsJson from '../../docs/data/quests.json';
import type { CasteId, ChamberId, Resources } from './data';

export interface QuestProgressInput {
  /** highest level of each chamber across your colonies */
  chambers: Partial<Record<ChamberId, number>>;
  /** units you own (home + away) */
  units: Partial<Record<CasteId, number>>;
  /** mission types you have ever sent */
  missionsSent: string[];
  /** raids you have won against wild nests */
  wildRaidsWon?: number;
}

/** What finishes a task. Exactly one kind per task (see the note in quests.json). */
export type QuestGoal =
  | { chamber: ChamberId; level: number }
  | { units: CasteId; count: number }
  | { missionSent: string }
  | { wildRaidsWon: number };

export interface QuestDef {
  id: string;
  title: string;
  hint: string;
  screen: string;
  reward: Resources;
  /** shown when this task is the big milestone of its phase */
  milestone?: string;
  goal: QuestGoal;
}

export interface Quest extends QuestDef {
  done: (p: QuestProgressInput) => boolean;
}

/** Is a task's goal met? */
export function questGoalMet(goal: QuestGoal, p: QuestProgressInput): boolean {
  if ('chamber' in goal) return (p.chambers[goal.chamber] ?? 0) >= goal.level;
  if ('units' in goal) return (p.units[goal.units] ?? 0) >= goal.count;
  if ('missionSent' in goal) return p.missionsSent.includes(goal.missionSent);
  return (p.wildRaidsWon ?? 0) >= goal.wildRaidsWon;
}

export const QUESTS: Quest[] = (questsJson.quests as QuestDef[]).map((q) => ({ ...q, done: (p) => questGoalMet(q.goal, p) }));

/** The next quest to work on (first not yet claimed), or null when the chain is finished. */
export const nextQuest = (claimed: string[]): Quest | null => QUESTS.find((q) => !claimed.includes(q.id)) ?? null;
