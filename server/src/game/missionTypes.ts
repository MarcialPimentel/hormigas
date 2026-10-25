// Transport, Relocate and Scout. (Raid & Haul: combat.ts. Forage: forage.ts.)
import {
  CASTES,
  add,
  addCounts,
  coordsKey,
  createRng,
  lvl,
  presentUnits,
  randomSeed,
  res,
  scoutDetail,
  scoutDetectionChance,
  type CasteId,
} from '@hormigas/shared';
import { GameError } from '../errors';
import { advance, getColony, getPlayer, lockColony, saveColony } from '../colony';
import { defineMission } from './missions';
import { addReport } from './reports';
import { refreshPoints } from './points';

defineMission('transport', {
  allowsCargo: true,
  slot: 'mission',
  async validate({ targetColony, colony }) {
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there.');
    if (targetColony.id === colony.id) throw new GameError('bad_target', 'Pick a different colony.');
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
  slot: 'mission',
  async validate({ targetColony, player, units }) {
    if (!targetColony) throw new GameError('bad_target', 'There is no colony there to scout.');
    if (targetColony.playerId === player.id) throw new GameError('bad_target', "You don't need to scout your own colony.");
    if (presentUnits(units).some((u) => u !== 'scout')) throw new GameError('scouts_only', 'Only Scouts can be sent to scout.');
  },
  async arrive(q, m, at) {
    if (!m.targetColonyId) return { home: true };
    const target = advance(await getColony(q, m.targetColonyId), at);
    const attacker = await getPlayer(q, m.playerId);
    const defender = await getPlayer(q, target.playerId);
    const scouts = lvl(m.units, 'scout');
    const yours = lvl(attacker.research, 'scent_reading');
    const theirs = lvl(defender.research, 'scent_reading');
    const detail = scoutDetail(yours, theirs, scouts);
    const homeUnits = Object.values(target.units).reduce((a, b) => a + (b ?? 0), 0);
    const chance = scoutDetectionChance(homeUnits, scouts, yours, theirs);
    const caught = createRng(randomSeed())() < chance;

    const data: any = {
      colony: target.name,
      owner: defender.username,
      coords: target ? { region: target.region, patch: target.patch, spot: target.spot } : m.target,
      detail,
      detectionChance: chance,
      caught,
      resources: target.resources,
      protectedEach: target.chambers.honeypot_gallery ? 1000 * Math.pow(1.6, target.chambers.honeypot_gallery) : 0,
    };
    if (detail !== 'resources') data.units = target.units;
    if (detail === 'defenses' || detail === 'full') data.defenses = target.defenses;
    if (detail === 'full') {
      data.chambers = target.chambers;
      data.research = defender.research;
    }
    m.result = { reportDetail: detail, caught };
    await addReport(q, m.worldId, m.playerId, 'scout', `Scout report: ${target.name} (${coordsKey(m.target)})`, data, at);
    await addReport(
      q, m.worldId, target.playerId, 'scouted',
      caught ? `Your colony killed ${scouts} enemy ${scouts === 1 ? 'scout' : 'scouts'}` : `Enemy scouts spotted near ${target.name}`,
      { colony: target.name, from: attacker.username, origin: m.origin, scouts, caught },
      at,
    );
    if (caught) {
      m.units = {};
      await refreshPoints(q, m.playerId);
      return { home: false };
    }
    return { home: true };
  },
});

export const UNIT_NAME = (id: string) => CASTES[id as CasteId]?.name ?? id;
