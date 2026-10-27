// "While you were away": what changed since the last visit (see away.ts).
import { CHAMBERS, RESEARCH, RESOURCE_IDS, type ChamberId, type ResearchId } from '@hormigas/shared';
import { useGame } from '../game';
import { fmtAgo, fmtFull } from '../format';
import { RESOURCE_LABEL } from '../describe';
import { Panel, ResDot } from './ui';

const GROUP: Record<string, string> = {
  forage: 'Forage trips',
  battle: 'Battles',
  scout: 'Scout reports',
  scouted: 'Spotted by scouts',
  nest_event: 'In the nest',
  transport: 'Deliveries',
  haul: 'Corpse hauls',
  milestone: 'Milestones',
};

export function AwayCard({ go }: { go: (screen: string) => void }) {
  const { away, dismissAway, now } = useGame();
  if (!away) return null;
  const gained = RESOURCE_IDS.filter((r) => away.stores[r] !== 0);
  const groups = new Map<string, string[]>();
  for (const r of away.reports) groups.set(r.type, [...(groups.get(r.type) ?? []), r.title]);

  return (
    <Panel
      title={`While you were away (${fmtAgo(now - away.since)})`}
      actions={
        <button className="btn ghost small" onClick={dismissAway}>
          Got it
        </button>
      }
    >
      <ul className="away">
        {away.chambers.map((c) => (
          <li key={c.id} className="away-build">
            <strong>{CHAMBERS[c.id as ChamberId]?.name ?? c.id}</strong> grew to level {c.to}
            {c.to - c.from > 1 ? ` (+${c.to - c.from})` : ''}
          </li>
        ))}
        {away.research.map((r) => (
          <li key={r.id} className="away-research">
            Learned <strong>{RESEARCH[r.id as ResearchId]?.name ?? r.id}</strong> {r.to}
          </li>
        ))}
        {gained.length > 0 && (
          <li className="away-stores">
            Stores{' '}
            {gained.map((r) => (
              <span key={r} className={`away-delta ${away.stores[r] > 0 ? 'up' : 'down'}`} title={RESOURCE_LABEL[r]}>
                <ResDot r={r} /> {away.stores[r] > 0 ? '+' : '−'}
                {fmtFull(Math.abs(away.stores[r]))}
              </span>
            ))}
          </li>
        )}
        {[...groups.entries()].map(([type, titles]) => (
          <li key={type} className={`away-reports type-${type}`}>
            <button className="linkish" onClick={() => go('reports')}>
              {GROUP[type] ?? 'Reports'}
              {titles.length > 1 ? ` (${titles.length})` : ''}:
            </button>{' '}
            <span className="muted">
              {titles.slice(0, 2).join(' · ')}
              {titles.length > 2 ? ' …' : ''}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
