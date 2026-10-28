// A close look inside one chamber (docs/12-ui-nest-view.md): the hollow at full size with ants drawn
// as field-guide portraits (docs/18-art-direction.md), and what the chamber holds.
// The chamber itself is still schematic; layered chamber art comes later.
import { useEffect, useMemo, type CSSProperties } from 'react';
import { CHAMBERS, lvl, storageCapacity, type ChamberId, type ResourceId } from '@hormigas/shared';
import { useGame } from '../game';
import { useMotion } from '../motion';
import { CASTES, FOOT_Y, antBody, type Caste } from '../art/ants';
import { seeded } from './nestScene';

const W = 400;
const H = 220;
const CX = 200;
const CY = 128;
const RX = 165;
const RY = 76;
const FLOOR = CY + RY * 0.7;

const STORES: Partial<Record<ChamberId, ResourceId>> = { granary: 'foliage', larder: 'protein', nectar_cellar: 'nectar' };
const COLOR: Record<ResourceId, string> = { foliage: '#8db255', protein: '#d06a6a', nectar: '#e8b23a' };
type Contents = 'leaves' | 'prey' | 'honey' | 'eggs' | null;
const CONTENTS: Partial<Record<ChamberId, Contents>> = {
  leaf_garden: 'leaves', granary: 'leaves', hunting_grounds: 'prey', larder: 'prey',
  aphid_pasture: 'honey', nectar_cellar: 'honey', honeypot_gallery: 'honey',
  nursery: 'eggs', brood_hall: 'eggs', queen_chamber: 'eggs',
};
const NAMES: Record<ResourceId, string> = { foliage: 'Foliage', protein: 'Protein', nectar: 'Nectar' };

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
  const contents = CONTENTS[id] ?? null;
  const rnd = seeded(id.length * 31 + level);
  const brood = colony.unitQueue.reduce((s, i) => s + i.count - i.done, 0);

  // what lies on the floor: more as the chamber grows (or, for stores, as it fills)
  const pieces = contents ? Math.round(contents === 'eggs' ? Math.min(14, 3 + (id === 'brood_hall' ? brood : level)) : 4 + (store ? fill * 22 : Math.min(16, level * 1.5))) : 0;
  const items = Array.from({ length: pieces }, () => {
    const x = CX + (rnd() - 0.5) * RX * 1.5;
    const spread = Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2));
    return { x, y: CY + RY * spread * (0.55 + rnd() * 0.35), r: rnd() };
  });

  const workers = id === 'queen_chamber' ? 2 : Math.min(6, 2 + Math.ceil(level / 3));
  const walkers = Array.from({ length: workers }, (_, i) => {
    const a = CX - RX * 0.62 + rnd() * RX * 0.4;
    const b = CX + RX * 0.62 - rnd() * RX * 0.4;
    return { a, b, y: FLOOR - 8 + (i % 3) * 6, dur: 9 + rnd() * 7, delay: rnd() * 16 + i * 3 };
  });

  return (
    <div className="closeup" role="dialog" aria-label={`Inside the ${CHAMBERS[id].name}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <clipPath id="cu-hollow"><ellipse cx={CX} cy={CY} rx={RX} ry={RY} /></clipPath>
        </defs>
        {Array.from({ length: 40 }, (_, i) => {
          const r = seeded(i + 5);
          return <circle key={i} cx={r() * W} cy={r() * H} r={1 + r() * 2.5} fill="#45331f" opacity={0.7} />;
        })}
        <path d={`M${CX - 30},0 C${CX - 30},30 ${CX - 10},40 ${CX - 20},${CY - RY + 6}`} stroke="#1a130e" strokeWidth={22} fill="none" strokeLinecap="round" />
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="#1a130e" stroke="#4c3a2b" strokeWidth={3} />
        <g clipPath="url(#cu-hollow)">
          {store && fill > 0.01 && <rect x={0} y={CY + RY - 2 * RY * fill} width={W} height={2 * RY * fill} fill={COLOR[store]} opacity={0.22} />}
          {items.map((p, i) =>
            contents === 'leaves' ? (
              <ellipse key={i} cx={p.x} cy={p.y} rx={7} ry={3} fill="#8db255" stroke="#5f7d36" strokeWidth={0.8} transform={`rotate(${p.r * 140 - 70} ${p.x} ${p.y})`} />
            ) : contents === 'prey' ? (
              <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r * 360})`}>
                <ellipse rx={6} ry={4} fill="#9b4f45" />
                <path d="M-5,2 l-3,3 M0,3 l0,4 M5,2 l3,3" stroke="#6e3530" strokeWidth={1} />
              </g>
            ) : contents === 'honey' ? (
              <circle key={i} cx={p.x} cy={p.y} r={3 + p.r * 3} fill="#e8b23a" stroke="#b9861d" strokeWidth={0.8} opacity={0.9} />
            ) : (
              <ellipse key={i} cx={p.x} cy={p.y + 2} rx={3.6} ry={2.4} fill="#f3ead8" transform={`rotate(${p.r * 60 - 30} ${p.x} ${p.y})`} />
            ),
          )}
          {walkers.map((wk, i) => (
            <Walker key={i} caste="worker" x={wk.a} x2={wk.b} y={id === 'queen_chamber' ? FLOOR - 14 : wk.y} len={42 + (wk.y - FLOOR) * 0.5} dur={wk.dur} delay={wk.delay} still={reduced} />
          ))}
          {/* the queen rests in front, workers tend her from behind */}
          {id === 'queen_chamber' && <Walker caste="queen" x={CX + 10} x2={CX + 10} y={FLOOR + 6} len={110} dur={1} delay={0} still />}
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
