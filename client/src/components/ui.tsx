import { RESOURCE_IDS, type Resources } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtDuration, fmtFull, fmtNum } from '../format';
import { RESOURCE_LABEL } from '../describe';
import type { ReactNode } from 'react';
import { picSvg, type PicKind } from '../art/icons';
import { useMotion } from '../motion';
import { CASTES, antSvg, type Caste } from '../art/ants';

/** The picture for a chamber, unit, defense or research, on its light tile (client/src/art/icons.ts). Decorative: the name sits beside it. */
export function Pic({ kind, id }: { kind: PicKind; id: string }) {
  const svg = picSvg(kind, id);
  return svg ? <span className="pic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="pic" aria-hidden="true" />;
}

/** Each resource as a little picture: a cut leaf, prey, a drop of honeydew, a worker. */
const RES_ICON: Record<'foliage' | 'protein' | 'nectar' | 'workforce', ReactNode> = {
  foliage: (
    <>
      <path d="M1.5,10.5 C1.5,4.5 5,1.5 10.5,1.5 C10.5,7 7.5,10.5 1.5,10.5Z" fill="currentColor" />
      <path d="M2.2,9.8 L8.6,3.4" stroke="#3f5a22" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  protein: (
    <>
      <ellipse cx="5.2" cy="6.6" rx="3.9" ry="3.1" fill="currentColor" />
      <circle cx="9.6" cy="5.6" r="1.7" fill="currentColor" />
      <path d="M3,9.4 l-1.4,1.6 M5.4,9.7 l0,1.8 M7.6,9.2 l1.3,1.6 M5.2,3.6 L5.2,9.6" stroke="#6e3530" strokeWidth="0.8" strokeLinecap="round" />
    </>
  ),
  nectar: (
    <>
      <path d="M6,1 C7.8,4 10,6.1 10,8 A4,4 0 0 1 2,8 C2,6.1 4.2,4 6,1Z" fill="currentColor" />
      <ellipse cx="4.6" cy="7.6" rx="0.9" ry="1.4" fill="#fff3c8" opacity="0.8" />
    </>
  ),
  workforce: (
    <>
      <ellipse cx="3.4" cy="7" rx="2.6" ry="2" fill="currentColor" />
      <ellipse cx="6.8" cy="6.4" rx="1.6" ry="1.2" fill="currentColor" />
      <circle cx="9.5" cy="5.6" r="1.7" fill="currentColor" />
      <path d="M5.6,7.4 l-1.6,3 M6.9,7.6 l0,2.8 M8,7.2 l1.8,2.9 M9.8,4.2 l1.4,-2.4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function ResDot({ r }: { r: 'foliage' | 'protein' | 'nectar' | 'workforce' }) {
  return (
    <svg className={`dot icon-${r}`} viewBox="0 0 12 12" aria-hidden="true">
      {RES_ICON[r]}
    </svg>
  );
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

// hex, not CSS variables: these go inside the ant SVG
const TRIP_LOAD: Record<string, string> = { foliage: '#8db255', protein: '#d06a6a', nectar: '#e8b23a' };
const TRIP_ANT_LEN = 18;

const tripAntCache = new Map<string, string>();
/** One small walking ant for a trip track (cached: the same few are drawn every second). */
function tripAnt(caste: Caste, i: number, walk: boolean, enemy: boolean, load?: string) {
  const key = `${caste}|${i}|${walk}|${enemy}|${load ?? ''}`;
  let svg = tripAntCache.get(key);
  if (!svg) {
    const [, , w, h] = CASTES[caste].vb;
    const len = caste === 'soldier' ? TRIP_ANT_LEN + 2 : TRIP_ANT_LEN;
    svg = antSvg(caste, { lod: 'sprite', walk, enemy, load, phase: i * 0.13 }, `width="${len}" height="${((len * h) / w).toFixed(1)}"`);
    tripAntCache.set(key, svg);
  }
  return svg;
}

/**
 * A party on its way: home on the left, the target on the right. Outbound it walks right; coming home
 * it walks back left, carrying coloured cargo. `incoming` parties walk from the right toward home.
 */
export function Trip({
  departAt,
  arriveAt,
  returnAt,
  status,
  cargo,
  incoming,
  hostile,
}: {
  departAt?: number;
  arriveAt: number;
  returnAt?: number;
  status: 'outbound' | 'returning' | 'holding';
  cargo?: Record<string, number>;
  incoming?: boolean;
  hostile?: boolean;
}) {
  const { now } = useGame();
  const { reduced } = useMotion();
  const k = (a: number | undefined, b: number | undefined) => (a && b && b > a ? Math.min(1, Math.max(0, (now - a) / (b - a))) : 0.5);
  let pos: number;
  let back = false;
  if (incoming) {
    pos = 100 - 100 * k(departAt, arriveAt);
    back = true;
  } else if (status === 'outbound') pos = 100 * k(departAt, arriveAt);
  else if (status === 'holding') pos = 100;
  else {
    pos = 100 - 100 * k(arriveAt, returnAt);
    back = true;
  }
  const loads = !incoming && status === 'returning' ? Object.keys(TRIP_LOAD).filter((r) => (cargo?.[r] ?? 0) > 0) : [];
  return (
    <span className={`trip${hostile ? ' hostile' : ''}`} aria-hidden="true">
      <span className="trip-home" />
      <span className="trip-line">
        {/* the whole party stays on the line: it slides across the room the line has left over */}
        <span className={`trip-party${back ? ' back' : ''}`} style={{ left: `calc((100% - ${3 * (hostile ? TRIP_ANT_LEN + 2 : TRIP_ANT_LEN) + 6}px) * ${(pos / 100).toFixed(4)})` }}>
          {[0, 1, 2].map((i) => (
            <i
              key={i}
              dangerouslySetInnerHTML={{
                __html: tripAnt(hostile ? 'soldier' : 'worker', i, !reduced, !!hostile, loads.length ? TRIP_LOAD[loads[i % loads.length]] : undefined),
              }}
            />
          ))}
        </span>
      </span>
      <span className="trip-target" />
    </span>
  );
}
