// The test scene (docs/test-bed.md), opened with /?test: the real Whole Yard or 3D Patch fed a made-up world, a
// lineup of every 3D ant, and a menu on the right to send parties, run the clock and tune how columns march.
// Nothing here talks to the server or touches a real colony: it is a page of made-up data.
import { useEffect, useRef, useState } from 'react';
import type { YardScene } from '../components/yard3d/scene';
import type { PatchScene } from '../components/patch3d/scene';
import { MARCH, MARCH_SPEC, marchChanges, resetMarch, type MarchGroup } from '../components/three/march';
import {
  ORDERS, PLACES, REGION_PATCHES, endsAt, fakeBattle, phaseKey, send, spotsFor, stateAt, statusOf, type Order, type Party,
} from './fakeWorld';
import { createLineup, type Lineup } from './modelStrip';
import './test.css';

type MapKind = 'yard' | 'patch';
const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20];
const HOURS = { Day: 12, Dusk: 18.5, Night: 23 } as const;
type Tod = keyof typeof HOURS;
const PRESET_KEY = 'hormigas.test.presets';

interface PresetParty { order: string; offset: number; size: number }
interface Preset { name: string; map?: MapKind; trip?: number; size?: number; seed?: number; march?: Record<string, Record<string, number>>; parties: PresetParty[] }

const stagger = (ids: string[], trip: number, size: number): PresetParty[] =>
  ids.map((order, i) => ({ order, size, offset: -(i / ids.length) * trip * 1000 }));
/** Starter setups: the situations worth checking every time ants or trails change. */
function starters(trip: number, size: number): Preset[] {
  return [
    { name: 'One of everything', parties: stagger(ORDERS.map((o) => o.id), trip, size) },
    { name: 'Busy forage trail', parties: stagger(['forage', 'forage', 'forage', 'forage', 'forage', 'forage'], trip, size) },
    { name: 'Loads walking home', parties: [...stagger(['claim', 'claim_far', 'tend'], trip, size).map((p) => ({ ...p, offset: p.offset - trip * 1500 }))] },
    { name: 'Big termite raid', parties: [{ order: 'raid_termites', offset: 0, size: 400 }] },
    { name: 'Under attack', parties: stagger(['raid_in', 'swarm_in', 'scout_in'], trip, size) },
    { name: 'Scouts out', parties: stagger(['scout', 'scout_far'], trip, size) },
  ];
}
function loadSaved(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function noonToday(hour: number) {
  const d = new Date();
  d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  return d.getTime();
}
const rngFrom = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

export default function TestScene() {
  const params = new URLSearchParams(location.search);
  const [map, setMap] = useState<MapKind>(params.get('test') === 'patch' ? 'patch' : 'yard');
  const [patchShown, setPatchShown] = useState(45);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [trip, setTrip] = useState(20);
  const [size, setSize] = useState(30);
  const [loop, setLoop] = useState(true);
  const [seed, setSeed] = useState(Number(params.get('seed')) || 42);
  const [tod, setTod] = useState<Tod>('Day');
  const [models, setModels] = useState(true);
  const [walk, setWalk] = useState(true);
  const [spin, setSpin] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [saved, setSaved] = useState<Preset[]>(loadSaved);
  const [copied, setCopied] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [, setMarchV] = useState(0);

  // the test clock and the parties on it, read every frame by the scenes
  const clock = useRef(noonToday(HOURS.Day));
  const parties = useRef<Party[]>([]);
  const nextId = useRef(1);
  const view = useRef({ state: stateAt([], clock.current), now: clock.current, key: '' });
  const opts = useRef({ playing, speed, loop, trip });
  opts.current = { playing, speed, loop, trip };
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const yard = useRef<YardScene | null>(null);
  const patch = useRef<PatchScene | null>(null);
  const lineHost = useRef<HTMLDivElement>(null);
  const lineLabels = useRef<HTMLDivElement>(null);
  const lineup = useRef<Lineup | null>(null);

  const refresh = () => {
    const now = clock.current;
    const key = `${phaseKey(parties.current, now)}|${nextId.current}`;
    // a new state object only when a party starts, ends or changes phase: that is when the yard rebuilds its columns
    if (key !== view.current.key) view.current = { ...view.current, state: stateAt(parties.current, now), key };
    // the yard runs its clock on by real time for up to 1.5 s after each new "now"; a fresh now every frame (even
    // paused, nudged by a hair) keeps it exactly on the test clock
    view.current.now = now + (view.current.now === now ? 0.001 : 0);
    view.current.state.serverNow = now;
  };

  // the clock
  useEffect(() => {
    let raf = 0, last = performance.now(), ui = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, t - last);
      last = t;
      const o = opts.current;
      if (o.playing) {
        clock.current += dt * o.speed;
        const now = clock.current;
        const done = parties.current.filter((p) => now >= endsAt(p));
        if (done.length) {
          parties.current = parties.current.filter((p) => now < endsAt(p));
          if (o.loop) for (const p of done) parties.current.push(send(p.order, nextId.current++, now, o.trip * 1000, p.size, p.originColonyId));
        }
      }
      refresh();
      if (t - ui > 120) {
        ui = t;
        setTick((x) => x + 1);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the map: the real scene, fed the made-up world
  useEffect(() => {
    let dead = false;
    setReady(false);
    setFailed(false);
    const h = host.current!, l = labels.current!;
    const made =
      map === 'yard'
        ? import('../components/yard3d/scene').then((m) =>
            m.createYardScene(h, l, () => ({ state: view.current.state, now: view.current.now, colonyId: 1 }), {
              onPick: (at) => (setPicked(`${at.region}:${at.patch}:${at.spot}`), yard.current?.setSelected(at)), // ring it, like the Yard screen
              onDive: () => {},
              onLook: (region, p) => yard.current?.setSpots(region, p, spotsFor(region, p), 'visible'),
              onRung: () => {},
            }, false).then((s) => {
              for (let r = 1; r <= 5; r++) s.setRegion(r, r === 1 ? REGION_PATCHES : []);
              for (const p of [44, 45, 46]) s.setSpots(1, p, spotsFor(1, p), 'visible');
              if (dead) return s.dispose();
              yard.current = s;
              // after the yard's own opening move, like the Yard screen does
              window.setTimeout(() => !dead && s.flyTo(PLACES.home, 'patch'), 1200);
            }),
          )
        : import('../components/patch3d/scene').then((m) =>
            m.createPatchScene(h, l, () => ({ colony: view.current.state.colony, state: view.current.state, now: view.current.now }), {
              onPick: (spot) => setPicked(`1:${patchShown}:${spot}`),
            }, false).then((s) => {
              if (dead) return s.dispose();
              s.setSpots(1, patchShown, spotsFor(1, patchShown));
              patch.current = s;
            }),
          );
    made.then(() => !dead && setReady(true)).catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      yard.current?.dispose();
      patch.current?.dispose();
      yard.current = null;
      patch.current = null;
    };
  }, [map, patchShown]);

  // the lineup
  useEffect(() => {
    if (!models) return;
    try {
      lineup.current = createLineup(lineHost.current!, lineLabels.current!);
    } catch {
      return;
    }
    return () => {
      lineup.current?.dispose();
      lineup.current = null;
    };
  }, [models]);
  useEffect(() => lineup.current?.set({ walk, spin, speed: Math.min(speed, 5) }), [walk, spin, speed, models]);

  // ---------- actions
  const add = (o: Order, n = size, offset = 0) => {
    parties.current.push(send(o, nextId.current++, clock.current + offset, trip * 1000, n));
    refresh();
  };
  const clearAll = () => {
    parties.current = [];
    nextId.current++;
    yard.current?.stopBattle();
    refresh();
  };
  const restartAll = () => {
    const now = clock.current;
    parties.current = parties.current.map((p) => send(p.order, nextId.current++, now, trip * 1000, p.size, p.originColonyId));
    refresh();
  };
  const remove = (id: number) => {
    parties.current = parties.current.filter((p) => p.id !== id);
    nextId.current++;
    refresh();
  };
  const randomMix = () => {
    const r = rngFrom(seed);
    clearAll();
    for (let i = 0; i < 6; i++) add(ORDERS[Math.floor(r() * ORDERS.length)], Math.round(5 + r() * size * 2), -r() * trip * 1500);
  };
  const playBattle = () => {
    const report = fakeBattle(PLACES.termites, PLACES.home, size, seed);
    if (map === 'yard') yard.current?.playBattle(report);
    else {
      if (patchShown !== 45) setPatchShown(45);
      window.setTimeout(() => patch.current?.playBattle(report), patchShown !== 45 ? 1500 : 0);
    }
  };
  const shiftClock = (ms: number) => {
    clock.current += ms;
    refresh();
  };
  const setTimeOfDay = (t: Tod) => {
    const d = new Date(clock.current);
    const target = new Date(clock.current);
    target.setHours(Math.floor(HOURS[t]), (HOURS[t] % 1) * 60, 0, 0);
    const delta = target.getTime() - d.getTime();
    clock.current += delta;
    parties.current = parties.current.map((p) => ({ ...p, departAt: p.departAt + delta, arriveAt: p.arriveAt + delta, leaveAt: p.leaveAt + delta, returnAt: p.returnAt + delta }));
    nextId.current++;
    setTod(t);
    refresh();
  };
  const applyPreset = (p: Preset) => {
    if (p.map) setMap(p.map);
    if (p.trip) setTrip(p.trip);
    if (p.seed) setSeed(p.seed);
    if (p.march) {
      resetMarch();
      for (const [g, vals] of Object.entries(p.march)) Object.assign(MARCH[g as MarchGroup], vals);
      setMarchV((v) => v + 1);
    }
    parties.current = [];
    const t = (p.trip ?? trip) * 1000;
    for (const x of p.parties) {
      const o = ORDERS.find((q) => q.id === x.order);
      if (o) parties.current.push(send(o, nextId.current++, clock.current + x.offset, t, x.size));
    }
    yard.current?.stopBattle();
    refresh();
  };
  const savePreset = () => {
    const name = window.prompt('Name this setup', `Setup ${saved.length + 1}`);
    if (!name) return;
    const p: Preset = {
      name, map, trip, size, seed, march: marchChanges(),
      parties: parties.current.map((x) => ({ order: x.order.id, offset: x.departAt - clock.current, size: x.size })),
    };
    const next = [...saved.filter((s) => s.name !== name), p];
    setSaved(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      /* private window: kept until the page closes */
    }
  };
  const deletePreset = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      /* nothing saved */
    }
  };
  const copyChanges = async () => {
    const text = JSON.stringify({ 'client/src/components/three/march.json': marchChanges() }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it to Claude to make it real.');
    } catch {
      setCopied(text);
    }
  };

  // ---------- readouts
  const now = clock.current;
  const span = parties.current.length
    ? { from: Math.min(...parties.current.map((p) => p.departAt)), to: Math.max(...parties.current.map(endsAt)) }
    : null;
  const changed = marchChanges();
  const group: MarchGroup = map;
  const presets = starters(trip, size);

  return (
    <div className="ts">
      <div className="ts-main">
        <div className="ts-map-wrap">
          <div key={`${map}-${patchShown}`} className={map === 'yard' ? 'yard ts-map' : 'patch3d ts-map'}>
            <div className={map === 'yard' ? 'yard-map' : 'ts-patch-host'} ref={host}>
              <div className={map === 'yard' ? 'yard-labels' : 'p3-labels'} ref={labels} aria-hidden="true" />
            </div>
            {!ready && !failed && <div className="ts-loading">Building the {map === 'yard' ? 'Whole Yard' : '3D Patch'}…</div>}
            {failed && <div className="ts-loading">This browser can't draw the 3D maps.</div>}
          </div>
          <div className="ts-badge">
            <b>Test scene</b> made-up world, nothing here touches the real game
            {picked && <span> · picked {picked}</span>}
          </div>
        </div>
        {models && (
          <div className="ts-lineup" ref={lineHost}>
            <div className="ts-lineup-labels" ref={lineLabels} />
            <div className="ts-lineup-note">Close-up: the detailed ant seen in chambers · Crowd: the light ant used for columns on the maps</div>
          </div>
        )}
      </div>

      <aside className="ts-panel" aria-label="Test controls">
        <section>
          <h2>Map</h2>
          <div className="ts-seg">
            <button type="button" aria-pressed={map === 'yard'} onClick={() => setMap('yard')}>Whole Yard</button>
            <button type="button" aria-pressed={map === 'patch'} onClick={() => setMap('patch')}>3D Patch</button>
          </div>
          {map === 'yard' ? (
            <div className="ts-row">
              <button type="button" className="btn small" onClick={() => yard.current?.flyTo(PLACES.home, 'ground')}>Ground</button>
              <button type="button" className="btn small" onClick={() => yard.current?.flyTo(PLACES.home, 'patch')}>Patch</button>
              <button type="button" className="btn small" onClick={() => yard.current?.flyTo(PLACES.home, 'region')}>Region</button>
              <button type="button" className="btn small" onClick={() => yard.current?.wholeYard()}>Whole yard</button>
            </div>
          ) : (
            <div className="ts-row">
              <button type="button" className="btn small" aria-pressed={patchShown === 45} onClick={() => setPatchShown(45)}>Home patch</button>
              <button type="button" className="btn small" aria-pressed={patchShown === 46} onClick={() => setPatchShown(46)}>Next patch</button>
              <button type="button" className="btn small" onClick={() => patch.current?.antsEye()}>Ant's-eye</button>
              <button type="button" className="btn small" onClick={() => patch.current?.resetView()}>Whole patch</button>
            </div>
          )}
          <div className="ts-row">
            {(Object.keys(HOURS) as Tod[]).map((t) => (
              <button key={t} type="button" className="btn small" aria-pressed={tod === t} onClick={() => setTimeOfDay(t)}>{t}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Clock</h2>
          <div className="ts-row">
            <button type="button" className="btn small primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
            <button type="button" className="btn small" onClick={() => shiftClock(-1000)} title="Back 1 second">−1 s</button>
            <button type="button" className="btn small" onClick={() => shiftClock(1000)} title="On 1 second">+1 s</button>
            <button type="button" className="btn small" onClick={restartAll} title="Send every party again from home, all at once">Restart all</button>
          </div>
          <label className="ts-field">
            <span>Speed</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => <option key={s} value={s}>×{s}</option>)}
            </select>
          </label>
          {span && (
            <label className="ts-field">
              <span>Scrub</span>
              <input
                type="range" min={0} max={1000} value={Math.round(((now - span.from) / Math.max(1, span.to - span.from)) * 1000)}
                onChange={(e) => {
                  setPlaying(false);
                  clock.current = span.from + (Number(e.target.value) / 1000) * (span.to - span.from);
                  refresh();
                }}
              />
            </label>
          )}
        </section>

        <section>
          <h2>Send a party</h2>
          <label className="ts-field">
            <span>Ants</span>
            <input type="range" min={1} max={500} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <output>{size}</output>
          </label>
          <label className="ts-field">
            <span>Trip</span>
            <input type="range" min={3} max={120} value={trip} onChange={(e) => setTrip(Number(e.target.value))} />
            <output>{trip} s</output>
          </label>
          <label className="ts-check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Send again when back
          </label>
          {(['Send', 'Incoming'] as const).map((g) => (
            <div key={g}>
              <h3>{g === 'Send' ? 'Your ants' : 'Coming at you'}</h3>
              <div className="ts-grid">
                {ORDERS.filter((o) => o.group === g).map((o) => (
                  <button key={o.id} type="button" className={`btn small${g === 'Incoming' ? ' danger' : ''}`} onClick={() => add(o)}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="ts-row">
            <button type="button" className="btn small" onClick={playBattle}>Play a battle</button>
            <button type="button" className="btn small" onClick={randomMix} title="Six random parties, picked by the seed">Random mix</button>
            <label className="ts-seed">Seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} /></label>
          </div>
          <button type="button" className="btn small danger" onClick={clearAll}>Clear all</button>
        </section>

        <section>
          <h2>On the map ({parties.current.length})</h2>
          {parties.current.length === 0 && <p className="ts-muted">Nothing marching. Press a button above or pick a setup.</p>}
          <ul className="ts-parties">
            {parties.current.map((p) => {
              const st = statusOf(p, now);
              const x = Math.max(0, Math.min(1, (now - p.departAt) / Math.max(1, endsAt(p) - p.departAt)));
              return (
                <li key={p.id}>
                  <span className={`ts-dot ${p.order.group === 'Incoming' ? 'in' : ''}`} />
                  <span className="ts-pname">{p.order.label} · {p.size}</span>
                  <span className="ts-phase">{now < p.departAt ? 'waiting' : st === 'outbound' ? 'out' : st === 'holding' ? 'holding' : st === 'returning' ? 'home' : 'done'} {Math.round(x * 100)}%</span>
                  {map === 'patch' ? (
                    <button type="button" className="btn ghost small" onClick={() => patch.current?.focusParty(`${p.order.group === 'Incoming' ? 'i' : 'm'}${p.id}`)}>Follow</button>
                  ) : (
                    <button type="button" className="btn ghost small" onClick={() => yard.current?.flyTo(PLACES[p.order.to], 'ground')}>Look</button>
                  )}
                  <button type="button" className="btn ghost small" aria-label="Remove" onClick={() => remove(p.id)}>×</button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2>Setups</h2>
          <div className="ts-grid">
            {presets.map((p) => <button key={p.name} type="button" className="btn small" onClick={() => applyPreset(p)}>{p.name}</button>)}
          </div>
          {saved.length > 0 && <h3>Saved</h3>}
          {saved.map((p) => (
            <div key={p.name} className="ts-row">
              <button type="button" className="btn small" onClick={() => applyPreset(p)}>{p.name}</button>
              <button type="button" className="btn ghost small" aria-label={`Delete ${p.name}`} onClick={() => deletePreset(p.name)}>×</button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={savePreset}>Save this setup</button>
        </section>

        <section>
          <h2>How columns march ({map === 'yard' ? 'Whole Yard' : '3D Patch'})</h2>
          {Object.entries(MARCH_SPEC[group]).map(([k, spec]) => {
            const v = (MARCH[group] as Record<string, number>)[k];
            const diff = changed[group]?.[k] !== undefined;
            return (
              <label key={k} className={`ts-knob${diff ? ' changed' : ''}`} title={spec.note}>
                <span>{spec.label}</span>
                <input
                  type="range" min={spec.min} max={spec.max} step={spec.step} value={v}
                  onChange={(e) => {
                    (MARCH[group] as Record<string, number>)[k] = Number(e.target.value);
                    setMarchV((x) => x + 1);
                  }}
                />
                <output>{v} <small>{spec.unit}</small></output>
                {diff && (
                  <button type="button" className="btn ghost small" title={`Back to ${spec.value}`} onClick={() => { (MARCH[group] as Record<string, number>)[k] = spec.value; setMarchV((x) => x + 1); }}>↺</button>
                )}
              </label>
            );
          })}
          <div className="ts-row">
            <button type="button" className="btn small primary" onClick={copyChanges} disabled={!Object.keys(changed).length}>Copy changes</button>
            <button type="button" className="btn small" onClick={() => { resetMarch(); setMarchV((x) => x + 1); }} disabled={!Object.keys(changed).length}>Reset all</button>
          </div>
          {copied && <pre className="ts-copied" onClick={() => setCopied(null)}>{copied}</pre>}
        </section>

        <section>
          <h2>Ant models</h2>
          <label className="ts-check"><input type="checkbox" checked={models} onChange={(e) => setModels(e.target.checked)} /> Show the lineup</label>
          <label className="ts-check"><input type="checkbox" checked={walk} onChange={(e) => setWalk(e.target.checked)} /> Walk on the spot</label>
          <label className="ts-check"><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Turn around</label>
        </section>
      </aside>
    </div>
  );
}

