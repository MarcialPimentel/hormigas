// A patch drawn as ground with its colonies, scents and the wilds, plus the world picker (docs/11-world.md, docs/22-discovery.md).
// The wilds also hold wild sites: aphid herds, termite mounds and spider dens (docs/24-npcs.md).
// Used by the Missions screen: tap a spot, then scout, raid, send or forage from its card.
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import {
  WORLD, WILDS_SPOT, TERRAIN, CHAMBERS, CASTES, DEFENSES, DISCOVERY_MESSAGES, WILD_SCENTS, HERDS, foundColonyBlocker, isSiteSpot, raidBlockMessage, terrainForSpot,
  type Knowledge, type Relation, type ScentHint, type ScentKind, type TerrainId,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtAgo, fmtCoords, fmtDuration, fmtNum } from '../format';
import { Trip } from './ui';
import { ENABLED_MISSIONS, MISSION_LABEL, type MissionType } from '../nav';

const can = (t: MissionType) => ENABLED_MISSIONS.includes(t);

// The 3D Patch on computers, the drawn patch on phones; either can be switched to the other, saved per browser.
const Patch3D = lazy(() => import('./patch3d/Patch3D').then((m) => ({ default: m.Patch3D })));
const VIEW_KEY = 'hormigas.patch';
type PatchMode = '3d' | '2d';
const finePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
function savedMode(): PatchMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === '3d' || v === '2d') return v;
  } catch {
    /* no storage: use the default */
  }
  return finePointer() && window.innerWidth >= 760 ? '3d' : '2d';
}

/** A colony as this player knows it. Scents carry only `known`, `kind` and a generic name; familiar scents add the name. */
export interface SpotColony {
  known: Knowledge;
  kind: ScentKind;
  name: string;
  owner: string | null;
  smelledAt: number | null;
  discoveredAt: number | null;
  id: number | null;
  points?: number;
  mine?: boolean;
  inactive?: boolean;
  protected?: boolean;
  /** for wild things, what the scent hints at: an ant nest, aphids, termites or a spider (docs/24-npcs.md) */
  hint?: ScentHint;
  /** set for known wild nests, termite mounds and spider dens (docs/17-wild-nests.md, docs/24-npcs.md) */
  wild?: { species: string; kind?: 'nest' | 'mound' | 'den'; level: number; style: string };
  /** set for known aphid herds (docs/24-npcs.md); tenders and honeydew only when they're yours */
  herd?: {
    level: number; nectarPerHour: number; storeCap: number; style: string; tended: boolean; tenderName: string | null; yours: boolean;
    tenders?: Record<string, number>; honeydew?: number; tenderColonyId?: number; since?: number;
  };
  /** a truce or shared supercolony scent with its owner (docs/23-supercolonies.md) */
  relation?: Relation;
  /** when a fading scent or an ending truce runs out */
  relationUntil?: number | null;
  /** the owner's supercolony */
  supercolony?: string;
}

/** "Wild nest · Level 3", "Termite mound · Tier 2", "Boss · Tier 1" */
export function wildTag(c: SpotColony): string {
  if (c.herd) return `Aphid herd · ${c.herd.tended ? (c.herd.yours ? 'yours' : 'tended') : 'untended'}`;
  if (!c.wild) return '';
  if (c.wild.kind === 'mound') return `Termite mound · Tier ${c.wild.level}`;
  if (c.wild.kind === 'den') return `Boss · Tier ${c.wild.level}`;
  return `Wild nest · Level ${c.wild.level}`;
}

/** "Truce", "Ally", "Scent fading (2 h)": the pact with a colony's owner, for its card. */
export function relationLabel(c: SpotColony, now: number): string | null {
  const left = c.relationUntil ? ` · ${fmtDuration(Math.max(0, c.relationUntil - now))} left` : '';
  switch (c.relation) {
    case 'ally': return 'Supercolony mate';
    case 'fading': return `Shared scent fading${left}`;
    case 'truce': return 'Truce';
    case 'truce_ending': return `Truce ending${left}`;
    default: return null;
  }
}

export interface Spot {
  spot: number;
  colony: SpotColony | null;
  corpses: number;
}

export const isScent = (c: SpotColony | null | undefined) => !!c && (c.known === 'scent' || c.known === 'familiar');

interface RegionPatch { patch: number; colonies: number; wild: boolean; mine: boolean }

export type Coords = { region: number; patch: number; spot: number };
const same = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;

export const regionName = (r: number) => WORLD.regionNames[r - 1] ?? `Region ${r}`;

/** Parties moving to or from one spot: ours heading there or back, and anyone heading from there to us. */
function useMovements(at: Coords, home: Coords) {
  const { state, colony } = useGame();
  const ours = (state?.missions ?? []).filter((m: any) => same(m.target, at));
  const theirs = (state?.incoming ?? []).filter((i: any) => same(i.origin, at) || (same(at, home) && i.targetColonyId === colony?.id));
  return { ours, theirs };
}

function Movements({ at, home }: { at: Coords; home: Coords }) {
  const { now } = useGame();
  const { ours, theirs } = useMovements(at, home);
  const rows: ReactNode[] = [];
  const inT = (t: number) => (t - now > 0 ? `in ${fmtDuration(t - now)}` : 'now');
  for (const m of ours) {
    const out = m.status === 'outbound';
    rows.push(
      <li key={`m${m.id}`}>
        <Trip departAt={m.departAt} arriveAt={m.arriveAt} returnAt={m.returnAt} status={m.status} cargo={m.cargo} />
        <span>
          {m.status === 'holding'
            ? 'Your soldiers are holding position here'
            : `Your ${(MISSION_LABEL[m.type as MissionType] ?? m.type).toLowerCase()} party ${out ? `arrives ${inT(m.arriveAt)}` : `is heading home, back ${inT(m.returnAt)}`}`}
        </span>
      </li>,
    );
  }
  for (const i of theirs) {
    const toHere = same(at, home);
    const what = i.type === 'swarm' ? 'Army ant swarm' : i.type === 'raid' ? 'Raid' : i.type === 'scout' ? 'Scouts' : i.type === 'hold' ? 'Allied soldiers' : 'Delivery';
    rows.push(
      <li key={`i${i.id}`} className={i.hostile ? 'danger' : ''}>
        <Trip departAt={i.departAt} arriveAt={i.arriveAt} status="outbound" incoming hostile={i.hostile} />
        <span>{toHere ? `${what} from ${i.from} arrives ${inT(i.arriveAt)}` : `${what} heading to your colony, arrives ${inT(i.arriveAt)}`}</span>
      </li>,
    );
  }
  if (rows.length === 0) return null;
  return <ul className="spot-moves">{rows}</ul>;
}

/* ---------- the patch, drawn ---------- */

// In-world colours: literal, the same in both themes (like the nest).
export const W = 690;
export const H = 240;
const GROUND = 64;
const SPOT_W = 45; // spots 1..12 share 0..540, the wilds take the rest: the wilds (13) and its wild sites (14+)
const spotX = (n: number) => (n === WILDS_SPOT ? 562 : n > WILDS_SPOT ? 562 + (n - WILDS_SPOT) * 38 : (n - 0.5) * SPOT_W);
const BAND: Record<TerrainId, { fill: string; ink: string }> = {
  sunny_meadow: { fill: '#B9C95A', ink: '#2B1D13' },
  sandy_soil: { fill: '#D9C08A', ink: '#2B1D13' },
  grassland: { fill: '#6F9A3E', ink: '#F6F7F0' },
  rotting_log: { fill: '#5E4630', ink: '#F6F7F0' },
  creek_bank: { fill: '#8FB3A6', ink: '#2B1D13' },
};
const FLAG = { mine: '#E8B23A', wild: '#C4473A', other: '#C98B52', inactive: '#9A9184' };
/** Scent plume colours for wild things: sharp ants red, sweet aphids green-gold, woody termites brown, a spider's danger violet. */
const HINT_COLOR: Record<ScentHint, string> = { nest: '#C4473A', herd: '#B9D25A', mound: '#B07A44', den: '#9B5BD0' };
const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function Ground({ seed }: { seed: number }) {
  const bands: ReactNode[] = [];
  const bits: ReactNode[] = [];
  const r = rng(seed);
  (Object.keys(TERRAIN) as TerrainId[]).forEach((t) => {
    const spots = TERRAIN[t].spots;
    const x0 = (Math.min(...spots) - 1) * SPOT_W;
    const x1 = Math.max(...spots) * SPOT_W;
    const b = BAND[t];
    bands.push(<rect key={t} x={x0} y={GROUND} width={x1 - x0} height={H - GROUND} fill={b.fill} />);
    bands.push(
      <text key={`${t}-l`} x={x0 + 6} y={GROUND + 14} className="ps-terrain" fill={b.ink}>
        {TERRAIN[t].name}
      </text>,
    );
    for (let i = 0; i < 14; i++) {
      const x = x0 + 4 + r() * (x1 - x0 - 8);
      const y = GROUND + 24 + r() * (H - GROUND - 34);
      if (t === 'sunny_meadow') bits.push(<circle key={`${t}${i}`} cx={x} cy={y} r={1.8} fill={i % 3 ? '#F2D35A' : '#F6F7F0'} />);
      else if (t === 'sandy_soil') bits.push(<circle key={`${t}${i}`} cx={x} cy={y} r={1.2} fill="#B59A66" />);
      else if (t === 'grassland') bits.push(<path key={`${t}${i}`} d={`M${x} ${y} l-2 -6 M${x} ${y} l0 -7 M${x} ${y} l2 -6`} stroke="#557A2C" strokeWidth={1.2} />);
      else if (t === 'creek_bank' && i < 6) bits.push(<path key={`${t}${i}`} d={`M${x - 6} ${y} q3 -3 6 0 t6 0`} stroke="#5E8FA8" strokeWidth={1.5} fill="none" />);
    }
    if (t === 'rotting_log') {
      bits.push(<rect key="log" x={x0 + 6} y={GROUND + 26} width={x1 - x0 - 12} height={20} rx={10} fill="#8A6440" />);
      bits.push(<ellipse key="log-end" cx={x1 - 12} cy={GROUND + 36} rx={6} ry={10} fill="#C9A274" />);
    }
    if (t === 'creek_bank') bits.push(<path key="creek" d={`M${x0} ${GROUND + 40} q${(x1 - x0) / 4} -10 ${(x1 - x0) / 2} 0 t${(x1 - x0) / 2} 0 v14 q${-(x1 - x0) / 4} 8 ${-(x1 - x0) / 2} 0 t${-(x1 - x0) / 2} 0z`} fill="#5E8FA8" />);
  });
  const wx = 12 * SPOT_W;
  return (
    <>
      <rect width={W} height={GROUND} fill="#A9CFE0" />
      {bands}
      <rect x={wx} y={GROUND} width={W - wx} height={H - GROUND} fill="#4E6B34" />
      <line x1={wx} y1={GROUND} x2={wx} y2={H} stroke="#2B1D13" strokeDasharray="4 4" strokeOpacity={0.5} />
      <text x={wx + 6} y={GROUND + 14} className="ps-terrain" fill="#F6F7F0">The wilds</text>
      {bits}
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={`w${i}`} d={`M${wx + 10 + i * 11} ${H - 30 - (i % 2) * 40} l-4 -14 l4 4 l4 -4z`} fill="#3C5528" />
      ))}
    </>
  );
}

export function SpotMark({ s, at, home, selected, onPick }: { s: Spot; at: Coords; home: Coords; selected: boolean; onPick: () => void }) {
  const x = spotX(s.spot);
  const y = 172;
  const c = s.colony;
  const wilds = s.spot === WILDS_SPOT;
  const { ours, theirs } = useMovements(at, home);
  const hostile = theirs.some((i: any) => i.hostile);
  const scent = isScent(c);
  const site = isSiteSpot(s.spot);
  const label = wilds
    ? 'The wilds'
    : c && scent
    ? `${site ? 'In the wilds' : `Spot ${s.spot}`}: ${c.known === 'familiar' ? `${c.name}, a scent you've smelled before` : c.name}, not scouted`
    : c
    ? `${site ? 'In the wilds' : `Spot ${s.spot}`}: ${c.name}, ${c.mine ? 'your colony' : c.wild || c.herd ? wildTag(c).toLowerCase() : c.owner}`
    : `Spot ${s.spot}: empty ${TERRAIN[terrainForSpot(s.spot)].name.toLowerCase()}`;
  const flag = c ? (c.mine ? FLAG.mine : c.kind === 'wild' ? (c.hint ? HINT_COLOR[c.hint] : FLAG.wild) : c.inactive ? FLAG.inactive : FLAG.other) : '';
  const labelY = s.spot % 2 ? 126 : 206;
  return (
    <g
      className={`ps-spot${selected ? ' selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={onPick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
    >
      <title>{label}</title>
      <rect x={x - (site ? 19 : wilds ? 22 : SPOT_W / 2)} y={GROUND + 20} width={site ? 38 : wilds ? 44 : SPOT_W} height={H - GROUND - 20} fill="transparent" />
      {selected && <ellipse cx={x} cy={y} rx={22} ry={12} fill="none" stroke="#F6F7F0" strokeWidth={2.5} />}
      {c && scent ? (
        <>
          <ellipse cx={x} cy={y + 2} rx={14} ry={5} fill={flag} opacity={0.3} />
          {[-7, 0, 7].map((dx, i) => (
            <path key={dx} d={`M${x + dx} ${y - 4} q-6 -9 0 -18 t0 -18${i === 1 ? ' t0 -12' : ''}`} stroke={flag} strokeWidth={2.6} fill="none" strokeLinecap="round" className="ps-scent" />
          ))}
          <text x={x} y={labelY} textAnchor="middle" className="ps-name">{site ? short(c.name.replace(/ scent$/, ''), 9) : short(c.name)}</text>
        </>
      ) : c && site ? (
        <>
          <WildSite c={c} x={x} y={y} />
          <text x={x} y={labelY} textAnchor="middle" className="ps-name">{short(c.herd ? 'Aphids' : c.wild?.kind === 'den' ? 'Spider' : c.wild?.kind === 'mound' ? 'Termites' : c.name, 9)}</text>
        </>
      ) : c ? (
        <>
          <ellipse cx={x} cy={y} rx={16} ry={8} fill="#4A3726" />
          <ellipse cx={x} cy={y - 3} rx={5} ry={2.6} fill="#1C140E" />
          <line x1={x} y1={y - 7} x2={x} y2={y - 38} stroke="#2B1D13" strokeWidth={1.5} />
          <path d={`M${x} ${y - 38} h13 l-3 5 l3 5 h-13z`} fill={flag} stroke="#2B1D13" strokeWidth={0.8} />
          <text x={x} y={labelY} textAnchor="middle" className="ps-name">{short(c.name)}</text>
        </>
      ) : wilds ? (
        <circle cx={x} cy={y} r={6} fill="none" stroke="#F6F7F0" strokeDasharray="2 2" />
      ) : (
        <circle cx={x} cy={y} r={4} fill="none" stroke="#2B1D13" strokeOpacity={0.45} />
      )}
      {s.corpses > 0 && [0, 1, 2].map((i) => <circle key={i} cx={x - 12 + i * 4} cy={y + 12 - (i % 2) * 2} r={2} fill="#D06A6A" />)}
      {(ours.length > 0 || theirs.length > 0) && (
        <circle cx={x + 14} cy={y - 14} r={4} fill={hostile ? '#C4473A' : '#E8B23A'} stroke="#2B1D13" strokeWidth={0.8} className="ps-moving" />
      )}
      <text x={x} y={H - 6} textAnchor="middle" className="ps-num">{wilds || site ? '' : s.spot}</text>
    </g>
  );
}

/** A known wild site, drawn: aphids on a stem, a termite mound, or a silk-lidded burrow. */
function WildSite({ c, x, y }: { c: SpotColony; x: number; y: number }) {
  if (c.herd) {
    const tended = c.herd.tended;
    return (
      <>
        <path d={`M${x} ${y + 4} C${x - 2} ${y - 14} ${x + 4} ${y - 26} ${x + 1} ${y - 40}`} stroke="#5E8A2E" strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d={`M${x + 1} ${y - 26} q9 -6 13 -2 q-6 4 -13 2z`} fill="#7DB043" />
        {[[-3, -14], [2, -20], [-1, -28], [3, -33]].map(([dx, dy], i) => (
          <ellipse key={i} cx={x + dx} cy={y + dy} rx={3.4} ry={2.4} fill="#B9D25A" stroke="#2B1D13" strokeWidth={0.7} />
        ))}
        <circle cx={x - 6} cy={y - 4} r={1.8} fill="#F2C94C" />
        {tended && <circle cx={x + 8} cy={y - 2} r={3} fill={c.herd.yours ? FLAG.mine : FLAG.other} stroke="#2B1D13" strokeWidth={0.8} />}
      </>
    );
  }
  if (c.wild?.kind === 'mound')
    return (
      <>
        <path d={`M${x - 15} ${y + 4} L${x - 6} ${y - 40} Q${x - 2} ${y - 48} ${x + 2} ${y - 38} L${x + 6} ${y - 26} L${x + 9} ${y - 32} L${x + 15} ${y + 4}Z`} fill="#A47E55" stroke="#2B1D13" strokeWidth={1.2} />
        <path d={`M${x - 8} ${y - 6} h6 M${x - 2} ${y - 20} h5 M${x + 4} ${y - 10} h5`} stroke="#6E5236" strokeWidth={1.4} />
      </>
    );
  if (c.wild?.kind === 'den')
    return (
      <>
        <ellipse cx={x} cy={y} rx={14} ry={6} fill="#1C140E" />
        <path d={`M${x - 14} ${y} L${x + 4} ${y - 16} L${x + 9} ${y - 12} L${x - 8} ${y + 2}Z`} fill="#7A5C40" stroke="#2B1D13" strokeWidth={1} />
        {[-16, -8, 8, 16].map((dx) => <path key={dx} d={`M${x} ${y} L${x + dx} ${y + 8}`} stroke="#E8E2D6" strokeWidth={0.7} opacity={0.8} />)}
      </>
    );
  return <ellipse cx={x} cy={y} rx={12} ry={6} fill="#4A3726" />;
}

/* ---------- a spot's card ---------- */

interface Intel { reportId: number; at: number; data: any }

const total = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + (b ?? 0), 0);

/** What your latest scout report says about a colony. The map shows only the mound; inside takes a scout. */
function ScoutView({ at }: { at: Coords }) {
  const { now } = useGame();
  const [intel, setIntel] = useState<Intel | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setIntel(undefined);
    api
      .get(`/api/intel?region=${at.region}&patch=${at.patch}&spot=${at.spot}`)
      .then((r) => live && setIntel(r.intel))
      .catch(() => live && setIntel(null));
    return () => {
      live = false;
    };
  }, [at.region, at.patch, at.spot]);

  if (intel === undefined) return <p className="muted small">Checking your scout reports…</p>;
  if (intel === null) return <p className="muted small scout-none">Only the mound shows from up here. Scout it to see inside.</p>;
  const d = intel.data;
  const tags = (o: Record<string, number> | undefined, names: Record<string, { name: string }>, lvl: boolean) =>
    Object.keys(names)
      .filter((id) => (o?.[id] ?? 0) > 0)
      .map((id) => [id, o![id]] as const)
      .map(([id, n]) => (
        <span key={id} className="intel-tag">
          {names[id]?.name ?? id} {lvl ? n : `×${fmtNum(n)}`}
        </span>
      ));
  return (
    <div className="intel">
      <p className="muted small">
        Scouted {fmtAgo(now - intel.at)} ago. Stores: {fmtNum(d.resources?.foliage ?? 0)} foliage, {fmtNum(d.resources?.protein ?? 0)} protein, {fmtNum(d.resources?.nectar ?? 0)} nectar.
      </p>
      {d.chambers && <div className="intel-tags chambers">{tags(d.chambers, CHAMBERS, true)}</div>}
      {d.units && (total(d.units) > 0 ? <div className="intel-tags">{tags(d.units, CASTES, false)}</div> : <p className="muted small">No army at home.</p>)}
      {d.defenses && total(d.defenses) > 0 && <div className="intel-tags">{tags(d.defenses, DEFENSES, false)}</div>}
      {!d.chambers && <p className="muted small">Your scouts didn't get close enough to see {d.units ? (d.defenses ? 'the chambers' : 'the defenses or chambers') : 'the army, defenses or chambers'}.</p>}
    </div>
  );
}

/** What a terrain does, for picking where to found a colony: "+20% Foliage, −10% Nectar · space 120–150". */
function terrainSummary(t: (typeof TERRAIN)[keyof typeof TERRAIN]) {
  const mods = t.mods as Record<string, number>;
  const label: Record<string, string> = { foliagePct: 'Foliage', proteinPct: 'Protein', nectarPct: 'Nectar', buildTimePct: 'build time' };
  const parts = Object.entries(mods).map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(v)}% ${label[k] ?? k}`);
  return `${parts.length ? parts.join(', ') : 'No bonuses'} · space ${t.space[0]}–${t.space[1]}`;
}

export function SpotCard({ s, at, onAct }: { s: Spot; at: Coords; onAct: (type: MissionType, at: Coords) => void }) {
  const { colony, state, now, act } = useGame();
  if (!colony || !state) return null;
  // a Winged Queen at home (or one this colony could raise), and room under the colony cap: same rules the server checks
  const flying = (state.missions ?? []).filter((m: any) => m.type === 'colonize' && m.status === 'outbound').length;
  const foundBlocker = foundColonyBlocker(colony, state.player.research, state.colonies.length + flying);
  const canFound = !foundBlocker;
  const c = s.colony;
  const wilds = s.spot === WILDS_SPOT;
  const terrain = wilds ? null : TERRAIN[terrainForSpot(s.spot)];
  const go = (type: MissionType) => onAct(type, at);
  const scent = isScent(c);
  const wildKind = c?.kind === 'wild';
  const herd = c?.herd;
  const site = isSiteSpot(s.spot);
  const pact = c && !scent && c.relation ? raidBlockMessage({ relation: c.relation, until: c.relationUntil ?? undefined }) : null;
  const pactLabel = c ? relationLabel(c, now) : null;
  return (
    <div className={`spot-card${c?.mine ? ' mine' : ''}${wildKind ? ' wild-nest' : c && !c.mine ? ' player' : ''}${scent ? ' scent' : ''}${wilds ? ' wilds' : ''}`}>
      <div className="spot-card-head">
        <div>
          {wilds ? (
            <>
              <strong>The wilds</strong>
              <span className="muted small">Unclaimed ground at the edge of the patch. Send foragers here, or Scouts to see what's out there.</span>
            </>
          ) : c && scent ? (
            <>
              <strong>
                {c.name} <span className="scent-tag">Not scouted</span>
              </strong>
              <span className="muted small">
                {c.known === 'familiar'
                  ? `You've smelled this scent before: ${c.kind === 'wild' ? 'its ants' : `${c.owner}'s ants`} ${c.smelledAt ? `came at you ${fmtAgo(now - c.smelledAt)} ago` : 'came at you'}. Scout it to see inside.`
                  : c.kind === 'wild'
                  ? WILD_SCENTS[c.hint ?? 'nest'].text
                  : "Another player's colony, by the smell. Scout it to learn whose."}
              </span>
            </>
          ) : herd ? (
            <>
              <strong>
                {c!.name} <span className="wild-tag">{wildTag(c!)}</span>
              </strong>
              <span className="muted small">{herd.style}</span>
              <span className="small">
                Makes {fmtNum(herd.nectarPerHour)} Nectar an hour while tended
                {herd.tended ? (herd.yours ? ', and your ants tend it.' : `. ${herd.tenderName}'s ants tend it: raid them to take it.`) : '. Nobody tends it.'}
              </span>
              {herd.yours && (
                <span className="muted small">
                  Your tenders: {Object.entries(herd.tenders ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${fmtNum(n)} ${CASTES[k as keyof typeof CASTES]?.name ?? k}`).join(', ') || 'none'}.
                  {' '}Honeydew waiting: {fmtNum(herd.honeydew ?? 0)} of {fmtNum(herd.storeCap)}, carried home every {HERDS.deliverEveryHours} hours.
                </span>
              )}
            </>
          ) : c?.wild ? (
            <>
              <strong>
                {c.name} <span className="wild-tag">{wildTag(c)}</span>
              </strong>
              <span className="muted small">{c.owner}. {c.wild.style}</span>
            </>
          ) : c ? (
            <>
              <strong>{c.name}</strong>
              <span className="muted small">
                {c.mine ? 'Your colony' : c.owner} · {fmtNum(c.points ?? 0)} pts
                {c.protected && ' · protected'}
                {c.inactive && ' · inactive'}
              </span>
              {(c.supercolony || pactLabel) && (
                <span className="small pact-line">
                  {c.supercolony && <span className="sc-tag">{c.supercolony}</span>}
                  {pactLabel && !c.mine && <span className={`pact-tag ${c.relation}`}>{pactLabel}</span>}
                </span>
              )}
            </>
          ) : (
            <>
              <strong>Spot {s.spot}</strong>
              <span className="muted small">Empty {terrain?.name.toLowerCase()}. Nobody lives here yet.</span>
              {terrain && <span className="muted small">{terrainSummary(terrain)}</span>}
              {foundBlocker && <span className="muted small">{foundBlocker.short}</span>}
            </>
          )}
          <span className="muted small coords">{fmtCoords(at)}{site ? ' · the wilds' : terrain && c ? ` · ${terrain.name}` : ''}</span>
        </div>
        <div className="spot-actions">
          {wilds && can('forage') && <button className="btn small" onClick={() => go('forage')}>Forage</button>}
          {wilds && <button className="btn ghost small" onClick={() => go('scout')}>Scout</button>}
          {s.corpses > 0 && can('haul') && <button className="btn small" onClick={() => go('haul')}>Haul</button>}
          {c && !c.mine && (
            <>
              <button className={`btn small${scent ? ' primary' : ''}`} onClick={() => go('scout')}>{scent ? 'Scout' : 'Scout again'}</button>
              {can('tend') && (scent ? c.hint === 'herd' : herd && (!herd.tended || herd.yours)) && (
                <button className="btn small" disabled={scent} title={scent ? DISCOVERY_MESSAGES.tend_needs_scout : undefined} onClick={() => go('tend')}>
                  {herd?.yours ? 'Send more tenders' : 'Tend'}
                </button>
              )}
              {herd?.yours && (
                <button className="btn ghost small" onClick={() => act(() => api.post(`/api/herds/${c.id}/recall`), 'Your tenders are heading home with the honeydew.')}>
                  Call tenders home
                </button>
              )}
              {can('raid') && !(herd && (!herd.tended || herd.yours)) && (
                <button className="btn small" disabled={scent || !!pact} title={scent ? DISCOVERY_MESSAGES.raid_needs_scout : pact ?? undefined} onClick={() => go('raid')}>
                  Raid
                </button>
              )}
              {c.relation === 'ally' && can('hold') && (
                <button className="btn small primary" onClick={() => go('hold')}>
                  Hold position
                </button>
              )}
              {!wildKind && (
                <button className="btn ghost small" disabled={scent} title={scent ? DISCOVERY_MESSAGES.send_needs_scout : undefined} onClick={() => go('transport')}>
                  Send
                </button>
              )}
            </>
          )}
          {c?.mine && c.id !== colony.id && <button className="btn small" onClick={() => go('relocate')}>Relocate</button>}
          {!c && !wilds && !site && canFound && can('colonize') && <button className="btn small" onClick={() => go('colonize')}>Found colony</button>}
        </div>
      </div>
      {c && scent && <p className="why small">{c.hint === 'herd' ? DISCOVERY_MESSAGES.tend_needs_scout : DISCOVERY_MESSAGES.raid_needs_scout}</p>}
      {pact && <p className="muted small">{pact}</p>}
      {s.corpses > 0 && <span className="corpses">{fmtNum(s.corpses)} protein in corpses</span>}
      {c && !c.mine && !scent && !herd && <ScoutView at={at} />}
      <Movements at={at} home={colony.coords} />
    </div>
  );
}

/* ---------- the patch view ---------- */

/** The 5 regions as tabs, each a 10×10 grid of patches. Shows where colonies live, never who or how strong. */
function WorldPicker({ region, patch, onGo }: { region: number; patch: number; onGo: (r: number, p: number) => void }) {
  const { colony } = useGame();
  const [shown, setShown] = useState(region);
  const [overview, setOverview] = useState<RegionPatch[] | null>(null);
  useEffect(() => setShown(region), [region]);
  useEffect(() => {
    let live = true;
    setOverview(null);
    api
      .get(`/api/map/region?region=${shown}`)
      .then((r) => live && setOverview(r.patches))
      .catch(() => live && setOverview([]));
    return () => {
      live = false;
    };
  }, [shown]);
  if (!colony) return null;
  const byPatch = new Map((overview ?? []).map((p) => [p.patch, p]));
  return (
    <div className="world-picker">
      <div className="region-tabs" role="tablist" aria-label="Regions">
        {Array.from({ length: WORLD.regions }, (_, i) => i + 1).map((r) => (
          <button key={r} role="tab" aria-selected={r === shown} className={`region-tab${r === shown ? ' on' : ''}`} onClick={() => setShown(r)}>
            <span className="region-num">{r}</span> {regionName(r)}
            {r === colony.coords.region && <span className="region-home" title="Your colony is here"> ●</span>}
          </button>
        ))}
      </div>
      <div className="region-view">
        <div className="region-grid" aria-label={`Patches of ${regionName(shown)}`}>
          {Array.from({ length: WORLD.patchesPerRegion }, (_, i) => i + 1).map((p) => {
            const o = byPatch.get(p);
            const mine = !!o?.mine;
            const lived = (o?.colonies ?? 0) > 0;
            const desc = mine ? 'your colony' : lived ? `${o!.colonies} ${o!.colonies === 1 ? 'colony' : 'colonies'}` : 'empty';
            return (
              <button
                key={p}
                className={`rg-cell${lived ? ' lived' : ''}${mine ? ' mine' : ''}${shown === region && p === patch ? ' on' : ''}`}
                onClick={() => onGo(shown, p)}
                aria-label={`Patch ${p}: ${desc}`}
                title={`Patch ${p}: ${desc}`}
              />
            );
          })}
        </div>
        <div className="region-legend muted small">
          <span><i className="rg-cell" /> empty</span>
          <span><i className="rg-cell lived" /> colonies live here</span>
          <span><i className="rg-cell mine" /> your colony</span>
          <span><i className="rg-cell on" /> shown</span>
          <p>Tap a patch to see it. Colonies there show as scents until you scout them.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A patch you can look around and act from. Opens on your own patch; "World" opens the region grid to look further.
 * `selected` highlights the current mission target when it's in view.
 */
export function PatchView({ start, selected, onAct, replay }: { start?: { region: number; patch: number }; selected?: Coords; onAct: (type: MissionType, at: Coords) => void; replay?: unknown }) {
  const { colony, state } = useGame();
  const [region, setRegion] = useState(start?.region ?? colony?.coords.region ?? 1);
  const [patch, setPatch] = useState(start?.patch ?? colony?.coords.patch ?? 1);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [world, setWorld] = useState(false);
  const [error, setError] = useState('');
  const [jumping, setJumping] = useState(false);
  // a replay asks for the 3D patch, whatever the saved choice
  const [mode, setMode] = useState<PatchMode>(() => (replay && finePointer() ? '3d' : savedMode()));
  const [failed3d, setFailed3d] = useState(false);
  const choose = (m: PatchMode) => {
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* not saved; still applies until reload */
    }
    setMode(m);
  };
  const show3d = mode === '3d' && !failed3d;

  useEffect(() => {
    if (start && (start.region !== region || start.patch !== patch)) go(start.region, start.patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.region, start?.patch]);

  useEffect(() => {
    let live = true;
    api
      .get(`/api/map?region=${region}&patch=${patch}`)
      .then((r) => live && (setSpots(r.spots), setError('')))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [region, patch, state?.serverNow]);

  if (!colony) return null;
  function go(r: number, p: number) {
    if (r === region && p === patch) return;
    setSpots(null);
    setSel(null);
    setRegion(r);
    setPatch(p);
  }
  const nearest = (dir: 1 | -1) => {
    setJumping(true);
    api
      .get(`/api/map/nearest?region=${region}&patch=${patch}&dir=${dir}`)
      .then((r) => (r.found ? (go(r.found.region, r.found.patch), setError('')) : setError('No other colonies anywhere yet.')))
      .catch((e) => setError(e.message))
      .finally(() => setJumping(false));
  };
  const here = colony.coords.region === region && colony.coords.patch === patch;
  const inView = selected && selected.region === region && selected.patch === patch ? selected.spot : null;
  const fallback = spots?.find((s) => s.colony?.mine) ?? spots?.find((s) => s.colony && s.colony.kind === 'player') ?? spots?.find((s) => s.colony);
  const picked = spots?.find((s) => s.spot === (sel ?? inView)) ?? fallback ?? spots?.find((s) => s.spot === WILDS_SPOT);
  const others = (spots ?? []).filter((s) => s.colony && s.colony.kind === 'player' && !s.colony.mine).length;
  const scents = (spots ?? []).filter((s) => isScent(s.colony)).length;

  return (
    <div className="patch-view">
      <div className="patch-head">
        <h3>
          {regionName(region)} · Patch {patch}
          {here && <span className="muted small"> · your patch</span>}
        </h3>
        <div className="patch-head-actions">
          {!here && (
            <button className="btn ghost small" onClick={() => go(colony.coords.region, colony.coords.patch)}>
              Back to my patch
            </button>
          )}
          {!failed3d && (show3d || finePointer()) && (
            <button className="btn ghost small" onClick={() => choose(show3d ? '2d' : '3d')} title={show3d ? 'Show the flat drawn patch instead' : 'Show the patch in 3D'}>
              {show3d ? '2D view' : '3D view'}
            </button>
          )}
          <button className={`btn small${world ? ' on' : ' ghost'}`} aria-expanded={world} onClick={() => setWorld(!world)}>
            World
          </button>
        </div>
      </div>
      {world && <WorldPicker region={region} patch={patch} onGo={(r, p) => go(r, p)} />}
      {error && <p className="form-error">{error}</p>}
      <div className={`patch-row${show3d ? ' p3' : ''}`}>
        <button className="btn ghost nearest" onClick={() => nearest(-1)} disabled={jumping} aria-label="Jump to the nearest colony before this patch">
          <span aria-hidden="true">‹</span>
          <small>Nearest colony</small>
        </button>
        {show3d ? (
          <Suspense fallback={<div className="patch3d loading">Sniffing out the patch…</div>}>
            <Patch3D region={region} patch={patch} spots={spots} selected={picked?.spot ?? null} onPick={setSel} onFail={() => setFailed3d(true)} replay={replay} />
          </Suspense>
        ) : (
        <div className="patch-scroll">
          <svg className="patch-scene" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Patch ${patch}, ${regionName(region)}`}>
            <Ground seed={region * 1000 + patch} />
            {spots?.map((s) => {
              const at = { region, patch, spot: s.spot };
              return <SpotMark key={s.spot} s={s} at={at} home={colony.coords} selected={picked?.spot === s.spot} onPick={() => setSel(s.spot)} />;
            })}
            {!spots && (
              <text x={W / 2} y={150} textAnchor="middle" className="ps-name">Sniffing out the patch…</text>
            )}
          </svg>
        </div>
        )}
        <button className="btn ghost nearest" onClick={() => nearest(1)} disabled={jumping} aria-label="Jump to the nearest colony after this patch">
          <span aria-hidden="true">›</span>
          <small>Nearest colony</small>
        </button>
      </div>
      {spots && picked && <SpotCard s={picked} at={{ region, patch, spot: picked.spot }} onAct={onAct} />}
      <p className="muted small">
        {spots && (others === 0 ? 'No other players in this patch. ' : `${others} other ${others === 1 ? 'player' : 'players'} in this patch. `)}
        {spots && scents > 0 && `${scents} ${scents === 1 ? 'scent' : 'scents'} not scouted yet: scout one to see who lives there before you raid it. `}
        Tap a spot to act on it.
      </p>
    </div>
  );
}
