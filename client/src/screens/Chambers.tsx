import { CHAMBERS, spaceMax, spaceUsed, type ChamberId } from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration } from '../format';
import { CHAMBER_BLURB, chamberEffect } from '../describe';
import { chamberPlan } from '../chamberPlan';
import { Cost, Countdown, Panel, Pic } from '../components/ui';

const GROUPS: { title: string; ids: ChamberId[] }[] = [
  { title: 'Food & workforce', ids: ['leaf_garden', 'hunting_grounds', 'aphid_pasture', 'nursery'] },
  { title: 'Storage', ids: ['granary', 'larder', 'nectar_cellar', 'honeypot_gallery'] },
  { title: 'Colony', ids: ['queen_chamber', 'brood_hall', 'pheromone_chamber', 'excavation_works'] },
];

export function Chambers() {
  const { colony, state, act } = useGame();
  if (!colony || !state) return null;
  const research = state.player.research;
  const used = spaceUsed(colony.chambers);
  const max = spaceMax(colony.baseSpace, research);
  const job = colony.buildJob;

  return (
    <div className="stack">
      <Panel
        title="Chambers"
        actions={
          <span className="muted" title="Each chamber level takes one unit of space">
            Space {used}/{max}
          </span>
        }
      >
        {job ? (
          <div className="active-job">
            <div>
              <strong>Digging {CHAMBERS[job.chamber as ChamberId].name}</strong> to level {job.level}
            </div>
            <Countdown startAt={job.startAt} endAt={job.endAt} />
            <button className="btn ghost small" onClick={() => act(() => api.post(`/api/colonies/${colony.id}/build/cancel`), 'Construction cancelled. Resources refunded.')}>
              Cancel
            </button>
          </div>
        ) : (
          <p className="muted">Your diggers are idle. Pick a chamber to expand.</p>
        )}
      </Panel>

      {GROUPS.map((g) => (
        <Panel key={g.title} title={g.title}>
          <ul className="rows">
            {g.ids.map((id) => {
              const { level, next, locked, cost, secs, blocked } = chamberPlan(colony, state, id);
              return (
                <li key={id} className={`row has-pic${locked ? ' locked' : ''}`}>
                  <Pic kind="chamber" id={id} />
                  <div className="row-main">
                    <div className="row-title">
                      <h3>{CHAMBERS[id].name}</h3>
                      {level > 0 && <span className="level">Lv {level}</span>}
                    </div>
                    <p className="blurb">{CHAMBER_BLURB[id]}</p>
                    {!locked && (
                      <p className="effect">
                        {level > 0 && CHAMBERS[id].effect.type !== 'gate' && <span>{chamberEffect(id, level, colony.terrain, state.world.speed)}</span>}
                        <span className="next">
                          {level > 0 ? 'Next: ' : 'At level 1: '}
                          {chamberEffect(id, next, colony.terrain, state.world.speed)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="row-side">
                    {locked ? (
                      <span className="req">{blocked}</span>
                    ) : (
                      <>
                        <Cost cost={cost} have={colony.resources} />
                        <span className="time">{fmtDuration(secs * 1000)}</span>
                        <button
                          className="btn primary"
                          disabled={!!blocked}
                          title={blocked || undefined}
                          onClick={() => act(() => api.post(`/api/colonies/${colony.id}/build`, { chamber: id }))}
                        >
                          {level === 0 ? 'Build' : `Dig level ${next}`}
                        </button>
                        {blocked && <span className="why">{blocked}</span>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
