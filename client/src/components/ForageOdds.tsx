import { FORAGE_OUTCOMES, forageOdds, forageOddsSummary, type ForageOutcome } from '@hormigas/shared';

const OUTCOME_LABEL: Record<ForageOutcome, string> = {
  food_cache: 'Food cache',
  dead_beetle: 'Dead beetle (Protein)',
  nothing: 'Nothing found',
  lost_trail: 'Lost the trail (back late)',
  shortcut: 'Shortcut (back early)',
  spider_ambush: 'Spider ambush (some lost)',
  rainstorm: 'Rainstorm (many lost)',
  the_boot: 'The Boot (all lost)',
};

const pct = (n: number) => `${n < 10 && n % 1 ? n.toFixed(1) : Math.round(n)}%`;

/** What a forage party can expect, with Foraging Instinct already applied. */
export function ForageOdds({ luck, compact = false }: { luck: number; compact?: boolean }) {
  const s = forageOddsSummary(luck);
  const all = forageOdds(luck);
  return (
    <div className="forage-odds">
      <div className="odds-bar" role="img" aria-label={`Finds food ${pct(s.food)}, back early ${pct(s.early)}, comes back empty ${pct(s.empty)}, loses ants ${pct(s.losses)}`}>
        <span className="odds-food" style={{ width: `${s.food}%` }} />
        <span className="odds-early" style={{ width: `${s.early}%` }} />
        <span className="odds-empty" style={{ width: `${s.empty}%` }} />
        <span className="odds-losses" style={{ width: `${s.losses}%` }} />
      </div>
      <ul className="odds-legend small">
        <li><i className="odds-food" />Finds food {pct(s.food)}</li>
        <li><i className="odds-early" />Back early {pct(s.early)}</li>
        <li><i className="odds-empty" />Comes back empty {pct(s.empty)}</li>
        <li><i className="odds-losses" />Loses ants {pct(s.losses)}</li>
      </ul>
      {!compact && (
        <details className="small">
          <summary>Every outcome{luck > 0 ? ` (luck ${luck} from Foraging Instinct and Desert Ants applied)` : ''}</summary>
          <ul className="counts">
            {FORAGE_OUTCOMES.map((k) => (
              <li key={k}>
                <span>{OUTCOME_LABEL[k]}</span>
                <strong>{pct(all[k])}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
