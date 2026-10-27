// Pacing simulator: plays an engaged player through the real rules and records when milestones happen.
// Used by `npm run sim` (prints the milestone map) and by test/pacing.test.ts (guards the targets).
//
// Player model: checks in whenever something can be done (so real players are ~1.5–2× slower),
// follows the founding tasks, then grows production, expands storage when costs outgrow it,
// builds key chambers when unlocked, researches with surplus.
import {
  CASTES,
  CHAMBERS,
  QUESTS,
  RESEARCH,
  RESOURCES_DATA,
  add,
  canAfford,
  chamberBuildSeconds,
  chamberCost,
  isUnlocked,
  lvl,
  productionPerHour,
  researchCost,
  researchSeconds,
  scale,
  storageCapacity,
  sub,
  workforce,
  type ChamberId,
  type ResearchId,
  type Resources,
} from '../src';

export interface Milestone {
  id: string;
  label: string;
  /** seconds since the colony was founded */
  at: number;
}

const RES = ['foliage', 'protein', 'nectar'] as const;
const STORE = { foliage: 'granary', protein: 'larder', nectar: 'nectar_cellar' } as const;

export function simulate(opts: { worldSpeed?: number; days?: number; stepSeconds?: number } = {}): { milestones: Milestone[]; final: any } {
  const speed = opts.worldSpeed ?? 1;
  const limit = (opts.days ?? 40) * 86400;
  const step = opts.stepSeconds ?? 20;
  const terrain = 'grassland' as const;

  let t = 0;
  let res: Resources = { ...RESOURCES_DATA.startingResources };
  const ch: Partial<Record<ChamberId, number>> = { queen_chamber: 1 };
  const rs: Partial<Record<ResearchId, number>> = {};
  const units = { worker: 0, scout: 0, minor_soldier: 0 };
  let wildRaidsWon = 0;
  const sent: string[] = [];
  let claimed = 0;
  let build: { id: ChamberId; level: number; end: number } | null = null;
  let research: { id: ResearchId; level: number; end: number } | null = null;
  const milestones: Milestone[] = [];
  const hit = (id: string, label: string) => {
    if (!milestones.some((m) => m.id === id)) milestones.push({ id, label, at: t });
  };

  const L = (id: ChamberId) => lvl(ch, id);
  const prod = () => productionPerHour(ch, terrain, speed);
  const hoursUntil = (c: Resources) => {
    const p = prod();
    return Math.max(...RES.map((r) => (c[r] <= res[r] ? 0 : p[r] > 0 ? (c[r] - res[r]) / p[r] : Infinity)));
  };

  function tryBuild(id: ChamberId): 'started' | 'wait' | 'skip' {
    if (!isUnlocked(CHAMBERS[id].unlock, ch, rs)) return 'skip';
    const level = L(id) + 1;
    const cost = chamberCost(id, level);
    const cap = storageCapacity(ch);
    const over = RES.find((r) => cost[r] > cap[r] * 0.98);
    if (over && STORE[over] !== id) return tryBuild(STORE[over]);
    if (hoursUntil(cost) > 24) return 'skip';
    if (!canAfford(res, cost)) return 'wait';
    res = sub(res, cost);
    build = { id, level, end: t + chamberBuildSeconds(id, level, { worldSpeed: speed, excavation: L('excavation_works'), terrain }) };
    return 'started';
  }

  /** What the player wants to build, most important first. */
  function wishlist(): ChamberId[] {
    const list: ChamberId[] = [];
    // founding tasks drive the early game
    const q = QUESTS[claimed];
    const questBuild: Record<string, ChamberId> = {
      leaf: 'leaf_garden', nursery: 'nursery', hunt: 'hunting_grounds', queen2: 'queen_chamber', grow: 'leaf_garden',
      queen3: 'queen_chamber', nectar: 'aphid_pasture', brood: 'brood_hall',
    };
    const wf = workforce(ch);
    if (wf.ratio < 1 || wf.supply - wf.demand < 8) list.push('nursery');
    if (q && questBuild[q.id]) list.push(questBuild[q.id]);
    const cap = storageCapacity(ch);
    const p = prod();
    for (const r of RES) if (L(STORE[r]) < 25 && res[r] + p[r] * 3 > cap[r] * 0.9) list.push(STORE[r]);
    const qL = L('queen_chamber');
    if (qL >= 2 && L('brood_hall') < 2) list.push('brood_hall');
    if (qL >= 3 && L('pheromone_chamber') < 2) list.push('pheromone_chamber');
    if (qL >= 3 && L('aphid_pasture') < Math.max(1, L('leaf_garden') - 4)) list.push('aphid_pasture');
    if (qL >= 4 && L('honeypot_gallery') < 1) list.push('honeypot_gallery');
    if (qL >= 4 && L('excavation_works') < Math.floor(L('leaf_garden') / 4)) list.push('excavation_works');
    if (L('leaf_garden') >= qL * 2 + 1 && qL < 6) list.push('queen_chamber');
    list.push(L('leaf_garden') <= L('hunting_grounds') + 1 ? 'leaf_garden' : 'hunting_grounds');
    return list;
  }

  function act() {
    // claim finished founding tasks
    while (claimed < QUESTS.length && QUESTS[claimed].done({ chambers: ch, units, missionsSent: sent, wildRaidsWon })) {
      res = add(res, QUESTS[claimed].reward);
      claimed++;
    }
    // after scouting, save up for the raid on the wild nest instead of building
    const savingForRaid = sent.includes('scout') && units.minor_soldier < 8;
    if (!build && !savingForRaid) {
      for (const id of wishlist()) {
        const r = tryBuild(id);
        if (r !== 'skip') break;
      }
    }
    if (!research && L('pheromone_chamber') >= 1) {
      for (const id of ['brood_science', 'colony_mind', 'mandibles', 'pheromone_trails', 'scent_reading', 'chitin'] as ResearchId[]) {
        const level = lvl(rs, id) + 1;
        if ((id === 'brood_science' && level > 2) || level > 3 || !isUnlocked(RESEARCH[id].unlock, ch, rs)) continue;
        const cost = researchCost(id, level);
        if (canAfford(res, scale(cost, 1.5))) {
          res = sub(res, cost);
          research = { id, level, end: t + researchSeconds(id, level, { worldSpeed: speed, pheromone: L('pheromone_chamber') }) };
        }
        break;
      }
    }
    if (L('brood_hall') >= 1) {
      const w = scale(CASTES.worker.cost, 3);
      if (units.worker < 3 && canAfford(res, w)) { res = sub(res, w); units.worker = 3; }
      if (units.worker >= 3 && !sent.includes('forage') && res.nectar >= 10) { res = sub(res, { foliage: 0, protein: 0, nectar: 10 }); sent.push('forage'); }
      if (units.scout < 1 && canAfford(res, CASTES.scout.cost) && res.nectar >= 5) { res = sub(res, CASTES.scout.cost); units.scout = 1; sent.push('scout'); }
      // founding task: raid the level-1 wild nest with 8 Minor Soldiers (docs/17-wild-nests.md)
      const army = scale(CASTES.minor_soldier.cost, 8);
      if (sent.includes('scout') && units.minor_soldier < 8 && canAfford(res, army) && res.nectar >= 20) {
        res = sub(res, add(army, { foliage: 0, protein: 0, nectar: 20 }));
        units.minor_soldier = 8;
        sent.push('raid');
        wildRaidsWon = 1;
        hit('wild_raid', 'First raid on the wild nest');
      }
    }
  }

  function check() {
    if (L('leaf_garden') >= 1) hit('first_chamber', 'First chamber built');
    if (L('queen_chamber') >= 2) hit('queen2', "Queen's Chamber 2 — storage and Brood Hall unlocked");
    if (L('queen_chamber') >= 3) hit('queen3', "Queen's Chamber 3 — Aphid Pasture and research unlocked");
    if (L('aphid_pasture') >= 1) hit('nectar', 'Nectar discovered (first Aphid Pasture)');
    if (L('brood_hall') >= 1) hit('brood_hall', 'Brood Hall built');
    if (units.worker >= 3) hit('first_castes', 'First castes raised');
    if (sent.includes('forage')) hit('first_forage', 'First forage party');
    if (claimed >= QUESTS.length) hit('founding_done', 'All founding tasks done');
    if (L('pheromone_chamber') >= 1) hit('research', 'First research possible');
    if ((rs.brood_science ?? 0) >= 1 && L('brood_hall') >= 2) hit('major_soldiers', 'Major Soldiers unlocked');
    if (L('queen_chamber') >= 4) hit('queen4', "Queen's Chamber 4 — Honeypot and Excavation unlocked");
    if (L('honeypot_gallery') >= 1) hit('honeypot', 'Honeypot Gallery — first raid protection');
    if (L('queen_chamber') >= 5) hit('queen5', "Queen's Chamber 5");
    if (L('leaf_garden') >= 10) hit('leaf10', 'Leaf Garden 10');
    if (L('queen_chamber') >= 6) hit('queen6', "Queen's Chamber 6");
    if (L('leaf_garden') >= 15) hit('leaf15', 'Leaf Garden 15');
    if (L('leaf_garden') >= 20) hit('leaf20', 'Leaf Garden 20');
  }

  function tick() {
    const p = prod();
    const cap = storageCapacity(ch);
    for (const r of RES) if (res[r] < cap[r]) res[r] = Math.min(cap[r], res[r] + (p[r] * step) / 3600);
    t += step;
    if (build && t >= build.end) { ch[build.id] = build.level; build = null; }
    if (research && t >= research.end) { rs[research.id] = research.level; research = null; }
  }

  while (t < limit) {
    act();
    check();
    tick();
  }
  return { milestones, final: { chambers: ch, research: rs, perHour: prod() } };
}

export function fmtTime(s: number): string {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 2 * 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}
