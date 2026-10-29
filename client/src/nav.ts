import { MISSION_TYPES, PLAYER_MISSIONS, type MissionType as SharedMissionType } from '@hormigas/shared';

export type Nav = (screen: string, params?: any) => void;

// Mission types, their names and help text live in shared/src/missions.ts (MISSION_TYPES), with the server's rules.
export type MissionType = SharedMissionType;

export const MISSION_LABEL = Object.fromEntries(Object.entries(MISSION_TYPES).map(([t, d]) => [t, d.label])) as Record<MissionType, string>;

export const MISSION_HELP = Object.fromEntries(Object.entries(MISSION_TYPES).map(([t, d]) => [t, d.help])) as Record<MissionType, string>;

/** Mission types a player can send, in screen order. */
export const ENABLED_MISSIONS: MissionType[] = PLAYER_MISSIONS;
