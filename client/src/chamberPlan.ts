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
  type Resources,
} from '@hormigas/shared';
import { whyShort } from './describe';
import { fmtDuration } from './format';
import type { ServerColony, ServerState } from './game';

/** The cost and time of digging `id` to `level`, with this colony's speed-ups. */
function digCost(colony: ServerColony, state: ServerState, id: ChamberId, level: number) {
  const secs = chamberBuildSeconds(id, level, {
    worldSpeed: state.world.speed,
    excavation: lvl(colony.chambers, 'excavation_works'),
    terrain: colony.terrain,
    timeMultiplier: state.player.timeMultiplier ?? 1,
    research: state.player.research,
    units: colony.units,
  });
  return { cost: chamberCost(id, level), secs };
}

/**
 * What a chamber's buttons offer. While the diggers are idle, `dig` is the next level now; while they're busy,
 * there is no `dig`. `plan` (once the dig plan is unlocked) lines a dig up to start on its own: behind the dig in
 * progress, or, with idle diggers, until the stores can pay. The cost is only paid when a planned dig starts.
 * `cost`/`secs`/`blocked` are for the main action: the dig when the diggers are idle, otherwise the plan.
 */
export function chamberPlan(colony: ServerColony, state: ServerState, id: ChamberId) {
  const research = state.player.research;
  const level = lvl(colony.chambers, id);
  const missing = missingRequirements(CHAMBERS[id].unlock, colony.chambers, research);
  const locked = missing.length > 0;
  const digging = !!colony.buildJob;
  const slots = digPlanSlots(colony.chambers, research);

  // the server refuses with the same checks (shared/src/blockers.ts, shared/src/digPlan.ts)
  let dig: { next: number; cost: Resources; secs: number; blocked: string } | null = null;
  if (!digging) {
    const next = level + 1;
    const blocker = chamberBlocker(id, colony, state.player);
    const { cost, secs } = digCost(colony, state, id, next);
    dig = { next, cost, secs, blocked: blocker ? blocker.short : !canAfford(colony.resources, cost) ? whyShort(colony, cost, state.world.speed) : '' };
  }

  let plan: { next: number; cost: Resources; secs: number; blocked: string } | null = null;
  if (!locked && (digging || slots > 0)) {
    const next = nextPlannedLevel(colony, id);
    const blocker = planBlocker(id, colony, state.player);
    // with idle diggers, Plan only shows when it's useful: the dig can't start now but can wait in line
    if (digging || !blocker) plan = { next, ...digCost(colony, state, id, next), blocked: blocker?.short ?? '' };
  }

  const main = dig ?? plan;
  const next = main?.next ?? level + 1;
  const { cost, secs } = main ?? digCost(colony, state, id, next);
  const blocked = locked ? (chamberBlocker(id, colony, state.player)?.short ?? '') : (main?.blocked ?? '');
  return { level, next, locked, cost, secs, blocked, dig, plan };
}

/** The planned digs in line: which chamber, the level each reaches, and what it's waiting for in words. */
export function plannedDigs(colony: ServerColony, state: ServerState, now: number) {
  const ids = colony.digPlan?.chambers ?? [];
  if (!ids.length) return [];
  const wait = digPlanWait(colony, state.player, state.world.speed, now);
  let note = 'Starts as soon as the stores can pay.';
  if (wait?.kind === 'queued') note = 'Starts when this dig ends, if the stores can pay then. Nothing is paid until it starts.';
  else if (wait?.kind === 'resources') note = `Waiting: ${wait.message} Nothing is paid until it starts.`;
  else if (wait?.kind === 'busy') note = `Waiting: ${wait.message}${wait.until ? ` (about ${fmtDuration(wait.until - now)})` : ''}`;
  else if (wait?.kind === 'ready') note = 'Starting…';
  return ids.map((id, i) => ({
    id,
    index: i,
    level: plannedLevel(colony, i),
    note: i === 0 ? note : 'Starts after the one above, when the stores can pay. Nothing is paid until it starts.',
    waiting: !colony.buildJob,
  }));
}
