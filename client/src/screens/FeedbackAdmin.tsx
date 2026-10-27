// Admin-only list of player feedback (docs/12-ui-nest-view.md).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useGame } from '../game';
import { fmtClock } from '../format';
import { Empty, Panel } from '../components/ui';

interface Item {
  id: number;
  kind: string;
  message: string;
  context: Record<string, string | number>;
  createdAt: number;
  handled: boolean;
  from: string;
}

export function FeedbackAdmin({ onCount }: { onCount: (n: number) => void }) {
  const { act } = useGame();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get(`/api/admin/feedback?show=${show}`)
      .then((r) => {
        setItems(r.items);
        onCount(r.open);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [show, onCount]);
  useEffect(load, [load]);

  async function mark(item: Item, handled: boolean) {
    if (await act(() => api.post(`/api/admin/feedback/${item.id}`, { handled }))) load();
  }

  return (
    <Panel
      title="Player feedback"
      actions={
        <div className="seg" role="radiogroup" aria-label="Show">
          {(['open', 'all'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={show === s} className={show === s ? 'on' : ''} onClick={() => setShow(s)}>
              {s === 'open' ? 'To read' : 'All'}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="form-error">{error}</p>}
      {!items ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <Empty>{show === 'open' ? 'Nothing new. Players are happy, or quiet.' : 'No feedback yet.'}</Empty>
      ) : (
        <ul className="feedback-list">
          {items.map((f) => (
            <li key={f.id} className={f.handled ? 'handled' : ''}>
              <div className="feedback-meta small">
                <span className={`kind kind-${f.kind}`}>{f.kind}</span>
                <strong>{f.from}</strong>
                <span className="muted">{fmtClock(f.createdAt)}</span>
              </div>
              <p className="feedback-message">{f.message}</p>
              <p className="muted small">
                {[f.context.screen && `on ${f.context.screen}`, f.context.colony && `${f.context.colony} (${f.context.coords})`, f.context.viewport]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {f.context.userAgent && <p className="muted small ua">{f.context.userAgent}</p>}
              <button className="btn ghost small" onClick={() => mark(f, !f.handled)}>
                {f.handled ? 'Mark as unread' : 'Mark as handled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
