import { useState } from 'react';
import {
  CASTES,
  DEFENSES,
  MVP_CASTES,
  MVP_DEFENSES,
  RESOURCE_IDS,
  lvl,
  missingRequirements,
  queueEndsAt,
  queuedCounts,
  scale,
  unitSeconds,
  type CasteId,
  type DefenseId,
  type Resources,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration, fmtFull, fmtNum } from '../format';
import { Cost, Countdown, Panel } from '../components/ui';
import { whyShort } from '../describe';

export const CASTE_BLURB: Record<string, string> = {
  worker: 'Cheap all-rounders. Carry loot and haul corpses.',
  minor_soldier: 'Fast and cheap. Good early raiders and fodder. Shred workers and scouts.',
  scout: 'Spies on other colonies. Nearly useless in a fight.',
  major_soldier: 'The colony’s main fighters. Tear through minor soldiers.',
  hauler: 'Big carriers for loot, transports and corpses.',
  soil_wall: 'One per colony. Huge guard that soaks up blows for the whole defense.',
  pit_trap: 'Cheap, Foliage-only trap. Good at absorbing an attack.',
  acid_sentry: 'Formic acid emplacement. Strong, and dangerous to major soldiers.',
};

const affordableCount = (cost: Resources, have: Resources) =>
  Math.max(0, Math.min(...RESOURCE_IDS.filter((r) => cost[r] > 0).map((r) => Math.floor(have[r] / cost[r]))));

function Stats({ def }: { def: any }) {
  const frenzy = Object.entries(def.frenzy ?? {}) as [string, number][];
  return (
    <dl className="stats">
      <div><dt>Attack</dt><dd>{fmtNum(def.attack)}</dd></div>
      <div><dt>Guard</dt><dd>{fmtNum(def.guard)}</dd></div>
      <div><dt>Health</dt><dd>{fmtNum(def.health)}</dd></div>
      {'speed' in def && <div><dt>Speed</dt><dd>{fmtNum(def.speed)}</dd></div>}
      {'cargo' in def && def.cargo > 0 && <div><dt>Cargo</dt><dd>{fmtNum(def.cargo)}</dd></div>}
      {frenzy.length > 0 && (
        <div className="wide">
          <dt>Frenzy</dt>
          <dd>{frenzy.map(([t, n]) => `vs ${(CASTES as any)[t]?.name ?? (DEFENSES as any)[t]?.name ?? t} ×${n}`).join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

export function Brood() {
  const { colony, state, act } = useGame();
  const [tab, setTab] = useState<'caste' | 'defense'>('caste');
  const [counts, setCounts] = useState<Record<string, string>>({});
  if (!colony || !state) return null;
  const brood = lvl(colony.chambers, 'brood_hall');
  const queued = queuedCounts(colony.unitQueue);
  const ends = queueEndsAt(colony.unitQueue);
  const head = colony.unitQueue[0];
  const ids = tab === 'caste' ? MVP_CASTES : MVP_DEFENSES;

  return (
    <div className="stack">
      <Panel title="Brood Hall" actions={<span className="muted">{brood > 0 ? `Lv ${brood}` : 'not built'}</span>}>
        {brood === 0 ? (
          <p className="muted">Build a Brood Hall (Chambers → Colony) to raise castes and defenses.</p>
        ) : colony.unitQueue.length === 0 ? (
          <p className="muted">The Brood Hall is empty. Raise castes to forage, raid and defend.</p>
        ) : (
          <div className="queue">
            {colony.unitQueue.map((item, i) => {
              const def = item.kind === 'caste' ? CASTES[item.id as CasteId] : DEFENSES[item.id as DefenseId];
              return (
                <div key={i} className="queue-item">
                  <span>
                    {def.name} <span className="muted">{fmtFull(item.done)}/{fmtFull(item.count)}</span>
                  </span>
                  {i === 0 && head?.startAt != null && (
                    <span className="muted small">
                      next in <Countdown endAt={head.startAt + (head.done + 1) * head.perUnitMs} />
                    </span>
                  )}
                </div>
              );
            })}
            {ends && (
              <p className="small muted">
                All done in <Countdown endAt={ends} />
              </p>
            )}
          </div>
        )}
        {colony.buildJob?.chamber === 'brood_hall' && <p className="notice">The Brood Hall is being enlarged and can't raise units until it's done.</p>}
      </Panel>

      <div className="tabs" role="tablist" style={{ maxWidth: 360 }}>
        <button role="tab" aria-selected={tab === 'caste'} className={tab === 'caste' ? 'on' : ''} onClick={() => setTab('caste')}>
          Castes
        </button>
        <button role="tab" aria-selected={tab === 'defense'} className={tab === 'defense' ? 'on' : ''} onClick={() => setTab('defense')}>
          Defenses
        </button>
      </div>

      <Panel>
        <ul className="rows">
          {ids.map((id) => {
            const def: any = tab === 'caste' ? CASTES[id as CasteId] : DEFENSES[id as DefenseId];
            const missing = missingRequirements(def.unlock, colony.chambers, state.player.research);
            const have = tab === 'caste' ? lvl(colony.units, id as CasteId) : lvl(colony.defenses, id as DefenseId);
            const maxAfford = affordableCount(def.cost, colony.resources);
            const cap = def.max ? Math.max(0, def.max - have - (queued[id] ?? 0)) : Infinity;
            const maxN = Math.min(maxAfford, cap, 100000);
            const raw = counts[id] ?? '';
            const n = Math.max(0, Math.floor(Number(raw) || 0));
            const per = unitSeconds(def.cost, { worldSpeed: state.world.speed, broodHall: Math.max(1, brood), timeMultiplier: state.player.timeMultiplier });
            let blocked = '';
            if (brood === 0) blocked = 'Build a Brood Hall first';
            else if (missing.length) blocked = `Needs ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}`;
            else if (colony.buildJob?.chamber === 'brood_hall') blocked = 'Brood Hall is being enlarged';
            else if (cap === 0) blocked = `Limit ${def.max} per colony`;
            else if (n > maxN) blocked = maxAfford < n ? whyShort(colony, scale(def.cost, n), state.world.speed) : 'Over the limit';
            return (
              <li key={id} className={`row${missing.length ? ' locked' : ''}`}>
                <div className="row-main">
                  <div className="row-title">
                    <h3>{def.name}</h3>
                    <span className="muted small">
                      {fmtFull(have)} {tab === 'caste' ? 'home' : 'built'}
                      {queued[id] ? ` · ${fmtFull(queued[id])} queued` : ''}
                    </span>
                  </div>
                  <p className="blurb">{CASTE_BLURB[id]}</p>
                  <Stats def={def} />
                </div>
                <div className="row-side">
                  {missing.length || brood === 0 ? (
                    <span className="req">{blocked}</span>
                  ) : (
                    <>
                      <span className="small muted">
                        Each: <Cost cost={def.cost} /> · {fmtDuration(per * 1000)}
                      </span>
                      <form
                        className="count-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (n < 1 || blocked) return;
                          if (await act(() => api.post(`/api/colonies/${colony.id}/brood`, { kind: tab, id, count: n }), `${fmtFull(n)} ${def.name} queued.`))
                            setCounts((c) => ({ ...c, [id]: '' }));
                        }}
                      >
                        <input
                          inputMode="numeric"
                          aria-label={`How many ${def.name}`}
                          placeholder="0"
                          value={raw}
                          onChange={(e) => setCounts((c) => ({ ...c, [id]: e.target.value.replace(/\D/g, '') }))}
                        />
                        <button type="button" className="btn ghost small" disabled={maxN < 1} onClick={() => setCounts((c) => ({ ...c, [id]: String(maxN) }))}>
                          Max {fmtNum(maxN)}
                        </button>
                        <button className="btn primary" disabled={n < 1 || !!blocked}>
                          Raise
                        </button>
                      </form>
                      {n > 0 && !blocked && (
                        <span className="why">
                          Total <Cost cost={scale(def.cost, n)} have={colony.resources} /> · {fmtDuration(per * n * 1000)}
                        </span>
                      )}
                      {blocked && <span className="why">{blocked}</span>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
