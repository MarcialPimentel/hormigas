// A raid or an army-ant swarm on its way (docs/20-swarms.md § Scouting an incoming raid): what you know about it, and
// the button to scout it. Until scouts reach it, you don't know how big it is (nor, for a swarm, which of the three
// sizes). Once they do, its real count and make-up show here with live odds against the ants you have at home right now.
import { useMemo } from 'react';
import { CASTES, SWARM, groundDefensePct, presentUnits, previewBattle, swarmScoutOdds, type CasteId, type ResearchLevels, type UnitCounts } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtFull } from '../format';
import type { Nav } from '../nav';

/** The swarm card's line before it's scouted: no numbers, just the choice. */
export const SWARM_ADVICE =
  "Army ants are marching in from the wilds. Most are foraging columns your soldiers can handle, some are war columns that cost dearly, and now and then a great swarm comes that could overrun your colony. Beat it to keep its prey and haul the corpses, or send your soldiers away and let it take some unprotected food. It never touches chambers.";

const plural = (id: CasteId, n: number) => `${fmtFull(n)} ${CASTES[id].name}${n === 1 ? '' : 's'}`;
/** "68 Minor Soldiers and 17 Major Soldiers" */
export const swarmMakeUp = (units: UnitCounts) => {
  const parts = presentUnits(units).map((id) => plural(id, units[id] ?? 0));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'nothing';
};

/** An incoming party your Scouts can go out to meet: a hostile raid, claim or swarm (the server sends `scouted` for these). */
export const scoutable = (i: any) => !!i?.hostile && typeof i.scouted === 'boolean';

/** Under a raid's or swarm's card: a button to scout it, or (once scouted) what it is and your odds. */
export function SwarmIntel({ i, go }: { i: any; go?: Nav }) {
  const { state, colony, selectColony } = useGame();
  if (!state || !colony || !scoutable(i)) return null;
  const swarm = i.type === 'swarm';
  const home = state.colonies.find((c) => c.id === i.targetColonyId);
  // a raid on a herd or windfall you hold: scouts go there to meet it
  const place = i.herd ?? home?.coords;
  if (!i.scouted) {
    if (!go || !place) return null;
    return (
      <p className="uw-scout">
        <button className="btn small" onClick={() => go('missions', { type: 'scout', target: place, meet: i.id })}>
          {swarm ? 'Scout the swarm' : 'Scout the raid'}
        </button>
        <span className="muted small">
          Send Scouts to see its real size and your odds. {swarm ? 'Army ants eat the ones they catch.' : 'The raiders kill the ones they catch.'}
        </span>
      </p>
    );
  }
  return (
    <div className="uw-swarm">
      <p className="small">
        {i.sizeName ? (
          <>
            It's a <strong>{i.sizeName.toLowerCase()}</strong>, {i.sizeBlurb}.{' '}
          </>
        ) : null}
        Your scouts saw <strong>{fmtFull(i.unitCount)} {swarm ? 'army ants' : 'ants'}</strong>: {swarmMakeUp(i.units ?? {})}.
      </p>
      {i.herd ? (
        <p className="muted small">They fight the ants you keep there, not your colony.</p>
      ) : colony.id === i.targetColonyId ? (
        <SwarmOdds swarm={i.units ?? {}} research={i.research} name={swarm ? 'the swarm' : 'the raiders'} />
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

/** Win / draw / lose for the colony against a scouted raid or swarm, with the ants at home right now. */
function SwarmOdds({ swarm, research, name }: { swarm: UnitCounts; research?: ResearchLevels; name: string }) {
  const { colony } = useGame();
  const key = colony ? JSON.stringify([colony.units, colony.defenses, colony.research, colony.terrain]) : '';
  const swarmKey = JSON.stringify([swarm, research]);
  const p = useMemo(() => {
    if (!colony || presentUnits(swarm).length === 0) return null;
    return previewBattle(
      { units: swarm, research: research ?? {} },
      { units: colony.units, defenses: colony.defenses, research: colony.research ?? {}, groundDefensePct: groundDefensePct(colony.terrain) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, swarmKey]);
  if (!p) return null;
  // the swarm attacks: the colony wins when the swarm loses
  const win = Math.round(p.lossRate * 100), draw = Math.round(p.drawRate * 100), lose = Math.round(p.winRate * 100);
  return (
    <>
      <div className="odds" role="img" aria-label={`Your colony wins ${win}%, draw ${draw}%, ${name} win ${lose}%`}>
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

/** On the Missions form, before Scouts go out to a raid or swarm: the chance a report gets back and the likely cost. */
export function SwarmScoutOdds({ scouts, research, swarm = true }: { scouts: number; research: ResearchLevels; swarm?: boolean }) {
  const o = swarmScoutOdds(scouts, research);
  const per = Math.round(o.perScout * 100);
  const lost = Math.round(o.expectedLost);
  return (
    <fieldset className="field">
      <legend>{swarm ? 'Scouting the swarm' : 'Scouting the raid'}</legend>
      <p className="small">
        Your Scouts go out to meet the {swarm ? 'army ant column' : 'raiders'}. Each one slips past on its own with a <strong>{per}%</strong> chance; the report gets back if any
        of them do. {swarm ? 'Army ants eat the rest.' : 'The raiders kill the rest.'}
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
      <p className="muted small">{swarm ? 'Army ants are nearly blind and hunt by smell' : 'Raiders know their own scent and smell strangers'}: Scent Reading adds {SWARM.scouting.perScentReadingPct}% per level and Chemical Mimicry {SWARM.scouting.perMimicryPct}% (up to {SWARM.scouting.maxPct}% a Scout).</p>
    </fieldset>
  );
}
