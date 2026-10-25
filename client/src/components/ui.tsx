import { RESOURCE_IDS, type Resources } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtDuration, fmtFull, fmtNum } from '../format';
import { RESOURCE_LABEL } from '../describe';
import type { ReactNode } from 'react';

export function ResDot({ r }: { r: 'foliage' | 'protein' | 'nectar' | 'workforce' }) {
  return <span className={`dot dot-${r}`} aria-hidden="true" />;
}

/** Inline cost list; amounts the colony can't afford are marked. */
export function Cost({ cost, have }: { cost: Resources; have?: Resources }) {
  const parts = RESOURCE_IDS.filter((r) => cost[r] > 0);
  if (parts.length === 0) return <span className="muted">Free</span>;
  return (
    <span className="cost">
      {parts.map((r) => {
        const short = have ? have[r] < cost[r] : false;
        return (
          <span key={r} className={`cost-item${short ? ' short' : ''}`} title={`${fmtFull(cost[r])} ${RESOURCE_LABEL[r]}${short ? ` — you have ${fmtFull(have![r])}` : ''}`}>
            <ResDot r={r} />
            {fmtNum(cost[r])}
          </span>
        );
      })}
    </span>
  );
}

export function Countdown({ endAt, startAt }: { endAt: number; startAt?: number }) {
  const { now } = useGame();
  const left = endAt - now;
  const pct = startAt ? Math.min(100, Math.max(0, ((now - startAt) / (endAt - startAt)) * 100)) : null;
  return (
    <span className="countdown">
      {pct !== null && (
        <span className="bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className="num">{left > 0 ? fmtDuration(left) : 'finishing…'}</span>
    </span>
  );
}

export function Panel({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
