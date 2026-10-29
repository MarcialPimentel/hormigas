// Human-readable descriptions of what chambers do at a given level.
import {
  CHAMBERS,
  explainShortfall,
  levelGrowth as growth,
  productionPerHour,
  protectedForLevel,
  shortfalls,
  storageCapacity,
  storageForLevel,
  type Resources,
  TERRAIN,
  type ChamberId,
  type TerrainId,
} from '@hormigas/shared';
import { fmtNum } from './format';

export const RESOURCE_LABEL = { foliage: 'Foliage', protein: 'Protein', nectar: 'Nectar' } as const;

export const CHAMBER_BLURB: Record<ChamberId, string> = {
  queen_chamber: 'Heart of the colony. Each level unlocks new chambers.',
  leaf_garden: 'Workers cut and mulch leaves into Foliage.',
  hunting_grounds: 'Hunting parties bring back Protein from small prey.',
  nursery: 'Raises the workforce that keeps the colony running.',
  granary: 'Stores Foliage.',
  larder: 'Stores Protein.',
  brood_hall: 'Raises castes and builds defenses. Bigger halls work faster.',
  pheromone_chamber: 'Where the colony develops new instincts (research).',
  aphid_pasture: 'Herded aphids give honeydew: Nectar.',
  nectar_cellar: 'Stores Nectar.',
  excavation_works: 'Diggers that speed up all chamber construction.',
  honeypot_gallery: 'Honeypot ants hold food in their bodies, safe from raiders.',
};

/** What a chamber provides at `level` (level 0 = nothing). */
export function chamberEffect(id: ChamberId, level: number, terrain: TerrainId, worldSpeed = 1): string {
  const def = CHAMBERS[id];
  const e = def.effect;
  switch (e.type) {
    case 'produce': {
      const r = e.resource!;
      const pct = (TERRAIN[terrain].mods[`${r}Pct` as 'foliagePct'] ?? 0) / 100;
      return `${fmtNum((e.base ?? 0) * growth(level) * (1 + pct) * worldSpeed)} ${RESOURCE_LABEL[r]}/h · uses ${fmtNum((def.workforceUse ?? 0) * growth(level))} workforce`;
    }
    case 'workforce':
      return `+${fmtNum((e.base ?? 0) * growth(level))} workforce`;
    case 'storage':
      return `Holds ${fmtNum(storageForLevel(level))} ${RESOURCE_LABEL[e.resource!]}`;
    case 'protectedStorage':
      return level > 0 ? `Protects ${fmtNum(protectedForLevel(level))} of each resource` : 'Protects nothing yet';
    case 'buildSpeed':
      return `Chambers build ${1 + level}× as fast`;
    case 'unitSpeed':
      return level > 0 ? `Raises castes ${1 + level}× as fast` : 'Not built';
    case 'researchSpeed':
      return level > 0 ? `Research ${1 + level}× as fast` : 'Not built';
    case 'gate': {
      const unlocks = (Object.keys(CHAMBERS) as ChamberId[]).filter((c) => CHAMBERS[c].unlock[id] === level).map((c) => CHAMBERS[c].name);
      return unlocks.length ? `Unlocks ${unlocks.join(', ')}` : `Level ${level}`;
    }
  }
}

/** Plain-language reason a colony can't pay `cost`, or '' if it can. */
export function whyShort(colony: { chambers: any; terrain: TerrainId; resources: Resources }, cost: Resources, worldSpeed: number): string {
  return explainShortfall(shortfalls(cost, colony.resources, storageCapacity(colony.chambers), productionPerHour(colony.chambers, colony.terrain, worldSpeed)));
}
