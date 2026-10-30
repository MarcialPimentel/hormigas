import { add, addCounts, counterHintText, counterHints, defensesValue, res, subCounts, total, unitsValue, type Resources, type UnitCounts } from '@hormigas/shared';
import { fmtCoords, fmtFull } from '../format';
import { Counts, ResLine } from '../screens/Reports';

// The replay plays on the 3D patch, which is for computers (a fine pointer and WebGL).
const canReplay = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

const bonus = (b: Record<string, number>) => {
  const parts = [
    b.mandibles ? `+${b.mandibles * 10}% attack` : '',
    b.guard_formation ? `+${b.guard_formation * 10}% guard` : '',
    b.chitin ? `+${b.chitin * 10}% health` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no bonuses';
};

/** `onReplay`: act the battle out on the 3D patch (computers). */
export function BattleReport({ data, onReplay }: { data: any; onReplay?: () => void }) {
  // a raid that met a truce or a shared scent on the way (docs/23-supercolonies.md)
  if (data.turnedBack)
    return <p className="report-body">Your soldiers reached {data.colony} ({fmtCoords(data.target)}) and turned back without a fight. {data.why} They are on their way home.</p>;
  const youAttacked = data.perspective === 'attacker';
  const asAlly = data.perspective === 'ally';
  const youWon = (data.winner === 'attacker') === youAttacked && data.winner !== 'draw';
  const fellBack = data.retreatedAfterRound != null;
  const outcome = fellBack
    ? youAttacked
      ? `Your raiders fell back after round ${data.retreatedAfterRound}, having lost more than ${data.retreatPct}% of their strength. No loot.`
      : `The raiders fell back after round ${data.retreatedAfterRound}. ${asAlly ? 'Your ally' : 'Your colony'} held.`
    : data.winner === 'draw'
      ? 'Draw — both sides still standing after six rounds.'
      : youWon
        ? youAttacked ? 'Victory. Your raiders broke the defense.' : asAlly ? 'Your soldiers helped your ally hold.' : 'Your colony held.'
        : youAttacked ? 'Defeat. Your raiders were wiped out.' : asAlly ? "Your ally's colony was overrun." : 'Your colony was overrun.';
  return (
    <div className="report-body battle">
      <p className={`outcome ${youWon ? 'good' : data.winner === 'draw' ? '' : 'bad'}`}>{outcome}</p>
      {onReplay && canReplay() && (
        <p>
          <button type="button" className="btn small" onClick={onReplay}>
            Replay on the patch
          </button>
        </p>
      )}
      <div className="sides">
        <section>
          <h4>Attacker: {data.attacker.name}</h4>
          <p className="muted small">From {fmtCoords(data.attacker.origin)} · {bonus(data.attacker.bonuses)}</p>
          <Counts counts={data.attacker.units} />
          <p className="small">Lost:</p>
          <Counts counts={data.attacker.lost} empty="Nothing" />
        </section>
        <section>
          <h4>Defender: {data.defender.name}</h4>
          <p className="muted small">{data.defender.colony} ({fmtCoords(data.target)}) · {bonus(data.defender.bonuses)}</p>
          <Counts counts={{ ...data.defender.units, ...data.defender.defenses }} empty="Nobody home" />
          <p className="small">Lost:</p>
          <Counts counts={{ ...data.defender.lost, ...data.defender.defensesDestroyed }} empty="Nothing" />
          {(data.defender.allies ?? []).map((a: any, i: number) => (
            <div key={i} className="ally-group">
              <p className="small">
                <strong>{asAlly && data.allyIndex === i ? 'Your soldiers' : `${a.name}'s soldiers`}</strong>, holding position:
              </p>
              <Counts counts={a.units} />
              <p className="small">Lost:</p>
              <Counts counts={a.lost} empty="Nothing" />
            </div>
          ))}
          {Object.keys(data.defender.defensesRebuilt ?? {}).length > 0 && (
            <>
              <p className="small">Rebuilt for free:</p>
              <Counts counts={data.defender.defensesRebuilt} />
            </>
          )}
        </section>
      </div>
      {data.rounds?.length > 0 && (
        <table className="table small">
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Attacker left</th>
              <th scope="col">Defender left</th>
            </tr>
          </thead>
          <tbody>
            {data.rounds.map((r: any) => (
              <tr key={r.round}>
                <td>{r.round}</td>
                <td>{fmtFull(r.attackerRemaining)}</td>
                <td>{fmtFull(r.defenderRemaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* what in the enemy's force struck your castes again and again, and what counters it (docs/05-castes-units.md) */}
      {(() => {
        const allyUnits = (data.defender.allies ?? []).reduce((u: UnitCounts, a: any) => addCounts(u, a.units ?? {}), {});
        const mine: UnitCounts = youAttacked ? data.attacker.lost ?? {} : asAlly ? data.defender.allies?.[data.allyIndex]?.lost ?? {} : data.defender.lost ?? {};
        const hints = youAttacked
          ? counterHints(mine, addCounts(data.defender.units ?? {}, allyUnits), data.defender.defenses ?? {})
          : counterHints(mine, data.attacker.units ?? {});
        return hints.length > 0 ? (
          <div className="counter-hints">
            {hints.map((h) => (
              <p key={h.lost} className="small counter-hint">{counterHintText(h)}</p>
            ))}
          </div>
        ) : null;
      })()}
      {data.winner === 'attacker' && (
        <p>
          Loot carried off: <ResLine r={data.loot} />
        </p>
      )}
      {data.corpsesCarried > 0 && (
        <p className="small">
          The raiders' Slave-makers carried <strong>{fmtFull(data.corpsesCarried)} Protein</strong> of the dead straight home.
        </p>
      )}
      {data.corpses > 0 && (
        <p className="small">
          The fallen left <strong>{fmtFull(data.corpses)} Protein</strong> in corpses at {fmtCoords(data.target)}. Anyone can haul them — be quick.
        </p>
      )}
      {!asAlly && <NetResult data={data} youAttacked={youAttacked} />}
    </div>
  );
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtFull(Math.abs(n))}`;

/**
 * What the fight was worth to you, counted in what it costs to raise what you lost (docs/08-combat.md).
 * Raiders: loot (and corpses carried) against the ants they lost, plus the corpses still on the field.
 * Defenders: the ants, rebuilt-for-nothing defenses and food the raid cost.
 */
function NetResult({ data, youAttacked }: { data: any; youAttacked: boolean }) {
  if (youAttacked) {
    const lost: Resources = unitsValue(data.attacker?.lost ?? {});
    const gained: Resources = add(data.loot ?? res(), res(0, data.corpsesCarried ?? 0, 0));
    const net = total(gained) - total(lost);
    return (
      <div className="net-result">
        <p className="small">
          <strong>Net result:</strong> lost <ResLine r={lost} /> · carried home <ResLine r={gained} /> ·{' '}
          <strong className={net >= 0 ? 'ok' : 'warn'}>{signed(net)}</strong>
          {data.corpses > 0 && <> ({signed(net + data.corpses)} if you haul the {fmtFull(data.corpses)} Protein in corpses)</>}
        </p>
      </div>
    );
  }
  const d = data.defender ?? {};
  const defensesLost = subCounts(d.defensesDestroyed ?? {}, d.defensesRebuilt ?? {});
  const lost = add(add(unitsValue(d.lost ?? {}), defensesValue(defensesLost)), data.loot ?? res());
  if (total(lost) <= 0) return null;
  return (
    <p className="small net-result">
      <strong>The fight cost you:</strong> <ResLine r={lost} /> ({fmtFull(total(lost))}, counting ants and defenses lost and food taken)
      {data.corpses > 0 && <>. The {fmtFull(data.corpses)} Protein in corpses at your door is yours to haul if you're quick</>}.
    </p>
  );
}
