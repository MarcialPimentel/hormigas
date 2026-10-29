// Recurring per-colony events (nest events, swarm sightings, wild-nest raids): each colony that qualifies keeps
// exactly one pending event of the type, and every time it fires the next one is scheduled, even when the
// handler fails, so one bad roll never switches the feature off for that colony until the next restart.
import type { Q, Tx } from './db';
import { onEvent, schedule, type GameEvent } from './events';
import { gameHoursMs, getWorld } from './world';

type RecurringType = 'nest_event' | 'swarm_spotted' | 'nest_raid';

export interface RecurringColony {
  id: number;
  npc: any;
}

export interface RecurringColonyEvent {
  /** Schedule the colony's next event, counted from time t. */
  scheduleNext: (q: Q, worldId: number, colonyId: number, t: number) => Promise<void>;
  /** Give every qualifying colony without a pending event one (run at startup). Returns how many were scheduled. */
  ensure: (q: Tx, worldId: number, t: number) => Promise<number>;
}

/**
 * Register a recurring per-colony event.
 * - `where`: SQL condition on colonies `c` that says which colonies have this event (e.g. `c.npc IS NULL`).
 * - `qualifies`: an extra check on the colony row in code, for rules that are easier to write in TypeScript.
 * - `gapHours`: game hours until the next one (rolled each time).
 * - `run`: what happens when it fires. Return 'stop' to end the chain for this colony.
 * If the colony no longer qualifies (gone, or changed), the chain stops quietly.
 */
export function recurringColonyEvent(
  type: RecurringType,
  o: {
    where: string;
    qualifies?: (c: RecurringColony) => boolean;
    gapHours: () => number;
    run: (q: Tx, ev: GameEvent<{ colonyId: number }>, colony: RecurringColony) => Promise<void | 'stop'>;
  },
): RecurringColonyEvent {
  const scheduleNext = async (q: Q, worldId: number, colonyId: number, t: number) => {
    const speed = (await getWorld(q)).speed;
    await schedule(q, worldId, type, t + gameHoursMs(o.gapHours(), speed), { colonyId });
  };

  const find = async (q: Q, colonyId: number): Promise<RecurringColony | null> => {
    const r = await q.query(`SELECT c.id, c.npc FROM colonies c WHERE c.id = $1 AND (${o.where})`, [colonyId]);
    const c = r.rows[0] as RecurringColony | undefined;
    return c && (!o.qualifies || o.qualifies(c)) ? c : null;
  };

  const ensure = async (q: Tx, worldId: number, t: number) => {
    const r = await q.query(
      `SELECT c.id, c.npc FROM colonies c WHERE c.world_id = $1 AND (${o.where})
          AND NOT EXISTS (SELECT 1 FROM events e WHERE NOT e.done AND e.type = $2 AND (e.payload->>'colonyId')::int = c.id)
        ORDER BY c.id`,
      [worldId, type],
    );
    const missing = r.rows.filter((c: RecurringColony) => !o.qualifies || o.qualifies(c));
    for (const c of missing) await scheduleNext(q, worldId, c.id, t);
    return missing.length;
  };

  onEvent(
    type,
    async (q, ev) => {
      const colony = await find(q, ev.payload.colonyId);
      if (!colony) return; // colony gone or no longer has this event: the chain ends
      if ((await o.run(q, ev, colony)) === 'stop') return;
      await scheduleNext(q, ev.world_id, colony.id, ev.due_at);
    },
    {
      // the handler's work was rolled back; keep the chain going so the colony gets its next one
      async onFail(q, ev) {
        if (await find(q, ev.payload.colonyId)) await scheduleNext(q, ev.world_id, ev.payload.colonyId, ev.due_at);
      },
    },
  );

  return { scheduleNext, ensure };
}
