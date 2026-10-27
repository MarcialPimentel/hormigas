import { useEffect, useState, type ReactNode } from 'react';
import { WORLD, WILDS_SPOT, TERRAIN, terrainForSpot } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtCoords, fmtDuration, fmtNum } from '../format';
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

type Coords = { region: number; patch: number; spot: number };
const same = (a: Coords, b: Coords) => a.region === b.region && a.patch === b.patch && a.spot === b.spot;

/** Parties moving to or from one spot: ours heading there or back, and anyone heading from there to us. */
function Movements({ at, home }: { at: Coords; home: Coords }) {
  const { state, colony, now } = useGame();
  const rows: ReactNode[] = [];
  const inT = (at: number) => (at - now > 0 ? `in ${fmtDuration(at - now)}` : 'now');
  for (const m of state?.missions ?? []) {
    if (!same(m.target, at)) continue;
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
  for (const i of state?.incoming ?? []) {
    const toHere = same(at, home) && i.targetColonyId === colony?.id;
    if (!same(i.origin, at) && !toHere) continue;
    const what = i.type === 'raid' ? 'Raid' : i.type === 'scout' ? 'Scouts' : 'Delivery';
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

export function MapScreen({ nav, start }: { nav: Nav; start?: { region: number; patch: number } }) {
  const { colony, state } = useGame();
  const [region, setRegion] = useState(start?.region ?? colony?.coords.region ?? 1);
  const [patch, setPatch] = useState(start?.patch ?? colony?.coords.patch ?? 1);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setSpots(null);
    api
      .get(`/api/map?region=${region}&patch=${patch}`)
      .then((r) => live && (setSpots(r.spots), setError('')))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [region, patch, state?.serverNow]);

  if (!colony) return null;
  const step = (d: number) => {
    let p = patch + d;
    let r = region;
    if (p < 1) { r = r > 1 ? r - 1 : WORLD.regions; p = WORLD.patchesPerRegion; }
    if (p > WORLD.patchesPerRegion) { r = r < WORLD.regions ? r + 1 : 1; p = 1; }
    setRegion(r);
    setPatch(p);
  };
  const clamp = (v: number, max: number) => Math.min(max, Math.max(1, Math.floor(v) || 1));
  const here = colony.coords.region === region && colony.coords.patch === patch;

  return (
    <div className="stack">
      <Panel title="Map">
        <div className="map-nav">
          <button className="btn ghost" onClick={() => step(-1)} aria-label="Previous patch">‹</button>
          <label>
            Region
            <input type="number" min={1} max={WORLD.regions} value={region} onChange={(e) => setRegion(clamp(Number(e.target.value), WORLD.regions))} />
          </label>
          <label>
            Patch
            <input type="number" min={1} max={WORLD.patchesPerRegion} value={patch} onChange={(e) => setPatch(clamp(Number(e.target.value), WORLD.patchesPerRegion))} />
          </label>
          <button className="btn ghost" onClick={() => step(1)} aria-label="Next patch">›</button>
          {!here && (
            <button className="btn ghost small" onClick={() => { setRegion(colony.coords.region); setPatch(colony.coords.patch); }}>
              Back to my patch
            </button>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
      </Panel>

      <Panel>
        {!spots ? (
          <p className="muted">Sniffing out the patch…</p>
        ) : (
          <ul className="spots">
            {spots.map((s) => {
              const coords = { region, patch, spot: s.spot };
              const wilds = s.spot === WILDS_SPOT;
              const terrain = wilds ? null : TERRAIN[terrainForSpot(s.spot)];
              const c = s.colony;
              return (
                <li key={s.spot} className={`spot${c?.mine ? ' mine' : ''}${wilds ? ' wilds' : ''}${c?.inactive ? ' inactive' : ''}${c?.wild ? ' wild-nest' : ''}`}>
                  <span className="spot-num" title={terrain?.name}>{s.spot}</span>
                  <div className="spot-main">
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
                      <span className="muted">Empty {terrain?.name.toLowerCase()}</span>
                    )}
                    {s.corpses > 0 && <span className="corpses">{fmtNum(s.corpses)} protein in corpses</span>}
                    <Movements at={coords} home={colony.coords} />
                  </div>
                  <div className="spot-actions">
                    {wilds && can('forage') && <button className="btn small" onClick={() => nav('missions', { type: 'forage', target: coords })}>Forage</button>}
                    {wilds && <button className="btn ghost small" onClick={() => nav('missions', { type: 'scout', target: coords })}>Scout</button>}
                    {s.corpses > 0 && can('haul') && <button className="btn small" onClick={() => nav('missions', { type: 'haul', target: coords })}>Haul</button>}
                    {c && !c.mine && (
                      <>
                        <button className="btn small" onClick={() => nav('missions', { type: 'scout', target: coords })}>Scout</button>
                        {can('raid') && <button className="btn small" onClick={() => nav('missions', { type: 'raid', target: coords })}>Raid</button>}
                        {!c.wild && <button className="btn ghost small" onClick={() => nav('missions', { type: 'transport', target: coords })}>Send</button>}
                      </>
                    )}
                    {c?.mine && c.id !== colony.id && (
                      <button className="btn small" onClick={() => nav('missions', { type: 'relocate', target: coords })}>Relocate</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted small">You are at {fmtCoords(colony.coords)}. Neighbors in your patch are the closest friends — and threats. Every patch with colonies also has a wild nest: scout it, raid it, and watch out for its raids.</p>
      </Panel>
    </div>
  );
}
