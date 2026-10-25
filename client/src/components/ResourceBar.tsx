import { RESOURCE_IDS, productionPerHour, storageCapacity, workforce, protectedAmount } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtFull, fmtNum } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { ResDot } from './ui';

export function ResourceBar() {
  const { colony } = useGame();
  if (!colony) return null;
  const rate = productionPerHour(colony.chambers, colony.terrain);
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
