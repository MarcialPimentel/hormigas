import {
  MVP_RESEARCH,
  RESEARCH,
  canAfford,
  lvl,
  missingRequirements,
  researchCost,
  researchMaxLevel,
  researchSeconds,
  type ResearchId,
} from '@hormigas/shared';
import { api } from '../api';
import { useGame } from '../game';
import { fmtDuration } from '../format';
import { Cost, Countdown, Panel, Pic } from '../components/ui';
import { whyShort } from '../describe';

export const RESEARCH_BLURB: Record<string, string> = {
  // Jaws
  mandibles: 'Stronger jaws. +10% attack per level for all units and defenses.',
  chitin: 'Tougher shells. +10% health per level.',
  guard_formation: 'Tighter ranks. +10% guard per level.',
  formic_acid: 'Guards spray acid from the gaster. Defenses get +10% attack, guard and health per level.',
  raiding_columns: 'March in long columns like army ants. Winning raids carry off +5% more of unprotected stores per level (up to 65%).',
  nest_plugging: 'Big-headed doorkeepers plug the entrances. +25% protected storage per level.',
  // Harvest
  foraging_instinct: 'Better luck on forage expeditions. +1 forage slot every 2 levels.',
  group_hunting: 'Recruit nestmates to bring down big prey. +5% Protein from Hunting Grounds per level.',
  aphid_husbandry: 'Tend and guard aphid herds. +5% Nectar from Aphid Pastures per level.',
  fungus_farming: 'Grow fungus on chewed leaves, like leafcutter ants. +5% Foliage from Leaf Gardens per level.',
  repletes: 'Living storage jars: workers that swell with food. +10% storage for every resource per level.',
  symbiosis: 'Beetles and other guests live in your nest. Coming in a later build.',
  // Nest
  brood_science: 'Unlocks Major Soldiers (level 1) and Haulers (level 2).',
  nurse_workers: 'Dedicated nurses feed and groom the larvae. Units are raised 5% faster per level (up to 30%).',
  deep_digging: '+5 space in every colony, per level.',
  tunnel_engineering: 'Shore up tunnels with packed soil. Chambers are dug 5% faster per level (up to 30%).',
  nuptial_flight: 'Unlocks the Winged Queen (Brood Hall 4). Rule one more colony at levels 1, 3, 5…',
  supercolony: 'Colonies that share one scent and never fight. Coming in a later build.',
  // Scent
  pheromone_trails: 'Clearer trails. +10% travel speed per level.',
  colony_mind: '+1 mission that can be out at the same time, per level.',
  scent_reading: 'Read more from a scout trip, and hide more from enemy scouts.',
  tandem_running: 'Experienced ants lead others step by step. Research is 5% faster per level (up to 30%).',
  chemical_mimicry: "Scouts wear the target's colony smell. Each level halves the chance they are spotted.",
};

export function Research() {
  const { colony, state, act } = useGame();
  if (!colony || !state) return null;
  const job = state.player.researchJob;
  const pher = lvl(colony.chambers, 'pheromone_chamber');
  const research = state.player.research;

  return (
    <div className="stack">
      <Panel title="Research" actions={<span className="muted">Pheromone Chamber {pher > 0 ? `Lv ${pher}` : 'not built'}</span>}>
        {job ? (
          <div className="active-job">
            <div>
              <strong>{RESEARCH[job.research as ResearchId].name}</strong> level {job.level}
              {job.colonyId !== colony.id && <span className="muted"> (in another colony)</span>}
            </div>
            <Countdown startAt={job.startAt} endAt={job.endAt} />
            <button className="btn ghost small" onClick={() => act(() => api.post('/api/research/cancel'), 'Research cancelled. Resources refunded.')}>
              Cancel
            </button>
          </div>
        ) : (
          <p className="muted">
            {pher > 0 ? 'Research benefits every colony you own. One research at a time.' : 'Build a Pheromone Chamber in this colony to start researching.'}
          </p>
        )}
      </Panel>

      <Panel>
        <ul className="rows">
          {MVP_RESEARCH.map((id) => {
            const level = lvl(research, id);
            const next = level + 1;
            const missing = missingRequirements(RESEARCH[id].unlock, colony.chambers, research);
            const cost = researchCost(id, next);
            const secs = researchSeconds(id, next, { worldSpeed: state.world.speed, pheromone: pher, timeMultiplier: state.player.timeMultiplier, research });
            const maxed = level >= researchMaxLevel(id);
            let blocked = '';
            if (maxed) blocked = 'Highest level reached';
            else if (missing.length) blocked = `Needs ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}`;
            else if (job) blocked = job.research === id ? 'Researching now' : 'Another research is running';
            else if (colony.buildJob?.chamber === 'pheromone_chamber') blocked = 'Pheromone Chamber is being enlarged';
            else if (!canAfford(colony.resources, cost)) blocked = whyShort(colony, cost, state.world.speed);
            return (
              <li key={id} className={`row has-pic${missing.length ? ' locked' : ''}`}>
                <Pic kind="research" id={id} />
                <div className="row-main">
                  <div className="row-title">
                    <h3>{RESEARCH[id].name}</h3>
                    {level > 0 && <span className="level">Lv {level}</span>}
                  </div>
                  <p className="blurb">{RESEARCH_BLURB[id]}</p>
                </div>
                <div className="row-side">
                  {maxed || missing.length ? (
                    <span className="req">{blocked}</span>
                  ) : (
                    <>
                      <Cost cost={cost} have={colony.resources} />
                      <span className="time">{fmtDuration(secs * 1000)}</span>
                      <button
                        className="btn primary"
                        disabled={!!blocked}
                        onClick={() => act(() => api.post('/api/research', { colonyId: colony.id, research: id }))}
                      >
                        Research {next}
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
    </div>
  );
}
