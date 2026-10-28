// Tap a chamber in the nest: what it does, what it holds, and digging its next level, without leaving the colony.
import { useEffect } from 'react';
import { CHAMBERS, protectedAmount, storageCapacity, type ChamberId, type ResourceId } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration, fmtFull } from '../format';
import { CHAMBER_BLURB, RESOURCE_LABEL, chamberEffect } from '../describe';
import { chamberPlan } from '../chamberPlan';
import { Cost } from './ui';

export const STORE_OF: Partial<Record<ChamberId, ResourceId>> = { granary: 'foliage', larder: 'protein', nectar_cellar: 'nectar' };

export function ChamberSheet({ id, onClose, onLookInside, onAllChambers }: { id: ChamberId; onClose: () => void; onLookInside: () => void; onAllChambers: () => void }) {
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
  const cap = storageCapacity(colony.chambers);
  const safe = protectedAmount(colony.chambers);
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
        {level > 0 && (
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
