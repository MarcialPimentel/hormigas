// Lifetime counters per player (docs/26-come-back.md). Colony needs, the Field Journal and "Yesterday in the colony"
// all read them. The server bumps the stored ones as things happen; the derived ones are worked out from the colonies.
import type { CasteId, ChamberId } from './data';
import { CASTES, CHAMBER_IDS } from './data';
import type { UnitCounts } from './economy';

export type Stats = Record<string, number>;

/**
 * Counters the server stores and bumps as things happen:
 * - forage_home: forage parties that came home; forage:<outcome>: forage outcomes (the_boot, shortcut, ...)
 * - food_home: food carried home by any party, plus windfall loads and herd honeydew
 * - digs, research: chamber levels and research levels finished
 * - corpses_hauled: Protein hauled from corpse fields
 * - scouted: scout reports
 * - wild_won: fights won against wild nests, termite mounds, spider dens and windfall holders; beat:<species>
 * - swarms_beaten, raids_held: raids on your colonies that you held
 * - windfalls_claimed, windfall:<kind>; herds_claimed, herd_nectar
 * - colonies_founded, truces, supercolonies, gifts (nest gifts), needs_done
 */
export const STORED_STATS = [
  'forage_home', 'food_home', 'digs', 'research', 'corpses_hauled', 'scouted', 'wild_won', 'swarms_beaten', 'raids_held',
  'windfalls_claimed', 'herds_claimed', 'herd_nectar', 'colonies_founded', 'truces', 'supercolonies', 'gifts', 'needs_done',
] as const;

/** What a player's colonies say about them (worked out, not stored). */
export interface ColonySummary {
  chambers: Partial<Record<ChamberId, number>>;
  /** ants raised in this colony since Build 12 (existing ants counted as raised) */
  raised: UnitCounts;
}

/**
 * Derived counters, from the player's colonies: raised (ants raised, all castes), raised:<caste>, castes_raised
 * (how many kinds), level:<chamber> (levels of that chamber across colonies) and colonies (how many you rule).
 */
export function derivedStats(colonies: ColonySummary[]): Stats {
  const out: Stats = { colonies: colonies.length, raised: 0 };
  const kinds = new Set<string>();
  for (const c of colonies) {
    for (const [id, n] of Object.entries(c.raised)) {
      if (!n || !(id in CASTES) || CASTES[id as CasteId].role === 'wild') continue;
      out.raised += n;
      out[`raised:${id}`] = (out[`raised:${id}`] ?? 0) + n;
      kinds.add(id);
    }
    for (const id of CHAMBER_IDS) out[`level:${id}`] = (out[`level:${id}`] ?? 0) + (c.chambers[id] ?? 0);
  }
  out.castes_raised = kinds.size;
  return out;
}

export const stat = (s: Stats, key: string): number => s[key] ?? 0;

/** Rows for "Yesterday in the colony", in display order. Only the ones that changed are shown. */
export const DAY_SUMMARY: { stat: string; one: string; many: string }[] = [
  { stat: 'food_home', one: '{n} food carried home', many: '{n} food carried home' },
  { stat: 'raised', one: '{n} ant raised', many: '{n} ants raised' },
  { stat: 'digs', one: '{n} dig finished', many: '{n} digs finished' },
  { stat: 'research', one: '{n} research learned', many: '{n} research learned' },
  { stat: 'forage_home', one: '{n} forage party home', many: '{n} forage parties home' },
  { stat: 'wild_won', one: '{n} fight won in the wilds', many: '{n} fights won in the wilds' },
  { stat: 'raids_held', one: '{n} raid held off', many: '{n} raids held off' },
  { stat: 'swarms_beaten', one: '{n} swarm beaten', many: '{n} swarms beaten' },
  { stat: 'windfalls_claimed', one: '{n} windfall claimed', many: '{n} windfalls claimed' },
  { stat: 'herd_nectar', one: '{n} Nectar from herds', many: '{n} Nectar from herds' },
  { stat: 'corpses_hauled', one: '{n} Protein of corpses hauled', many: '{n} Protein of corpses hauled' },
  { stat: 'scouted', one: '{n} place scouted', many: '{n} places scouted' },
  { stat: 'gifts', one: '{n} gift from the nest', many: '{n} gifts from the nest' },
  { stat: 'needs_done', one: '{n} colony need met', many: '{n} colony needs met' },
];

/** What changed between two snapshots of the counters (only rows that went up). */
export function daySummary(now: Stats, before: Stats): { stat: string; amount: number; text: string }[] {
  const out: { stat: string; amount: number; text: string }[] = [];
  for (const row of DAY_SUMMARY) {
    const amount = Math.floor(stat(now, row.stat) - stat(before, row.stat));
    if (amount <= 0) continue;
    out.push({ stat: row.stat, amount, text: (amount === 1 ? row.one : row.many).replace('{n}', amount.toLocaleString('en-US')) });
  }
  return out;
}
