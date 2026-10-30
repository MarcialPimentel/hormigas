// Every caste and defense a player can see carries its own role and description in docs/data,
// so adding one is a data change and no screen is left showing a blank line.
import { describe, expect, it } from 'vitest';
import { CASTES, CASTE_IDS, CASTE_ROLES, DEFENSES, DEFENSE_IDS, castesWithRole, roleCount } from '../src';

describe('caste and defense data', () => {
  it('every caste has a known role and a description', () => {
    for (const id of CASTE_IDS) {
      expect(CASTE_ROLES, id).toContain(CASTES[id].role);
      expect(CASTES[id].blurb?.length ?? 0, `${id} blurb`).toBeGreaterThan(10);
      // NPC-only castes are "wild", and only they are
      expect(CASTES[id].role === 'wild', id).toBe(!!CASTES[id].npcOnly);
    }
  });

  it('every defense has a description', () => {
    for (const id of DEFENSE_IDS) expect(DEFENSES[id].blurb?.length ?? 0, `${id} blurb`).toBeGreaterThan(10);
  });

  it('roles group castes for the screens: the nest draws one guard per soldier', () => {
    expect(castesWithRole('soldier')).toEqual(expect.arrayContaining(['minor_soldier', 'major_soldier', 'acid_sprayer', 'trap_jaw']));
    expect(castesWithRole('soldier')).not.toContain('worker');
    expect(roleCount({ minor_soldier: 3, major_soldier: 2, acid_sprayer: 1, trap_jaw: 1, worker: 50, scout: 4 }, 'soldier')).toBe(7);
    expect(roleCount({}, 'soldier')).toBe(0);
  });
});
