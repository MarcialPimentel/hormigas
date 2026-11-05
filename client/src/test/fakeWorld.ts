// The test scene's made-up world (docs/test-bed.md): two colonies of yours, a rival, and one of every wild thing,
// with parties sent and timed on a clock the test scene owns. Nothing here talks to the server. It only builds the
// same state shapes the server sends, so the real Whole Yard and 3D Patch scenes draw it with their own code.
import { MISSION_TYPES, WILDS_SPOT, type MissionType } from '@hormigas/shared';
import type { ServerState } from '../game';
import type { Spot } from '../components/Patch';

export type Coords = { region: number; patch: number; spot: number };
const at = (region: number, patch: number, spot: number): Coords => ({ region, patch, spot });

/** Where everything lives. Home patch 1:45, a second colony next door on 1:46, a rival on 1:44. */
export const PLACES = {
  home: at(1, 45, 6),
  second: at(1, 46, 3),
  rival: at(1, 45, 2),
  rivalFar: at(1, 44, 5),
  empty: at(1, 45, 10),
  wilds: at(1, 45, WILDS_SPOT),
  wildNest: at(1, 45, WILDS_SPOT + 1),
  termites: at(1, 45, WILDS_SPOT + 2),
  herd: at(1, 45, WILDS_SPOT + 3),
  windfall: at(1, 45, WILDS_SPOT + 4),
  spider: at(1, 46, WILDS_SPOT + 1),
  windfallFar: at(1, 46, WILDS_SPOT + 2),
  wildsFar: at(1, 44, WILDS_SPOT),
} as const;
export type Place = keyof typeof PLACES;

export const COLONIES = [
  { id: 1, name: 'Test Colony', coords: PLACES.home },
  { id: 2, name: 'Second Colony', coords: PLACES.second },
];

/** What each button sends. `units` is a recipe scaled by the party size; `back` is what it carries home. */
export interface Order {
  id: string;
  label: string;
  group: 'Send' | 'Incoming';
  type: MissionType | 'raid_in' | 'scout_in' | 'swarm_in' | 'delivery_in' | 'claim_in';
  to: Place;
  from?: Place;
  units?: Record<string, number>;
  back?: Record<string, number>;
  /** for windfall claims and herd tenders: how long they stay before walking home, × the trip */
  hold?: number;
}
export const ORDERS: Order[] = [
  { id: 'forage', label: 'Forage', group: 'Send', type: 'forage', to: 'wilds', units: { worker: 1 }, back: { foliage: 1, protein: 1 } },
  { id: 'forage_far', label: 'Forage next patch', group: 'Send', type: 'forage', to: 'wildsFar', units: { worker: 1 }, back: { foliage: 1 } },
  { id: 'scout', label: 'Scout wild nest', group: 'Send', type: 'scout', to: 'wildNest', units: { scout: 1 } },
  { id: 'scout_far', label: 'Scout spider den', group: 'Send', type: 'scout', to: 'spider', units: { scout: 1 } },
  { id: 'raid_nest', label: 'Raid wild nest', group: 'Send', type: 'raid', to: 'wildNest', units: { minor_soldier: 0.7, worker: 0.3 }, back: { protein: 1 } },
  { id: 'raid_termites', label: 'Raid termites', group: 'Send', type: 'raid', to: 'termites', units: { major_soldier: 0.6, worker: 0.4 }, back: { foliage: 1 } },
  { id: 'raid_spider', label: 'Raid spider den', group: 'Send', type: 'raid', to: 'spider', units: { major_soldier: 0.8, worker: 0.2 }, back: { protein: 1 } },
  { id: 'raid_rival', label: 'Raid rival', group: 'Send', type: 'raid', to: 'rival', units: { minor_soldier: 0.8, worker: 0.2 }, back: { nectar: 1 } },
  { id: 'claim', label: 'Claim windfall', group: 'Send', type: 'claim', to: 'windfall', units: { minor_soldier: 0.4, worker: 0.6 }, back: { protein: 1 }, hold: 1 },
  { id: 'claim_far', label: 'Claim far windfall', group: 'Send', type: 'claim', to: 'windfallFar', units: { minor_soldier: 0.4, worker: 0.6 }, back: { protein: 1 }, hold: 1 },
  { id: 'tend', label: 'Tend aphids', group: 'Send', type: 'tend', to: 'herd', units: { worker: 1 }, back: { nectar: 1 }, hold: 1 },
  { id: 'transport', label: 'Transport', group: 'Send', type: 'transport', to: 'second', units: { worker: 1 } },
  { id: 'colonize', label: 'Found colony', group: 'Send', type: 'colonize', to: 'empty', units: { winged_queen: 0, worker: 1 } },
  { id: 'raid_in', label: 'Raid on you', group: 'Incoming', type: 'raid_in', from: 'rivalFar', to: 'home' },
  { id: 'scout_in', label: 'Scouts on you', group: 'Incoming', type: 'scout_in', from: 'rival', to: 'home' },
  { id: 'swarm_in', label: 'Army ant swarm', group: 'Incoming', type: 'swarm_in', from: 'wildsFar', to: 'home' },
  { id: 'delivery_in', label: 'Delivery to you', group: 'Incoming', type: 'delivery_in', from: 'rivalFar', to: 'second' },
  // a wild nest's party coming for a windfall you hold (docs/25-windfalls.md#wild-ants-come-for-windfalls)
  { id: 'claim_in', label: 'Wild ants for windfall', group: 'Incoming', type: 'claim_in', from: 'wildNest', to: 'windfall' },
];

/** A party on the test clock. Times are ms on that clock. */
export interface Party {
  id: number;
  order: Order;
  size: number;
  from: Coords;
  originColonyId: number;
  departAt: number;
  arriveAt: number;
  /** one-way parties that stay (claims, tenders): when they start walking home */
  leaveAt: number;
  returnAt: number;
  scouted: boolean;
}

function unitsFor(o: Order, size: number) {
  const out: Record<string, number> = {};
  for (const [id, share] of Object.entries(o.units ?? { worker: 1 })) {
    const n = Math.round(size * share);
    if (n > 0) out[id] = n;
  }
  if (o.type === 'colonize') out.winged_queen = 1;
  return out;
}
const scaled = (r: Record<string, number> | undefined, size: number) =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, Math.round(v * size * 8)]));

/** Send a party: `trip` is one way, in ms of test-clock time. */
export function send(o: Order, id: number, now: number, trip: number, size: number, fromColony = 1): Party {
  const home = COLONIES.find((c) => c.id === fromColony) ?? COLONIES[0];
  const from = o.from ? PLACES[o.from] : home.coords;
  const arriveAt = now + trip;
  const leaveAt = arriveAt + (o.hold ?? 0) * trip;
  return { id, order: o, size, from, originColonyId: home.id, departAt: now, arriveAt, leaveAt, returnAt: leaveAt + trip, scouted: true };
}

const ONE_WAY_STAYS = new Set(['claim', 'tend']);
const ONE_WAY_GONE = new Set(['colonize', 'relocate']);
const incoming = (p: Party) => p.order.group === 'Incoming';

/** When a party leaves the map for good. */
export function endsAt(p: Party) {
  if (incoming(p) || ONE_WAY_GONE.has(p.order.type)) return p.arriveAt;
  return p.returnAt;
}

/** The trip phase a party is in, as the server would say it. */
export function statusOf(p: Party, now: number): 'outbound' | 'holding' | 'returning' | 'done' {
  if (now < p.arriveAt) return 'outbound';
  if (incoming(p) || ONE_WAY_GONE.has(p.order.type)) return 'done';
  if (ONE_WAY_STAYS.has(p.order.type) && now < p.leaveAt) return 'holding';
  return now < p.returnAt ? 'returning' : 'done';
}

/** A party as the server's state lists it: a mission of yours, or a party coming at you. */
function missionRow(p: Party, now: number) {
  const status = statusOf(p, now);
  const oneWay = !!MISSION_TYPES[p.order.type as MissionType]?.oneWay;
  const back = status === 'returning';
  return {
    id: p.id, type: p.order.type, status, origin: p.from, target: PLACES[p.order.to], originColonyId: p.originColonyId,
    units: unitsFor(p.order, p.size),
    cargo: back ? scaled(p.order.back, p.size) : p.order.type === 'transport' && !back ? { foliage: p.size * 10 } : {},
    departAt: p.departAt,
    // a one-way party's walk home is timed from when it leaves the target, like the server's comeHome
    arriveAt: oneWay && back ? p.leaveAt : p.arriveAt,
    returnAt: oneWay && !back ? null : p.returnAt,
  };
}
function incomingRow(p: Party) {
  const t = p.order.type;
  const target = PLACES[p.order.to];
  return {
    id: p.id, type: t === 'raid_in' ? 'raid' : t === 'scout_in' ? 'scout' : t === 'swarm_in' ? 'swarm' : t === 'claim_in' ? 'claim' : 'transport',
    hostile: t !== 'delivery_in', origin: p.from, targetColonyId: COLONIES.find((c) => c.coords === target)?.id ?? 1,
    departAt: p.departAt, arriveAt: p.arriveAt, unitCount: t === 'swarm_in' ? p.size * 4 : p.size, scouted: p.scouted,
    from: t === 'swarm_in' ? 'the wilds' : t === 'claim_in' ? 'Wild nest' : 'Rival',
    // aimed at your ants holding a windfall, not at a colony
    ...(t === 'claim_in' ? { wild: true, herd: target, windfall: true } : {}),
  };
}

/** The whole fake server state at `now`. */
export function stateAt(parties: Party[], now: number): ServerState {
  const live = parties.filter((p) => statusOf(p, now) !== 'done');
  return {
    serverNow: now,
    world: { id: 0, name: 'Test world', speed: 1 },
    player: {
      id: 1, username: 'tester', research: {}, researchJob: null, points: { total: 0, economy: 0, research: 0, military: 0 },
      protectedUntil: 0, timeMultiplier: 1, isAdmin: false, firstForage: false, supercolony: null, pendingDiplomacy: 0, deeds: { 'beat:termite': 3 },
    },
    colonies: COLONIES,
    colony: { ...COLONIES[0], units: {}, chambers: {}, resources: { foliage: 0, protein: 0, nectar: 0 } } as unknown as ServerState['colony'],
    missions: live.filter((p) => !incoming(p)).map((p) => missionRow(p, now)),
    incoming: live.filter(incoming).map(incomingRow),
  };
}

/** A short string that changes whenever a party starts, finishes or changes phase (when the yard must redraw). */
export function phaseKey(parties: Party[], now: number) {
  return parties.map((p) => `${p.id}${statusOf(p, now)[0]}`).join(',');
}

// ---------- the map: what lives on each patch
const colonySpot = (spot: number, c: Record<string, unknown>): Spot => ({
  spot, corpses: 0,
  colony: { known: 'known', kind: 'player', smelledAt: null, discoveredAt: 0, id: null, owner: null, name: '', ...c } as Spot['colony'],
});
const wildSpot = (spot: number, c: Record<string, unknown>): Spot => colonySpot(spot, { kind: 'wild', ...c });

export function spotsFor(region: number, patch: number): Spot[] {
  if (region !== 1) return [];
  const windfall = (kind: string) => ({
    kind, text: 'A test windfall', left: { protein: 900 }, pile: { protein: 1200 }, endsAt: Date.now() + 864e5, held: false, guarded: false,
    holderName: null, yours: false, deliverEveryHours: 2,
  });
  if (patch === 45)
    return [
      colonySpot(6, { known: 'mine', id: 1, name: 'Test Colony', owner: 'tester', mine: true, points: 120 }),
      colonySpot(2, { id: 9, name: 'Rival Hill', owner: 'Rival', points: 300 }),
      wildSpot(WILDS_SPOT + 1, { name: 'Wild nest', wild: { species: 'Wood ants', kind: 'nest', level: 2, style: '' } }),
      wildSpot(WILDS_SPOT + 2, { name: 'Termite mound', wild: { species: 'Termites', kind: 'mound', level: 2, style: '' } }),
      wildSpot(WILDS_SPOT + 3, {
        name: 'Aphid herd',
        herd: { level: 3, nectarPerHour: 35, storeCap: 420, style: '', tended: false, tenderName: null, yours: false },
      }),
      wildSpot(WILDS_SPOT + 4, { name: 'Grasshopper', windfall: windfall('grasshopper') }),
    ];
  if (patch === 46)
    return [
      colonySpot(3, { known: 'mine', id: 2, name: 'Second Colony', owner: 'tester', mine: true, points: 40 }),
      wildSpot(WILDS_SPOT + 1, { name: 'Spider den', wild: { species: 'Trapdoor spider', kind: 'den', level: 1, style: '' } }),
      wildSpot(WILDS_SPOT + 2, { name: 'Fallen fig', windfall: windfall('fig') }),
      wildSpot(WILDS_SPOT + 3, { name: 'Leafy branch', windfall: windfall('branch') }),
    ];
  if (patch === 44)
    return [
      colonySpot(5, { id: 10, name: 'Rival Outpost', owner: 'Rival', points: 200 }),
      // every other windfall kind, so each one's model can be checked
      wildSpot(WILDS_SPOT + 1, { name: 'Dead beetle', windfall: windfall('beetle') }),
      wildSpot(WILDS_SPOT + 2, { name: 'Sugar spill', windfall: windfall('sugar') }),
      wildSpot(WILDS_SPOT + 3, { name: 'Picnic crumbs', windfall: windfall('picnic') }),
      wildSpot(WILDS_SPOT + 4, { name: 'Dead lizard', windfall: { ...windfall('lizard'), held: true, holderName: 'Wild nest' } }),
    ];
  return [];
}

/** Region 1's patches with something on them (the yard's borders and banners). */
export const REGION_PATCHES = [
  { patch: 44, colonies: 1, wild: true, mine: false },
  { patch: 45, colonies: 2, wild: true, mine: true },
  { patch: 46, colonies: 1, wild: true, mine: true },
];

/** A battle report for the replay button: the shape planBattle reads. */
export function fakeBattle(target: Coords, origin: Coords, size: number, seed: number) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const a0 = size, d0 = Math.round(size * (0.6 + rnd() * 0.8));
  const rounds: { attackerRemaining: number; defenderRemaining: number }[] = [];
  let a = a0, d = d0;
  for (let r = 0; r < 5 && a > 0 && d > 0; r++) {
    a = Math.max(0, Math.round(a - d * (0.15 + rnd() * 0.2)));
    d = Math.max(0, Math.round(d - a0 * (0.15 + rnd() * 0.25)));
    rounds.push({ attackerRemaining: a, defenderRemaining: d });
  }
  return {
    perspective: 'attacker', target, rounds, winner: d === 0 ? 'attacker' : a === 0 ? 'defender' : 'draw',
    attacker: { name: 'tester', origin, units: { minor_soldier: Math.round(a0 * 0.7), worker: Math.round(a0 * 0.3) } },
    defender: { name: 'Wild nest', wild: true, units: { worker: Math.round(d0 * 0.5), minor_soldier: Math.round(d0 * 0.5) } },
  };
}
