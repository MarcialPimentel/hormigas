import { CHAMBERS, RESEARCH, queueEndsAt, type ChamberId, type ResearchId } from '@hormigas/shared';
import { useGame } from '../game';
import { Countdown, Empty } from './ui';
import type { ReactNode } from 'react';

interface Item {
  key: string;
  endAt: number;
  startAt?: number;
  label: ReactNode;
  screen: string;
  tone?: 'danger';
}

/** Everything with a timer: construction, research, brood queue, missions, incoming raids. */
export function ActivityList({ go }: { go: (screen: string) => void }) {
  const { state, colony } = useGame();
  if (!state || !colony) return null;
  const items: Item[] = [];

  if (colony.buildJob) {
    items.push({
      key: 'build',
      startAt: colony.buildJob.startAt,
      endAt: colony.buildJob.endAt,
      label: <>Digging <strong>{CHAMBERS[colony.buildJob.chamber as ChamberId].name}</strong> to level {colony.buildJob.level}</>,
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
  for (const it of activityHooks) items.push(...it(state, colony));

  items.sort((a, b) => a.endAt - b.endAt);
  if (items.length === 0) return <Empty>Nothing in progress. Every idle minute is wasted growth — start a build.</Empty>;
  return (
    <ul className="activity">
      {items.map((i) => (
        <li key={i.key} className={i.tone === 'danger' ? 'danger' : ''}>
          <button className="activity-link" onClick={() => go(i.screen)}>
            <span>{i.label}</span>
            <Countdown startAt={i.startAt} endAt={i.endAt} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Later milestones register more activity sources here (brood queue, missions, raids). */
export const activityHooks: ((state: any, colony: any) => Item[])[] = [];
