export type Nav = (screen: string, params?: any) => void;

export type MissionType = 'transport' | 'relocate' | 'scout' | 'raid' | 'haul' | 'forage';

export const MISSION_LABEL: Record<MissionType, string> = {
  raid: 'Raid',
  scout: 'Scout',
  transport: 'Transport',
  relocate: 'Relocate',
  haul: 'Haul corpses',
  forage: 'Forage',
};

export const MISSION_HELP: Record<MissionType, string> = {
  raid: 'Attack a colony. Win, and your survivors carry home loot.',
  scout: 'Send Scouts to see what a colony has. Only Scouts can go.',
  transport: 'Carry resources to any colony. Your units come back.',
  relocate: 'Move units and resources to another of your colonies. They stay there.',
  haul: 'Collect battlefield corpses as Protein. Workers and Haulers can carry them.',
  forage: 'Explore the wilds at the edge of a patch. Anything can happen.',
};

/** Mission types the server supports right now (grows with each milestone). */
export const ENABLED_MISSIONS: MissionType[] = ['raid', 'scout', 'transport', 'relocate', 'haul'];
