// Transport, Relocate and Scout. (Raid & Haul: combat.ts. Forage: forage.ts.)
import {
  CASTES,
  add,
  addCounts,
  coordsKey,
  createRng,
  lvl,
  presentUnits,
  protectedAmount,
  randomSeed,
  res,
  scoutDetail,
  scoutDetectionChance,
  researchSum,
  WILDS_SPOT,
  corpseFieldAmount,
  forageFindCap,
  forageOddsSummary,
  isInactive,
  SPECIES,
  HERDS,
  herdNectarPerHour,
  herdStoreCap,
  regrowHours,
  speciesKind,
  type CasteId,
} from '@hormigas/shared';
import type { Tx } from '../db';
import type { ArrivalOutcome, Mission } from './missions';
import { GameError } from '../errors';
import { cachedWorldSpeed } from '../world';
import { advance, getColony, getPlayer, lockColony, saveColony } from '../colony';
import { nestStateOf, syncNest } from './nests';
import { herdOf } from './herds';
import { defineMission } from './missions';
import { addReport } from './reports';
import { refreshPointsAfterCommit } from './points';
import { discover, requireKnown, smelledBy } from './discovery';

defineMission('transport', {
  allowsCargo: true,
  slot: 'mission',
  async validate({ q, targetColony, colony, player }) {
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there.');
    if (targetColony.id === colony.id) throw new GameError('bad_target', 'Pick a different colony.');
    if (herdOf(targetColony)) throw new GameError('bad_target', "Aphids don't take deliveries. Send ants to tend them instead.");
    if (targetColony.npc) throw new GameError('bad_target', "Wild ants don't accept deliveries.");
    await requireKnown(q, player.id, targetColony.id, 'send');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    let c = await lockColony(q, m.targetColonyId);
    c = advance(c, at);
    c.resources = add(c.resources, m.cargo);
    await saveColony(q, c);
    const delivered = m.cargo;
    m.cargo = res();
    m.result = { delivered };
    await addReport(q, m.worldId, m.playerId, 'transport', `Transport delivered to ${c.name}`, { target: m.target, colony: c.name, delivered }, at);
    if (c.playerId !== m.playerId) {
      const sender = await getPlayer(q, m.playerId);
      await addReport(q, m.worldId, c.playerId, 'transport', `${sender.username} delivered resources to ${c.name}`, { from: sender.username, colony: c.name, delivered }, at);
    }
    return { home: true };
  },
});

defineMission('relocate', {
  allowsCargo: true,
  slot: 'mission',
  async validate({ targetColony, colony, player }) {
    if (!targetColony || targetColony.playerId !== player.id) throw new GameError('bad_target', 'You can only relocate to your own colonies.');
    if (targetColony.id === colony.id) throw new GameError('bad_target', 'Pick a different colony.');
  },
  async arrive(q, m, at) {
    let c = await lockColony(q, m.targetColonyId!);
    if (c.playerId !== m.playerId) return { home: true }; // colony changed hands: turn back
    c = advance(c, at);
    c.units = addCounts(c.units, m.units);
    c.resources = add(c.resources, m.cargo);
    await saveColony(q, c);
    await addReport(q, m.worldId, m.playerId, 'relocate', `Units arrived at ${c.name}`, { colony: c.name, units: m.units, cargo: m.cargo }, at);
    m.result = { delivered: m.cargo, units: m.units };
    m.units = {};
    m.cargo = res();
    return { home: false };
  },
});

defineMission('scout', {
  allowsCargo: false,
  allowsWilds: true,
  slot: 'mission',
  async validate({ targetColony, player, units, target }) {
    if (presentUnits(units).some((u) => u !== 'scout')) throw new GameError('scouts_only', 'Only Scouts can be sent to scout.');
    if (target.spot === WILDS_SPOT) return; // surveying the wilds is always allowed
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there to scout.');
    if (targetColony.playerId === player.id) throw new GameError('bad_target', "You don't need to scout your own colony.");
  },
  async arrive(q, m, at) {
    if (m.target.spot === WILDS_SPOT) return surveyWilds(q, m, at);
    if (!m.targetColonyId) return { home: true };
    const found = await getColony(q, m.targetColonyId);
    const target = found.npc ? await syncNest(q, await lockColony(q, found.id), at) : advance(found, at);
    const attacker = await getPlayer(q, m.playerId);
    // at an aphid herd, the tenders (if any) are the ones who might spot the scouts (docs/23-npcs.md)
    const herd = herdOf(target);
    const defender = await getPlayer(q, herd?.tender ? herd.tender.playerId : target.playerId);
    const scouts = lvl(m.units, 'scout');
    const yours = lvl(attacker.research, 'scent_reading');
    const theirs = lvl(defender.research, 'scent_reading');
    const detail = scoutDetail(yours, theirs, scouts);
    const homeUnits = Object.values(target.units).reduce((a, b) => a + (b ?? 0), 0);
    const chance = scoutDetectionChance(homeUnits, scouts, yours, theirs, researchSum(attacker.research, 'scoutStealth'));
    const caught = createRng(randomSeed())() < chance;

    const nest = nestStateOf(target);
    const data: any = {
      colony: target.name,
      owner: herd ? (herd.tender ? `Tended by ${defender.username}` : 'Untended') : nest ? SPECIES[nest.species].name : defender.username,
      ...(nest ? { wild: { species: nest.species, kind: speciesKind(nest.species), level: nest.level, style: SPECIES[nest.species].style } } : {}),
      ...(herd ? { herd: { level: herd.level, nectarPerHour: herdNectarPerHour(herd.level), storeCap: herdStoreCap(herd.level), tended: !!herd.tender, tenderName: herd.tender ? defender.username : null, style: HERDS.style } } : {}),
      coords: target ? { region: target.region, patch: target.patch, spot: target.spot } : m.target,
      detail,
      detectionChance: chance,
      caught,
      resources: target.resources,
      protectedEach: protectedAmount(target.chambers, defender.research),
    };
    // Scouts outrun soldiers: if our own raid on this colony hasn't landed yet, say so, or the report reads as "the raid did nothing"
    const raid = await q.query(
      "SELECT min(arrive_at) AS at FROM missions WHERE player_id = $1 AND type = 'raid' AND target_colony_id = $2 AND status = 'outbound' AND arrive_at > $3",
      [m.playerId, target.id, at],
    );
    if (raid.rows[0]?.at) data.raidArrivesAt = Number(raid.rows[0].at);
    if (nest) data.regrowMs = (regrowHours(nest.species) * 3600_000) / cachedWorldSpeed();
    if (detail !== 'resources') data.units = target.units;
    if (detail === 'defenses' || detail === 'full') data.defenses = target.defenses;
    if (detail === 'full') {
      data.chambers = target.chambers;
      data.research = defender.research;
    }
    m.result = { reportDetail: detail, caught };
    // A scout report turns the scent into a known colony; the target now recognizes the scouts' scent (one way).
    await discover(q, m.playerId, target.id, 'scouted', at);
    await smelledBy(q, defender.id, m.originColonyId, 'scouted_you', at);
    await addReport(q, m.worldId, m.playerId, 'scout', `Scout report: ${target.name} (${coordsKey(m.target)})`, data, at);
    if (!defender.isNpc) await addReport(
      q, m.worldId, defender.id, 'scouted',
      caught ? `Your colony killed ${scouts} enemy ${scouts === 1 ? 'scout' : 'scouts'}` : `Enemy scouts spotted near ${target.name}`,
      { colony: target.name, from: attacker.username, origin: m.origin, scouts, caught },
      at,
    );
    if (caught) {
      m.units = {};
      await refreshPointsAfterCommit(q, m.playerId);
      return { home: false };
    }
    return { home: true };
  },
});

const WILDS_TEXT = [
  'Tall grass, dead leaves and the smell of rain. Plenty of hiding places for food, and for things that eat ants.',
  'A tangle of roots and fallen seeds. Your scouts marked a few promising trails.',
  'Damp soil under a flat stone. Beetles live here, and something with too many legs.',
  'Sun-baked ground with the odd crumb. The scouts came back thirsty but hopeful.',
];

/** Scouts can survey the wilds of any patch: forage odds, what lives in the patch, corpses lying around. */
async function surveyWilds(q: Tx, m: Mission, at: number): Promise<ArrivalOutcome> {
  const player = await getPlayer(q, m.playerId);
  const luck = lvl(player.research, 'foraging_instinct');
  const { region, patch } = m.target;
  const cols = await q.query(
    `SELECT p.id, p.points_total, p.protected_until, p.last_active
       FROM colonies c JOIN players p ON p.id = c.player_id
      WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3`,
    [m.worldId, region, patch],
  );
  const others = cols.rows.filter((r: any) => r.id !== m.playerId);
  const inactive = others.filter((r: any) => isInactive({ points: r.points_total, protectedUntil: r.protected_until, lastActive: r.last_active }, at)).length;
  const corpses = (await q.query('SELECT protein, created_at FROM corpse_fields WHERE world_id = $1 AND region = $2 AND patch = $3', [m.worldId, region, patch])).rows
    .reduce((sum: number, r: any) => sum + corpseFieldAmount(r.protein, r.created_at, at), 0);
  const rng = createRng(randomSeed());
  const data = {
    wilds: true,
    coords: m.target,
    text: WILDS_TEXT[Math.floor(rng() * WILDS_TEXT.length)],
    odds: forageOddsSummary(luck),
    findCap: forageFindCap(player.points.total, luck),
    colonies: others.length,
    inactive,
    corpses: Math.floor(corpses),
  };
  m.result = { wilds: true };
  await addReport(q, m.worldId, m.playerId, 'scout', `Scout report: the wilds (${coordsKey(m.target)})`, data, at);
  return { home: true };
}

export const UNIT_NAME = (id: string) => CASTES[id as CasteId]?.name ?? id;
