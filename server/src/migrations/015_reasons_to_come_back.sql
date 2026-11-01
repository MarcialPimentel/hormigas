-- Build 12: Reasons to come back (docs/26-come-back.md). Only adds tables and columns; safe on the live world.

-- Lifetime counters per player (forage trips home, digs finished, fights won, ...). Colony needs and the
-- Field Journal both read them. Keys are listed in shared/src/stats.ts.
CREATE TABLE IF NOT EXISTS player_stats (
  player_id int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key       text NOT NULL,
  value     double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, key)
);

-- The day's colony needs. A need counts from `base` (the counter when it was given) up to `base + target`.
CREATE TABLE IF NOT EXISTS player_needs (
  player_id  int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day        int NOT NULL,
  slot       int NOT NULL,
  need_id    text NOT NULL,
  base       double precision NOT NULL,
  target     double precision NOT NULL,
  claimed_at bigint,
  PRIMARY KEY (player_id, day, slot)
);

-- The counters as they stood at the player's first visit of each day: "Yesterday in the colony" is the difference.
CREATE TABLE IF NOT EXISTS player_days (
  player_id int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day       int NOT NULL,
  stats     jsonb NOT NULL,
  PRIMARY KEY (player_id, day)
);

-- Field Journal: the highest stage reached in each entry (1 sketch, 2 full entry, 3 coloured plate).
CREATE TABLE IF NOT EXISTS player_journal (
  player_id int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  entry_id  text NOT NULL,
  tier      int NOT NULL,
  at        bigint NOT NULL,
  PRIMARY KEY (player_id, entry_id)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS reroll_day int;
ALTER TABLE players ADD COLUMN IF NOT EXISTS journal_seen_at bigint NOT NULL DEFAULT 0;

-- Ants raised in each colony, counted as they hatch (shared/src/colony.ts). Hatching is computed, not an event,
-- so the colony keeps its own tally. Existing colonies start from the ants they have now.
ALTER TABLE colonies ADD COLUMN IF NOT EXISTS raised jsonb NOT NULL DEFAULT '{}';
UPDATE colonies SET raised = units WHERE npc IS NULL;

-- ---------- Backfill the counters from what already happened, so nobody's journal starts empty ----------
-- Only from records that are exact (reports, raid log, colonies, research); the rest start at 0.

INSERT INTO player_stats (player_id, key, value)
SELECT p.id, 'digs', COALESCE((SELECT sum(v::text::numeric) FROM colonies c, jsonb_each(c.chambers) AS e(k, v) WHERE c.player_id = p.id), 0)
  FROM players p WHERE NOT p.is_npc
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT p.id, 'research', COALESCE((SELECT sum(v::text::numeric) FROM jsonb_each(p.research) AS e(k, v)), 0)
  FROM players p WHERE NOT p.is_npc
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'forage_home', count(*) FROM reports WHERE type = 'forage' AND data ? 'outcome' GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'forage:' || (data->>'outcome'), count(*) FROM reports WHERE type = 'forage' AND data ? 'outcome' GROUP BY player_id, data->>'outcome'
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'corpses_hauled', sum((data->>'collected')::numeric) FROM reports WHERE type = 'haul' AND data ? 'collected' GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'scouted', count(*) FROM reports WHERE type = 'scout' GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'herds_claimed', count(*) FROM reports WHERE type = 'herd' AND (data->>'claimed')::boolean IS TRUE GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'windfalls_claimed', count(*) FROM reports WHERE type = 'windfall' AND data->>'event' = 'windfall_held' AND (data->>'claimed')::boolean IS TRUE GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'windfall:' || (CASE data->>'windfall' WHEN 'Dead grasshopper' THEN 'grasshopper' WHEN 'Fallen fig' THEN 'fig' WHEN 'Leafy branch' THEN 'branch' WHEN 'Dead lizard' THEN 'lizard' END), count(*)
  FROM reports WHERE type = 'windfall' AND data->>'event' = 'windfall_held' AND (data->>'claimed')::boolean IS TRUE
   AND data->>'windfall' IN ('Dead grasshopper', 'Fallen fig', 'Leafy branch', 'Dead lizard')
 GROUP BY 1, 2
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'colonies_founded', count(*) FROM reports WHERE type = 'colonize' AND (data->>'founded')::boolean IS NOT FALSE AND title LIKE 'New colony founded%' GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'truces', count(*) FROM reports WHERE type = 'diplomacy' AND data->>'event' = 'truce_active' GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'supercolonies', count(*) FROM reports WHERE type = 'diplomacy' AND data->>'event' IN ('founded', 'joined') AND data->>'with' IS NULL GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'gifts', count(*) FROM reports WHERE type = 'nest_event' AND data ? 'found' AND data->'found' <> 'null'::jsonb GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'swarms_beaten', count(*) FROM reports
 WHERE type = 'battle' AND data->>'perspective' = 'defender' AND data->>'winner' = 'defender' AND data->'attacker'->>'name' = 'Army ant swarm'
 GROUP BY player_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT player_id, 'raids_held', count(*) FROM reports
 WHERE type = 'battle' AND data->>'perspective' = 'defender' AND data->>'winner' = 'defender' AND data->'attacker'->>'name' <> 'Army ant swarm'
 GROUP BY player_id
ON CONFLICT DO NOTHING;

-- Fights won in the wilds: wild nests, termite mounds, spider dens and windfalls (raid log + the target's npc state)
INSERT INTO player_stats (player_id, key, value)
SELECT r.attacker_id, 'wild_won', count(*) FROM raid_log r JOIN colonies c ON c.id = r.colony_id JOIN players p ON p.id = r.attacker_id
 WHERE r.winner = 'attacker' AND NOT p.is_npc AND (c.npc ? 'species' OR c.npc->>'kind' = 'windfall')
 GROUP BY r.attacker_id
ON CONFLICT DO NOTHING;

INSERT INTO player_stats (player_id, key, value)
SELECT r.attacker_id, 'beat:' || (c.npc->>'species'), count(*) FROM raid_log r JOIN colonies c ON c.id = r.colony_id JOIN players p ON p.id = r.attacker_id
 WHERE r.winner = 'attacker' AND NOT p.is_npc AND c.npc ? 'species'
 GROUP BY r.attacker_id, c.npc->>'species'
ON CONFLICT DO NOTHING;
