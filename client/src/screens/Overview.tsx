import { lazy, Suspense, useState } from 'react';
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
import { disableNotifications, enableNotifications, notificationsEnabled, notificationsSupported } from '../notify';

const NestHome = lazy(() => import('../components/NestHome').then((m) => ({ default: m.NestHome })));

export function Overview({ go }: { go: (screen: string, params?: any) => void }) {
  const { colony, state, now, act, toast } = useGame();
  const [editing, setEditing] = useState(false);
  const [notifyOn, setNotifyOn] = useState(notificationsEnabled());
  const [name, setName] = useState('');
  if (!colony || !state) return null;

  const rate = productionPerHour(colony.chambers, colony.terrain, state.world.speed);
  const cap = storageCapacity(colony.chambers);
  const safe = protectedAmount(colony.chambers);
  const wf = workforce(colony.chambers);
  const terrain = TERRAIN[colony.terrain];
  const protectedLeft = state.player.protectedUntil - now;

  return (
    <div className="stack">
      <Suspense fallback={<div className="nest" style={{ height: 280 }} />}>
        <NestHome nav={go} />
      </Suspense>
      <AwayCard go={go} />
      <QuestCard nav={go} />
      <Panel>
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
            <p className="notice">
              New-colony protection: no one can raid you for {fmtDuration(protectedLeft)} (until {fmtClock(state.player.protectedUntil)}), or until you raid someone.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Happening now">
        <ActivityList go={go} />
      </Panel>

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

      {notificationsSupported() && (
        <Panel title="Notifications">
          <div className="active-job">
            <p className="muted small" style={{ flex: '1 1 260px' }}>
              {notifyOn
                ? 'On. You get a browser notification for raids, scouts, reports and finished work while this tab is in the background.'
                : 'Off. Turn on to hear about incoming raids and finished work while this tab is in the background.'}
            </p>
            <button
              className={`btn ${notifyOn ? 'ghost' : 'primary'} small`}
              onClick={async () => {
                if (notifyOn) {
                  disableNotifications();
                  setNotifyOn(false);
                } else {
                  const ok = await enableNotifications();
                  setNotifyOn(ok);
                  if (!ok) toast('error', 'Notifications are blocked in your browser settings.');
                }
              }}
            >
              {notifyOn ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
