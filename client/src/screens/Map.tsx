import { useEffect, useState } from 'react';
import { WORLD, WILDS_SPOT, TERRAIN, terrainForSpot } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtCoords, fmtNum } from '../format';
import { Panel } from '../components/ui';
import { ENABLED_MISSIONS, type MissionType, type Nav } from '../nav';

const can = (t: MissionType) => ENABLED_MISSIONS.includes(t);

interface Spot {
  spot: number;
  colony: null | { id: number; name: string; owner: string; points: number; mine: boolean; inactive: boolean; protected: boolean };
  corpses: number;
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
                <li key={s.spot} className={`spot${c?.mine ? ' mine' : ''}${wilds ? ' wilds' : ''}${c?.inactive ? ' inactive' : ''}`}>
                  <span className="spot-num" title={terrain?.name}>{s.spot}</span>
                  <div className="spot-main">
                    {wilds ? (
                      <>
                        <strong>The wilds</strong>
                        <span className="muted small">Unclaimed ground at the edge of the patch. Send foragers here.</span>
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
                  </div>
                  <div className="spot-actions">
                    {wilds && can('forage') && <button className="btn small" onClick={() => nav('missions', { type: 'forage', target: coords })}>Forage</button>}
                    {s.corpses > 0 && can('haul') && <button className="btn small" onClick={() => nav('missions', { type: 'haul', target: coords })}>Haul</button>}
                    {c && !c.mine && (
                      <>
                        <button className="btn small" onClick={() => nav('missions', { type: 'scout', target: coords })}>Scout</button>
                        {can('raid') && <button className="btn small" onClick={() => nav('missions', { type: 'raid', target: coords })}>Raid</button>}
                        <button className="btn ghost small" onClick={() => nav('missions', { type: 'transport', target: coords })}>Send</button>
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
        <p className="muted small">You are at {fmtCoords(colony.coords)}. Neighbors in your patch are the closest friends — and threats.</p>
      </Panel>
    </div>
  );
}
