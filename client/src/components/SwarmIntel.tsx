// An army-ant swarm on its way (docs/20-swarms.md): what the colony knows about it, and Scouting the swarm.
// Until scouts reach it, all you know is that it's roughly the size of your colony. Once they do, its real size and
// make-up show here with live odds against the ants you have at home right now.
import { useMemo } from 'react';
import { CASTES, SWARM, groundDefensePct, presentUnits, previewBattle, swarmScoutOdds, type CasteId, type ResearchLevels, type UnitCounts } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtFull } from '../format';
import type { Nav } from '../nav';

/** The swarm card's line before it's scouted: no numbers, just the choice. */
export const SWARM_ADVICE =
  'An army roughly the size of your colony is marching in from the wilds. Keep your soldiers home to fight it and win corpses to haul, or send them away and let it take some unprotected food. It never touches chambers.';

const plural = (id: CasteId, n: number) => `${fmtFull(n)} ${CASTES[id].name}${n === 1 ? '' : 's'}`;
/** "68 Minor Soldiers and 17 Major Soldiers" */
export const swarmMakeUp = (units: UnitCounts) => {
  const parts = presentUnits(units).map((id) => plural(id, units[id] ?? 0));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'nothing';
};

/** Under the swarm's card: a button to scout it, or (once scouted) what it is and your odds. */
export function SwarmIntel({ i, go }: { i: any; go?: Nav }) {
  const { state, colony, selectColony } = useGame();
  if (!state || !colony) return null;
  const home = state.colonies.find((c) => c.id === i.targetColonyId);
  if (!i.scouted) {
    if (!go || !home) return null;
    return (
      <p className="uw-scout">
        <button className="btn small" onClick={() => go('missions', { type: 'scout', target: home.coords })}>
          Scout the swarm
        </button>
        <span className="muted small">Send Scouts to see its real size and your odds. Army ants eat the ones they catch.</span>
      </p>
    );
  }
  return (
    <div className="uw-swarm">
      <p className="small">
        Your scouts saw <strong>{fmtFull(i.unitCount)} army ants</strong>: {swarmMakeUp(i.units ?? {})}.
      </p>
      {colony.id === i.targetColonyId ? (
        <SwarmOdds swarm={i.units ?? {}} />
      ) : (
        <p className="muted small">
          <button className="linkish" onClick={() => selectColony(i.targetColonyId)}>
            Switch to {home?.name ?? 'that colony'}
          </button>{' '}
          to see your odds against it.
        </p>
      )}
    </div>
  );
}

/** Win / draw / lose for the colony against a scouted swarm, with the ants at home right now. */
function SwarmOdds({ swarm }: { swarm: UnitCounts }) {
  const { colony } = useGame();
  const key = colony ? JSON.stringify([colony.units, colony.defenses, colony.research, colony.terrain]) : '';
  const swarmKey = JSON.stringify(swarm);
  const p = useMemo(() => {
    if (!colony || presentUnits(swarm).length === 0) return null;
    return previewBattle(
      { units: swarm, research: {} },
      { units: colony.units, defenses: colony.defenses, research: colony.research ?? {}, groundDefensePct: groundDefensePct(colony.terrain) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, swarmKey]);
  if (!p) return null;
  // the swarm attacks: the colony wins when the swarm loses
  const win = Math.round(p.lossRate * 100), draw = Math.round(p.drawRate * 100), lose = Math.round(p.winRate * 100);
  return (
    <>
      <div className="odds" role="img" aria-label={`Your colony wins ${win}%, draw ${draw}%, the swarm wins ${lose}%`}>
        <span className="win" style={{ flexGrow: p.lossRate }} />
        <span className="draw" style={{ flexGrow: p.drawRate }} />
        <span className="loss" style={{ flexGrow: p.winRate }} />
      </div>
      <p className="small uw-odds">
        With the ants home now: <strong>win {win}%</strong> · draw {draw}% · lose {lose}%.{' '}
        <span className="muted">Raise soldiers or send some away and this changes.</span>
      </p>
    </>
  );
}

/** On the Missions form, before Scouts go out to a swarm: the chance a report gets back and the likely cost. */
export function SwarmScoutOdds({ scouts, research }: { scouts: number; research: ResearchLevels }) {
  const o = swarmScoutOdds(scouts, research);
  const per = Math.round(o.perScout * 100);
  const lost = Math.round(o.expectedLost);
  return (
    <fieldset className="field">
      <legend>Scouting the swarm</legend>
      <p className="small">
        Your Scouts go out to meet the army ant column. Each one slips past on its own with a <strong>{per}%</strong> chance; the report gets back if any
        of them do. Army ants eat the rest.
      </p>
      {scouts > 0 ? (
        <>
          <div className="odds" role="img" aria-label={`Report gets back ${Math.round(o.reportChance * 100)}%`}>
            <span className="win" style={{ flexGrow: o.reportChance }} />
            <span className="loss" style={{ flexGrow: 1 - o.reportChance }} />
          </div>
          <dl className="summary tight">
            <div><dt>Report gets back</dt><dd>{Math.round(o.reportChance * 100)}%</dd></div>
            <div><dt>Scouts likely lost</dt><dd>~{fmtFull(lost)} of {fmtFull(scouts)}</dd></div>
          </dl>
        </>
      ) : (
        <p className="muted small">Choose Scouts to see your odds. More Scouts make a report likelier.</p>
      )}
      <p className="muted small">Army ants are nearly blind and hunt by smell: Scent Reading adds {SWARM.scouting.perScentReadingPct}% per level and Chemical Mimicry {SWARM.scouting.perMimicryPct}% (up to {SWARM.scouting.maxPct}% a Scout).</p>
    </fieldset>
  );
}
