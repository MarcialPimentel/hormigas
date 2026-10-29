// The map: regions as a grid of patches, each patch drawn with its colonies as mounds (docs/11-world.md, "Map screen").
import { useEffect, useState, type ReactNode } from 'react';
import { WORLD, WILDS_SPOT, TERRAIN, CHAMBERS, CASTES, DEFENSES, terrainForSpot, type TerrainId } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtAgo, fmtCoords, fmtDuration, fmtNum } from '../format';
import { Panel, Trip } from '../components/ui';
import { ENABLED_MISSIONS, MISSION_LABEL, type MissionType, type Nav } from '../nav';

const can = (t: MissionType) => ENABLED_MISSIONS.includes(t);

interface Spot {
  spot: number;
  colony: null | {
    id: number; name: string; owner: string; points: number; mine: boolean; inactive: boolean; protected: boolean;
    /** set for wild nests (docs/17-wild-nests.md) */
    wild?: { species: string; level: number; style: string };
  };
  corpses: number;
}

interface RegionPatch { patch: number; colonies: number; wild: boolean; mine: boolean }

type Coords = { region: number; patch: number; spot: number };
const same = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;

const regionName = (r: number) => WORLD.regionNames[r - 1] ?? `Region ${r}`;

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
          Your {(MISSION_LABEL[m.type as MissionType] ?? m.type).toLowerCase()} party {out ? `arrives ${inT(m.arriveAt)}` : `is heading home, back ${inT(m.returnAt)}`}
        </span>
      </li>,
    );
  }
  for (const i of theirs) {
    const toHere = same(at, home);
    const what = i.type === 'swarm' ? 'Army ant swarm' : i.type === 'raid' ? 'Raid' : i.type === 'scout' ? 'Scouts' : 'Delivery';
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
const W = 600;
const H = 240;
const GROUND = 64;
const SPOT_W = 45; // spots 1..12 share 0..540, the wilds take the rest
const spotX = (n: number) => (n === WILDS_SPOT ? 570 : (n - 0.5) * SPOT_W);
const BAND: Record<TerrainId, { fill: string; ink: string }> = {
  sunny_meadow: { fill: '#B9C95A', ink: '#2B1D13' },
  sandy_soil: { fill: '#D9C08A', ink: '#2B1D13' },
  grassland: { fill: '#6F9A3E', ink: '#F6F7F0' },
  rotting_log: { fill: '#5E4630', ink: '#F6F7F0' },
  creek_bank: { fill: '#8FB3A6', ink: '#2B1D13' },
};
const FLAG = { mine: '#E8B23A', wild: '#C4473A', other: '#C98B52', inactive: '#9A9184' };
const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function Ground({ seed }: { seed: number }) {
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

function SpotMark({ s, at, home, selected, onPick }: { s: Spot; at: Coords; home: Coords; selected: boolean; onPick: () => void }) {
  const x = spotX(s.spot);
  const y = 172;
  const c = s.colony;
  const wilds = s.spot === WILDS_SPOT;
  const { ours, theirs } = useMovements(at, home);
  const hostile = theirs.some((i: any) => i.hostile);
  const label = wilds
    ? 'The wilds'
    : c
    ? `Spot ${s.spot}: ${c.name}, ${c.mine ? 'your colony' : c.wild ? `wild nest level ${c.wild.level}` : c.owner}`
    : `Spot ${s.spot}: empty ${TERRAIN[terrainForSpot(s.spot)].name.toLowerCase()}`;
  const flag = c ? (c.mine ? FLAG.mine : c.wild ? FLAG.wild : c.inactive ? FLAG.inactive : FLAG.other) : '';
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
      <rect x={x - SPOT_W / 2} y={GROUND + 20} width={wilds ? 60 : SPOT_W} height={H - GROUND - 20} fill="transparent" />
      {selected && <ellipse cx={x} cy={y} rx={22} ry={12} fill="none" stroke="#F6F7F0" strokeWidth={2.5} />}
      {c ? (
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
      <text x={x} y={H - 6} textAnchor="middle" className="ps-num">{wilds ? '' : s.spot}</text>
    </g>
  );
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

function SpotCard({ s, at, nav }: { s: Spot; at: Coords; nav: Nav }) {
  const { colony, state } = useGame();
  if (!colony || !state) return null;
  const canFound = (state.player.research.nuptial_flight ?? 0) > 0;
  const c = s.colony;
  const wilds = s.spot === WILDS_SPOT;
  const terrain = wilds ? null : TERRAIN[terrainForSpot(s.spot)];
  const go = (type: MissionType) => nav('missions', { type, target: at });
  return (
    <div className={`spot-card${c?.mine ? ' mine' : ''}${c?.wild ? ' wild-nest' : ''}${wilds ? ' wilds' : ''}`}>
      <div className="spot-card-head">
        <div>
          {wilds ? (
            <>
              <strong>The wilds</strong>
              <span className="muted small">Unclaimed ground at the edge of the patch. Send foragers here, or Scouts to see what's out there.</span>
            </>
          ) : c?.wild ? (
            <>
              <strong>
                {c.name} <span className="wild-tag">Wild nest · Level {c.wild.level}</span>
              </strong>
              <span className="muted small">{c.owner}. {c.wild.style}</span>
            </>
          ) : c ? (
            <>
              <strong>{c.name}</strong>
              <span className="muted small">
                {c.mine ? 'Your colony' : c.owner} · {fmtNum(c.points)} pts
                {c.protected && ' · protected'}
                {c.inactive && ' · inactive'}
              </span>
            </>
          ) : (
            <>
              <strong>Spot {s.spot}</strong>
              <span className="muted small">Empty {terrain?.name.toLowerCase()}. Nobody lives here yet.</span>
              {terrain && <span className="muted small">{terrainSummary(terrain)}</span>}
              {!canFound && <span className="muted small">A Winged Queen could found a colony here. Research Nuptial Flight to raise one.</span>}
            </>
          )}
          <span className="muted small coords">{fmtCoords(at)}{terrain && c ? ` · ${terrain.name}` : ''}</span>
        </div>
        <div className="spot-actions">
          {wilds && can('forage') && <button className="btn small" onClick={() => go('forage')}>Forage</button>}
          {wilds && <button className="btn ghost small" onClick={() => go('scout')}>Scout</button>}
          {s.corpses > 0 && can('haul') && <button className="btn small" onClick={() => go('haul')}>Haul</button>}
          {c && !c.mine && (
            <>
              <button className="btn small" onClick={() => go('scout')}>Scout</button>
              {can('raid') && <button className="btn small" onClick={() => go('raid')}>Raid</button>}
              {!c.wild && <button className="btn ghost small" onClick={() => go('transport')}>Send</button>}
            </>
          )}
          {c?.mine && c.id !== colony.id && <button className="btn small" onClick={() => go('relocate')}>Relocate</button>}
          {!c && !wilds && canFound && can('colonize') && <button className="btn small" onClick={() => go('colonize')}>Found colony</button>}
        </div>
      </div>
      {s.corpses > 0 && <span className="corpses">{fmtNum(s.corpses)} protein in corpses</span>}
      {c && !c.mine && <ScoutView at={at} />}
      <Movements at={at} home={colony.coords} />
    </div>
  );
}

/* ---------- the screen ---------- */

export function MapScreen({ nav, start }: { nav: Nav; start?: { region: number; patch: number } }) {
  const { colony, state } = useGame();
  const [region, setRegion] = useState(start?.region ?? colony?.coords.region ?? 1);
  const [patch, setPatch] = useState(start?.patch ?? colony?.coords.patch ?? 1);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [overview, setOverview] = useState<RegionPatch[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [jumping, setJumping] = useState(false);

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

  useEffect(() => {
    let live = true;
    setOverview(null);
    api
      .get(`/api/map/region?region=${region}`)
      .then((r) => live && setOverview(r.patches))
      .catch(() => live && setOverview([]));
    return () => {
      live = false;
    };
  }, [region]);

  if (!colony) return null;
  const go = (r: number, p: number) => {
    if (r === region && p === patch) return;
    setSpots(null);
    setSel(null);
    setRegion(r);
    setPatch(p);
  };
  const nearest = (dir: 1 | -1) => {
    setJumping(true);
    api
      .get(`/api/map/nearest?region=${region}&patch=${patch}&dir=${dir}`)
      .then((r) => (r.found ? (go(r.found.region, r.found.patch), setError('')) : setError('No other colonies anywhere yet.')))
      .catch((e) => setError(e.message))
      .finally(() => setJumping(false));
  };
  const here = colony.coords.region === region && colony.coords.patch === patch;
  const byPatch = new Map((overview ?? []).map((p) => [p.patch, p]));
  const fallback = spots?.find((s) => s.colony?.mine) ?? spots?.find((s) => s.colony && !s.colony.wild) ?? spots?.find((s) => s.colony);
  const picked = spots?.find((s) => s.spot === sel) ?? fallback ?? spots?.find((s) => s.spot === WILDS_SPOT);
  const others = (spots ?? []).filter((s) => s.colony && !s.colony.wild && !s.colony.mine).length;

  return (
    <div className="stack">
      <Panel title="Map">
        <div className="region-tabs" role="tablist" aria-label="Regions">
          {Array.from({ length: WORLD.regions }, (_, i) => i + 1).map((r) => (
            <button key={r} role="tab" aria-selected={r === region} className={`region-tab${r === region ? ' on' : ''}`} onClick={() => go(r, r === colony.coords.region ? colony.coords.patch : 1)}>
              <span className="region-num">{r}</span> {regionName(r)}
              {r === colony.coords.region && <span className="region-home" title="Your colony is here"> ●</span>}
            </button>
          ))}
        </div>
        <div className="region-view">
          <div className="region-grid" aria-label={`Patches of ${regionName(region)}`}>
            {Array.from({ length: WORLD.patchesPerRegion }, (_, i) => i + 1).map((p) => {
              const o = byPatch.get(p);
              const mine = !!o?.mine;
              const lived = (o?.colonies ?? 0) > 0;
              const desc = mine ? 'your colony' : lived ? `${o!.colonies} ${o!.colonies === 1 ? 'colony' : 'colonies'}` : 'empty';
              return (
                <button
                  key={p}
                  className={`rg-cell${lived ? ' lived' : ''}${mine ? ' mine' : ''}${p === patch ? ' on' : ''}`}
                  onClick={() => go(region, p)}
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
            <span><i className="rg-cell on" /> shown below</span>
            <p>Tap a patch to go there. The grid shows where colonies are, not who or how strong.</p>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
      </Panel>

      <Panel
        title={`${regionName(region)} · Patch ${patch}`}
        actions={
          !here && (
            <button className="btn ghost small" onClick={() => go(colony.coords.region, colony.coords.patch)}>
              Back to my patch
            </button>
          )
        }
      >
        <div className="patch-row">
          <button className="btn ghost nearest" onClick={() => nearest(-1)} disabled={jumping} aria-label="Jump to the nearest colony before this patch">
            <span aria-hidden="true">‹</span>
            <small>Nearest colony</small>
          </button>
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
          <button className="btn ghost nearest" onClick={() => nearest(1)} disabled={jumping} aria-label="Jump to the nearest colony after this patch">
            <span aria-hidden="true">›</span>
            <small>Nearest colony</small>
          </button>
        </div>
        {spots && picked && <SpotCard s={picked} at={{ region, patch, spot: picked.spot }} nav={nav} />}
        <p className="muted small">
          {spots && (others === 0 ? 'No other players in this patch. ' : `${others} other ${others === 1 ? 'player' : 'players'} in this patch. `)}
          You are at {fmtCoords(colony.coords)} in {regionName(colony.coords.region)}. Neighbors in your patch are the closest friends, and threats. Every patch with colonies also has a wild nest.
        </p>
      </Panel>
    </div>
  );
}
