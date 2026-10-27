import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useGame } from './game';
import { fmtCoords } from './format';
import { ResourceBar } from './components/ResourceBar';
import { Login } from './screens/Login';
import { Overview } from './screens/Overview';
import { Chambers } from './screens/Chambers';
import { Brood } from './screens/Brood';
import { Research } from './screens/Research';
import { MapScreen } from './screens/Map';
import { Missions } from './screens/Missions';
import { Reports } from './screens/Reports';
import { Rankings } from './screens/Rankings';
import { FeedbackAdmin } from './screens/FeedbackAdmin';
import { FeedbackButton } from './components/Feedback';
import type { Nav } from './nav';

export interface ScreenDef {
  id: string;
  label: string;
  icon: ReactNode;
  render: (nav: Nav) => ReactNode;
  badge?: number;
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const ICONS = {
  nest: I('M3 11c3-6 15-6 18 0M5 11v8h14v-8M9 19v-4a3 3 0 0 1 6 0v4'),
  chambers: I('M12 3v4M12 7c-4 0-7 2-7 5s3 5 7 5 7-2 7-5-3-5-7-5ZM12 17v4M5 12H2M22 12h-3'),
  brood: I('M12 4c2 0 3 1.5 3 3.5S14 11 12 11 9 9.5 9 7.5 10 4 12 4ZM8 20c0-4 2-6 4-6s4 2 4 6M6 9 3 7M18 9l3-2M6 15l-3 1M18 15l3 1'),
  research: I('M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8'),
  map: I('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14'),
  missions: I('M4 18c4-1 6-5 8-9s5-5 8-5M16 4h4v4M4 18l2 2'),
  reports: I('M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7'),
  ranks: I('M8 21V11M16 21V7M12 21V3M4 21h16'),
  feedback: I('M4 5h16v11H9l-5 4V5ZM8 9.5h8M8 12.5h5'),
};

export function App() {
  const { loggedIn, state, colony, selectColony, toasts, setLoggedIn } = useGame();
  const [screen, setScreen] = useState('nest');
  const [params, setParams] = useState<any>(undefined);
  const [openFeedback, setOpenFeedback] = useState(0);
  const isAdmin = !!state?.player.isAdmin;
  // Admins see how much feedback is waiting, without opening the screen first.
  useEffect(() => {
    if (isAdmin) api.get('/api/admin/feedback').then((r) => setOpenFeedback(r.open)).catch(() => {});
  }, [isAdmin]);
  const onFeedbackCount = useCallback((n: number) => setOpenFeedback(n), []);
  const nav: Nav = (id, p) => {
    setScreen(id);
    setParams(p);
    window.scrollTo(0, 0);
  };

  if (loggedIn === null) return <div className="boot">Waking the colony…</div>;
  if (!loggedIn) return <Login />;
  if (!state || !colony) return <div className="boot">Waking the colony…</div>;

  const screens: ScreenDef[] = [
    { id: 'nest', label: 'Colony', icon: ICONS.nest, render: (n) => <Overview go={n} /> },
    { id: 'chambers', label: 'Chambers', icon: ICONS.chambers, render: () => <Chambers /> },
    { id: 'brood', label: 'Brood Hall', icon: ICONS.brood, render: () => <Brood /> },
    { id: 'research', label: 'Research', icon: ICONS.research, render: () => <Research /> },
    { id: 'map', label: 'Map', icon: ICONS.map, render: (n) => <MapScreen nav={n} start={params} /> },
    { id: 'missions', label: 'Missions', icon: ICONS.missions, render: () => <Missions draft={params} />, badge: (state.incoming ?? []).filter((i: any) => i.hostile).length },
    { id: 'reports', label: 'Reports', icon: ICONS.reports, render: () => <Reports />, badge: state.unreadReports },
    { id: 'rankings', label: 'Rankings', icon: ICONS.ranks, render: () => <Rankings /> },
  ];
  if (isAdmin) screens.push({ id: 'feedback', label: 'Feedback', icon: ICONS.feedback, render: () => <FeedbackAdmin onCount={onFeedbackCount} />, badge: openFeedback });
  const current = screens.find((s) => s.id === screen) ?? screens[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="wordmark small">Hormigas</span>
          {state.colonies.length > 1 ? (
            <select className="colony-select" value={colony.id} onChange={(e) => selectColony(Number(e.target.value))} aria-label="Switch colony">
              {state.colonies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({fmtCoords(c.coords)})
                </option>
              ))}
            </select>
          ) : (
            <span className="muted colony-label">{colony.name}</span>
          )}
        </div>
        <div className="topbar-actions">
          <FeedbackButton screen={current.id} />
          <button
            className="btn ghost small"
            onClick={async () => {
              await api.post('/api/auth/logout');
              setLoggedIn(false);
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <ResourceBar />
      <nav className="nav" aria-label="Screens">
        {screens.map((s) => (
          <button key={s.id} className={s.id === current.id ? 'on' : ''} aria-current={s.id === current.id ? 'page' : undefined} onClick={() => nav(s.id)}>
            {s.icon}
            <span>{s.label}</span>
            {s.badge ? <span className="badge" aria-label={`${s.badge} new`}>{s.badge}</span> : null}
          </button>
        ))}
      </nav>
      <main className="content">{current.render(nav)}</main>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
