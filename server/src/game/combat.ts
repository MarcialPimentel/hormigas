// Raids (combat, loot, corpses, defense rebuild) and corpse hauling.
import {
  BLOCK_MESSAGES,
  BASH_LIMIT_PER_24H,
  canRaid,
  corpseDecayFactor,
  corpseFieldAmount,
  corpseProtein,
  corpseCarry,
  res,
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
  isHerdState,
  type Coords,
  type UnitCounts,
} from '@hormigas/shared';
import type { Q, Tx } from '../db';
import { GameError } from '../errors';
import { advance, getColony, getPlayer, lockColony, saveColony, type Player } from '../colony';
import { syncNest } from './nests';
import { defineMission, lockGarrisons, saveGarrison, type Mission } from './missions';
import { raidBlock } from './diplomacy';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { requireKnown, smelledBy } from './discovery';
import { herdOf, leaveHerd } from './herds';

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
  async validate({ q, player, colony, targetColony, units, t }) {
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there to raid.');
    if (targetColony.playerId === player.id) throw new GameError('bad_target', "You can't raid your own colony.");
    if (!presentUnits(units).some((u) => CASTES[u].attack > 0)) throw new GameError('no_fighters', 'Send at least one unit that can fight.');
    // Scout before raiding: nobody raids a scent (docs/22-discovery.md).
    await requireKnown(q, player.id, targetColony.id, 'raid');
    const recentWins = await raidsInLast24h(q, player.id, targetColony.id, t);
    const herd = herdOf(targetColony);
    if (herd) {
      // Aphid herds (docs/24-npcs.md): raiding one is a fight with the player whose ants tend it, under the usual PvP rules.
      if (!herd.tender) throw new GameError('herd_untended', 'Nobody tends this herd, so there is no one to fight. Send ants to tend it instead.');
      if (herd.tender.playerId === player.id) throw new GameError('bad_target', 'Your own ants tend this herd.');
      // truces and supercolonies cover a player's tenders too (docs/23-supercolonies.md)
      const herdPact = await raidBlock(q, player.id, herd.tender.playerId, t);
      if (herdPact) throw new GameError(herdPact.code, herdPact.message);
      const tenderOwner = await getPlayer(q, herd.tender.playerId);
      const block = canRaid(pvpState(player), pvpState(tenderOwner), t, recentWins);
      if (block) throw new GameError(block, BLOCK_MESSAGES[block]);
      if (player.protectedUntil > t) await q.query('UPDATE players SET protected_until = $2 WHERE id = $1', [player.id, t]);
      return;
    }
    if (targetColony.npc) {
      // Wild nests: no protection of any kind, but the bash limit still applies.
      // Raiding one is PvE practice, so it doesn't end your own new-colony protection (docs/17-wild-nests.md).
      if (recentWins >= BASH_LIMIT_PER_24H) throw new GameError('bash_limit', BLOCK_MESSAGES.bash_limit);
      return;
    }
    // Truces and supercolonies: no raids, including while a truce's notice or a shared scent runs out (docs/23-supercolonies.md).
    const pact = await raidBlock(q, player.id, targetColony.playerId, t);
    if (pact) throw new GameError(pact.code, pact.message);
    const target = await getPlayer(q, targetColony.playerId);
    const block = canRaid(pvpState(player), pvpState(target), t, recentWins);
    if (block) throw new GameError(block, BLOCK_MESSAGES[block]);
    // Raiding ends your own new-colony protection.
    if (player.protectedUntil > t) await q.query('UPDATE players SET protected_until = $2 WHERE id = $1', [player.id, t]);
    void colony;
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    // A pact agreed while the raid was on its way: the soldiers smell it and turn back without a fight.
    // at an aphid herd, the pact that counts is with the player whose ants tend it (docs/24-npcs.md)
    const row = (await q.query('SELECT player_id, npc FROM colonies WHERE id = $1', [m.targetColonyId])).rows[0];
    const owner = isHerdState(row?.npc) ? row.npc.tender?.playerId : row?.player_id;
    const pact = owner != null ? await raidBlock(q, m.playerId, owner, at) : null;
    if (pact) {
      const c = await getColony(q, m.targetColonyId);
      m.result = { turnedBack: true, pact: pact.code };
      await addReport(q, m.worldId, m.playerId, 'battle', `Your raid on ${c.name} turned back: ${pact.message}`, { turnedBack: true, target: m.target, colony: c.name, why: pact.message }, at);
      return { home: true };
    }
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
  // A herd's tenders fight for the player who sent them (docs/24-npcs.md); an untended herd has nobody to fight.
  const herd = herdOf(target);
  const defender = await getPlayer(q, herd?.tender ? herd.tender.playerId : target.playerId);
  // Wild nests fight under their nest's name and get no reports or points.
  const attackerName = opts.attackerName ?? (attacker.isNpc ? (await getColony(q, m.originColonyId)).name : attacker.username);
  const defenderName = defender.isNpc ? target.name : defender.username;
  const seed = randomSeed();
  const rng = createRng(seed);

  const startAttacker = nonZero(m.units);
  const startDefender = nonZero(target.units);
  const startDefenses = nonZero(target.defenses);
  // Allied soldiers holding position at the colony fight beside its own (docs/23-supercolonies.md).
  const garrisons = target.npc ? [] : await lockGarrisons(q, target.id);
  const allyPlayers = await Promise.all(garrisons.map((g) => getPlayer(q, g.playerId)));
  const allyStart = garrisons.map((g) => nonZero(g.units));
  const result = simulateBattle(
    // only player raids carry a fall-back order; wild nests and swarms fight to the end
    { units: startAttacker, research: attacker.research, retreatPct: m.retreatPct ?? 0 },
    { units: startDefender, defenses: target.defenses, research: defender.research, allies: garrisons.map((g, i) => ({ units: allyStart[i], research: allyPlayers[i].research })) },
    rng,
  );
  const rebuilt = rebuildDefenses(result.defensesDestroyed, rng);

  m.units = nonZero(result.attackerSurvivors);
  target.units = nonZero(result.defenderSurvivors);
  target.defenses = nonZero(addCounts(subCounts(target.defenses, result.defensesDestroyed), rebuilt));

  let loot = { foliage: 0, protein: 0, nectar: 0 };
  if (result.winner === 'attacker') {
    // wild nests, mounds and dens give up more; aphid herds (players' tenders) don't (docs/08-combat.md)
    const wildTarget = !!target.npc && !herd;
    loot = fillCargo(lootable(target.resources, protectedAmount(target.chambers, defender.research), lootPct(attacker.research, wildTarget)), groupCargo(m.units));
    target.resources = sub(target.resources, loot);
    m.cargo = loot;
  }
  if (herd?.tender && presentUnits(target.units).length === 0) await leaveHerd(q, target, at); // the tenders are gone: the herd is free
  else await saveColony(q, target);

  for (const [i, g] of garrisons.entries()) {
    g.units = nonZero(result.alliesSurvivors[i]);
    await saveGarrison(q, g);
  }
  const allies = garrisons.map((g, i) => ({ name: allyPlayers[i].username, units: allyStart[i], lost: nonZero(result.alliesLost[i]) }));

  const corpses = corpseProtein(result.attackerLost, result.defenderLost, ...result.alliesLost);
  // Slave-makers carry the dead home at once after a won raid; the rest stay on the field (docs/05-castes-units.md)
  const carried = result.winner === 'attacker' ? Math.min(corpses, corpseCarry(m.units)) : 0;
  if (carried > 0) m.cargo = { ...(m.cargo ?? res()), protein: (m.cargo?.protein ?? 0) + carried };
  await addCorpses(q, m.worldId, m.target, corpses - carried, at);
  await q.query('INSERT INTO raid_log (world_id, attacker_id, colony_id, winner, at) VALUES ($1,$2,$3,$4,$5)', [
    m.worldId, attacker.id, target.id, result.winner, at,
  ]);

  const data = {
    winner: result.winner,
    seed,
    ...(m.retreatPct ? { retreatPct: m.retreatPct } : {}),
    ...(result.retreatedAfterRound != null ? { retreatedAfterRound: result.retreatedAfterRound } : {}),
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
      ...(allies.length ? { allies } : {}),
    },
    rounds: result.rounds,
    loot,
    corpses,
    ...(carried > 0 ? { corpsesCarried: carried } : {}),
  };
  m.result = { winner: result.winner, loot, corpses };
  const verb = result.retreatedAfterRound != null ? 'fell back' : result.winner === 'attacker' ? 'won' : result.winner === 'defender' ? 'lost' : 'drew';
  if (!attacker.isNpc)
    await addReport(q, m.worldId, attacker.id, 'battle', `Raid on ${target.name} (${coordsKey(m.target)}): you ${verb}`, { ...data, perspective: 'attacker' }, at);
  const dverb = herd
    ? result.winner === 'defender' ? 'held: your tenders drove off the raiders' : result.winner === 'attacker' ? 'lost: your tenders were driven off' : 'held (draw)'
    : result.retreatedAfterRound != null ? 'held: the raiders fell back' : result.winner === 'defender' ? 'held' : result.winner === 'attacker' ? 'was raided' : 'held (draw)';
  // The defender now recognizes the raiders' scent (one way: they still scout before striking back). Swarms have no home.
  if (!defender.isNpc && m.type === 'raid') await smelledBy(q, defender.id, m.originColonyId, 'raided_you', at);
  if (!defender.isNpc)
    await addReport(q, m.worldId, defender.id, 'battle', `${target.name} ${dverb} — attack by ${attackerName}`, { ...data, perspective: 'defender' }, at);
  for (const [i, ally] of allyPlayers.entries()) {
    const lostAny = presentUnits(allies[i].lost).length > 0;
    const verbA = result.winner === 'defender' ? 'helped hold' : result.winner === 'attacker' ? 'could not save' : 'held (draw)';
    await addReport(q, m.worldId, ally.id, 'battle', `Your soldiers ${verbA} ${target.name} against ${attackerName}${lostAny ? '' : ', with no losses'}`, { ...data, perspective: 'ally', allyIndex: i }, at);
    await refreshPointsAfterCommit(q, ally.id);
  }
  if (!defender.isNpc) await refreshPointsAfterCommit(q, defender.id);
  if (!attacker.isNpc) await refreshPointsAfterCommit(q, attacker.id);
}

defineMission('haul', {
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
