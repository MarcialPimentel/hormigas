// The ants at work in the chambers (docs/12-ui-nest-view.md, "Meeting the ants"): every built chamber of the 3D
// nest has a small crew doing its work, each with a name and a job, met by zooming in. Hauliers bring loads in
// from the tunnel, others tend the pile, the brood or the queen. It's choreography: the server's numbers decide
// what the chamber holds (contents.ts); the crew only shows the kind of work that goes on in it.
//
// Plain numbers and slab units, no Three.js, so it can be tested.
import type { ChamberId } from '@hormigas/shared';
import type { Caste } from '../../art/ants';
import type { CargoKind } from './ants3d';
import { D, TUN_H, floorAt, shaftX, type Room } from './slab';

/** How she holds herself while she waits at a stop: busy nose-down, reaching up, or standing. */
export type Pose = 'work' | 'up' | 'still';
export interface Stop {
  /** across the hollow, as a share of its half-width (−1 left wall … 1 right wall); 'mouth' is the tunnel */
  dx: number | 'mouth';
  /** depth, 0 front … 1 back */
  dz: number;
  /** seconds she stays */
  wait: number;
  pose?: Pose;
  /** which way she faces while she waits (+1 right, −1 left); otherwise the way she came */
  face?: 1 | -1;
  /** what she carries on the way to the next stop */
  carry?: { kind: CargoKind; color: string };
}
export interface Job {
  /** what the name card says she's doing */
  label: string;
  caste?: Caste;
  stops: Stop[];
}

const LEAF = { kind: 'leaf', color: '#8DCB4A' } as const;
const MEAT = { kind: 'chunk', color: '#C4473A' } as const;
const HONEY = { kind: 'drop', color: '#F2B93B' } as const;
const EGG = { kind: 'drop', color: '#FBF6EA' } as const;
const SPOIL = { kind: 'chunk', color: '#B5653A' } as const;
const MULCH = { kind: 'leaf', color: '#A6D83A' } as const;

/** Bring a load in from the tunnel, put it down at `dx`, go back for more. */
const haul = (label: string, carry: Stop['carry'], dx: number, dz = 0.5): Job => ({
  label,
  stops: [
    { dx: 'mouth', dz: 0.5, wait: 2.5, carry },
    { dx, dz, wait: 1.2, pose: 'work' },
  ],
});
/** Take a load out to the tunnel. */
const carryOut = (label: string, carry: Stop['carry'], dx: number, dz = 0.5): Job => ({
  label,
  stops: [
    { dx, dz, wait: 1.6, pose: 'work', carry },
    { dx: 'mouth', dz: 0.5, wait: 2.5 },
  ],
});
/** Go from spot to spot in one part of the hollow, busy at each. */
const tend = (label: string, spots: [number, number][], wait = 2.4, pose: Pose = 'work'): Job => ({
  label,
  stops: spots.map(([dx, dz]) => ({ dx, dz, wait, pose })),
});
const guard: Job = { label: 'Guarding the door', caste: 'soldier', stops: [{ dx: 'mouth', dz: 0.55, wait: 30, pose: 'still' }] };

/** The work in each chamber, most common first. `side` is the tunnel's side of the hollow (−1 left, 1 right). */
export function chamberJobs(id: ChamberId, side: number): Job[] {
  const far = -side; // the end away from the tunnel
  switch (id) {
    case 'granary':
      return [haul('Bringing in leaf bits', LEAF, 0.15 * side, 0.25), tend('Stacking the leaf pile', [[-0.5, 0.2], [-0.1, 0.8], [0.3, 0.3]]), haul('Bringing in leaf bits', LEAF, 0.45 * far, 0.75), tend('Sorting fresh leaves from old', [[0.55, 0.6], [0.2, 0.9]], 2.8)];
    case 'larder':
      return [haul('Hauling prey in', MEAT, 0, 0.5), tend('Cutting up prey', [[0.4, 0.35], [0.5, 0.65]], 3), tend('Sorting the meat', [[-0.4, 0.4], [-0.1, 0.7]])];
    case 'hunting_grounds':
      return [tend('Cutting up the catch', [[-0.45, 0.4], [-0.3, 0.7]], 3), carryOut('Carrying meat to the larder', MEAT, -0.25, 0.55), tend('Picking over the scraps', [[0.3, 0.3], [0.55, 0.6]])];
    case 'nectar_cellar':
      return [haul('Topping up the honey pool', HONEY, 0.25 * side, 0.35), tend('Skimming the honey', [[-0.3, 0.6], [0.3, 0.7]], 3), haul('Topping up the honey pool', HONEY, 0.25 * far, 0.65)];
    case 'honeypot_gallery':
      return [tend('Feeding the honeypots', [[-0.5, 0.5], [-0.05, 0.5], [0.4, 0.5]], 2.8, 'up'), haul('Bringing nectar for the honeypots', HONEY, 0, 0.45), tend('Feeding the honeypots', [[0.55, 0.45], [0.15, 0.55]], 2.8, 'up')];
    case 'leaf_garden':
      return [haul('Bringing leaves for the garden', LEAF, 0.3 * side, 0.4), tend('Chewing leaves into mulch', [[-0.4, 0.35], [0, 0.6], [0.35, 0.3]], 3), tend('Weeding the fungus', [[-0.2, 0.7], [0.3, 0.75]], 2.6), carryOut('Spreading fresh mulch', MULCH, 0.3 * far, 0.55)];
    case 'brood_hall':
    case 'nursery':
      return [tend('Licking the eggs clean', [[-0.6, 0.35], [-0.45, 0.7]], 2.6), tend('Feeding the larvae', [[-0.15, 0.4], [0.15, 0.65]], 2.4), { label: 'Moving cocoons', stops: [{ dx: 0.55, dz: 0.4, wait: 1.5, pose: 'work', carry: EGG }, { dx: 0.15, dz: 0.6, wait: 1.5, pose: 'work' }] }, haul('Bringing food for the brood', HONEY, 0, 0.5)];
    case 'queen_chamber':
      return [tend('Grooming the queen', [[-0.42, 0.3], [-0.25, 0.75]], 3.2), carryOut('Carrying eggs to the brood', EGG, 0.55, 0.5), tend('Grooming the queen', [[0.12, 0.7], [-0.05, 0.25]], 3.2), haul('Feeding the queen', HONEY, 0.1, 0.4)];
    case 'aphid_pasture':
      return [tend('Collecting honeydew', [[-0.1, 0.45], [0.25, 0.55], [0.45, 0.4]], 3, 'up'), tend('Herding the aphids', [[-0.4, 0.3], [0.5, 0.7]], 1.8), carryOut('Carrying honeydew home', HONEY, 0.2, 0.5)];
    case 'excavation_works':
      return [tend('Digging', [[0.82 * far, 0.35], [0.78 * far, 0.7]], 3.5), carryOut('Hauling spoil out', SPOIL, 0.35, 0.5), tend('Digging', [[0.75 * far, 0.55]], 4)];
    case 'pheromone_chamber':
      return [tend('Laying scent trails', [[-0.5, 0.3], [0, 0.65], [0.5, 0.35]], 1.6), tend('Reading the scents', [[-0.2, 0.5], [0.3, 0.55]], 3.5, 'up')];
  }
}

/** Which side of the hollow the tunnel comes in from (−1 left, 1 right). */
export function tunnelSide(r: Room) {
  const s = r.viaQueen ? Math.sign(r.x) : Math.sign(r.x - shaftX(r.y));
  return -(s || 1);
}

/** How many ants work in a chamber: more in a bigger one, never more than the colony can spare. */
export function crewSize(level: number, workers: number) {
  return Math.max(0, Math.min(10, 3 + Math.floor(level / 2), workers));
}

/**
 * Share `budget` workers out over the chambers (their levels, in order) a few at a time, so every chamber gets
 * someone before any gets a full crew. Returns each chamber's crew size.
 */
export function shareCrews(levels: number[], budget: number) {
  const size = levels.map(() => 0);
  for (let given = 0, more = true; more && given < budget; ) {
    more = false;
    for (let i = 0; i < levels.length && given < budget; i++) {
      if (size[i] < crewSize(levels[i], Infinity)) {
        size[i]++;
        given++;
        more = true;
      }
    }
  }
  return size;
}

export interface Member {
  /** stable within the chamber, so she keeps her name (antNames.ts) */
  key: string;
  caste: Caste;
  job: string;
  stops: Stop[];
}

/** Where the queen sits: the middle of her chamber, facing her eggs. */
export const QUEEN_STOP: Stop = { dx: -0.08, dz: 0.5, wait: 60, pose: 'still', face: 1 };

/** The crew of one chamber: the queen in hers, a soldier at the door of the stores if the colony has soldiers. */
export function crewFor(r: Room, level: number, workers: number, soldiers: number): Member[] {
  const jobs = chamberJobs(r.id, tunnelSide(r));
  const out: Member[] = [];
  if (r.id === 'queen_chamber') out.push({ key: 'queen', caste: 'queen', job: 'Laying eggs', stops: [QUEEN_STOP] });
  const n = crewSize(level, workers);
  for (let i = 0; i < n; i++) {
    const j = jobs[i % jobs.length];
    out.push({ key: `walker-${i}`, caste: j.caste ?? 'worker', job: j.label, stops: j.stops });
  }
  const stores: ChamberId[] = ['granary', 'larder', 'nectar_cellar', 'queen_chamber', 'honeypot_gallery'];
  if (soldiers > 0 && level >= 2 && stores.includes(r.id)) out.push({ key: 'guard', caste: 'soldier', job: guard.label, stops: guard.stops });
  return out;
}

const MOUTH_OUT = 1.3;
/** The floor she walks on at x: the hollow's floor, easing onto the tunnel's floor past its edge. */
export function floorY(r: Room, x: number) {
  const edge = r.rx * 0.88, d = Math.abs(x - r.x);
  const inside = (dx: number) => floorAt(r, r.x + Math.sign(x - r.x) * dx) + 0.02;
  if (d <= edge) return inside(d);
  const tunnel = r.y - TUN_H + 0.12;
  const t = Math.min(1, (d - edge) / (r.rx + MOUTH_OUT - edge));
  return inside(edge) + (tunnel - inside(edge)) * Math.min(1, t * 1.6);
}

/** Where a stop is: feet on the floor, or a little way into the tunnel for 'mouth'. */
export function stopAt(r: Room, s: Stop) {
  const z = -D + 0.45 + (D - 0.9) * (1 - s.dz);
  const x = s.dx === 'mouth' ? r.x + tunnelSide(r) * (r.rx + MOUTH_OUT) : r.x + Math.max(-0.88, Math.min(0.88, s.dx)) * r.rx;
  return { x, y: floorY(r, x), z };
}

/** One ant of the crew as she is this frame. */
export interface CrewPose {
  x: number;
  y: number;
  z: number;
  /** +1 heading right, −1 left */
  facing: number;
  /** nose up (+) or down (−) along the floor */
  slope: number;
  moving: boolean;
  pose: Pose;
  carry: Stop['carry'] | null;
}

/**
 * How high the heap in a chamber stands above the floor at x, when the store is `fill` full (0–1): ants walk over
 * the pile rather than through it. The shapes match how contents.ts lays the piles out (lowest pieces first).
 */
export function heapAt(r: Room, x: number, fill: number) {
  const dx = x - r.x, f = Math.sqrt(Math.max(0, Math.min(1, fill)));
  switch (r.id) {
    case 'granary':
      return Math.max(0, 1 - (dx / (r.rx * 0.8)) ** 2) * r.ry * 1.05 * f * 0.8;
    case 'leaf_garden':
      return Math.max(0, 1 - (dx / (r.rx * 0.75)) ** 2) * r.ry * 0.85 * 0.95 + 0.45;
    case 'larder':
      return Math.max(0, r.ry * 0.35 * (1 - Math.abs(dx) / r.rx)) * f * 0.7;
    default:
      return 0;
  }
}

const SPEED = 1.15;
/** Where each member of the crew is, moving her on by `dt` seconds. Members start part-way through their rounds. */
export function createCrew(r: Room, members: Member[], seed = 1, heap: (x: number) => number = () => 0) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const st = members.map((m) => {
    // no two ants on the same job stand on exactly the same spot
    const jx = (rnd() - 0.5) * 0.18, jz = (rnd() - 0.5) * 0.3;
    const pts = m.stops.map((x) => stopAt(r, x.dx === 'mouth' ? x : { ...x, dx: x.dx + jx, dz: Math.max(0, Math.min(1, x.dz + jz)) }));
    const at = Math.floor(rnd() * pts.length);
    return { m, pts, at, walking: false, from: pts[at], t: rnd() * (m.stops[at]?.wait ?? 1), facing: m.stops[at]?.face ?? (rnd() < 0.5 ? 1 : -1), speed: SPEED * (0.85 + rnd() * 0.3) };
  });
  return {
    members,
    /** Move everyone on by dt; `held` is the one being looked at, who stops where she is. */
    step(dt: number, held = -1): CrewPose[] {
      return st.map((a, i) => {
        if (i !== held) {
          a.t -= dt;
          if (a.t <= 0) {
            if (a.walking || a.pts.length === 1) {
              a.walking = false;
              a.facing = a.m.stops[a.at].face ?? a.facing;
              a.t = a.m.stops[a.at].wait * (0.8 + rnd() * 0.4);
            } else {
              a.from = { ...a.pts[a.at] };
              a.at = (a.at + 1) % a.pts.length;
              a.walking = true;
              a.t = Math.abs(a.pts[a.at].x - a.from.x) / a.speed + 0.25;
            }
          }
        }
        const to = a.pts[a.at];
        let x = to.x, z = to.z;
        if (a.walking) {
          const len = Math.abs(to.x - a.from.x) / a.speed + 0.25;
          const k = Math.max(0, Math.min(1, 1 - a.t / len));
          x = a.from.x + (to.x - a.from.x) * k;
          z = a.from.z + (to.z - a.from.z) * k;
          if (Math.abs(to.x - a.from.x) > 0.01) a.facing = to.x > a.from.x ? 1 : -1;
        }
        const ground = (gx: number) => floorY(r, gx) + (Math.abs(gx - r.x) < r.rx * 0.9 ? heap(gx) : 0);
        const y = ground(x);
        const slope = Math.atan2(ground(x + 0.15 * a.facing) - y, 0.15);
        const prev = a.m.stops[(a.at - 1 + a.pts.length) % a.pts.length];
        return {
          x, y, z, facing: a.facing, slope,
          moving: a.walking && i !== held,
          pose: a.walking ? 'still' : (a.m.stops[a.at].pose ?? 'still'),
          // a load goes from the stop where it's picked up to the next one
          carry: a.walking ? prev.carry ?? null : null,
        };
      });
    },
  };
}
export type Crew = ReturnType<typeof createCrew>;
