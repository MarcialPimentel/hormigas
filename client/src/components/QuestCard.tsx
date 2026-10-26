import { useState } from 'react';
import { api } from '../api';
import { useGame } from '../game';
import { Cost } from './ui';
import { enableNotifications, notificationsEnabled, notificationsSupported } from '../notify';
import type { Nav } from '../nav';

export function QuestCard({ nav }: { nav: Nav }) {
  const { state, colony, act, toast } = useGame();
  const [askDismissed, setAskDismissed] = useState(() => {
    try {
      return localStorage.getItem('hormigas.notify') !== null;
    } catch {
      return true;
    }
  });
  if (!state || !colony || !state.quests) return null;
  const q = state.quests;

  if (q.finished) {
    if (askDismissed || !notificationsSupported() || notificationsEnabled()) return null;
    return (
      <section className="quest">
        <div className="quest-main">
          <h2>Know when you're raided</h2>
          <p className="muted">Get a browser notification for incoming raids, finished builds and reports while this tab is in the background.</p>
        </div>
        <div className="quest-side">
          <button
            className="btn primary"
            onClick={async () => {
              const ok = await enableNotifications();
              toast(ok ? 'ok' : 'error', ok ? 'Notifications turned on.' : 'Notifications are blocked in your browser settings.');
              setAskDismissed(true);
            }}
          >
            Turn on notifications
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              try {
                localStorage.setItem('hormigas.notify', 'off');
              } catch {
                /* ignore */
              }
              setAskDismissed(true);
            }}
          >
            Not now
          </button>
        </div>
      </section>
    );
  }

  const quest = q.quest;
  return (
    <section className={`quest${quest.ready ? ' ready' : ''}${quest.milestone ? ' big' : ''}`}>
      <div className="quest-main">
        <p className="quest-step muted small">
          Founding task {q.claimed + 1} of {q.total}
          {quest.milestone ? ' · first big milestone' : ''}
        </p>
        <h2>{quest.title}</h2>
        <p className="muted">{quest.hint}</p>
      </div>
      <div className="quest-side">
        <span className="small">
          Reward <Cost cost={quest.reward} />
        </span>
        {quest.ready ? (
          <button className="btn primary" onClick={() => act(() => api.post('/api/quests/claim', { id: quest.id, colonyId: colony.id }), 'Reward collected.')}>
            Collect reward
          </button>
        ) : (
          <button className="btn" onClick={() => nav(quest.screen)}>
            Show me
          </button>
        )}
      </div>
    </section>
  );
}
