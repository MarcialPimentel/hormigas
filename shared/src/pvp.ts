// PvP protection rules. Spec: docs/10-pvp-rules.md
import { FORMULAS } from './data';

const P = FORMULAS.pvp;

export const NEW_PLAYER_PROTECTION_MS = P.newPlayerProtectionHours * 3600_000;
export const INACTIVE_AFTER_MS = P.inactiveAfterDays * 86400_000;
export const BASH_LIMIT_PER_24H = P.bashLimitPer24h;

export interface PlayerPvpState {
  points: number;
  /** epoch ms until which the player is protected (new player), or 0 */
  protectedUntil: number;
  lastActive: number;
}

export type AttackBlockReason = 'self' | 'target_protected' | 'attacker_protected_target_too_weak' | 'target_too_weak' | 'bash_limit' | null;

export const isInactive = (p: PlayerPvpState, now: number) => now - p.lastActive >= INACTIVE_AFTER_MS;
export const isNewPlayerProtected = (p: PlayerPvpState, now: number) => p.protectedUntil > now;

/**
 * Can `attacker` raid `target`? (Scouting is always allowed except on yourself.)
 * raidsInLast24h = successful raids by attacker on that colony in the past 24 h.
 */
export function canRaid(attacker: PlayerPvpState, target: PlayerPvpState, now: number, raidsInLast24h: number): AttackBlockReason {
  const inactive = isInactive(target, now);
  if (!inactive && isNewPlayerProtected(target, now)) return 'target_protected';
  if (!inactive && attacker.points > 0 && target.points < (attacker.points * P.strengthProtectionPct) / 100) return 'target_too_weak';
  if (raidsInLast24h >= P.bashLimitPer24h) return 'bash_limit';
  return null;
}

export const BLOCK_MESSAGES: Record<Exclude<AttackBlockReason, null>, string> = {
  self: "You can't raid your own colony.",
  target_protected: 'This colony is still under new-colony protection.',
  attacker_protected_target_too_weak: 'Target is too weak.',
  target_too_weak: 'This colony is too weak compared to you (strength protection).',
  bash_limit: "You've hit the daily raid limit on this colony.",
};

/** Late Founding Boost: time multiplier lateFoundingMinMultiplier..1 for players below the world median. */
export function lateFoundingMultiplier(playerPoints: number, worldMedianPoints: number): number {
  if (worldMedianPoints <= 0) return 1;
  const min = P.lateFoundingMinMultiplier;
  return min + (1 - min) * Math.min(1, playerPoints / worldMedianPoints);
}
