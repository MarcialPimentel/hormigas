import { fmtCoords, fmtFull } from '../format';
import { Counts, ResLine } from '../screens/Reports';

const bonus = (b: Record<string, number>) => {
  const parts = [
    b.mandibles ? `+${b.mandibles * 10}% attack` : '',
    b.guard_formation ? `+${b.guard_formation * 10}% guard` : '',
    b.chitin ? `+${b.chitin * 10}% health` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no bonuses';
};

export function BattleReport({ data }: { data: any }) {
  const youAttacked = data.perspective === 'attacker';
  const youWon = (data.winner === 'attacker') === youAttacked && data.winner !== 'draw';
  const outcome =
    data.winner === 'draw'
      ? 'Draw — both sides still standing after six rounds.'
      : youWon
        ? youAttacked ? 'Victory. Your raiders broke the defense.' : 'Your colony held.'
        : youAttacked ? 'Defeat. Your raiders were wiped out.' : 'Your colony was overrun.';
  return (
    <div className="report-body battle">
      <p className={`outcome ${youWon ? 'good' : data.winner === 'draw' ? '' : 'bad'}`}>{outcome}</p>
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
      {data.winner === 'attacker' && (
        <p>
          Loot carried off: <ResLine r={data.loot} />
        </p>
      )}
      {data.corpses > 0 && (
        <p className="small">
          The fallen left <strong>{fmtFull(data.corpses)} Protein</strong> in corpses at {fmtCoords(data.target)}. Anyone can haul them — be quick.
        </p>
      )}
    </div>
  );
}
