// Scouting an incoming raid (docs/20-swarms.md § Scouting an incoming raid). Scouts sent at a place of yours that a
// raid, a claim or an army-ant swarm is heading for go out to meet that party. Each one slips past on its own; if any
// get back, the party is scouted: its real size and make-up show on its card, with live odds. The rest are killed.
import { SWARM, blocksRaids, coordsKey, createRng, isHeldState, lvl, randomSeed, rollSwarmScouts, swarmSize } from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { getPlayer, type Colony } from '../colony';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { relationOf } from './diplomacy';
import { SCOUTABLE_INCOMING, type ArrivalOutcome, type Mission } from './missions';

export interface IncomingParty {
  id: number;
  type: string;
  units: Record<string, number>;
  arriveAt: number;
  /** who sent it, as the target sees it */
  from: string;
  size?: ReturnType<typeof swarmSize>;
}

/** The place is yours to defend: one of your colonies, or a herd or windfall your ants hold. */
export function defendsPlace(c: Colony | null, playerId: number) {
  if (!c) return false;
  if (!c.npc) return c.playerId === playerId;
  return isHeldState(c.npc) && c.npc.tender?.playerId === playerId;
}

/**
 * The hostile raid, claim or swarm heading for `colonyId` that `playerId`'s scouts would meet: the one named by
 * `meetId`, or else the next to land. Parties that turn back (a truce or shared scent) don't count.
 */
export async function incomingParty(q: Q, colonyId: number, playerId: number, meetId?: number): Promise<IncomingParty | null> {
  const r = await q.query(
    `SELECT m.id, m.type, m.player_id, m.units, m.arrive_at, m.result, p.is_npc,
            CASE WHEN m.type = 'swarm' THEN $3 WHEN p.is_npc THEN o.name ELSE p.username END AS from_name
       FROM missions m JOIN players p ON p.id = m.player_id JOIN colonies o ON o.id = m.origin_colony_id
      WHERE m.target_colony_id = $1 AND m.player_id <> $2 AND m.status = 'outbound' AND m.type = ANY($4::text[])
        AND ($5::bigint IS NULL OR m.id = $5)
      ORDER BY m.arrive_at`,
    [colonyId, playerId, SWARM.name, SCOUTABLE_INCOMING, meetId ?? null],
  );
  for (const row of r.rows) {
    if (row.type !== 'swarm' && !row.is_npc && blocksRaids((await relationOf(q, playerId, Number(row.player_id)))?.relation ?? null)) continue;
    return {
      id: Number(row.id), type: row.type, units: row.units, arriveAt: Number(row.arrive_at), from: row.from_name,
      ...(row.type === 'swarm' ? { size: swarmSize(row.result?.size) } : {}),
    };
  }
  return null;
}

const ants = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + (b ?? 0), 0);

/** Scouts reach the party they went out to meet. */
export async function scoutIncoming(q: Tx, m: Mission, place: Colony, partyId: number | undefined, at: number): Promise<ArrivalOutcome> {
  const scouts = lvl(m.units, 'scout');
  const party = await incomingParty(q, place.id, m.playerId, partyId);
  const swarm = party ? party.type === 'swarm' : partyId == null;
  // reports keep `swarm` for swarms (older reports read it) and use `party` for raids and claims
  const key = swarm ? 'swarm' : 'party';
  const where = { colony: place.name, colonyId: place.id, coords: { region: place.region, patch: place.patch, spot: place.spot } };
  if (!party || party.arriveAt <= at) {
    m.result = { swarm, meet: partyId ?? null, gone: true };
    await addReport(q, m.worldId, m.playerId, 'scout', `Your scouts found no ${swarm ? 'swarm' : 'raid'} near ${place.name}`, { [key]: { ...where, gone: true }, scouts, back: scouts, lost: 0 }, at);
    return { home: true };
  }
  const player = await getPlayer(q, m.playerId);
  const back = rollSwarmScouts(scouts, player.research, createRng(randomSeed()));
  const lost = scouts - back;
  if (back > 0) await q.query(`UPDATE missions SET result = coalesce(result, '{}'::jsonb) || '{"scouted": true}'::jsonb WHERE id = $1`, [party.id]);
  const n = ants(party.units).toLocaleString('en');
  const title = back === 0
    ? `Your scouts never came back from the ${swarm ? 'swarm' : 'raid'}`
    : swarm
      ? `Swarm scouted: ${party.size ? `a ${party.size.name.toLowerCase()}, ` : ''}${n} army ants heading for ${place.name}`
      : `Raid scouted: ${n} ants from ${party.from} heading for ${place.name}`;
  await addReport(
    q, m.worldId, m.playerId, 'scout', title,
    {
      [key]: {
        ...where, arriveAt: party.arriveAt, ...(swarm ? {} : { from: party.from, kind: party.type, held: !!place.npc }),
        ...(back > 0 ? { units: party.units, ...(party.size ? { size: party.size.id, sizeName: party.size.name, sizeBlurb: party.size.blurb } : {}) } : {}),
      },
      scouts, back, lost, key: coordsKey(where.coords),
    },
    at,
  );
  m.result = { swarm, meet: party.id, back, lost };
  if (lost > 0) await refreshPointsAfterCommit(q, m.playerId);
  if (back === 0) {
    m.units = {};
    return { home: false };
  }
  m.units = { ...m.units, scout: back };
  return { home: true };
}
