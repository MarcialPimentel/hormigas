// Guards the milestone map in docs/16-milestones.md. If a balance change breaks these, either
// re-tune or update the targets in the doc on purpose — `npm run sim` prints the full map.
import { describe, expect, it } from 'vitest';
import { simulate } from '../sim/simulate';

const H = 3600;
const D = 86400;

describe('pacing (engaged player, live speed ×1)', () => {
  const { milestones } = simulate({ worldSpeed: 1, days: 6 });
  const at = (id: string) => {
    const m = milestones.find((x) => x.id === id);
    if (!m) throw new Error(`milestone ${id} never reached`);
    return m.at;
  };

  it('founding: first chamber within minutes, Queen 2 inside the first session', () => {
    expect(at('first_chamber')).toBeLessThan(5 * 60);
    expect(at('queen2')).toBeLessThan(30 * 60);
  });

  it('Nectar is the first big goal: reached in 1–3 hours', () => {
    expect(at('nectar')).toBeGreaterThan(1 * H);
    expect(at('nectar')).toBeLessThan(3 * H);
  });

  it('Brood Hall and first castes follow Nectar quickly', () => {
    expect(at('brood_hall') - at('nectar')).toBeLessThan(1.5 * H);
    expect(at('first_castes')).toBeLessThan(6 * H);
    expect(at('founding_done')).toBeLessThan(8 * H);
  });

  it('a raid shield (Honeypot) exists before new-colony protection (72 h) ends', () => {
    expect(at('honeypot')).toBeLessThan(60 * H);
  });

  it('growth phase lands in days 1–5', () => {
    expect(at('major_soldiers')).toBeLessThan(1.5 * D);
    expect(at('queen4')).toBeLessThan(2 * D);
    expect(at('leaf10')).toBeLessThan(4 * D);
  });

  it('world speed scales the whole curve', () => {
    const fast = simulate({ worldSpeed: 5, days: 1 }).milestones.find((m) => m.id === 'nectar')!.at;
    expect(fast).toBeLessThan(at('nectar') / 3);
  });
});
