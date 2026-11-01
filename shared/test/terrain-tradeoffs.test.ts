// Every ground has one strength and one weakness (docs/04-colony.md § Terrain, Marz 1 Nov 2026).
import { describe, expect, it } from 'vitest';
import { TERRAIN, TERRAIN_IDS, groundDefensePct, previewBattle, terrainTraits } from '../src';

describe('terrain trade-offs', () => {
  it('every ground but Grassland has exactly one strength and one weakness from its numbers', () => {
    for (const t of TERRAIN_IDS) {
      if (t === 'grassland') continue;
      const { strength, weakness } = terrainTraits(t);
      expect(strength, t).not.toBe('None');
      expect(weakness, t).not.toBe('None');
      expect(strength.includes(','), t).toBe(false);
      expect(weakness.includes(','), t).toBe(false);
    }
  });
  it('reads in plain words', () => {
    expect(terrainTraits('sandy_soil')).toEqual({ strength: 'Digs 20% faster', weakness: 'Defenses 15% weaker' });
    expect(terrainTraits('rotting_log')).toEqual({ strength: 'Protein +20%', weakness: 'Digs 15% slower' });
    expect(terrainTraits('sunny_meadow')).toEqual({ strength: 'Foliage +20%', weakness: 'Nectar −10%' });
    expect(terrainTraits('creek_bank')).toEqual({ strength: 'Nectar +25%', weakness: 'Foliage −10%' });
  });
  it('Grassland stays even: the biggest nest and no bonus', () => {
    expect(TERRAIN.grassland.mods).toEqual({});
    expect(terrainTraits('grassland')).toEqual({ strength: 'Biggest nest', weakness: 'No food bonus' });
    for (const t of TERRAIN_IDS) expect(TERRAIN[t].space[1]).toBeLessThanOrEqual(TERRAIN.grassland.space[1]);
  });
  it("Sandy Soil's defenses hold worse in a fight", () => {
    expect(groundDefensePct('sandy_soil')).toBe(-15);
    expect(groundDefensePct('grassland')).toBe(0);
    // a close fight, so the ground can tip it
    const attacker = { units: { major_soldier: 40 }, research: {} };
    const walls = { units: {}, defenses: { soil_wall: 1, acid_sentry: 6, pit_trap: 6 }, research: {} };
    const firm = previewBattle(attacker, walls, { runs: 40, seed: 7 });
    const sand = previewBattle(attacker, { ...walls, groundDefensePct: groundDefensePct('sandy_soil') }, { runs: 40, seed: 7 });
    expect(sand.avgAttackerLossValue).toBeLessThan(firm.avgAttackerLossValue);
    expect(sand.winRate).toBeGreaterThanOrEqual(firm.winRate);
  });
});
