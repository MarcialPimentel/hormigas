// Founding tasks (docs/02-progression.md, docs/16-milestones.md).
// The chain builds toward the first big milestone — discovering Nectar — then teaches castes and missions.
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
  /** shown when this task is the big milestone of its phase */
  milestone?: string;
  done: (p: QuestProgressInput) => boolean;
}

const ch = (p: QuestProgressInput, id: ChamberId) => p.chambers[id] ?? 0;

export const QUESTS: Quest[] = [
  { id: 'leaf', title: 'Build a Leaf Garden', hint: 'Foliage is the colony’s building material.', screen: 'chambers', reward: res(150, 50, 0), done: (p) => ch(p, 'leaf_garden') >= 1 },
  { id: 'nursery', title: 'Build a Nursery', hint: 'Production chambers need workers to run them. The Nursery raises them.', screen: 'chambers', reward: res(150, 75, 0), done: (p) => ch(p, 'nursery') >= 1 },
  { id: 'hunt', title: 'Build Hunting Grounds', hint: 'Protein feeds castes and research.', screen: 'chambers', reward: res(200, 100, 0), done: (p) => ch(p, 'hunting_grounds') >= 1 },
  { id: 'queen2', title: "Enlarge the Queen's Chamber to level 2", hint: 'Each level of the Queen’s Chamber unlocks new chambers.', screen: 'chambers', reward: res(300, 150, 0), done: (p) => ch(p, 'queen_chamber') >= 2 },
  { id: 'grow', title: 'Grow your Leaf Garden to level 3', hint: 'A bigger economy makes everything after this faster.', screen: 'chambers', reward: res(300, 200, 0), done: (p) => ch(p, 'leaf_garden') >= 3 },
  { id: 'queen3', title: "Enlarge the Queen's Chamber to level 3", hint: 'Level 3 lets the colony herd aphids.', screen: 'chambers', reward: res(400, 300, 0), done: (p) => ch(p, 'queen_chamber') >= 3 },
  {
    id: 'nectar',
    title: 'Discover Nectar',
    hint: 'Build an Aphid Pasture. Aphids give honeydew — Nectar — which castes, research and every journey need.',
    screen: 'chambers',
    reward: res(300, 200, 150),
    milestone: 'Your colony has discovered Nectar.',
    done: (p) => ch(p, 'aphid_pasture') >= 1,
  },
  { id: 'brood', title: 'Build a Brood Hall', hint: 'Castes and defenses are raised in the Brood Hall.', screen: 'chambers', reward: res(600, 300, 100), done: (p) => ch(p, 'brood_hall') >= 1 },
  { id: 'workers', title: 'Raise 3 Workers', hint: 'Workers carry food home and haul corpses.', screen: 'brood', reward: res(400, 200, 150), done: (p) => (p.units.worker ?? 0) >= 3 },
  { id: 'forage', title: 'Send a forage party', hint: 'Missions → Forage. Send a few Workers into the wilds and see what they find.', screen: 'missions', reward: res(500, 500, 200), done: (p) => p.missionsSent.includes('forage') },
  { id: 'scout', title: 'Scout a neighbor', hint: 'Raise a Scout, then pick a colony on the Map and press Scout.', screen: 'map', reward: res(1000, 1000, 500), done: (p) => p.missionsSent.includes('scout') },
];

/** The next quest to work on (first not yet claimed), or null when the chain is finished. */
export const nextQuest = (claimed: string[]): Quest | null => QUESTS.find((q) => !claimed.includes(q.id)) ?? null;
