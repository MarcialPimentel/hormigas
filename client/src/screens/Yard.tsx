// The Whole Yard (preview, docs/art/whole-yard.md): the game on one map. Zoom from the whole yard down to ant height;
// double-click one of your mounds to dive into its nest. The buttons on the left open what used to be screens
// (Chambers, Brood Hall, Research, Missions) as panels over the map, for whichever colony you cycle to; Allies, Reports, Rankings and the
// Field Journal cover the whole player, so they open without the colony switcher.
// Computers only; it ships behind the ?preview=yard switch (client/src/preview.ts).
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WORLD } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { useMotion } from '../motion';
import { fmtCoords } from '../format';
import { leaveYardPreview } from '../preview';
import { SpotCard, type Coords, type Spot } from '../components/Patch';
import { UnderWay } from '../components/UnderWay';
import { Chambers } from './Chambers';
import { Brood } from './Brood';
import { Research } from './Research';
import { SendMission } from './Missions';
import { Rankings } from './Rankings';
import { Reports } from './Reports';
import { Allies } from './Allies';
import { Journal } from './Journal';
import { MISSION_LABEL, type MissionType, type Nav } from '../nav';
import type { Rung, YardScene } from '../components/yard3d/scene';

const NestHome = lazy(() => import('../components/NestHome').then((m) => ({ default: m.NestHome })));
type PanelId = 'chambers' | 'brood' | 'research' | 'missions' | 'allies' | 'reports' | 'ranks' | 'journal';
const PANEL_IDS: PanelId[] = ['chambers', 'brood', 'research', 'missions', 'allies', 'reports', 'ranks', 'journal'];
/** Panels about the whole player rather than one colony: no colony switcher in their header. */
const PLAYER_PANELS: PanelId[] = ['research', 'allies', 'reports', 'ranks', 'journal'];
/** Panels that take the map's full width (the tech tree, the journal's pages). */
const WIDE_PANELS: PanelId[] = ['research', 'journal'];

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const RAIL: { id: PanelId | 'nest'; label: string; icon: ReactNode; gap?: boolean }[] = [
  { id: 'nest', label: 'Nest', icon: I('M3 11c3-6 15-6 18 0M5 11v8h14v-8M9 19v-4a3 3 0 0 1 6 0v4') },
  { id: 'chambers', label: 'Chambers', icon: I('M12 3v4M12 7c-4 0-7 2-7 5s3 5 7 5 7-2 7-5-3-5-7-5ZM12 17v4M5 12H2M22 12h-3') },
  { id: 'brood', label: 'Brood Hall', icon: I('M12 4c2 0 3 1.5 3 3.5S14 11 12 11 9 9.5 9 7.5 10 4 12 4ZM8 20c0-4 2-6 4-6s4 2 4 6M6 9 3 7M18 9l3-2M6 15l-3 1M18 15l3 1') },
  { id: 'research', label: 'Research', icon: I('M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8') },
  { id: 'missions', label: 'Missions', icon: I('M4 18c4-1 6-5 8-9s5-5 8-5M16 4h4v4M4 18l2 2') },
  { id: 'allies', label: 'Allies', icon: I('M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 3-5 6-5s6 2 6 5M12 15.5c1-.3 2.4-.5 4-.5 3 0 6 2 6 5'), gap: true },
  { id: 'reports', label: 'Reports', icon: I('M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7') },
  { id: 'ranks', label: 'Rankings', icon: I('M8 21V11M16 21V7M12 21V3M4 21h16') },
  { id: 'journal', label: 'Journal', icon: I('M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11M9 8h6') },
];
const RUNGS: { id: Rung; label: string }[] = [
  { id: 'yard', label: 'Yard' },
  { id: 'region', label: 'Region' },
  { id: 'patch', label: 'Patch' },
  { id: 'ground', label: 'Ground' },
];
const same = (a: { region: number; patch: number }, b: { region: number; patch: number }) => a.region === b.region && a.patch === b.patch;

export function Yard({ go }: { go: Nav }) {
  const { state, colony, now, selectColony } = useGame();
  const { reduced } = useMotion();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<YardScene | null>(null);
  const dataRef = useRef({ state, now, colonyId: colony?.id ?? null });
  dataRef.current = { state, now, colonyId: colony?.id ?? null };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rung, setRung] = useState<Rung>('yard');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [nest, setNest] = useState(false);
  const [sel, setSel] = useState<Coords | null>(null);
  const [deploy, setDeploy] = useState<{ type: MissionType; target: Coords } | null>(null);
  const [look, setLook] = useState<{ region: number; patch: number } | null>(null);
  const [spots, setSpots] = useState<Record<string, Spot[]>>({});
  const handlers = useRef({ pick: (_: Coords) => {}, dive: (_: Coords) => {} });

  // the scene lives as long as the screen
  useEffect(() => {
    let dead = false;
    import('../components/yard3d/scene')
      .then((m) =>
        m.createYardScene(host.current!, labels.current!, () => dataRef.current, {
          onPick: (at) => handlers.current.pick(at),
          onDive: (at) => handlers.current.dive(at),
          onLook: (region, patch) => setLook({ region, patch }),
          onRung: setRung,
        }, reduced),
      )
      .then((s) => {
        if (dead) return s.dispose();
        sceneRef.current = s;
        setReady(true);
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => sceneRef.current?.setReduced(reduced), [reduced]);

  // every region's patches: who lives where (the borders, the far-out squares)
  useEffect(() => {
    if (!ready) return;
    let dead = false;
    const load = () => {
      for (let r = 1; r <= WORLD.regions; r++)
        api.get(`/api/map/region?region=${r}`).then((x) => !dead && sceneRef.current?.setRegion(r, x.patches)).catch(() => {});
    };
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [ready]);

  // a patch's spots: your colonies' patches, the one you're looking at, the one you tapped
  const homes = useMemo(() => (state?.colonies ?? []).map((c) => ({ region: c.coords.region, patch: c.coords.patch })), [state?.colonies]);
  const wanted = useMemo(() => {
    const out = [...homes];
    for (const p of [look, sel]) if (p && !out.some((o) => same(o, p))) out.push({ region: p.region, patch: p.patch });
    return out;
  }, [homes, look, sel]);
  const wantedKey = wanted.map((w) => `${w.region}:${w.patch}`).join(',');
  useEffect(() => {
    if (!ready) return;
    let dead = false;
    for (const w of wanted)
      api
        .get(`/api/map?region=${w.region}&patch=${w.patch}`)
        .then((r) => {
          if (dead) return;
          sceneRef.current?.setSpots(w.region, w.patch, r.spots);
          setSpots((s) => ({ ...s, [`${w.region}:${w.patch}`]: r.spots }));
        })
        .catch(() => {});
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wantedKey, state?.serverNow]);

  // first look: fly from the whole yard to your colony's patch
  const flown = useRef(false);
  useEffect(() => {
    if (!ready || flown.current || !colony) return;
    flown.current = true;
    window.setTimeout(() => sceneRef.current?.flyTo(colony.coords, 'region'), 700);
  }, [ready, colony]);

  handlers.current.pick = (at) => {
    setSel(at);
    setDeploy(null);
    sceneRef.current?.setSelected(at);
  };
  handlers.current.dive = (at) => {
    const mine = state?.colonies.find((c) => c.coords.region === at.region && c.coords.patch === at.patch && c.coords.spot === at.spot);
    if (mine && mine.id !== colony?.id) selectColony(mine.id);
    setPanel(null);
    setNest(true);
  };
  const surface = () => {
    setNest(false);
    if (colony) sceneRef.current?.flyTo(colony.coords, 'patch');
  };
  const dive = () => {
    if (!colony) return;
    sceneRef.current?.flyTo(colony.coords, 'ground');
    window.setTimeout(() => setNest(true), reduced ? 100 : 1200);
  };
  // the nest's own links ("Up to the patch", "All chambers") open the yard's panels instead of other screens
  const nestNav: Nav = (id, p) => {
    if (id === 'missions') return surface();
    if (PANEL_IDS.includes(id as PanelId)) return setNest(false), setPanel(id as PanelId);
    go(id, p);
  };
  // links inside the panels (a report's "show on map", an ally's colony): fly there or open the send card, not another screen
  const panelNav: Nav = (id, p) => {
    if (id === 'missions' && !p?.replay && (p?.view || p?.target)) {
      const at = p.target ?? { ...p.view, spot: 0 };
      setPanel(null);
      sceneRef.current?.flyTo(at, 'patch');
      if (p.target) {
        handlers.current.pick(p.target);
        if (p.type) setDeploy({ type: p.type, target: p.target });
      }
      return;
    }
    if (PANEL_IDS.includes(id as PanelId)) return setPanel(id as PanelId);
    go(id, p);
  };
  const cycle = (dir: 1 | -1) => {
    if (!state || !colony) return;
    const list = state.colonies;
    const i = list.findIndex((c) => c.id === colony.id);
    const next = list[(i + dir + list.length) % list.length];
    selectColony(next.id);
    if (!nest) sceneRef.current?.flyTo(next.coords, 'patch');
  };

  // what needs you: the turn-based "unit needs orders", for a game that never stops
  const needs = useMemo(() => {
    if (!state || !colony) return null;
    const threat = (state.incoming ?? []).find((i: any) => i.hostile);
    if (threat) return { text: threat.type === 'swarm' ? 'Army ants coming' : 'Raid incoming', sub: `${Math.max(1, Math.ceil(((threat as any).arriveAt - now) / 60000))} min · see Missions`, danger: true, go: () => setPanel('missions') };
    if (!colony.buildJob && !colony.digPlan?.chambers?.length) return { text: 'No dig running', sub: `${colony.name} · open Chambers`, go: () => setPanel('chambers') };
    if (!(colony.unitQueue ?? []).length) return { text: 'Brood Hall idle', sub: `${colony.name} · open Brood Hall`, go: () => setPanel('brood') };
    if (!state.player.researchJob) return { text: 'No research running', sub: 'Open Research', go: () => setPanel('research') };
    return null;
  }, [state, colony, now]);

  if (!state || !colony) return null;
  const selSpot = sel ? spots[`${sel.region}:${sel.patch}`]?.find((s) => s.spot === sel.spot) : null;
  const badges: Partial<Record<PanelId, [number, string]>> = {
    missions: [(state.incoming ?? []).filter((i: any) => i.hostile).length, 'raids coming'],
    allies: [state.player.pendingDiplomacy ?? 0, 'waiting for you'],
    reports: [state.unreadReports ?? 0, 'unread'],
    journal: [state.journal?.fresh ?? 0, 'new pages'],
  };
  const colonyTitle = (
    <div className="yard-cycle">
      {state.colonies.length > 1 && (
        <button type="button" className="btn ghost small" onClick={() => cycle(-1)} aria-label="Previous colony">‹</button>
      )}
      <span>
        <b>{colony.name}</b> <span className="muted small">{fmtCoords(colony.coords)}</span>
      </span>
      {state.colonies.length > 1 && (
        <button type="button" className="btn ghost small" onClick={() => cycle(1)} aria-label="Next colony">›</button>
      )}
    </div>
  );

  return (
    <div className={`yard${nest ? ' in-nest' : ''}`}>
      <div className="yard-map" ref={host} aria-label="The whole yard: every region and patch as one map" role="img">
        <div className="yard-labels" ref={labels} aria-hidden="true" />
        {!ready && !failed && <div className="yard-loading">Looking over the yard…</div>}
        {failed && <div className="yard-loading">This browser can't draw the 3D yard. Turn the preview off to use the usual screens.</div>}
      </div>

      {nest && (
        <div className="yard-nest">
          <Suspense fallback={<div className="nest fill" />}>
            <NestHome nav={nestNav} fill inset={{ left: 96, right: 16, top: 64, bottom: 16 }} />
          </Suspense>
        </div>
      )}

      <nav className="yard-rail" aria-label="Colony">
        {RAIL.map((b) => (
          <button
            key={b.id}
            type="button"
            className={[(b.id === 'nest' ? nest : panel === b.id) ? 'on' : '', b.gap ? 'gap' : ''].filter(Boolean).join(' ') || undefined}
            aria-pressed={b.id === 'nest' ? nest : panel === b.id}
            onClick={() => (b.id === 'nest' ? (nest ? surface() : dive()) : setPanel((p) => (p === b.id ? null : (b.id as PanelId))))}
          >
            {b.icon}
            <span>{b.id === 'nest' && nest ? 'Up' : b.label}</span>
            {b.id !== 'nest' && (badges[b.id]?.[0] ?? 0) > 0 && (
              <i className="rail-badge" aria-label={`${badges[b.id]![0]} ${badges[b.id]![1]}`}>{badges[b.id]![0]}</i>
            )}
          </button>
        ))}
      </nav>

      {panel && (
        <aside className={`yard-panel${WIDE_PANELS.includes(panel) ? ' wide' : ''}`} aria-label={RAIL.find((r) => r.id === panel)?.label}>
          <div className="yard-panel-head">
            {PLAYER_PANELS.includes(panel) ? <b>{RAIL.find((r) => r.id === panel)?.label}</b> : colonyTitle}
            <button type="button" className="btn ghost small" onClick={() => setPanel(null)} aria-label="Close">×</button>
          </div>
          <div className="yard-panel-body">
            {panel === 'chambers' && <Chambers />}
            {panel === 'brood' && <Brood />}
            {panel === 'research' && <Research />}
            {panel === 'allies' && <Allies go={panelNav} />}
            {panel === 'reports' && <Reports go={panelNav} />}
            {panel === 'ranks' && <Rankings />}
            {panel === 'journal' && <Journal />}
            {panel === 'missions' && (
              <div className="stack">
                <div className="row-actions">
                  <button type="button" className="btn primary small" onClick={() => setDeploy({ type: 'transport', target: sel ?? colony.coords })}>Send ants…</button>
                </div>
                <UnderWay onFocus={(_, at) => sceneRef.current?.flyTo(at, 'patch')} />
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="yard-top">
        {!nest && (
          <div className="yard-ladder" role="group" aria-label="Zoom level">
            {RUNGS.map((r) => (
              <button key={r.id} type="button" aria-pressed={rung === r.id} onClick={() => (r.id === 'yard' ? sceneRef.current?.wholeYard() : sceneRef.current?.flyTo(sel ?? colony.coords, r.id))}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        {nest && (
          <button type="button" className="btn small primary" onClick={surface}>↑ Up to the yard</button>
        )}
        <button type="button" className="btn ghost small" onClick={() => go('nest')} title="The usual screens; Whole Yard stays at the top of the menu">
          Classic screens
        </button>
        <button type="button" className="btn ghost small" onClick={leaveYardPreview} title="Turn the Whole Yard preview off in this browser">
          Turn preview off
        </button>
      </div>

      {!nest && (
        <div className="yard-right">
          {needs && (
            <button type="button" className={`yard-needs${needs.danger ? ' danger' : ''}`} onClick={needs.go}>
              <b>{needs.text}</b>
              <span>{needs.sub}</span>
            </button>
          )}
          {deploy ? (
            <div className="deploy">
              <SendMission
                type={deploy.type}
                setType={(t) => setDeploy((d) => (d ? { ...d, type: t } : d))}
                target={deploy.target}
                setTarget={(t) => setDeploy((d) => (d ? { ...d, target: t } : d))}
                onClose={() => setDeploy(null)}
                onSent={() => setDeploy(null)}
              />
            </div>
          ) : (
            sel &&
            selSpot && (
              <div className="yard-card">
                <button type="button" className="btn ghost small yard-card-x" onClick={() => (setSel(null), sceneRef.current?.setSelected(null))} aria-label="Close">×</button>
                <SpotCard s={selSpot} at={sel} onAct={(type, at) => setDeploy({ type, target: at })} />
              </div>
            )
          )}
          {deploy && <p className="muted small yard-hint">{MISSION_LABEL[deploy.type]}: pick the ants and send. The column walks the map.</p>}
        </div>
      )}
      {!nest && <p className="yard-help" aria-hidden="true">Scroll to zoom · drag to move · right-drag or Q/E to turn · double-click your mound to go inside</p>}
    </div>
  );
}
