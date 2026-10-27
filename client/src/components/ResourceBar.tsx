import { useEffect, useRef, useState } from 'react';
import { RESOURCE_IDS, productionPerHour, storageCapacity, workforce, protectedAmount, type ResourceId } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtFull, fmtNum } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { ResDot } from './ui';

interface Pop {
  id: number;
  r: ResourceId;
  amount: number;
}

/** "+N" floating up from a resource when more arrives at once than production explains (cargo home, a gift, loot). */
function usePops() {
  const { colony, state } = useGame();
  const [pops, setPops] = useState<Pop[]>([]);
  const prev = useRef<{ id: number; res: Record<ResourceId, number> } | null>(null);
  useEffect(() => {
    if (!colony || !state) return;
    const p = prev.current;
    prev.current = { id: colony.id, res: { ...colony.resources } };
    if (!p || p.id !== colony.id) return;
    const rate = productionPerHour(colony.chambers, colony.terrain, state.world.speed);
    const fresh: Pop[] = [];
    for (const r of RESOURCE_IDS) {
      const jump = colony.resources[r] - p.res[r];
      // up to two minutes of production is just the clock catching up (background tabs tick slowly)
      if (jump >= Math.max(5, (rate[r] / 3600) * 120)) fresh.push({ id: Date.now() + Math.random(), r, amount: Math.floor(jump) });
    }
    if (fresh.length === 0) return;
    setPops((ps) => [...ps, ...fresh]);
    const ids = new Set(fresh.map((f) => f.id));
    setTimeout(() => setPops((ps) => ps.filter((x) => !ids.has(x.id))), 2400);
  }, [colony, state]);
  return pops;
}

export function ResourceBar() {
  const { colony, state } = useGame();
  const pops = usePops();
  if (!colony || !state) return null;
  const rate = productionPerHour(colony.chambers, colony.terrain, state.world.speed);
  const cap = storageCapacity(colony.chambers);
  const wf = workforce(colony.chambers);
  const safe = protectedAmount(colony.chambers);
  return (
    <div className="resbar" role="region" aria-label="Resources">
      {RESOURCE_IDS.map((r) => {
        const full = colony.resources[r] >= cap[r];
        return (
          <div
            key={r}
            className={`res res-${r}${full ? ' full' : ''}`}
            title={`${RESOURCE_LABEL[r]}: ${fmtFull(colony.resources[r])} / ${fmtFull(cap[r])}\n+${fmtFull(rate[r])} per hour${safe ? `\n${fmtFull(safe)} protected` : ''}${full ? '\nStorage full — production paused' : ''}`}
          >
            <ResDot r={r} />
            <span className="res-amount">{fmtNum(colony.resources[r])}</span>
            <span className="res-rate">{full ? 'full' : `+${fmtNum(rate[r])}/h`}</span>
            {pops
              .filter((p) => p.r === r)
              .map((p) => (
                <span key={p.id} className="res-pop" aria-hidden="true">
                  +{fmtNum(p.amount)}
                </span>
              ))}
          </div>
        );
      })}
      <div className={`res res-workforce${wf.ratio < 1 ? ' short' : ''}`} title={`Workforce: ${wf.demand} needed, ${wf.supply} available${wf.ratio < 1 ? `\nProduction at ${Math.round(wf.ratio * 100)}%` : ''}`}>
        <ResDot r="workforce" />
        <span className="res-amount">
          {fmtNum(wf.demand)}/{fmtNum(wf.supply)}
        </span>
        <span className="res-rate">{wf.ratio < 1 ? `${Math.round(wf.ratio * 100)}% output` : 'workforce'}</span>
      </div>
    </div>
  );
}
