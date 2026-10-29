// What digging a chamber's next level takes, and what (if anything) is in the way.
// Shared by the Chambers screen and the nest's chamber sheet so they always agree.
import { CHAMBERS, canAfford, chamberBuildSeconds, chamberCost, lvl, missingRequirements, spaceMax, spaceUsed, type ChamberId } from '@hormigas/shared';
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
  const job = colony.buildJob;
  const affordable = canAfford(colony.resources, cost);
  let blocked = '';
  if (locked) blocked = `Needs ${missing.map((m) => `${m.name} ${m.need}`).join(', ')}`;
  else if (job) blocked = job.chamber === id ? 'Digging now' : 'Diggers are busy';
  else if (spaceUsed(colony.chambers) >= spaceMax(colony.baseSpace, research)) blocked = 'No space left';
  else if (id === 'brood_hall' && colony.unitQueue.length > 0) blocked = 'Brood Hall is raising units';
  else if (id === 'pheromone_chamber' && state.player.researchJob) blocked = 'Research in progress';
  else if (!affordable) blocked = whyShort(colony, cost, state.world.speed);
  return { level, next, locked, cost, secs, blocked };
}
