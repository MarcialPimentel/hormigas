// What's coming at you, named the same way everywhere (Under way, Activity, the patch, notifications).
// A truce or a shared scent makes the sender's scouts visitors and turns their raids back (docs/23-supercolonies.md).
import { RELATION_NAMES, type Relation } from '@hormigas/shared';

const INCOMING: Record<string, string> = { swarm: 'Army ant swarm', raid: 'Raid', scout: 'Enemy scouts', hold: 'Allied soldiers', transport: 'Delivery' };

export type IncomingLike = { type: string; pact?: Relation | null };

export function incomingName(i: IncomingLike): string {
  if (i.pact && i.type === 'scout') return 'Visiting scouts';
  if (i.pact && i.type === 'raid') return 'Raid (turns back)';
  return INCOMING[i.type] ?? i.type;
}

/** " · Truce" after the sender's name when you have a pact with them, else nothing. */
export const pactNote = (i: IncomingLike) => (i.pact ? ` · ${RELATION_NAMES[i.pact]}` : '');

/** The pop-up for a party setting off towards you, or null when it isn't worth one. */
export function incomingAlert(msg: { missionType: string; from: string; colony: string; pact?: Relation | null }): string | null {
  const { missionType: t, from, colony, pact } = msg;
  if (t === 'swarm') return `An army ant swarm is heading for ${colony}!`;
  if (t !== 'raid' && t !== 'scout') return null;
  if (pact) return t === 'scout' ? `${from}'s scouts are visiting ${colony} (${RELATION_NAMES[pact].toLowerCase()})` : null;
  return t === 'raid' ? `Raid incoming from ${from}!` : `Enemy scouts heading for ${colony}`;
}
