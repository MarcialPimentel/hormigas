// Raids (combat, loot, corpses, defense rebuild) and corpse hauling.
import {
  BLOCK_MESSAGES,
  BASH_LIMIT_PER_24H,
  canRaid,
  corpseDecayFactor,
  corpseFieldAmount,
  corpseProtein,
  createRng,
  fillCargo,
  groupCargo,
  lootable,
  presentUnits,
  protectedAmount,
  lootPct,
  randomSeed,
  rebuildDefenses,
  simulateBattle,
  sub,
  subCounts,
  addCounts,
  coordsKey,
  CASTES,
  type Coords,
  type UnitCounts,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError } from '../errors';
import { advance, getColony, getPlayer, lockColony, saveColony, type Player } from '../colony';
import { syncNest } from './nests';
import { defineMission, type Mission } from './missions';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';

const nonZero = <T extends Record<string, number | undefined>>(u: T): T => Object.fromEntries(Object.entries(u).filter(([, n]) => (n ?? 0) > 0)) as T;

/**
 * Raids that count toward the bash limit: raids this attacker won on this colony in the last 24 h,
 * plus raids still on their way there. Without the second part, several raids sent at once
 * would all pass the check before any of them landed. A recalled raid no longer counts.
 */
export async function raidsInLast24h(q: Q, attackerId: number, colonyId: number, t: number): Promise<number> {
  const r = await q.query(
    `SELECT
       (SELECT count(*) FROM raid_log WHERE attacker_id = $1 AND colony_id = $2 AND winner = 'attacker' AND at > $3)
     + (SELECT count(*) FROM missions WHERE player_id = $1 AND target_colony_id = $2 AND type = 'raid' AND status = 'outbound')
     AS n`,
    [attackerId, colonyId, t - 86400_000],
  );
  return Number(r.rows[0].n);
}

export function pvpState(p: Player) {
  return { points: p.points.total, protectedUntil: p.protectedUntil, lastActive: p.lastActive };
}

/** Add Protein to the corpse field at `c`, keeping the existing remainder's decay. */
export async function addCorpses(q: Q, worldId: number, c: Coords, protein: number, t: number) {
  if (protein <= 0) return;
  const r = await q.query('SELECT protein, created_at FROM corpse_fields WHERE world_id=$1 AND region=$2 AND patch=$3 AND spot=$4 FOR UPDATE', [
    worldId, c.region, c.patch, c.spot,
  ]);
  const existing = r.rows[0] ? corpseFieldAmount(r.rows[0].protein, r.rows[0].created_at, t) : 0;
  await q.query(
    `INSERT INTO corpse_fields (world_id, region, patch, spot, protein, created_at) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (world_id, region, patch, spot) DO UPDATE SET protein = EXCLUDED.protein, created_at = EXCLUDED.created_at`,
    [worldId, c.region, c.patch, c.spot, existing + protein, t],
  );
}

defineMission('raid', {
  allowsCargo: false,
  slot: 'mission',
  async validate({ q, player, colony, targetColony, units, t }) {
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there to raid.');
    if (targetColony.playerId === player.id) throw new GameError('bad_target', "You can't raid your own colony.");
    if (!presentUnits(units).some((u) => CASTES[u].attack > 0)) throw new GameError('no_fighters', 'Send at least one unit that can fight.');
    const recentWins = await raidsInLast24h(q, player.id, targetColony.id, t);
    if (targetColony.npc) {
      // Wild nests: no protection of any kind, but the bash limit still applies.
      // Raiding one is PvE practice, so it doesn't end your own new-colony protection (docs/17-wild-nests.md).
      if (recentWins >= BASH_LIMIT_PER_24H) throw new GameError('bash_limit', BLOCK_MESSAGES.bash_limit);
      return;
    }
    const target = await getPlayer(q, targetColony.playerId);
    const block = canRaid(pvpState(player), pvpState(target), t, recentWins);
    if (block) throw new GameError(block, BLOCK_MESSAGES[block]);
    // Raiding ends your own new-colony protection.
    if (player.protectedUntil > t) await q.query('UPDATE players SET protected_until = $2 WHERE id = $1', [player.id, t]);
    void colony;
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    await resolveRaid(q, m, at);
    return { home: presentUnits(m.units).length > 0 };
  },
});

/**
 * Fight a raid that has arrived: battle, loot into m.cargo, corpses, the raid log and both reports.
 * Leaves the surviving attackers in m.units. Used by player raids, wild-nest raids and swarms.
 */
export async function resolveRaid(q: Tx, m: Mission, at: number, opts: { attackerName?: string } = {}): Promise<void> {
  let target = await lockColony(q, m.targetColonyId!);
  target = target.npc ? await syncNest(q, target, at) : advance(target, at);
  const attacker = await getPlayer(q, m.playerId);
  const defender = await getPlayer(q, target.playerId);
  // Wild nests fight under their nest's name and get no reports or points.
  const attackerName = opts.attackerName ?? (attacker.isNpc ? (await getColony(q, m.originColonyId)).name : attacker.username);
  const defenderName = defender.isNpc ? target.name : defender.username;
  const seed = randomSeed();
  const rng = createRng(seed);

  const startAttacker = nonZero(m.units);
  const startDefender = nonZero(target.units);
  const startDefenses = nonZero(target.defenses);
  const result = simulateBattle(
    { units: startAttacker, research: attacker.research },
    { units: startDefender, defenses: target.defenses, research: defender.research },
    rng,
  );
  const rebuilt = rebuildDefenses(result.defensesDestroyed, rng);

  m.units = nonZero(result.attackerSurvivors);
  target.units = nonZero(result.defenderSurvivors);
  target.defenses = nonZero(addCounts(subCounts(target.defenses, result.defensesDestroyed), rebuilt));

  let loot = { foliage: 0, protein: 0, nectar: 0 };
  if (result.winner === 'attacker') {
    loot = fillCargo(lootable(target.resources, protectedAmount(target.chambers, defender.research), lootPct(attacker.research)), groupCargo(m.units));
    target.resources = sub(target.resources, loot);
    m.cargo = loot;
  }
  await saveColony(q, target);

  const corpses = corpseProtein(result.attackerLost, result.defenderLost);
  await addCorpses(q, m.worldId, m.target, corpses, at);
  await q.query('INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES ($1,$2,$3,$4,$5)', [
    m.worldId, attacker.id, target.id, result.winner, at,
  ]);

  const data = {
    winner: result.winner,
    seed,
    at: coordsKey(m.target),
    target: m.target,
    attacker: {
      name: attackerName,
      wild: attacker.isNpc,
      origin: m.origin,
      units: startAttacker,
      lost: nonZero(result.attackerLost),
      bonuses: { mandibles: attacker.research.mandibles ?? 0, chitin: attacker.research.chitin ?? 0, guard_formation: attacker.research.guard_formation ?? 0 },
    },
    defender: {
      name: defenderName,
      wild: defender.isNpc,
      colony: target.name,
      units: startDefender,
      defenses: startDefenses,
      lost: nonZero(result.defenderLost),
      defensesDestroyed: nonZero(result.defensesDestroyed),
      defensesRebuilt: nonZero(rebuilt),
      bonuses: { mandibles: defender.research.mandibles ?? 0, chitin: defender.research.chitin ?? 0, guard_formation: defender.research.guard_formation ?? 0 },
    },
    rounds: result.rounds,
    loot,
    corpses,
  };
  m.result = { winner: result.winner, loot, corpses };
  const verb = result.winner === 'attacker' ? 'won' : result.winner === 'defender' ? 'lost' : 'drew';
  if (!attacker.isNpc)
    await addReport(q, m.worldId, attacker.id, 'battle', `Raid on ${target.name} (${coordsKey(m.target)}): you ${verb}`, { ...data, perspective: 'attacker' }, at);
  const dverb = result.winner === 'defender' ? 'held' : result.winner === 'attacker' ? 'was raided' : 'held (draw)';
  if (!defender.isNpc)
    await addReport(q, m.worldId, defender.id, 'battle', `${target.name} ${dverb} — attack by ${attackerName}`, { ...data, perspective: 'defender' }, at);
  if (!defender.isNpc) await refreshPointsAfterCommit(q, defender.id);
  if (!attacker.isNpc) await refreshPointsAfterCommit(q, attacker.id);
}

defineMission('haul', {
  allowsCargo: false,
  slot: 'mission',
  async validate({ targetColony, units }) {
    void targetColony;
    if (groupCargo(units, { corpses: true }) <= 0) throw new GameError('no_cargo', 'Send units that can carry, like Workers or Haulers.');
  },
  async arrive(q: Tx, m, at) {
    const r = await q.query('SELECT protein, created_at FROM corpse_fields WHERE world_id=$1 AND region=$2 AND patch=$3 AND spot=$4 FOR UPDATE', [
      m.worldId, m.target.region, m.target.patch, m.target.spot,
    ]);
    const row = r.rows[0];
    const available = row ? corpseFieldAmount(row.protein, row.created_at, at) : 0;
    const take = Math.min(available, groupCargo(m.units, { corpses: true }));
    if (row) {
      const left = available - take;
      const factor = corpseDecayFactor(row.created_at, at);
      if (left <= 0 || factor <= 0)
        await q.query('DELETE FROM corpse_fields WHERE world_id=$1 AND region=$2 AND patch=$3 AND spot=$4', [m.worldId, m.target.region, m.target.patch, m.target.spot]);
      else
        await q.query('UPDATE corpse_fields SET protein=$5 WHERE world_id=$1 AND region=$2 AND patch=$3 AND spot=$4', [
          m.worldId, m.target.region, m.target.patch, m.target.spot, left / factor,
        ]);
    }
    m.cargo = { foliage: 0, protein: take, nectar: 0 };
    m.result = { collected: take };
    await addReport(q, m.worldId, m.playerId, 'haul', take > 0 ? `Hauled ${Math.floor(take).toLocaleString()} Protein from ${coordsKey(m.target)}` : `Nothing to haul at ${coordsKey(m.target)}`, {
      target: m.target,
      collected: take,
    }, at);
    return { home: true };
  },
});
