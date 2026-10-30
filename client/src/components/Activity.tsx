import { CHAMBERS, RESEARCH, plannedLevel, queueEndsAt, type ChamberId, type ResearchId } from '@hormigas/shared';
import { useGame } from '../game';
import { Countdown, Empty, Trip } from './ui';
import { fmtCoords } from '../format';
import { incomingName, pactNote } from '../incoming';
import { MISSION_LABEL, type MissionType } from '../nav';
import type { ReactNode } from 'react';

interface Item {
  key: string;
  endAt: number;
  startAt?: number;
  label: ReactNode;
  screen: string;
  tone?: 'danger';
  /** a party on the move: shown as a little walking track instead of a progress bar */
  trip?: ReactNode;
}

/** Everything with a timer: construction, research, brood queue, missions, incoming raids. */
/**
 * What's going on in the colony, soonest first. `trips` false leaves out missions and parties coming at you, for
 * screens that show them in Under way; `quiet` returns nothing instead of the "start a build" nudge when idle.
 */
export function ActivityList({ go, trips = true, quiet = false }: { go: (screen: string) => void; trips?: boolean; quiet?: boolean }) {
  const { state, colony } = useGame();
  if (!state || !colony) return null;
  const items: Item[] = [];

  const planned = colony.digPlan?.chambers[0];
  if (colony.buildJob) {
    items.push({
      key: 'build',
      startAt: colony.buildJob.startAt,
      endAt: colony.buildJob.endAt,
      label: (
        <>
          Digging <strong>{CHAMBERS[colony.buildJob.chamber as ChamberId].name}</strong> to level {colony.buildJob.level}
          {planned && <span className="muted small"> · then {CHAMBERS[planned].name} {plannedLevel(colony, 0)}</span>}
        </>
      ),
      screen: 'chambers',
    });
  } else if (planned && colony.digPlan?.checkAt) {
    items.push({
      key: 'plan',
      endAt: colony.digPlan.checkAt,
      label: <>Planned dig <strong>{CHAMBERS[planned].name}</strong> {plannedLevel(colony, 0)} waiting to start</>,
      screen: 'chambers',
    });
  }
  if (state.player.researchJob) {
    const j = state.player.researchJob;
    items.push({
      key: 'research',
      startAt: j.startAt,
      endAt: j.endAt,
      label: <>Researching <strong>{RESEARCH[j.research as ResearchId].name}</strong> {j.level}</>,
      screen: 'research',
    });
  }
  const qEnd = queueEndsAt(colony.unitQueue);
  if (qEnd) {
    const left = colony.unitQueue.reduce((s, i) => s + i.count - i.done, 0);
    items.push({
      key: 'brood',
      endAt: qEnd,
      label: <>Brood Hall raising <strong>{left.toLocaleString()}</strong> {left === 1 ? 'unit' : 'units'}</>,
      screen: 'brood',
    });
  }
  if (colony.digestJob) {
    const j = colony.digestJob;
    items.push({
      key: 'digest',
      startAt: j.startAt,
      endAt: j.endAt,
      label: <>Larvae digesting Protein into <strong>{j.nectar.toLocaleString()}</strong> Nectar</>,
      screen: 'brood',
    });
  }
  for (const m of trips ? state.missions ?? [] : []) {
    if (m.status === 'holding') continue; // no timer: holding until recalled (shown under Missions)
    const out = m.status === 'outbound';
    items.push({
      key: `m${m.id}`,
      trip: <Trip departAt={m.departAt} arriveAt={m.arriveAt} returnAt={m.returnAt} status={m.status} cargo={m.cargo} />,
      startAt: out ? m.departAt : m.arriveAt,
      endAt: out ? m.arriveAt : m.returnAt,
      label: (
        <>
          {MISSION_LABEL[m.type as MissionType] ?? m.type} {out ? 'arriving at' : 'returning from'} <strong>{fmtCoords(m.target)}</strong>
        </>
      ),
      screen: 'missions',
    });
  }
  for (const i of trips ? state.incoming ?? [] : []) {
    items.push({
      key: `i${i.id}`,
      trip: <Trip departAt={i.departAt} arriveAt={i.arriveAt} status="outbound" incoming hostile={i.hostile} />,
      endAt: i.arriveAt,
      label: i.hostile ? (
        <>
          {i.type === 'swarm' ? (
            <>
              <strong>Army ant swarm incoming</strong> out of the wilds — {i.unitCount.toLocaleString()} ants
              <span className="muted small">
                {' '}It's sized so the army you have at home now usually wins. Keep your soldiers in to fight it and win corpses to haul, or send them away and let it take some unprotected food. It never touches chambers.
              </span>
            </>
          ) : (
            <>
              <strong>{i.type === 'raid' ? 'Raid incoming' : 'Enemy scouts incoming'}</strong>{i.herd ? ` on your aphid herd (${fmtCoords(i.herd)})` : ''} from {i.from} ({fmtCoords(i.origin)}){i.type === 'raid' ? ` — ${i.unitCount.toLocaleString()} units` : ''}
              {i.herd && i.type === 'raid' && <span className="muted small"> They're after your tenders and the honeydew. Send more soldiers to tend it, or call your tenders home before they land.</span>}
            </>
          )}
          {i.wild && i.type === 'raid' && (
            <span className="muted small"> Wild ants. Keep soldiers at home to fight them off, or send your army away until they've gone.</span>
          )}
        </>
      ) : (
        <>{incomingName(i)} from {i.from}{pactNote(i)} arriving</>
      ),
      screen: 'missions',
      tone: i.hostile ? 'danger' : undefined,
    });
  }

  items.sort((a, b) => a.endAt - b.endAt);
  if (items.length === 0) return quiet ? null : <Empty>Nothing in progress. Every idle minute is wasted growth — start a build.</Empty>;
  return (
    <ul className="activity">
      {items.map((i) => (
        <li key={i.key} className={i.tone === 'danger' ? 'danger' : ''}>
          <button className="activity-link" onClick={() => go(i.screen)}>
            <span>{i.label}</span>
            <span className="activity-time">
              {i.trip}
              <Countdown startAt={i.trip ? undefined : i.startAt} endAt={i.endAt} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
