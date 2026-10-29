import { lazy, Suspense, useEffect, useState } from 'react';
import {
  RESOURCE_IDS,
  TERRAIN,
  productionPerHour,
  protectedAmount,
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
/** Room the floating cards take at the nest's edges (match .float-col and .float-name in styles.css). */
const insetFor = (w: number) => ({ left: 0, right: (w >= 1280 ? 340 : 300) + 16, top: 64, bottom: 56 });

export function Overview({ go }: { go: (screen: string, params?: any) => void }) {
  const { colony, state, now, act } = useGame();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const wide = useWide();
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (!colony || !state) return null;

  const rate = productionPerHour(colony.chambers, colony.terrain, state.world.speed, colony.research);
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
  const happening = (
    <Panel title="Happening now">
      <ActivityList go={go} />
    </Panel>
  );

  // On a computer the colony is the screen: the nest fills it and these cards float in its sky and corners.
  if (wide) {
    return (
      <div className="colony-stage">
        <Suspense fallback={<div className="nest fill" />}>
          <NestHome nav={go} fill inset={insetFor(vw)} />
        </Suspense>
        <div className="float-name">{nameCard}</div>
        <div className="float-col">
          <AwayCard go={go} />
          {happening}
          <QuestCard nav={go} />
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
