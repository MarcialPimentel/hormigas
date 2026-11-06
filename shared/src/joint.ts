// Joint raids and the members' board (Build 19). Spec: docs/23-supercolonies.md § Joint raids. Numbers: docs/data/diplomacy.json.
//
// A supercolony member opens a joint raid on a wild target (a wild nest, a termite mound, a spider den) and picks when it
// lands. Members join by sending armies that can get there by then; at the landing time everyone who came fights as one
// attacking side, each with their own research. Loot is split by each player's share of the army's worth.
import { DIPLOMACY_DATA, RESOURCE_IDS, type Resources } from './data';
import { res, total } from './resources';
import { fillCargo, unitsValue } from './combat';
import type { UnitCounts } from './economy';

const J = (DIPLOMACY_DATA as unknown as { jointRaid: { leadHours: [number, number]; leadOptions: number[] }; board: { postLength: number; keep: number } });

export const JOINT_RAID = {
  /** the landing time is at least / at most this many hours ahead, at world speed 1 */
  leadHours: J.jointRaid.leadHours,
  /** the choices the send card offers */
  leadOptions: J.jointRaid.leadOptions,
};

export const BOARD = { postLength: J.board.postLength, keep: J.board.keep };

/** The earliest and latest a joint raid can land, counted from now, in ms at this world speed. */
export const jointLeadMs = (worldSpeed: number): [number, number] => {
  const s = Math.max(1, worldSpeed);
  return [(JOINT_RAID.leadHours[0] * 3600_000) / s, (JOINT_RAID.leadHours[1] * 3600_000) / s];
};

/** One lead choice (hours at speed 1) in ms at this world speed. */
export const jointLeadOptionMs = (hours: number, worldSpeed: number) => (hours * 3600_000) / Math.max(1, worldSpeed);

/** The army's worth in resources (what loot and credit are split by). */
export const armyWorth = (units: UnitCounts): number => total(unitsValue(units));

/**
 * Split a joint raid's loot: each player gets their share of `loot` by their army's worth when it set out, as much of
 * it as their surviving ants can carry. What nobody can carry stays behind.
 */
export function splitLoot(loot: Resources, members: { worth: number; cargo: number }[]): Resources[] {
  const all = members.reduce((s, m) => s + Math.max(0, m.worth), 0);
  return members.map((m) => {
    if (all <= 0 || m.worth <= 0) return res();
    const share = res();
    for (const r of RESOURCE_IDS) share[r] = Math.floor((loot[r] * m.worth) / all);
    return fillCargo(share, m.cargo);
  });
}

/** Trim and check a board post; returns the text, or a reason it can't be posted. */
export function boardPostProblem(raw: string): string | null {
  const t = raw.trim();
  if (!t) return 'Write something first.';
  if (t.length > BOARD.postLength) return `Keep it under ${BOARD.postLength} characters.`;
  return null;
}

export const JOINT_MESSAGES = {
  not_member: 'Joint raids are for supercolony members. Found or join one in Allies first.',
  wild_only: 'Joint raids go to wild nests, termite mounds and spider dens.',
  solo_den: (n: number) => `Spider dens are too strong for one colony: they only fight a supercolony's joint raid of at least ${n} players. Open one, or join one from the members' board.`,
  bad_lead: 'Pick when the joint raid lands.',
  gone: 'That joint raid has already landed or been called off.',
  other_colony: "That joint raid is for a different target.",
  too_far: (by: string) => `This army can't get there in time: it would arrive ${by} after the joint raid lands. Pick a closer colony or a faster army.`,
  one_army: 'You already have an army in this joint raid.',
  not_leader: 'Only the player who opened the joint raid can call it off.',
  open_here: 'Your supercolony already has a joint raid on this target. Join that one.',
};
