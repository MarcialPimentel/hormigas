// Discovery: the shared record of which colonies each player knows (docs/22-discovery.md).
// Every other system asks here instead of reading known_colonies directly.
import { DISCOVERY_MESSAGES, knowledgeFrom, type DiscoveryVia, type Knowledge, type KnownRow } from '@hormigas/shared';
import type { Q } from '../db';
import { GameError } from '../errors';

export interface KnownEntry extends KnownRow {
  knowledge: Knowledge;
  via: DiscoveryVia | null;
}

/** What `playerId` knows about each of these colonies. Colonies with no row come back as 'scent' (or 'mine'). */
export async function knowledgeOf(q: Q, playerId: number, colonyIds: number[]): Promise<Map<number, KnownEntry>> {
  const out = new Map<number, KnownEntry>();
  if (colonyIds.length === 0) return out;
  const r = await q.query(
    `SELECT c.id, c.player_id, k.via, k.discovered_at, k.smelled_at
       FROM colonies c LEFT JOIN known_colonies k ON k.colony_id = c.id AND k.player_id = $1
      WHERE c.id = ANY($2::int[])`,
    [playerId, colonyIds],
  );
  for (const row of r.rows) {
    const known: KnownRow = {
      discoveredAt: row.discovered_at == null ? null : Number(row.discovered_at),
      smelledAt: row.smelled_at == null ? null : Number(row.smelled_at),
    };
    out.set(row.id, { ...known, via: row.via, knowledge: knowledgeFrom(known, row.player_id === playerId) });
  }
  return out;
}

export async function knowledgeOne(q: Q, playerId: number, colonyId: number): Promise<KnownEntry> {
  return (await knowledgeOf(q, playerId, [colonyId])).get(colonyId) ?? { discoveredAt: null, smelledAt: null, via: null, knowledge: 'scent' };
}

/** `playerId` has scouted `colonyId` (or dealt with it some other way that counts): it's known from now on. */
export async function discover(q: Q, playerId: number, colonyId: number, via: DiscoveryVia, at: number) {
  await q.query(
    `INSERT INTO known_colonies (player_id, colony_id, via, first_at, discovered_at)
     SELECT $1, c.id, $3, $4, $4 FROM colonies c WHERE c.id = $2 AND c.player_id <> $1
     ON CONFLICT (player_id, colony_id)
       DO UPDATE SET discovered_at = COALESCE(known_colonies.discovered_at, EXCLUDED.discovered_at),
                     via = CASE WHEN known_colonies.discovered_at IS NULL THEN EXCLUDED.via ELSE known_colonies.via END`,
    [playerId, colonyId, via, at],
  );
}

/**
 * `colonyId` scouted or raided one of `playerId`'s colonies. Discovery is one way, so this doesn't make it known,
 * but the player now recognizes the scent: its name shows on the map ("I've smelled this scent before").
 */
export async function smelledBy(q: Q, playerId: number, colonyId: number, via: DiscoveryVia, at: number) {
  await q.query(
    `INSERT INTO known_colonies (player_id, colony_id, via, first_at, smelled_at)
     SELECT $1, c.id, $3, $4, $4 FROM colonies c JOIN players p ON p.id = $1
      WHERE c.id = $2 AND c.player_id <> $1 AND NOT p.is_npc
     ON CONFLICT (player_id, colony_id)
       DO UPDATE SET smelled_at = GREATEST(COALESCE(known_colonies.smelled_at, 0), EXCLUDED.smelled_at)`,
    [playerId, colonyId, via, at],
  );
}

/** Raids and deliveries need a colony you have scouted. Throws the reason the player sees. */
export async function requireKnown(q: Q, playerId: number, colonyId: number, action: 'raid' | 'send') {
  const k = await knowledgeOne(q, playerId, colonyId);
  if (k.knowledge === 'known' || k.knowledge === 'mine') return;
  throw new GameError('not_scouted', action === 'raid' ? DISCOVERY_MESSAGES.raid_needs_scout : DISCOVERY_MESSAGES.send_needs_scout);
}
