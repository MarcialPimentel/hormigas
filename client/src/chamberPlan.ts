// What digging a chamber's next level takes, and what (if anything) is in the way.
// Shared by the Chambers screen and the nest's chamber sheet so they always agree.
import {
  CHAMBERS,
  canAfford,
  chamberBlocker,
  chamberBuildSeconds,
  chamberCost,
  digPlanSlots,
  digPlanWait,
  lvl,
  missingRequirements,
  nextPlannedLevel,
  planBlocker,
  plannedLevel,
  type ChamberId,
} from '@hormigas/shared';
import { whyShort } from './describe';
import { fmtDuration } from './format';
import type { ServerColony, ServerState } from './game';

/**
 * While the diggers are busy and the dig plan is unlocked, the button plans the next dig instead (`planning`):
 * the level counts the dig in progress, and the cost is only paid when it starts.
 */
export function chamberPlan(colony: ServerColony, state: ServerState, id: ChamberId) {
  const research = state.player.research;
  const level = lvl(colony.chambers, id);
  const planning = !!colony.buildJob && digPlanSlots(colony.chambers, research) > 0;
  const next = planning ? nextPlannedLevel(colony, id) : level + 1;
  const missing = missingRequirements(CHAMBERS[id].unlock, colony.chambers, research);
  const locked = missing.length > 0;
  const cost = chamberCost(id, next);
  const secs = chamberBuildSeconds(id, next, {
    worldSpeed: state.world.speed,
    excavation: lvl(colony.chambers, 'excavation_works'),
    terrain: colony.terrain,
    timeMultiplier: state.player.timeMultiplier ?? 1,
    research,
  });
  // the server refuses with the same checks (shared/src/blockers.ts, shared/src/digPlan.ts)
  let blocked: string;
  if (planning) blocked = planBlocker(id, colony, state.player)?.short ?? '';
  else {
    const blocker = chamberBlocker(id, colony, state.player);
    blocked = blocker ? blocker.short : !canAfford(colony.resources, cost) ? whyShort(colony, cost, state.world.speed) : '';
  }
  return { level, next, locked, cost, secs, blocked, planning };
}

/** The planned dig, if any: which chamber, the level it reaches, and what it's waiting for in words. */
export function plannedDig(colony: ServerColony, state: ServerState, now: number) {
  const id = colony.digPlan?.chambers[0];
  if (!id) return null;
  const wait = digPlanWait(colony, state.player, state.world.speed, now);
  let note = 'Starts as soon as the stores can pay.';
  if (wait?.kind === 'queued') note = 'Starts when this dig ends, if the stores can pay then. Nothing is paid until it starts.';
  else if (wait?.kind === 'resources') note = `Waiting: ${wait.message}`;
  else if (wait?.kind === 'busy') note = `Waiting: ${wait.message}${wait.until ? ` (about ${fmtDuration(wait.until - now)})` : ''}`;
  else if (wait?.kind === 'ready') note = 'Starting…';
  return { id, level: plannedLevel(colony, 0), note, waiting: !colony.buildJob };
}
