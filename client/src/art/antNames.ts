// Every ant you can look at closely has a name (docs/18-art-direction.md, "Names").
// Nothing is stored: a name is worked out from where the ant is (colony, chamber, which ant), so the same
// ant has the same name on every visit, on every device, for anyone who looks.
import names from '../../../docs/data/ant-names.json';
import type { Caste } from './ants';

/** FNV-1a: a small, stable string hash. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The name of one ant. Workers, soldiers and queens are female, as in real colonies, and a queen
 * is titled. Winged males (drones) take the male names.
 */
export function antName(key: string, caste: Caste | 'drone') {
  const list = caste === 'drone' ? names.male : names.female;
  const name = list[hash(key) % list.length];
  return caste === 'queen' ? `Reina ${name}` : name;
}

/** What to call the caste under the name. */
export const CASTE_LABEL: Record<Caste | 'drone', string> = {
  worker: 'Worker',
  soldier: 'Soldier',
  queen: 'Queen',
  alate: 'Winged queen',
  army: 'Army ant',
  army_major: 'Army ant major',
  drone: 'Winged male',
};
