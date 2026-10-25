// Onboarding quest chain (docs/02-progression.md). Each quest points at the next thing to learn.
import type { CasteId, ChamberId, Resources } from './data';
import { res } from './resources';

export interface QuestProgressInput {
  /** highest level of each chamber across your colonies */
  chambers: Partial<Record<ChamberId, number>>;
  /** units you own (home + away) */
  units: Partial<Record<CasteId, number>>;
  /** mission types you have ever sent */
  missionsSent: string[];
}

export interface Quest {
  id: string;
  title: string;
  hint: string;
  screen: string;
  reward: Resources;
  done: (p: QuestProgressInput) => boolean;
}

const ch = (p: QuestProgressInput, id: ChamberId) => p.chambers[id] ?? 0;

export const QUESTS: Quest[] = [
  { id: 'leaf', title: 'Build a Leaf Garden', hint: 'Foliage is the colony’s building material. Chambers → Leaf Garden.', screen: 'chambers', reward: res(150, 50, 0), done: (p) => ch(p, 'leaf_garden') >= 1 },
  { id: 'nursery', title: 'Build a Nursery', hint: 'Production chambers need workforce. The Nursery supplies it.', screen: 'chambers', reward: res(150, 75, 0), done: (p) => ch(p, 'nursery') >= 1 },
  { id: 'hunt', title: 'Build Hunting Grounds', hint: 'Protein feeds castes and research.', screen: 'chambers', reward: res(200, 100, 0), done: (p) => ch(p, 'hunting_grounds') >= 1 },
  { id: 'queen', title: "Enlarge the Queen's Chamber to level 2", hint: 'The Queen’s Chamber unlocks new chambers as it grows.', screen: 'chambers', reward: res(500, 300, 0), done: (p) => ch(p, 'queen_chamber') >= 2 },
  { id: 'brood', title: 'Build a Brood Hall', hint: 'Castes and defenses are raised in the Brood Hall.', screen: 'chambers', reward: res(600, 300, 100), done: (p) => ch(p, 'brood_hall') >= 1 },
  { id: 'workers', title: 'Raise 3 Workers', hint: 'Workers carry food home and haul corpses.', screen: 'brood', reward: res(400, 200, 200), done: (p) => (p.units.worker ?? 0) >= 3 },
  { id: 'forage', title: 'Send a forage party', hint: 'Missions → Forage. Send a few Workers into the wilds and see what they find.', screen: 'missions', reward: res(500, 500, 200), done: (p) => p.missionsSent.includes('forage') },
  { id: 'scout', title: 'Scout a neighbor', hint: 'Raise a Scout, then pick a colony on the Map and press Scout.', screen: 'map', reward: res(1000, 1000, 500), done: (p) => p.missionsSent.includes('scout') },
];

/** The next quest to work on (first not yet claimed), or null when the chain is finished. */
export const nextQuest = (claimed: string[]): Quest | null => QUESTS.find((q) => !claimed.includes(q.id)) ?? null;
