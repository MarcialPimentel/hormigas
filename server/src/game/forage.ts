// Forage expeditions into the wilds (spot 13 of any patch).
import { WILDS_SPOT, coordsKey, createRng, partyForageLuck, groupCargo, randomSeed, resolveForage, returnLegMs, type CasteId, type UnitCounts } from '@hormigas/shared';
import type { Q } from '../db';
import { GameError } from '../errors';
import { getPlayer } from '../colony';
import { defineMission } from './missions';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';

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
  async validate({ target }) {
    if (target.spot !== WILDS_SPOT) throw new GameError('bad_target', `Foragers can only go to the wilds (spot ${WILDS_SPOT}).`);
  },
  async arrive(q, m, at) {
    const player = await getPlayer(q, m.playerId);
    const luck = partyForageLuck(player.research, m.units); // Desert Ants in the party add luck
    const firstTrip = !(await hasForagedBefore(q, m.playerId, m.id));
    const r = resolveForage(createRng(randomSeed()), { cargo: groupCargo(m.units), playerPoints: player.points.total, luck, firstTrip });

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
    // the report arrives now, but the food lands only when the party is home (same sum as the return trip in missions.ts)
    const survivors = Object.values(m.units).some((n) => (n ?? 0) > 0);
    const returnsAt = survivors ? at + returnLegMs(m.departAt, m.arriveAt, r.returnTimeFactor) : null;

    await addReport(q, m.worldId, m.playerId, 'forage', `${TITLES[r.outcome]} (${coordsKey(m.target)})`, {
      outcome: r.outcome,
      text: r.text,
      found: m.cargo,
      lost,
      target: m.target,
      returnsAt,
    }, at);
    if (Object.keys(lost).length) await refreshPointsAfterCommit(q, m.playerId);
    return { home: true, returnFactor: r.returnTimeFactor };
  },
});

/** Has this player had a forage party reach the wilds before? (Recalled parties don't count.) */
export async function hasForagedBefore(q: Q, playerId: number, exceptMissionId = 0): Promise<boolean> {
  const r = await q.query(
    "SELECT 1 FROM missions WHERE player_id = $1 AND type = 'forage' AND id <> $2 AND result ? 'outcome' LIMIT 1",
    [playerId, exceptMissionId],
  );
  return r.rows.length > 0;
}
