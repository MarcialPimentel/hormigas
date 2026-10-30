import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  RESOURCE_IDS,
  TERRAIN,
  productionPerHour,
  protectedAmount,
  queueEndsAt,
  spaceMax,
  spaceUsed,
  storageCapacity,
  workforce,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock, fmtCoords, fmtDuration, fmtFull } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Panel, ResDot } from '../components/ui';
import { ActivityList } from '../components/Activity';
import { QuestCard } from '../components/QuestCard';
import { AwayCard } from '../components/AwayCard';

import { UnderWay } from '../components/UnderWay';

const NestHome = lazy(() => import('../components/NestHome').then((m) => ({ default: m.NestHome })));

/** Wide enough for the left nav (styles.css, 900px): the nest fills the screen and the cards float over it. */
const WIDE = '(min-width: 900px)';
function useWide() {
  const mq = () => (typeof matchMedia !== 'undefined' ? matchMedia(WIDE) : null);
  const [wide, setWide] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
type Inset = { left: number; right: number; top: number; bottom: number };

/**
 * Where the 3D nest should be framed: centred left to right, below the cards at the top (the colony's name,
 * Happening now) and above the founding task at the bottom. Measured, since the cards grow and shrink.
 */
function useCardInset(on: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  const top = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const bottom = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState<Inset>({ left: 16, right: 16, top: 72, bottom: 56 });
  useEffect(() => {
    const s = stage.current;
    if (!on || !s) return;
    const measure = () => {
      const box = s.getBoundingClientRect();
      const lowest = Math.max(0, ...top.map((r) => (r.current?.offsetHeight ? r.current.getBoundingClientRect().bottom - box.top : 0)));
      const b = bottom.current?.offsetHeight ? box.bottom - bottom.current.getBoundingClientRect().top : 0;
      // very tall cards may cover a little of the nest rather than shrink it to nothing
      const next = {
        left: 16,
        right: 16,
        top: Math.round(Math.min(box.height * 0.4, lowest) + 12),
        bottom: Math.round(Math.max(56, Math.min(box.height * 0.3, b + 12))),
      };
      setInset((p) => (p.top === next.top && p.bottom === next.bottom ? p : next));
    };
    const ro = new ResizeObserver(measure);
    for (const el of [s, ...top.map((r) => r.current), bottom.current]) if (el) ro.observe(el);
    measure();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  return { stage, top, bottom, inset };
}

export function Overview({ go }: { go: (screen: string, params?: any) => void }) {
  const { colony, state, now, act } = useGame();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const wide = useWide();
  const frame = useCardInset(wide);
  if (!colony || !state) return null;

  const rate = productionPerHour(colony.chambers, colony.terrain, state.world.speed, colony.research, colony.units);
  const cap = storageCapacity(colony.chambers, colony.research);
  const safe = protectedAmount(colony.chambers, colony.research);
  const wf = workforce(colony.chambers);
  const terrain = TERRAIN[colony.terrain];
  const protectedLeft = state.player.protectedUntil - now;

  const nameCard = (
    <div className="colony-head">
      {editing ? (
        <form
          className="rename"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act(() => api.patch(`/api/colonies/${colony.id}`, { name }), 'Colony renamed.')) setEditing(false);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus aria-label="Colony name" />
          <button className="btn primary small">Save</button>
          <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <h1 className="colony-name">
          {colony.name}
          <button className="btn ghost small" onClick={() => { setName(colony.name); setEditing(true); }}>
            Rename
          </button>
        </h1>
      )}
      <p className="muted">
        {fmtCoords(colony.coords)} · {terrain.name} · Space {spaceUsed(colony.chambers)}/{spaceMax(colony.baseSpace, state.player.research)} ·{' '}
        {fmtFull(state.player.points.total)} points
      </p>
      {protectedLeft > 0 && (
        <p className="notice" title={`Until ${fmtClock(state.player.protectedUntil)}, or until you raid someone.`}>
          {wide
            ? `Safe from raids for ${fmtDuration(protectedLeft)}`
            : `New-colony protection: no one can raid you for ${fmtDuration(protectedLeft)} (until ${fmtClock(state.player.protectedUntil)}), or until you raid someone.`}
        </p>
      )}
    </div>
  );
  // the way up to the war room: what's out there right now, one tap from the full view
  const out = (state.missions?.length ?? 0) + (state.incoming?.length ?? 0);
  // digs, research and brood; missions and raids live in Under way, so they aren't listed twice. With parties
  // out and nothing else going on, the card steps aside rather than nag.
  const busyAtHome = !!(colony.buildJob || colony.digPlan?.chambers[0] || state.player.researchJob || queueEndsAt(colony.unitQueue) || colony.digestJob);
  const happening = busyAtHome || out === 0 ? (
    <Panel title="Happening now">
      <ActivityList go={go} trips={false} quiet={out > 0} />
    </Panel>
  ) : null;
  const underWay = (
    <Panel
      title="Under way"
      actions={
        <button className="btn small primary" onClick={() => go('missions')} title="The patch and every mission, full screen">
          Open the war room
        </button>
      }
    >
      {out > 0 ? <UnderWay compact limit={4} onFocus={() => go('missions')} /> : <p className="muted small">Nothing out. Send ants from the war room.</p>}
    </Panel>
  );

  // On a computer the colony is the screen: the nest fills it and these cards float in its sky and corners.
  if (wide) {
    return (
      <div className="colony-stage" ref={frame.stage}>
        <Suspense fallback={<div className="nest fill" />}>
          <NestHome nav={go} fill inset={frame.inset} />
        </Suspense>
        <div className="float-name" ref={frame.top[0]}>
          {nameCard}
        </div>
        <div className="float-col">
          <div className="float-top" ref={frame.top[1]}>
            <AwayCard go={go} />
            {underWay}
            {happening}
          </div>
          <div className="float-bottom" ref={frame.bottom}>
            <QuestCard nav={go} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <Suspense fallback={<div className="nest" style={{ height: 280 }} />}>
        <NestHome nav={go} />
      </Suspense>
      <AwayCard go={go} />
      <QuestCard nav={go} />
      <Panel>{nameCard}</Panel>

      {underWay}
      {happening}

      <Panel title="Production">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Resource</th>
              <th scope="col">Per hour</th>
              <th scope="col">Stored</th>
              <th scope="col">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCE_IDS.map((r) => (
              <tr key={r}>
                <th scope="row">
                  <ResDot r={r} /> {RESOURCE_LABEL[r]}
                </th>
                <td>+{fmtFull(rate[r])}</td>
                <td>{fmtFull(colony.resources[r])}</td>
                <td className={colony.resources[r] >= cap[r] ? 'warn' : ''}>
                  {fmtFull(cap[r])}
                  {colony.resources[r] >= cap[r] && ' (full)'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Workforce {fmtFull(wf.demand)} needed / {fmtFull(wf.supply)} available.
          {wf.ratio < 1
            ? ` Production is at ${Math.round(wf.ratio * 100)}% — enlarge the Nursery.`
            : ' Production chambers are fully staffed.'}
          {safe > 0 ? ` The Honeypot Gallery protects ${fmtFull(safe)} of each resource from raids.` : ''}
        </p>
      </Panel>

    </div>
  );
}
