// Truces and supercolonies. Spec: docs/23-supercolonies.md
//
// The ladder between two players:
// - contact      one of you has scouted the other (docs/22-discovery.md). Needed before anything else.
// - truce        a no-raid pact. Either side can end it, with notice: raids stay off until the notice runs out.
// - supercolony  a shared scent for up to 6 players: no raiding each other, and soldiers can hold position at a member's nest.
//                Leaving starts a slow fade: raids stay off until the old scent has worn away.
import { DIPLOMACY_DATA } from './data';
import { lvl, type ResearchLevels } from './economy';

const D = DIPLOMACY_DATA;

export const TRUCE_NOTICE_HOURS: number = D.truceNoticeHours;
export const SCENT_FADE_HOURS: number = D.scentFadeHours;
export const SUPERCOLONY_MAX_MEMBERS: number = D.supercolonyMaxMembers;
export const SUPERCOLONY_NAME_LENGTH = D.supercolonyNameLength as [number, number];

/** Notice before a truce ends, in ms at this world speed. */
export const truceNoticeMs = (worldSpeed: number) => (TRUCE_NOTICE_HOURS * 3600_000) / Math.max(1, worldSpeed);
/** How long a shared scent takes to fade after leaving a supercolony, in ms at this world speed. */
export const scentFadeMs = (worldSpeed: number) => (SCENT_FADE_HOURS * 3600_000) / Math.max(1, worldSpeed);

/** Founding or joining a supercolony needs the Supercolony research. Truces need nothing but contact. */
export const canJoinSupercolony = (research: ResearchLevels | undefined) => lvl(research, D.unlockResearch as 'supercolony') >= 1;

export type TruceStatus = 'proposed' | 'active' | 'ending' | 'ended' | 'declined' | 'withdrawn';
export type MemberStatus = 'member' | 'fading' | 'gone';

/**
 * How another player stands with you, for the map and the raid check.
 * - ally          you share a supercolony's scent
 * - fading        one of you left your shared supercolony; the scent hasn't worn off yet (`until`)
 * - truce         an active truce
 * - truce_ending  a truce in its notice period (`until`)
 */
export type Relation = 'ally' | 'fading' | 'truce' | 'truce_ending';

export interface RelationInfo {
  relation: Relation;
  /** when a fading scent or an ending truce runs out */
  until?: number;
}

/** Relations that stop raids. All of them do: that's the point of a slow break-up. */
export const blocksRaids = (r: Relation | null | undefined) => r != null;

/** Supercolony names: letters, numbers, spaces and a little punctuation, so they read well on the map. */
export function supercolonyNameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  const [min, max] = SUPERCOLONY_NAME_LENGTH;
  if (name.length < min || name.length > max) return `A supercolony name is ${min}–${max} characters.`;
  if (!/^[\p{L}\p{N} '’.\-]+$/u.test(name)) return 'Use letters, numbers, spaces, apostrophes, dots and dashes.';
  return null;
}

export const DIPLOMACY_MESSAGES = {
  no_contact: "You haven't met this colony yet. Scout one of their colonies first (or wait for them to scout you).",
  raid_ally: 'You share a scent with this colony. Supercolony members never raid each other.',
  raid_fading: "Your scents haven't parted yet. Raids stay off until the old supercolony scent fades.",
  raid_truce: 'You have a truce with this colony. Raids stay off until it ends.',
  raid_truce_ending: 'Your truce is ending, but raids stay off until the notice runs out.',
  needs_research: 'Needs the Supercolony research (Nest branch).',
  hold_needs_ally: 'Soldiers can only hold position at a colony of your own supercolony.',
} as const;

/** The reason a raid on a player you have this relation with is refused. */
export function raidBlockMessage(r: RelationInfo): string {
  switch (r.relation) {
    case 'ally': return DIPLOMACY_MESSAGES.raid_ally;
    case 'fading': return DIPLOMACY_MESSAGES.raid_fading;
    case 'truce': return DIPLOMACY_MESSAGES.raid_truce;
    case 'truce_ending': return DIPLOMACY_MESSAGES.raid_truce_ending;
  }
}
