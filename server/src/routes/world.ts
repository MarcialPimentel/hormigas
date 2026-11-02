// Map, missions and reports routes.
import type { FastifyInstance } from 'fastify';
import {
  WORLD, WILDS_SPOT, SPECIES, SCENT_NAME, WILD_SCENTS, HERDS, MAX_SPOT, isInactive, isNewPlayerProtected, corpseFieldAmount, nestLevelFor, isHerdState,
  herdNectarPerHour, herdStoreCap, herdHoneydewAt, speciesKind, type ScentHint, isWindfallState, WINDFALLS, type WindfallState,
} from '@hormigas/shared';
import { leaderOf } from '../game/nests';
import { knowledgeOf, type KnownEntry } from '../game/discovery';
import { fogOf, showsThrough, sightOf } from '../game/fog';
import { relationsOf, supercolonyTags } from '../game/diplomacy';
import type { RelationInfo } from '@hormigas/shared';
import { getPool, tx } from '../db';
import { now } from '../clock';
import { requireAuth } from '../auth';
import { GameError } from '../errors';
import { processDueEvents } from '../events';
import { getWorld } from '../world';
import { missionView, recallMission, sendMission } from '../game/missions';
import { recallTenders } from '../game/herds';
import { cachedWorldSpeed } from '../world';

/** What a wild scent smells of (docs/24-npcs.md): sharp = ant nest, sweet = aphids, woody = termites, danger = spider. */
function scentHint(npc: any): ScentHint {
  if (isHerdState(npc)) return 'herd';
  const kind = speciesKind(npc.species);
  return kind === 'nest' ? 'nest' : kind;
}

/**
 * One colony on the map, as this player knows it (docs/22-discovery.md).
 * A scent shows only whose ants it smells of (and, for wild things, a hint of what they are); a familiar scent adds
 * its name; a known colony shows everything.
 */
function colonyView(c: any, k: KnownEntry, leader: number, t: number, me: number, rel?: RelationInfo, tag?: { id: number; name: string }) {
  if (isWindfallState(c.npc)) return windfallView(c, c.npc, me);
  const kind = c.npc ? 'wild' : 'player';
  const hint = c.npc ? scentHint(c.npc) : undefined;
  const base = { known: k.knowledge, kind, hint, smelledAt: k.smelledAt, discoveredAt: k.discoveredAt };
  const herd = isHerdState(c.npc) ? c.npc : null;
  const species = c.npc && !herd ? SPECIES[c.npc.species as keyof typeof SPECIES] : null;
  const owner = herd ? 'Aphids' : species ? species.name : c.username;
  if (k.knowledge === 'scent') return { ...base, id: null, name: hint ? WILD_SCENTS[hint].name : SCENT_NAME[kind as 'player' | 'wild'], owner: null };
  if (k.knowledge === 'familiar') return { ...base, id: null, name: c.name, owner };
  const pvp = { points: c.points_total, protectedUntil: c.protected_until, lastActive: c.last_active };
  const wild = c.npc && !herd;
  return {
    ...base,
    id: c.id,
    name: c.name,
    playerId: c.player_id,
    owner,
    points: c.npc ? 0 : c.points_total,
    mine: k.knowledge === 'mine',
    inactive: !c.npc && isInactive(pvp, t),
    protected: !c.npc && isNewPlayerProtected(pvp, t),
    // truces and supercolonies (docs/23-supercolonies.md)
    ...(rel ? { relation: rel.relation, relationUntil: rel.until ?? null } : {}),
    ...(tag ? { supercolony: tag.name } : {}),
    ...(wild
      ? { wild: { species: c.npc.species, kind: speciesKind(c.npc.species), level: speciesKind(c.npc.species) === 'nest' ? nestLevelFor(leader, c.npc.level) : c.npc.level, style: species!.style } }
      : {}),
    ...(herd ? { herd: herdView(c, herd, t, me) } : {}),
  };
}

/** A known aphid herd: its yield, and who tends it. Its tenders and honeydew are shown only to the player who tends it. */
function herdView(c: any, herd: any, t: number, me: number) {
  const yours = herd.tender?.playerId === me;
  return {
    level: herd.level,
    nectarPerHour: herdNectarPerHour(herd.level),
    storeCap: herdStoreCap(herd.level),
    style: HERDS.style,
    tended: !!herd.tender,
    tenderName: herd.tender ? c.tender_name : null,
    yours,
    ...(yours
      ? { tenders: c.units, honeydew: Math.floor(herdHoneydewAt(herd, Number(c.nectar), t, cachedWorldSpeed())), tenderColonyId: herd.tender.colonyId, since: herd.tender.since, deliverEveryHours: HERDS.deliverEveryHours }
      : {}),
  };
}

/**
 * A windfall lying in the wilds (docs/25-windfalls.md). Everyone smells it, so it needs no scouting: anyone sees what it
 * is, how much is left, when it rots, and who holds it. How many ants hold or guard it takes a scout, unless they're yours.
 */
function windfallView(c: any, w: WindfallState, me: number) {
  const yours = w.tender?.playerId === me;
  const holders = Object.values(c.units as Record<string, number>).some((n) => n > 0);
  return {
    known: 'known' as const,
    kind: 'wild' as const,
    smelledAt: null,
    discoveredAt: null,
    id: c.id,
    name: c.name,
    playerId: c.player_id,
    owner: w.tender ? c.tender_name : holders ? 'Wild ants' : 'Nobody',
    points: 0,
    mine: false,
    windfall: {
      kind: w.drop!.kind,
      text: WINDFALLS.kinds[w.drop!.kind].text,
      left: { foliage: Math.floor(Number(c.foliage)), protein: Math.floor(Number(c.protein)), nectar: Math.floor(Number(c.nectar)) },
      pile: w.drop!.pile,
      endsAt: w.drop!.endsAt,
      held: !!w.tender && holders,
      guarded: !w.tender && holders,
      holderName: w.tender ? c.tender_name : null,
      yours,
      deliverEveryHours: WINDFALLS.deliverEveryHours,
      ...(yours ? { holders: c.units, holderColonyId: w.tender!.colonyId, since: w.tender!.since } : {}),
    },
  };
}

export async function worldRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    await requireAuth(req);
    await processDueEvents();
  });

  app.get('/api/map', async (req) => {
    const qs = req.query as any;
    const region = Number(qs.region);
    const patch = Number(qs.patch);
    if (!(region >= 1 && region <= WORLD.regions && patch >= 1 && patch <= WORLD.patchesPerRegion))
      throw new GameError('bad_coords', 'That patch does not exist.');
    const q = getPool();
    const world = await getWorld(q);
    const t = now();
    // fog of war (docs/22-discovery.md#fog-of-war): a patch never explored shows only its outline; one explored but out
    // of sight shows the colonies that were there when you last saw it, and nothing that comes and goes
    const f = fogOf(await sightOf(q, req.playerId, t), region, patch);
    // only the wilds show, so you can send Scouts to survey them
    if (f.fog === 'unexplored') return { region, patch, fog: f.fog, seenAt: null, spots: [{ spot: WILDS_SPOT, colony: null, corpses: 0 }] };
    const r = await q.query(
      `SELECT c.id, c.name, c.spot, c.player_id, c.npc, c.units, c.foliage, c.protein, c.nectar, c.created_at, p.username, p.points_total, p.protected_until, p.last_active,
              (SELECT tp.username FROM players tp WHERE tp.id = (c.npc->'tender'->>'playerId')::int) AS tender_name
         FROM colonies c JOIN players p ON p.id = c.player_id
        WHERE c.world_id = $1 AND c.region = $2 AND c.patch = $3 ORDER BY c.spot`,
      [world.id, region, patch],
    );
    if (f.fog === 'explored') r.rows = r.rows.filter((x: any) => x.player_id === req.playerId || (!isWindfallState(x.npc) && showsThrough(f, Number(x.created_at))));
    const hasCorpses = f.fog === 'visible' && (await q.query("SELECT to_regclass('corpse_fields') IS NOT NULL AS ok")).rows[0].ok;
    const corpses = hasCorpses
      ? (await q.query('SELECT spot, protein, created_at FROM corpse_fields WHERE world_id = $1 AND region = $2 AND patch = $3', [world.id, region, patch])).rows
      : [];
    // a wild nest's level follows the strongest active player in its patch
    const leader = leaderOf(r.rows.filter((x: any) => !x.npc), t);
    const known = await knowledgeOf(q, req.playerId, r.rows.map((x: any) => x.id));
    const owners = [...new Set(r.rows.filter((x: any) => !x.npc).map((x: any) => x.player_id as number))];
    const rels = await relationsOf(q, req.playerId, owners, t);
    const tags = await supercolonyTags(q, owners);
    const spots = [];
    // colony spots, the wilds, then any wild sites that hold something (herds, mounds, dens: docs/24-npcs.md)
    for (let spot = 1; spot <= MAX_SPOT; spot++) {
      let c = r.rows.find((x: any) => x.spot === spot);
      // an empty windfall site shows nothing until the next windfall drops (docs/25-windfalls.md)
      if (c && isWindfallState(c.npc) && !c.npc.drop) c = undefined;
      if (spot > WORLD.spotsPerPatch + 1 && !c) continue;
      const corpse = corpses.find((x: any) => x.spot === spot);
      spots.push({
        spot,
        colony: c ? colonyView(c, known.get(c.id)!, leader, t, req.playerId, rels.get(c.player_id), tags.get(c.player_id)) : null,
        corpses: corpse ? corpseFieldAmount(corpse.protein, corpse.created_at, t) : 0,
      });
    }
    return { region, patch, fog: f.fog, seenAt: f.seenAt, spots };
  });

  /**
   * Which patches of a region have colonies: counts only, so players can find each other without seeing more. Under
   * fog of war (docs/22-discovery.md#fog-of-war) only explored patches are counted, as they were when last seen, and
   * every patch says how this player sees it.
   */
  app.get('/api/map/region', async (req) => {
    const region = Number((req.query as any).region);
    if (!(Number.isInteger(region) && region >= 1 && region <= WORLD.regions)) throw new GameError('bad_coords', 'That region does not exist.');
    const q = getPool();
    const world = await getWorld(q);
    const sight = await sightOf(q, req.playerId, now());
    const r = await q.query(
      `SELECT patch, player_id, npc IS NOT NULL AS wild, created_at,
              (npc IS NULL AND player_id <> $3 AND player_id IN (
                SELECT o.player_id FROM supercolony_members me
                  JOIN supercolony_members o ON o.supercolony_id = me.supercolony_id
                 WHERE me.player_id = $3 AND me.status = 'member' AND o.status = 'member')) AS ally
         FROM colonies WHERE world_id = $1 AND region = $2 ORDER BY patch`,
      [world.id, region, req.playerId],
    );
    const fog: Record<number, { fog: string; seenAt: number | null }> = {};
    for (let p = 1; p <= WORLD.patchesPerRegion; p++) fog[p] = fogOf(sight, region, p);
    const by = new Map<number, { patch: number; colonies: number; wild: boolean; mine: boolean; ally: boolean }>();
    for (const x of r.rows) {
      const f = fogOf(sight, region, x.patch);
      if (x.player_id !== req.playerId && !showsThrough(f, Number(x.created_at))) continue;
      const e = by.get(x.patch) ?? { patch: x.patch, colonies: 0, wild: false, mine: false, ally: false };
      if (x.wild) e.wild = true;
      else {
        e.colonies++;
        if (x.player_id === req.playerId) e.mine = true;
        if (x.ally) e.ally = true;
      }
      by.set(x.patch, e);
    }
    return {
      region,
      patches: [...by.values()].filter((e) => e.colonies > 0 || e.wild),
      fog: Object.entries(fog).map(([p, f]) => ({ patch: Number(p), fog: f.fog, seenAt: f.seenAt })),
    };
  });

  /**
   * The next patch, going one way through the world (region by region), that holds another player's colony.
   * Wild nests don't count: every inhabited patch has one. Wraps around the world.
   */
  app.get('/api/map/nearest', async (req) => {
    const qs = req.query as any;
    const region = Number(qs.region);
    const patch = Number(qs.patch);
    const dir = Number(qs.dir) < 0 ? -1 : 1;
    if (!(region >= 1 && region <= WORLD.regions && patch >= 1 && patch <= WORLD.patchesPerRegion))
      throw new GameError('bad_coords', 'That patch does not exist.');
    const q = getPool();
    const world = await getWorld(q);
    const P = WORLD.patchesPerRegion;
    const here = (region - 1) * P + patch;
    // only colonies you could see on the map: in sight, or on an explored patch as you last saw it (fog of war)
    const sight = await sightOf(q, req.playerId, now());
    const r = await q.query(
      'SELECT region, patch, created_at FROM colonies WHERE world_id = $1 AND npc IS NULL AND player_id <> $2',
      [world.id, req.playerId],
    );
    const idxs = [...new Set(r.rows.filter((x: any) => showsThrough(fogOf(sight, x.region, x.patch), Number(x.created_at)))
      .map((x: any) => (x.region - 1) * P + x.patch))].sort((a, b) => a - b);
    const others = idxs.filter((i) => i !== here);
    const next = dir > 0 ? others.find((i) => i > here) ?? others[0] : [...others].reverse().find((i) => i < here) ?? others[others.length - 1];
    const row = next === undefined ? null : { region: Math.floor((next - 1) / P) + 1, patch: ((next - 1) % P) + 1 };
    return { found: row ? { region: row.region, patch: row.patch } : null };
  });

  app.post('/api/missions', async (req) => {
    const m = await tx((q) => sendMission(q, req.playerId, (req.body ?? {}) as any));
    return { ok: true, mission: missionView(m) };
  });

  /** Call your tenders home from an aphid herd (docs/24-npcs.md). */
  app.post('/api/herds/:id/recall', async (req) => {
    const m = await tx((q) => recallTenders(q, req.playerId, Number((req.params as any).id)));
    return { ok: true, mission: missionView(m) };
  });

  app.post('/api/missions/:id/recall', async (req) => {
    const m = await tx((q) => recallMission(q, req.playerId, Number((req.params as any).id)));
    return { ok: true, mission: missionView(m) };
  });

  app.get('/api/reports', async (req) => {
    const qs = req.query as any;
    const limit = Math.min(100, Math.max(1, Number(qs.limit) || 50));
    const before = Number(qs.before) || Number.MAX_SAFE_INTEGER;
    const r = await getPool().query(
      'SELECT id, type, title, data, created_at, read FROM reports WHERE player_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3',
      [req.playerId, before, limit],
    );
    return { reports: r.rows.map((x: any) => ({ id: x.id, type: x.type, title: x.title, data: x.data, createdAt: x.created_at, read: x.read })) };
  });

  app.post('/api/reports/read', async (req) => {
    const ids = ((req.body ?? {}) as any).ids;
    if (Array.isArray(ids) && ids.length) await getPool().query('UPDATE reports SET read = true WHERE player_id = $1 AND id = ANY($2::bigint[])', [req.playerId, ids.map(Number)]);
    else await getPool().query('UPDATE reports SET read = true WHERE player_id = $1', [req.playerId]);
    return { ok: true };
  });

  app.post('/api/reports/delete', async (req) => {
    const ids = ((req.body ?? {}) as any).ids;
    if (!Array.isArray(ids)) throw new GameError('bad_ids', 'Pick reports to delete.');
    await getPool().query('DELETE FROM reports WHERE player_id = $1 AND id = ANY($2::bigint[])', [req.playerId, ids.map(Number)]);
    return { ok: true };
  });

  /** Latest scout report you have on a colony spot (for the battle preview). */
  app.get('/api/intel', async (req) => {
    const qs = req.query as any;
    const key = `${Number(qs.region)}:${Number(qs.patch)}:${Number(qs.spot)}`;
    const r = await getPool().query(
      "SELECT id, data, created_at FROM reports WHERE player_id = $1 AND type = 'scout' AND title LIKE '%(' || $2 || ')' ORDER BY id DESC LIMIT 1",
      [req.playerId, key],
    );
    const row = r.rows[0];
    return { intel: row ? { reportId: row.id, at: row.created_at, data: row.data } : null };
  });
}
