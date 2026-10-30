// The ants you meet inside a chamber stay inside it, keep their names, and never outnumber the colony
// (client/src/components/nest3d/crew.ts).
import { describe, expect, it } from 'vitest';
import { CHAMBER_IDS } from '@hormigas/shared';
import { chamberJobs, createCrew, crewFor, crewSize, floorY, heapAt, shareCrews, stopAt, tunnelSide } from '../src/components/nest3d/crew';
import { D, room } from '../src/components/nest3d/slab';

describe('chamber crews', () => {
  it('every chamber has work, and every stop is inside its hollow or just into its tunnel', () => {
    for (const id of CHAMBER_IDS) {
      const r = room(id, 5);
      const jobs = chamberJobs(id, tunnelSide(r));
      expect(jobs.length, id).toBeGreaterThan(0);
      for (const j of jobs) {
        expect(j.label.length).toBeGreaterThan(0);
        for (const s of j.stops) {
          const p = stopAt(r, s);
          expect(Math.abs(p.x - r.x), `${id} ${j.label}`).toBeLessThanOrEqual(r.rx + 1.31);
          expect(p.z).toBeLessThan(0);
          expect(p.z).toBeGreaterThan(-D);
          // feet below the middle of the hollow: on the floor, not floating
          expect(p.y).toBeLessThan(r.y);
        }
      }
    }
  });

  it('the tunnel side points toward the shaft (or the queen, for chambers reached through her)', () => {
    expect(tunnelSide(room('granary', 1))).toBe(1); // left of the shaft: tunnel on its right
    expect(tunnelSide(room('larder', 1))).toBe(-1);
    expect(tunnelSide(room('nectar_cellar', 1))).toBe(1); // through the queen, who is to its right
    expect(tunnelSide(room('honeypot_gallery', 1))).toBe(-1);
  });

  it('more ants in bigger chambers, never more than ten or than the colony can spare', () => {
    expect(crewSize(1, 100)).toBe(3);
    expect(crewSize(8, 100)).toBe(7);
    expect(crewSize(30, 100)).toBe(10);
    expect(crewSize(10, 2)).toBe(2);
    expect(crewSize(10, 0)).toBe(0);
  });

  it('crews are shared out fairly: everyone gets someone before anyone gets a full crew, never past the budget', () => {
    expect(shareCrews([6, 1, 1], 3)).toEqual([1, 1, 1]);
    expect(shareCrews([6, 1, 1], 7)).toEqual([3, 2, 2]);
    expect(shareCrews([6, 1, 1], 100)).toEqual([6, 3, 3]);
    expect(shareCrews([6, 1, 1], 0)).toEqual([0, 0, 0]);
    const s = shareCrews([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 40);
    expect(s.reduce((a, b) => a + b, 0)).toBe(40);
    expect(Math.min(...s)).toBeGreaterThan(0);
  });

  it('the queen lives in her chamber; a soldier guards the stores only if the colony has soldiers', () => {
    const q = crewFor(room('queen_chamber', 4), 4, 50, 0);
    expect(q[0]).toMatchObject({ key: 'queen', caste: 'queen' });
    expect(q.filter((m) => m.caste === 'queen')).toHaveLength(1);
    expect(crewFor(room('granary', 4), 4, 50, 0).some((m) => m.caste === 'soldier')).toBe(false);
    expect(crewFor(room('granary', 4), 4, 50, 5).some((m) => m.caste === 'soldier')).toBe(true);
    expect(crewFor(room('nursery', 4), 4, 50, 5).some((m) => m.caste === 'soldier')).toBe(false);
  });

  it('names stay put: the same chamber gives the same keys every time', () => {
    const a = crewFor(room('larder', 6), 6, 80, 3).map((m) => m.key);
    const b = crewFor(room('larder', 6), 6, 80, 3).map((m) => m.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('ants walk their rounds without leaving the floor, and the one being looked at stands still', () => {
    const r = room('granary', 6);
    const crew = createCrew(r, crewFor(r, 6, 80, 2), 3, (x) => heapAt(r, x, 0.5));
    let poses = crew.step(0);
    const start = poses.map((p) => p.x);
    for (let t = 0; t < 600; t++) {
      poses = crew.step(0.05, 0);
      for (const p of poses) {
        expect(Math.abs(p.x - r.x)).toBeLessThanOrEqual(r.rx + 1.31);
        expect(p.y).toBeGreaterThanOrEqual(floorY(r, p.x) - 1e-9);
      }
      expect(poses[0].moving).toBe(false);
    }
    const held = poses[0];
    expect(crew.step(1, 0)[0]).toMatchObject({ x: held.x, z: held.z });
    // the others got on with their work
    expect(poses.slice(1).some((p, i) => Math.abs(p.x - start[i + 1]) > 0.1)).toBe(true);
  });

  it('loads go one way: hauliers carry in from the tunnel and come back empty', () => {
    const r = room('granary', 6);
    const crew = createCrew(r, [{ key: 'walker-0', caste: 'worker', job: 'Bringing in leaf bits', stops: chamberJobs('granary', tunnelSide(r))[0].stops }], 1);
    const mouthX = stopAt(r, { dx: 'mouth', dz: 0.5, wait: 0 }).x;
    let carriedInward = false, carriedOutward = false;
    let last = crew.step(0)[0];
    for (let t = 0; t < 800; t++) {
      const p = crew.step(0.05)[0];
      if (p.moving && p.carry) {
        const towardMouth = Math.abs(p.x - mouthX) < Math.abs(last.x - mouthX);
        if (towardMouth) carriedOutward = true;
        else if (p.x !== last.x) carriedInward = true;
      }
      last = p;
    }
    expect(carriedInward).toBe(true);
    expect(carriedOutward).toBe(false);
  });

  it('the heap is as tall as the store is full', () => {
    const r = room('granary', 6);
    expect(heapAt(r, r.x, 0)).toBe(0);
    expect(heapAt(r, r.x, 1)).toBeGreaterThan(heapAt(r, r.x, 0.25));
    expect(heapAt(room('nursery', 3), 0, 1)).toBe(0);
  });
});
