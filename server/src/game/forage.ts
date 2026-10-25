// Forage expeditions into the wilds (spot 13 of any patch).
import { WILDS_SPOT, coordsKey, createRng, groupCargo, lvl, randomSeed, resolveForage, type CasteId, type UnitCounts } from '@hormigas/shared';
import { GameError } from '../errors';
import { getPlayer } from '../colony';
import { defineMission } from './missions';
import { addReport } from './reports';
import { refreshPoints } from './points';

const TITLES: Record<string, string> = {
  food_cache: 'Foragers found a food cache',
  dead_beetle: 'Foragers dragged home a dead beetle',
  nothing: 'Foragers came back empty-handed',
  lost_trail: 'Foragers lost the trail',
  shortcut: 'Foragers found a shortcut home',
  spider_ambush: 'Spider ambush in the wilds',
  rainstorm: 'Rainstorm caught your foragers',
  the_boot: 'Your forage party was lost',
};

defineMission('forage', {
  allowsCargo: false,
  allowsWilds: true,
  slot: 'forage',
  async validate({ target }) {
    if (target.spot !== WILDS_SPOT) throw new GameError('bad_target', `Foragers can only go to the wilds (spot ${WILDS_SPOT}).`);
  },
  async arrive(q, m, at) {
    const player = await getPlayer(q, m.playerId);
    const luck = lvl(player.research, 'foraging_instinct');
    const r = resolveForage(createRng(randomSeed()), { cargo: groupCargo(m.units), playerPoints: player.points.total, luck });

    const lost: UnitCounts = {};
    if (r.lossFraction > 0) {
      for (const [id, n] of Object.entries(m.units)) {
        const dead = r.lossFraction >= 1 ? n! : Math.floor(n! * r.lossFraction);
        if (dead > 0) {
          lost[id as CasteId] = dead;
          m.units[id as CasteId] = n! - dead;
        }
      }
      m.units = Object.fromEntries(Object.entries(m.units).filter(([, n]) => (n ?? 0) > 0));
    }
    // finds are limited by what the survivors can carry
    const cap = groupCargo(m.units);
    const sum = r.found.foliage + r.found.protein + r.found.nectar;
    const k = sum > cap && sum > 0 ? cap / sum : 1;
    m.cargo = { foliage: Math.floor(r.found.foliage * k), protein: Math.floor(r.found.protein * k), nectar: Math.floor(r.found.nectar * k) };
    m.result = { outcome: r.outcome, found: m.cargo, lost };

    await addReport(q, m.worldId, m.playerId, 'forage', `${TITLES[r.outcome]} (${coordsKey(m.target)})`, {
      outcome: r.outcome,
      text: r.text,
      found: m.cargo,
      lost,
      target: m.target,
    }, at);
    if (Object.keys(lost).length) await refreshPoints(q, m.playerId);
    return { home: true, returnFactor: r.returnTimeFactor };
  },
});
