// What digging a chamber's next level takes, and what (if anything) is in the way.
// Shared by the Chambers screen and the nest's chamber sheet so they always agree.
import { CHAMBERS, canAfford, chamberBlocker, chamberBuildSeconds, chamberCost, lvl, missingRequirements, type ChamberId } from '@hormigas/shared';
import { whyShort } from './describe';
import type { ServerColony, ServerState } from './game';

export function chamberPlan(colony: ServerColony, state: ServerState, id: ChamberId) {
  const research = state.player.research;
  const level = lvl(colony.chambers, id);
  const next = level + 1;
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
  // the server refuses with the same checks (shared/src/blockers.ts)
  const blocker = chamberBlocker(id, colony, state.player);
  const blocked = blocker ? blocker.short : !canAfford(colony.resources, cost) ? whyShort(colony, cost, state.world.speed) : '';
  return { level, next, locked, cost, secs, blocked };
}
