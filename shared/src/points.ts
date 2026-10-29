// Points & rankings. Spec: docs/02-progression.md (1 point per 1,000 resources spent)
import { CHAMBER_IDS, FORMULAS, RESEARCH_IDS, type Resources } from './data';

const PER_POINT = FORMULAS.points.resourcesPerPoint;
import { chamberCost, researchCost, lvl, type ChamberLevels, type DefenseCounts, type ResearchLevels, type UnitCounts } from './economy';
import { defensesValue, unitsValue } from './combat';
import { total } from './resources';

export function chamberSpent(chambers: ChamberLevels): number {
  let sum = 0;
  for (const id of CHAMBER_IDS) for (let l = 1; l <= lvl(chambers, id); l++) sum += total(chamberCost(id, l));
  return sum;
}

export function researchSpent(research: ResearchLevels): number {
  let sum = 0;
  for (const id of RESEARCH_IDS) for (let l = 1; l <= lvl(research, id); l++) sum += total(researchCost(id, l));
  return sum;
}

export function militarySpent(units: UnitCounts, defenses: DefenseCounts): number {
  return total(unitsValue(units)) + total(defensesValue(defenses));
}

export interface Points {
  total: number;
  economy: number;
  research: number;
  military: number;
}

export function computePoints(
  colonies: { chambers: ChamberLevels; units: UnitCounts; defenses: DefenseCounts; unitsAway?: UnitCounts }[],
  research: ResearchLevels,
): Points {
  let economy = 0;
  let military = 0;
  for (const c of colonies) {
    economy += chamberSpent(c.chambers);
    military += militarySpent(c.units, c.defenses) + (c.unitsAway ? militarySpent(c.unitsAway, {}) : 0);
  }
  const researchP = researchSpent(research);
  const p = (v: number) => Math.floor(v / PER_POINT);
  return { economy: p(economy), research: p(researchP), military: p(military), total: p(economy + researchP + military) };
}

export const pointsForSpend = (cost: Resources) => total(cost) / PER_POINT;
