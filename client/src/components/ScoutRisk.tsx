// On the send card for a scouting party: the chance the ants at the target spot catch and kill the scouts.
// Uses the same detection rule as the server (shared/src/world.ts scoutDetectionChance) and your latest scout
// report for how many ants are there. Never scouted, or a report that didn't count them: the odds are unknown.
import type { ReactNode } from 'react';
import { blocksRaids, researchSum, scoutDetectionChance, scoutLevel, type Coords, type Relation } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtDuration, fmtFull } from '../format';
import { useIntel } from './BattlePreview';
import type { SpotColony } from './Patch';

export function ScoutRisk({ target, scouts, colony }: { target: Coords; scouts: number; colony: SpotColony | null | undefined }) {
  const { state, now } = useGame();
  const intel = useIntel(target);
  if (!state) return null;

  const research = state.player.research;
  const relation: Relation | undefined = colony?.relation;
  // nobody there at all: a free windfall or an untended herd
  const empty = (!!colony?.windfall && !colony.windfall.held && !colony.windfall.guarded) || (!!colony?.herd && !colony.herd.tended);
  // wild things have no Scent Reading of their own
  const npc = !!colony?.wild || (!!colony?.herd && !colony.herd.tended) || (!!colony?.windfall && !colony.windfall.held);

  const head = <legend>Scouting risk</legend>;
  const rule = (
    <p className="muted small">
      If the ants there spot your Scouts, they kill every one of them. The more ants at home and the more Scouts you send, the likelier that is; your Scent
      Reading and Chemical Mimicry against theirs make it less likely.
    </p>
  );

  let body: ReactNode;
  if (relation && blocksRaids(relation)) {
    body = <p className="small">You share a {relation === 'ally' || relation === 'fading' ? 'scent' : 'truce'} with them: their ants let your Scouts be. <strong>No risk.</strong></p>;
  } else if (empty) {
    body = <p className="small">Nobody is there to spot them. <strong>No risk</strong> right now.</p>;
  } else if (intel === undefined) {
    body = <p className="muted small">Checking your scout reports…</p>;
  } else if (!intel || !intel.data?.units) {
    body = (
      <p className="small">
        <strong>Risk unknown.</strong>{' '}
        {intel ? "Your last report didn't count their ants, so you can't tell how likely they are to spot your Scouts." : "You haven't scouted it yet, so you don't know how many ants are there to spot your Scouts."}
      </p>
    );
  } else if (scouts <= 0) {
    body = <p className="muted small">Choose Scouts to see the risk.</p>;
  } else {
    const d = intel.data;
    const home = Object.values(d.units as Record<string, number>).reduce((a, b) => a + (b ?? 0), 0);
    const theirsKnown = npc || !!d.research;
    const chance = scoutDetectionChance(home, scouts, scoutLevel(research), theirsKnown ? scoutLevel(d.research ?? {}) : 0, researchSum(research, 'scoutStealth'));
    const die = Math.round(chance * 100);
    const age = now - intel.at;
    body = (
      <>
        <div className="odds" role="img" aria-label={`Scouts get back ${100 - die}%, spotted and killed ${die}%`}>
          <span className="win" style={{ flexGrow: 1 - chance }} />
          <span className="loss" style={{ flexGrow: chance }} />
        </div>
        <dl className="summary tight">
          <div><dt>Get back with a report</dt><dd>{theirsKnown ? '' : 'at most '}{100 - die}%</dd></div>
          <div><dt>Spotted and killed</dt><dd>{theirsKnown ? '' : 'at least '}{die}%</dd></div>
        </dl>
        <p className="muted small">
          Your last report counted {fmtFull(home)} ants there, {fmtDuration(age)} ago{age > 3600_000 ? '; there may be more now' : ''}. If spotted, all{' '}
          {fmtFull(scouts)} {scouts === 1 ? 'Scout dies' : 'Scouts die'}.
          {!theirsKnown && " Your scouts haven't seen their research: if they have Scent Reading, the risk is higher."}
        </p>
      </>
    );
  }

  return (
    <fieldset className="field">
      {head}
      {body}
      {rule}
    </fieldset>
  );
}
