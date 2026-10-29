// Mission types and their fixed rules, written once for the server (which enforces them) and the
// Missions screen and map (which preview them). Spec: docs/06-missions.md, docs/19-colonies.md.
// The server adds each type's own checks and arrival in server/src/game/*.ts via defineMission.
import { CASTES, type CasteId } from './data';
import { lvl, missingRequirements, type ChamberLevels, type ResearchLevels, type UnitCounts } from './economy';
import { forageSlots, maxColonies, missionSlots, presentUnits } from './world';
import type { Blocker } from './blockers';

export type MissionType = 'transport' | 'relocate' | 'scout' | 'raid' | 'haul' | 'forage' | 'colonize' | 'swarm' | 'hold' | 'tend';
export type MissionSlot = 'mission' | 'forage';

/** What kind of place a mission is aimed at. */
export type MissionTarget =
  | 'colony' // someone's colony (transport, raid)
  | 'own' // one of your own colonies (relocate)
  | 'ally' // a supercolony mate's colony (hold)
  | 'herd' // an aphid herd (tend)
  | 'empty' // an empty colony spot, 1–12 (colonize)
  | 'wilds' // the wilds, spot 13 (forage)
  | 'any'; // a colony, wild site or the wilds (scout, haul)

export interface MissionTypeDef {
  label: string;
  help: string;
  target: MissionTarget;
  /** May carry resources there. */
  allowsCargo: boolean;
  /** May go to the wilds (spot 13). */
  allowsWilds: boolean;
  /** May go to wild sites (spots 14+: aphid herds, termite mounds, spider dens). */
  allowsSites: boolean;
  /** Which slots it takes up. */
  slot: MissionSlot;
  /** The party doesn't come home by itself: it stays at the target (relocate, colonize, tend, hold, swarm). */
  oneWay: boolean;
  /** Players can send it (swarms only come from the wild). */
  playerSent: boolean;
  /** Only these castes may go. */
  onlyUnits?: CasteId[];
  /** Exactly this many of a caste must go (others may escort). */
  exactUnits?: Partial<Record<CasteId, number>>;
  /** Error for breaking onlyUnits / exactUnits. */
  unitError?: { code: string; message: string; short: string };
}

export const MISSION_TYPES: Record<MissionType, MissionTypeDef> = {
  raid: {
    label: 'Raid', help: 'Attack a colony. Win, and your survivors carry home loot.',
    target: 'colony', allowsCargo: false, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: false, playerSent: true,
  },
  scout: {
    label: 'Scout', help: 'Send Scouts to see what a colony has, or to survey the wilds (spot 13). Only Scouts can go.',
    target: 'any', allowsCargo: false, allowsWilds: true, allowsSites: true, slot: 'mission', oneWay: false, playerSent: true,
    onlyUnits: ['scout'],
    unitError: { code: 'scouts_only', message: 'Only Scouts can be sent to scout.', short: 'Only Scouts can scout.' },
  },
  forage: {
    label: 'Forage', help: 'Explore the wilds at the edge of a patch. Anything can happen.',
    target: 'wilds', allowsCargo: false, allowsWilds: true, allowsSites: true, slot: 'forage', oneWay: false, playerSent: true,
  },
  tend: {
    label: 'Tend aphids',
    help: 'Station ants at an aphid herd you have scouted. They stay, guard it and carry its honeydew home as Nectar every few hours. One herd per colony.',
    target: 'herd', allowsCargo: false, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: true, playerSent: true,
  },
  transport: {
    label: 'Transport', help: 'Carry resources to any colony. Your units come back.',
    target: 'colony', allowsCargo: true, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: false, playerSent: true,
  },
  relocate: {
    label: 'Relocate', help: 'Move units and resources to another of your colonies. They stay there.',
    target: 'own', allowsCargo: true, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: true, playerSent: true,
  },
  haul: {
    label: 'Haul corpses', help: 'Collect battlefield corpses as Protein. Workers and Haulers can carry them.',
    target: 'any', allowsCargo: false, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: false, playerSent: true,
  },
  colonize: {
    label: 'Found colony',
    help: 'Send one Winged Queen to an empty spot to found a new colony. Escorts and cargo stay with her.',
    target: 'empty', allowsCargo: true, allowsWilds: false, allowsSites: false, slot: 'mission', oneWay: true, playerSent: true,
    exactUnits: { winged_queen: 1 },
    unitError: { code: 'one_queen', message: 'Send exactly one Winged Queen to found a colony.', short: 'Send exactly one Winged Queen.' },
  },
  hold: {
    label: 'Hold position', help: "Station soldiers at a supercolony mate's colony. They fight in its battles until you recall them.",
    target: 'ally', allowsCargo: false, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: true, playerSent: true,
  },
  swarm: {
    label: 'Army ant swarm', help: 'A swarm of army ants from the wilds. Only the wild sends these.',
    target: 'colony', allowsCargo: false, allowsWilds: false, allowsSites: true, slot: 'mission', oneWay: true, playerSent: false,
  },
};

/** Mission types a player can send, in the order the Missions screen shows them. */
export const PLAYER_MISSIONS: MissionType[] = ['raid', 'scout', 'forage', 'tend', 'transport', 'relocate', 'haul', 'colonize', 'hold'];

/** Castes allowed on a mission, or null for any. */
export const missionUnitsAllowed = (type: MissionType): CasteId[] | null => MISSION_TYPES[type].onlyUnits ?? null;

/** Whether `units` break the type's unit rule (scouts only, exactly one Winged Queen). Null when fine. */
export function missionUnitProblem(type: MissionType, units: UnitCounts): { code: string; message: string; short: string } | null {
  const def = MISSION_TYPES[type];
  const bad =
    (def.onlyUnits && presentUnits(units).some((u) => !def.onlyUnits!.includes(u))) ||
    (def.exactUnits && Object.entries(def.exactUnits).some(([id, n]) => lvl(units, id as CasteId) !== n));
  return bad ? def.unitError ?? { code: 'bad_units', message: 'Those units can’t go on this mission.', short: 'Wrong units for this mission.' } : null;
}

/** Slots in one pool: how many missions use it and how many there are. */
export function missionSlotUsage(missions: { type: string }[], pool: MissionSlot, research: ResearchLevels): { used: number; max: number } {
  const used = missions.filter((m) => (MISSION_TYPES[m.type as MissionType]?.slot ?? 'mission') === pool).length;
  return { used, max: pool === 'forage' ? forageSlots(research) : missionSlots(research) };
}

/** What to say when every slot in a pool is taken. */
export const noSlotsMessage = (pool: MissionSlot, max: number): string =>
  pool === 'forage' ? 'All forage parties are already out.' : `All ${max} mission slots are in use. Research Colony Mind for more.`;

// ---------- speed and timing ----------

/** Mission speed: 10% to 100% in steps of 10. Slower uses less Nectar. */
export const MISSION_SPEED = { min: 10, max: 100, step: 10 } as const;

export const isValidSpeedPct = (pct: number): boolean =>
  Number.isInteger(pct) && pct >= MISSION_SPEED.min && pct <= MISSION_SPEED.max && pct % MISSION_SPEED.step === 0;

/** How long the walk home from the target takes: as long as the way out (times a forage event's factor). */
export const returnLegMs = (departAt: number, arriveAt: number, factor = 1): number => Math.round((arriveAt - departAt) * factor);

/** A recalled party turns round where it is: it's home after as long again as it has walked so far. */
export const recallReturnAt = (departAt: number, t: number): number => t + (t - departAt);

/** Arrival and (for round trips) homecoming of a mission sent at `t` with a one-way trip of `oneWaySeconds`. */
export function missionTimes(type: MissionType, t: number, oneWaySeconds: number): { arriveAt: number; returnAt: number | null } {
  const arriveAt = t + oneWaySeconds * 1000;
  return { arriveAt, returnAt: MISSION_TYPES[type].oneWay ? null : arriveAt + returnLegMs(t, arriveAt) };
}

// ---------- founding colonies (docs/19-colonies.md) ----------

export const colonyCapMessage = (max: number): string =>
  `You can rule ${max} ${max === 1 ? 'colony' : 'colonies'} right now. Research more Nuptial Flight to found another.`;

/**
 * Why this colony can't send a Winged Queen to found a colony right now, or null.
 * `claimed` = colonies the player holds plus queens already flying (both count against the cap).
 */
export function foundColonyBlocker(
  colony: { chambers: ChamberLevels; units: UnitCounts },
  research: ResearchLevels,
  claimed: number,
): Blocker | null {
  const max = maxColonies(research);
  if (claimed >= max) return { code: 'colony_cap', message: colonyCapMessage(max), short: colonyCapMessage(max) };
  if (lvl(colony.units, 'winged_queen') > 0) return null;
  const missing = missingRequirements(CASTES.winged_queen.unlock, colony.chambers, research);
  if (missing.length) {
    const list = missing.map((m) => `${m.name} ${m.need}`).join(', ');
    return { code: 'locked', message: `A Winged Queen needs ${list}.`, short: `A Winged Queen could found a colony here. She needs ${list}.` };
  }
  return { code: 'no_queen', message: 'Raise a Winged Queen in the Brood Hall first.', short: 'A Winged Queen could found a colony here. Raise one in the Brood Hall.' };
}
