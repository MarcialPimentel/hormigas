// A close look inside one chamber (docs/12-ui-nest-view.md): the chamber's art (docs/18-art-direction.md,
// client/src/art/chambers.ts) at full size, with workers walking its floor and stores tinted by how full they are.
import { useEffect, useMemo, type CSSProperties } from 'react';
import { CHAMBERS, lvl, storageCapacity, type ChamberId, type ResourceId } from '@hormigas/shared';
import { useGame } from '../game';
import { useMotion } from '../motion';
import { CASTES, FOOT_Y, antBody, type Caste } from '../art/ants';
import { FLOOR, HOLLOW, VIEW, chamberBody } from '../art/chambers';
import { seeded } from './nestScene';

const STORES: Partial<Record<ChamberId, ResourceId>> = { granary: 'foliage', larder: 'protein', nectar_cellar: 'nectar' };
const COLOR: Record<ResourceId, string> = { foliage: '#8db255', protein: '#d06a6a', nectar: '#e8b23a' };
const NAMES: Record<ResourceId, string> = { foliage: 'Foliage', protein: 'Protein', nectar: 'Nectar' };
/** The part of the art the close-up frames: the hollow and its wall, a little trimmed. */
const FRAME = { x: 12, y: 8, w: VIEW.w - 24, h: VIEW.h - 12 };

/** One ant standing on (x, y), `len` units long; walks back and forth between x and x2 unless still. */
function Walker({ caste, x, x2, y = FLOOR, len, dur, delay, still }: { caste: Caste; x: number; x2: number; y?: number; len: number; dur: number; delay: number; still: boolean }) {
  const [vx, , vw] = CASTES[caste].vb;
  const k = len / vw;
  const body = useMemo(() => antBody(caste, { lod: 'portrait', walk: !still, stride: 0.5 }), [caste, still]);
  // standing still: somewhere along its beat, facing either way
  const at = x + (x2 - x) * ((delay % dur) / dur);
  const style = still
    ? { transform: `translate(${at}px, ${y}px) scaleX(${Math.floor(delay) % 2 ? -1 : 1})` }
    : ({ '--from': `${x}px`, '--to': `${x2}px`, '--y': `${y}px`, animationDuration: `${dur}s`, animationDelay: `-${delay}s` } as CSSProperties);
  return (
    <g className={still ? undefined : 'cu-walker'} style={style}>
      <g transform={`scale(${k}) translate(${-(vx + vw / 2)} ${-FOOT_Y})`} dangerouslySetInnerHTML={{ __html: body }} />
    </g>
  );
}

export function ChamberCloseUp({ id, onClose, onOpenChambers }: { id: ChamberId; onClose: () => void; onOpenChambers: () => void }) {
  const { colony } = useGame();
  const { reduced } = useMotion();
  const art = useMemo(() => chamberBody(id, `cu-${id}`), [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!colony) return null;
  const level = lvl(colony.chambers, id);
  const store = STORES[id];
  const cap = storageCapacity(colony.chambers);
  const fill = store ? Math.max(0, Math.min(1, colony.resources[store] / cap[store])) : 0;
  const rnd = seeded(id.length * 31 + level);
  const { cx, cy, rx, ry } = HOLLOW;

  // a few workers going about their business across the floor; more in bigger chambers
  const workers = Math.min(4, 1 + Math.floor(level / 3));
  const walkers = Array.from({ length: workers }, (_, i) => ({
    a: cx - rx * 0.5 + rnd() * rx * 0.15,
    b: cx + rx * 0.5 - rnd() * rx * 0.15,
    dur: 11 + rnd() * 8,
    delay: rnd() * 20 + i * 4,
  }));

  return (
    <div className="closeup" role="dialog" aria-label={`Inside the ${CHAMBERS[id].name}`}>
      <svg viewBox={`${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g dangerouslySetInnerHTML={{ __html: art }} />
        <g clipPath={`url(#ch-cu-${id})`}>
          {/* stores: a wash of their food colour rising with how full they are */}
          {store && fill > 0.01 && <rect x={0} y={cy + ry - 2 * ry * fill} width={VIEW.w} height={2 * ry * fill} fill={COLOR[store]} opacity={0.14} />}
          {walkers.map((wk, i) => (
            <Walker key={i} caste="worker" x={wk.a} x2={wk.b} y={FLOOR + (i % 2) * 1.5} len={22} dur={wk.dur} delay={wk.delay} still={reduced} />
          ))}
        </g>
      </svg>
      <div className="closeup-bar">
        <span className="closeup-title">
          {CHAMBERS[id].name} <span className="muted">level {level}</span>
        </span>
        <span className="closeup-actions">
          <button type="button" className="btn closeup-btn" onClick={onOpenChambers}>Upgrade</button>
          <button type="button" className="btn closeup-btn" onClick={onClose} aria-label="Back to the whole nest">Back</button>
        </span>
      </div>
      {store && (
        <div className="closeup-store small">
          {NAMES[store]}: {Math.floor(colony.resources[store]).toLocaleString()} / {Math.floor(cap[store]).toLocaleString()}
        </div>
      )}
    </div>
  );
}
