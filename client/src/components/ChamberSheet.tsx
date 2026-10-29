// Tap a chamber in the nest: what it does, what it holds, and digging its next level, without leaving the colony.
import { useEffect, useRef } from 'react';
import { CHAMBERS, protectedAmount, storageCapacity, type ChamberId, type ResourceId } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration, fmtFull } from '../format';
import { CHAMBER_BLURB, RESOURCE_LABEL, chamberEffect } from '../describe';
import { chamberPlan } from '../chamberPlan';
import { Cost } from './ui';

export const STORE_OF: Partial<Record<ChamberId, ResourceId>> = { granary: 'foliage', larder: 'protein', nectar_cellar: 'nectar' };

interface SheetProps {
  id: ChamberId;
  onClose: () => void;
  onLookInside?: () => void;
  onAllChambers: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The chamber's card, popped up beside the chamber itself (the Colony screen on a computer). `at` says where the
 * chamber is on screen right now, in pixels inside the nest; the card follows it as the nest turns.
 */
export function ChamberPopover({ at, ...sheet }: SheetProps & { at: () => { x: number; y: number; rx: number } | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = box.current;
      const host = el?.offsetParent as HTMLElement | null;
      const p = at();
      if (!el || !host) return;
      el.style.visibility = p ? 'visible' : 'hidden';
      if (!p) return;
      // keep clear of the cards floating down the right of the 3D nest (the flat nest already stops short of them)
      const cards = host.classList.contains('n3') ? parseFloat(getComputedStyle(host).getPropertyValue('--cards-w')) + 28 || 0 : 0;
      const W = host.clientWidth - cards, H = host.clientHeight, w = el.offsetWidth, h = el.offsetHeight, gap = 12;
      // to the chamber's right if it fits, otherwise to its left
      const right = p.x + p.rx + gap + w <= W - 8;
      const x = clamp(right ? p.x + p.rx + gap : p.x - p.rx - gap - w, 8, Math.max(8, W - w - 8));
      const y = clamp(p.y - 44, 8, Math.max(8, H - h - 8));
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.dataset.side = right ? 'right' : 'left';
      el.style.setProperty('--arrow-y', `${Math.round(clamp(p.y - y, 18, h - 18))}px`);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [at]);
  return (
    <div className="sheet-pop" ref={box}>
      <ChamberSheet {...sheet} />
    </div>
  );
}

export function ChamberSheet({ id, onClose, onLookInside, onAllChambers }: SheetProps) {
  const { colony, state, act, now } = useGame();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!colony || !state) return null;
  const { level, next, locked, cost, secs, blocked } = chamberPlan(colony, state, id);
  const def = CHAMBERS[id];
  const store = STORE_OF[id];
  const cap = storageCapacity(colony.chambers, colony.research);
  const safe = protectedAmount(colony.chambers, colony.research);
  const job = colony.buildJob?.chamber === id ? colony.buildJob : null;

  return (
    <section className="sheet" aria-label={`${def.name}`}>
      <div className="sheet-head">
        <h2>
          {def.name} <span className="muted sheet-level">{level > 0 ? `level ${level}` : 'not dug yet'}</span>
        </h2>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      <p className="muted small">{CHAMBER_BLURB[id]}</p>
      {level > 0 && store && (
        <p className="small">
          Holds {fmtFull(colony.resources[store])} of {fmtFull(cap[store])} {RESOURCE_LABEL[store].toLowerCase()}.
          {safe > 0 ? ` Raids can only take what's above ${fmtFull(safe)}.` : ''}
        </p>
      )}
      {level > 0 && !store && def.effect.type !== 'gate' && <p className="small">Now: {chamberEffect(id, level, colony.terrain, state.world.speed)}</p>}
      {job ? (
        <p className="small sheet-next">
          <strong>Digging level {job.level}</strong> · {fmtDuration(job.endAt - now)} left
        </p>
      ) : locked ? (
        <p className="small sheet-next">{blocked}</p>
      ) : (
        <p className="small sheet-next">
          <strong>{level > 0 ? `Level ${next}` : 'At level 1'}:</strong> {chamberEffect(id, next, colony.terrain, state.world.speed)}
          <br />
          <Cost cost={cost} have={colony.resources} /> · {fmtDuration(secs * 1000)} to dig
        </p>
      )}
      <div className="sheet-actions">
        {!locked && !job && (
          <button
            type="button"
            className="btn primary"
            disabled={!!blocked}
            title={blocked || undefined}
            onClick={() => act(() => api.post(`/api/colonies/${colony.id}/build`, { chamber: id }))}
          >
            {level === 0 ? 'Dig it' : 'Dig deeper'}
          </button>
        )}
        {level > 0 && onLookInside && (
          <button type="button" className="btn" onClick={onLookInside}>
            Look inside
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onAllChambers}>
          All chambers
        </button>
        {!locked && !job && blocked && <span className="why">{blocked}</span>}
      </div>
    </section>
  );
}
