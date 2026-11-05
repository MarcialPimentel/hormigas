// Colony needs, the daily tasks, with Yesterday in the colony on top (docs/26-come-back.md).
import { useState } from 'react';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration } from '../format';
import { Cost } from './ui';
import type { Nav } from '../nav';

interface Need {
  day: number;
  slot: number;
  id: string;
  title: string;
  hint: string;
  screen: string;
  done: number;
  target: number;
  ready: boolean;
  claimed: boolean;
  carried: boolean;
  expiresAt: number;
}

const YESTERDAY_KEY = 'hormigas.yesterdaySeen';

/** `here`: the screen this card sits on; a need pointing there gets no Show me (it would go nowhere). */
export function NeedsCard({ nav, here }: { nav: Nav; here?: string }) {
  const { state, colony, act, now } = useGame();
  const [seenDay, setSeenDay] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(YESTERDAY_KEY)) || null;
    } catch {
      return null;
    }
  });
  const needs = state?.needs;
  if (!needs || !colony) return null;
  const list: Need[] = needs.needs;
  const showYesterday = needs.yesterday && needs.yesterday.rows.length > 0 && seenDay !== needs.day;
  if (list.length === 0 && !showYesterday) return null;
  const open = list.filter((n) => !n.claimed);
  const doneToday = list.filter((n) => n.claimed).length;

  return (
    <section className="needs" aria-label="Colony needs">
      {showYesterday && (
        <div className="needs-yesterday">
          <p className="small">
            <strong>{needs.yesterday.days === 1 ? 'Yesterday in the colony' : `The last ${needs.yesterday.days} days in the colony`}</strong>
            {': '}
            {needs.yesterday.rows.map((r: { text: string }) => r.text).join(' · ')}.
          </p>
          <button
            className="btn ghost small"
            onClick={() => {
              try {
                localStorage.setItem(YESTERDAY_KEY, String(needs.day));
              } catch {
                /* ignore */
              }
              setSeenDay(needs.day);
            }}
          >
            Got it
          </button>
        </div>
      )}
      {list.length > 0 && (
        <>
          <header className="needs-head">
            <h2>Colony needs</h2>
            <span className="muted small">
              Each pays <Cost cost={needs.reward} /> · new needs in {fmtDuration(Math.max(0, needs.endsAt - now))}
            </span>
          </header>
          <ul className="needs-list">
            {open.map((n) => (
              <li key={`${n.day}-${n.slot}`} className={`need${n.ready ? ' ready' : ''}`}>
                <div className="need-main">
                  <strong>{n.title}</strong>
                  <span className="need-bar" aria-hidden="true">
                    <span style={{ width: `${(n.done / n.target) * 100}%` }} />
                  </span>
                  <span className="muted small">
                    {n.done.toLocaleString('en-US')} / {n.target.toLocaleString('en-US')}
                    {n.carried ? ` · from yesterday, fades in ${fmtDuration(Math.max(0, n.expiresAt - now))}` : ` · ${n.hint}`}
                  </span>
                </div>
                <div className="need-side">
                  {n.ready ? (
                    <button
                      className="btn primary small"
                      onClick={() => act(() => api.post('/api/needs/claim', { day: n.day, slot: n.slot, colonyId: colony.id }), `Reward collected in ${colony.name}.`)}
                    >
                      Collect
                    </button>
                  ) : (
                    n.screen !== here && (
                      <button className="btn small" onClick={() => nav(n.screen)}>
                        Show me
                      </button>
                    )
                  )}
                  {needs.canReroll && !n.carried && !n.ready && (
                    <button
                      className="btn ghost small"
                      title="Swap this need for another. Once a day."
                      onClick={() => act(() => api.post('/api/needs/reroll', { slot: n.slot }), 'The colony needs something else.')}
                    >
                      Swap
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {open.length === 0 && <p className="muted small">Everything the colony needed today is done. Rest easy.</p>}
          {doneToday > 0 && open.length > 0 && <p className="muted small">{doneToday} done today.</p>}
          <p className="muted small needs-foot">Missing a day costs nothing: unfinished needs keep until the day after.</p>
        </>
      )}
    </section>
  );
}
