export type Nav = (screen: string, params?: any) => void;

export type MissionType = 'transport' | 'relocate' | 'scout' | 'raid' | 'haul' | 'forage' | 'colonize' | 'hold';

export const MISSION_LABEL: Record<MissionType, string> = {
  raid: 'Raid',
  scout: 'Scout',
  transport: 'Transport',
  relocate: 'Relocate',
  haul: 'Haul corpses',
  forage: 'Forage',
  colonize: 'Found colony',
  hold: 'Hold position',
};

export const MISSION_HELP: Record<MissionType, string> = {
  raid: 'Attack a colony. Win, and your survivors carry home loot.',
  scout: 'Send Scouts to see what a colony has, or to survey the wilds (spot 13). Only Scouts can go.',
  transport: 'Carry resources to any colony. Your units come back.',
  relocate: 'Move units and resources to another of your colonies. They stay there.',
  haul: 'Collect battlefield corpses as Protein. Workers and Haulers can carry them.',
  forage: 'Explore the wilds at the edge of a patch. Anything can happen.',
  colonize: 'Send one Winged Queen to an empty spot to found a new colony. Escorts and cargo stay with her.',
  hold: "Station soldiers at a supercolony mate's colony. They fight in its battles until you recall them.",
};

/** Mission types the server supports right now (grows with each milestone). */
export const ENABLED_MISSIONS: MissionType[] = ['raid', 'scout', 'forage', 'transport', 'relocate', 'haul', 'colonize', 'hold'];
