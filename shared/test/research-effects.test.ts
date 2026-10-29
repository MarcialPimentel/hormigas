// Research effects (docs/21-tech-tree.md): every key in research.json is one the game reads, all through researchSum.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CASTES, FORMULAS, RESEARCH, RESEARCH_IDS, RESEARCH_NUMBER_EFFECTS, RESEARCH_UNLOCK_FLAGS,
  forageLuck, forageSlots, maxColonies, missionSlots, scoutLevel, spaceMax, unitSpeed,
} from '../src';

/** All .ts source in a folder, recursively. */
function sources(dir: string): { file: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') ? [{ file: p, text: readFileSync(p, 'utf8') }] : [];
  });
}

const root = fileURLToPath(new URL('../..', import.meta.url));
// data.ts only lists the keys; listing them there doesn't count as reading them
const CODE = [...sources(join(root, 'shared', 'src')), ...sources(join(root, 'server', 'src'))].filter(
  (s) => !s.file.endsWith(join('shared', 'src', 'data.ts')),
);

describe('research effect keys', () => {
  it('every effect in research.json is a known number effect or unlock flag, with the right kind of value', () => {
    for (const id of RESEARCH_IDS) {
      for (const [key, v] of Object.entries(RESEARCH[id].effect)) {
        if ((RESEARCH_UNLOCK_FLAGS as readonly string[]).includes(key)) expect(v, `${id}.${key}`).toBe(true);
        else {
          expect(RESEARCH_NUMBER_EFFECTS as readonly string[], `${id}.${key} is not a known effect`).toContain(key);
          expect(typeof v, `${id}.${key}`).toBe('number');
        }
      }
    }
  });

  it('every number effect is read somewhere in the game code', () => {
    for (const key of RESEARCH_NUMBER_EFFECTS) {
      const used = CODE.some((s) => s.text.includes(`'${key}'`));
      expect(used, `nothing reads '${key}'`).toBe(true);
    }
  });

  it('game code never reads the level of a research that has a number effect (it reads the effect instead)', () => {
    const withEffects = RESEARCH_IDS.filter((id) => Object.values(RESEARCH[id].effect).some((v) => typeof v === 'number'));
    for (const { file, text } of CODE) {
      for (const id of withEffects) {
        const direct = new RegExp(`lvl\\([^)]*research[^)]*,\\s*'${id}'\\)`).test(text);
        expect(direct, `${file} reads the ${id} level directly`).toBe(false);
      }
    }
  });
});

describe('the helpers follow the data', () => {
  it('scout level, forage luck, slots, colonies, space and speed are effect × level', () => {
    expect(scoutLevel({ scent_reading: 3 })).toBe(3 * RESEARCH.scent_reading.effect.scoutLevel!);
    expect(scoutLevel(undefined)).toBe(0);
    expect(forageLuck({ foraging_instinct: 4 })).toBe(4 * RESEARCH.foraging_instinct.effect.forageLuck!);
    expect(forageSlots({ foraging_instinct: 3 })).toBe(FORMULAS.missions.baseForageSlots + 1);
    expect(missionSlots({ colony_mind: 2 })).toBe(FORMULAS.missions.baseSlots + 2);
    expect(maxColonies({ nuptial_flight: 3 })).toBe(FORMULAS.colonies.base + 2);
    expect(spaceMax(20, { deep_digging: 2 })).toBe(30);
    expect(unitSpeed('worker', { pheromone_trails: 3 })).toBeCloseTo(CASTES.worker.speed * 1.3);
  });
});
