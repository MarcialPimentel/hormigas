// The trailer world: a separate local database (hormigas_trailer, in the same Docker Postgres as development)
// with one late-game colony, rivals around it, a fought battle to replay and columns on the march.
// Built from scratch on every run, so the trailer can be re-rendered whenever the game changes.
// Your development world (database "hormigas") is never touched.

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { API, LOGIN, ROOT } from './lib.mjs';

const ADMIN = 'postgres://hormigas:hormigas@localhost:5432/hormigas';
const DB = 'postgres://hormigas:hormigas@localhost:5432/hormigas_trailer';
const PORT = new URL(API).port;
const SPEED = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start the game server on the trailer database; resolves once it answers. */
async function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'src/index.ts'], {
    cwd: join(ROOT, 'server'),
    env: { ...process.env, DATABASE_URL: DB, PORT, WORLD_SPEED: String(SPEED), WORLD_NAME: 'The Backyard', NODE_ENV: 'development' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`${API}/api/state`);
      return child;
    } catch {
      await sleep(500);
    }
  }
  child.kill();
  throw new Error('the trailer game server did not start');
}
const stopServer = (child) => new Promise((r) => { child.once('exit', r); child.kill(); });

/** A logged-in API caller for the trailer player. */
async function session() {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LOGIN) });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };
}

const nowMs = '(extract(epoch from now())*1000)::bigint';
const json = (o) => `'${JSON.stringify(o)}'`;

/** Rival players: name, region, patch, spot. Next door to Red Hill, and around the rest of the yard. */
const RIVALS = [
  ['Formica Rex', 1, 1, 7], ['Leafcutters', 1, 1, 8], ['Pheidole', 1, 1, 6], ['Carpenteria', 1, 2, 7], ['Weaverkin', 1, 2, 8],
  ['Bullhorn', 1, 3, 5], ['Lasius Niger', 1, 71, 7], ['Sugarline', 1, 86, 8], ['Fire Hill', 2, 23, 3], ['Honeydew', 2, 54, 4],
  ['Ironjaw', 2, 77, 6], ['Odontomachus', 3, 60, 4], ['Tapinoma', 3, 18, 5], ['Azteca', 3, 82, 3], ['Driver Column', 4, 97, 5],
  ['Polyrhachis', 4, 33, 6], ['Camponotus', 4, 61, 2], ['Messor', 5, 34, 6], ['Pogonomyrmex', 5, 49, 7], ['Dorylus', 5, 12, 3],
  ['Oecophylla', 1, 26, 2], ['Ectatomma', 2, 41, 7], ['Amber Gate', 3, 44, 6], ['Thornfield', 4, 15, 4], ['Mossback', 5, 71, 5],
];
/** The trailer player's other colonies (a late-game player has many). */
const OWN = [
  ['Clover Rise', 1, 4, 4], ['Stonefoot', 1, 13, 6], ['Rootdeep', 1, 24, 3], ['Dewpoint', 1, 26, 8], ['Long Shadow', 1, 45, 5],
  ['Barkside', 1, 57, 4], ['Sunhill', 1, 62, 7], ['Fernhollow', 1, 88, 5], ['Gardengate', 2, 10, 5], ['Creek Crossing', 3, 30, 6],
  ['Woodline', 4, 5, 3], ['Tallgrass', 5, 55, 4],
];
const HOME_CHAMBERS = { queen_chamber: 8, leaf_garden: 10, hunting_grounds: 9, nursery: 8, granary: 7, larder: 7, brood_hall: 7, pheromone_chamber: 6, aphid_pasture: 7, nectar_cellar: 6, excavation_works: 6, honeypot_gallery: 5 };
const HOME_UNITS = { worker: 2400, minor_soldier: 1800, major_soldier: 420, scout: 60, hauler: 300, acid_sprayer: 380, trap_jaw: 220, supermajor: 30, media_worker: 500, gardener_minim: 300, desert_ant: 200, bullet_ant: 12, rhino_beetle: 3, carrion_beetle: 20, assassin_bug: 10, slave_maker: 80 };
const RESEARCH = { mandibles: 6, chitin: 6, guard_formation: 4, formic_acid: 5, raiding_columns: 4, nest_plugging: 3, swarm_raiding: 3, armoured_heads: 3, acid_glands: 3, snap_reflex: 3, crushing_heads: 3, propaganda_glands: 2, foraging_instinct: 5, group_hunting: 4, aphid_husbandry: 4, fungus_farming: 4, repletes: 3, symbiosis: 4, brood_science: 5, nurse_workers: 4, deep_digging: 4, tunnel_engineering: 4, nuptial_flight: 2, supercolony: 1, pheromone_trails: 4, colony_mind: 30, scent_reading: 3, tandem_running: 3, chemical_mimicry: 3 };

async function seed() {
  const db = new pg.Client(DB);
  await db.connect();
  const me = (await db.query(`select id, password_hash from players where lower(username) = lower($1)`, [LOGIN.username])).rows[0];
  // always the same place (1:1:5), so the neighbours and camera paths fit around it
  await db.query(`update colonies set region = 1, patch = 1, spot = 5, name = 'Red Hill', base_space = 400, chambers = ${json(HOME_CHAMBERS)}, units = ${json(HOME_UNITS)},
    defenses = ${json({ soil_wall: 40, pit_trap: 60, acid_sentry: 30, narrow_tunnel: 3 })}, foliage = 900000, protein = 700000, nectar = 400000 where player_id = $1`, [me.id]);
  await db.query(`update players set research = ${json(RESEARCH)}, protected_until = 0 where id = $1`, [me.id]);
  const insColony = (player, [name, r, p, s], i, chambers, units) => db.query(
    `insert into colonies (world_id, player_id, name, region, patch, spot, terrain, base_space, last_updated, created_at, chambers, units, foliage, protein, nectar)
     values (1, $1, $2, $3, $4, $5, 'grassland', 250, ${nowMs}, 0, $6, $7, 200000, 200000, 100000) on conflict do nothing`, [player, name, r, p, s, chambers, units]);
  for (const [i, c] of OWN.entries()) await insColony(me.id, c, i, { queen_chamber: 5, leaf_garden: 7, nursery: 5, brood_hall: 5, hunting_grounds: 6, granary: 4 }, { worker: 800, minor_soldier: 600, major_soldier: 100, desert_ant: 60, scout: 10 });
  for (const [i, c] of RIVALS.entries()) {
    const id = (await db.query(`insert into players (world_id, username, password_hash, created_at, last_active) values (1, $1, $2, 0, 0) returning id`, [c[0].replace(/ /g, '_'), me.password_hash])).rows[0].id;
    await insColony(id, c, i, { queen_chamber: 2 + (i % 6), leaf_garden: 3 + (i % 7), nursery: 2 + (i % 4), brood_hall: 2 + (i % 5), hunting_grounds: 2 + (i % 5) }, { worker: 300 + i * 30, minor_soldier: 150 + i * 20 });
  }
  // the neighbour Red Hill raids for the battle: well defended, so the fight lasts a few rounds
  await db.query(`update colonies set units = ${json({ minor_soldier: 900, major_soldier: 220, acid_sprayer: 160, worker: 800 })},
    defenses = ${json({ soil_wall: 10, pit_trap: 15, acid_sentry: 6 })}, chambers = ${json({ queen_chamber: 6, leaf_garden: 7, nursery: 5, brood_hall: 5, hunting_grounds: 5, granary: 5 })}
    where name = 'Formica Rex'`);
  await db.end();
}

/** Everything the player can see and raid: all patches explored, every colony scouted. */
async function reveal() {
  const db = new pg.Client(DB);
  await db.connect();
  const me = (await db.query(`select id from players where lower(username) = lower($1)`, [LOGIN.username])).rows[0].id;
  await db.query(`insert into explored_patches select $1, r, p, ${nowMs} from generate_series(1,5) r, generate_series(1,100) p on conflict do nothing`, [me]);
  await db.query(`insert into known_colonies select $1, id, 'scout', ${nowMs}, ${nowMs}, null from colonies where player_id <> $1 on conflict do nothing`, [me]);
  await db.query(`update players set protected_until = 0`);
  await db.end();
}

/** Strength protection: make the neighbour count as a fair target (the server's points refresh can undo it). */
async function fairTarget() {
  const db = new pg.Client(DB);
  await db.connect();
  await db.query(`update players set points_total = 14000, points = '{"total":14000,"economy":8000,"military":4000,"research":2000}' where username = 'Formica_Rex'`);
  await db.end();
}

/**
 * Build the trailer world and leave its server running. Returns { stop }.
 * Columns marching at the slow end of the speed slider take several minutes, so the capture that follows sees them out.
 */
export async function prepareWorld() {
  const admin = new pg.Client(ADMIN);
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = 'hormigas_trailer'`);
  await admin.query('drop database if exists hormigas_trailer');
  await admin.query('create database hormigas_trailer');
  await admin.end();
  console.log('world: fresh database');

  let server = await startServer();
  const reg = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LOGIN) });
  if (!reg.ok) throw new Error(`register failed: ${await reg.text()}`);
  await seed();
  // restart, so wild nests spawn around every colony (the server does that on start)
  await stopServer(server);
  server = await startServer();
  await reveal();
  console.log('world: seeded');

  const api = await session();
  const state = await api.get('/api/state');
  const home = state.colonies.find((c) => c.name === 'Red Hill');
  const send = async (from, type, target, units, speedPct = 10) => {
    const r = await api.post('/api/missions', { type, colonyId: from.id, target, units, speedPct });
    if (r.error) console.warn(`  ${type} from ${from.name} to ${Object.values(target).join(':')}: ${r.error.message}`);
    return r.mission;
  };
  // the battle first, at full speed: it is fought within a minute
  let raid = null;
  for (let i = 0; i < 5 && !raid; i++) {
    await fairTarget();
    raid = await send(home, 'raid', { region: 1, patch: 1, spot: 7 }, { minor_soldier: 800, major_soldier: 300, trap_jaw: 150, supermajor: 20, acid_sprayer: 250, worker: 200 }, 100);
    if (!raid) await sleep(2000);
  }
  if (!raid) throw new Error('the battle raid could not be sent');
  // columns: raids on wild nests, foragers and haulers out from Red Hill and the other colonies, slowly
  // columns at full speed, so the ants walk briskly; the targets are far off, so they stay out for minutes
  const far = { speedPct: 100 };
  await send(home, 'forage', { region: 1, patch: 44, spot: 13 }, { desert_ant: 120, media_worker: 150 }, far.speedPct);
  await send(home, 'forage', { region: 1, patch: 90, spot: 13 }, { worker: 400, hauler: 60 }, far.speedPct);
  await send(home, 'forage', { region: 1, patch: 9, spot: 13 }, { worker: 300, media_worker: 100 }, far.speedPct);
  await send(home, 'scout', { region: 1, patch: 71, spot: 7 }, { scout: 8 }, far.speedPct);
  await send(home, 'transport', { region: 1, patch: 88, spot: 5 }, { hauler: 80, worker: 200 }, far.speedPct);
  await send(home, 'transport', { region: 1, patch: 62, spot: 7 }, { worker: 250, minor_soldier: 200 }, far.speedPct);
  for (const c of state.colonies.filter((c) => c.id !== home.id)) {
    const p = c.coords.patch > 50 ? c.coords.patch - 22 : c.coords.patch + 22;
    await send(c, 'forage', { region: c.coords.region, patch: p, spot: 13 }, { worker: 300, desert_ant: 40 }, far.speedPct);
    await send(c, 'transport', { ...home.coords }, { worker: 200 }, far.speedPct);
  }
  // wait for the battle's report
  for (let i = 0; i < 180; i++) {
    const r = await api.get('/api/reports');
    const b = r.reports?.find((x) => x.type === 'battle' && x.data?.rounds?.length);
    if (b) {
      console.log(`world: battle fought, ${b.title}, ${b.data.rounds.length} rounds`);
      break;
    }
    await sleep(1000);
  }
  return { api, home, send, stop: () => stopServer(server) };
}
