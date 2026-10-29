// Discovery: which colonies a player knows. Spec: docs/22-discovery.md
//
// Every colony you don't own is, to you, one of:
// - 'scent'    you know something lives there, and whether it's players' ants or wild ants. Nothing else.
// - 'familiar' it scouted or raided you, so you know its name ("I've smelled this scent before"). Still a scent.
// - 'known'    you scouted it (or dealt with it before discovery existed). Name, owner, points, level; you can raid it.
// The server stores 'familiar' and 'known' in the known_colonies table. No row means 'scent'.

export type Knowledge = 'mine' | 'known' | 'familiar' | 'scent';

/** Whose ants a scent smells of. */
export type ScentKind = 'player' | 'wild';

/** How a colony became known or familiar (known_colonies.via). Later builds add their own values. */
export type DiscoveryVia = 'scouted' | 'raided' | 'earlier' | 'scouted_you' | 'raided_you';

export interface KnownRow {
  /** set once you have scouted it: then it's 'known' */
  discoveredAt: number | null;
  /** last time it scouted or raided one of your colonies */
  smelledAt: number | null;
}

export function knowledgeFrom(row: KnownRow | undefined, mine: boolean): Knowledge {
  if (mine) return 'mine';
  if (row?.discoveredAt != null) return 'known';
  if (row?.smelledAt != null) return 'familiar';
  return 'scent';
}

/** Can you raid or send to it? Only colonies you have scouted. */
export const canActOn = (k: Knowledge) => k === 'known';

export const SCENT_NAME: Record<ScentKind, string> = { player: 'Ant scent', wild: 'Wild scent' };

export const DISCOVERY_MESSAGES = {
  raid_needs_scout: "Scout this scent first. Your soldiers need to know what they're walking into.",
  send_needs_scout: 'Scout this scent first, so your workers know whose door they are knocking on.',
} as const;
