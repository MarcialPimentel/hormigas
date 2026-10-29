-- Discovery (docs/22-discovery.md): which colonies each player knows.
-- No row = a scent. discovered_at set = known (scouted). smelled_at set = familiar (it scouted or raided you).
-- Additive only: a new table, filled from mission history. Nothing existing is changed. Safe to run twice.
CREATE TABLE IF NOT EXISTS known_colonies (
  player_id      int NOT NULL REFERENCES players(id),
  colony_id      int NOT NULL REFERENCES colonies(id),
  via            text NOT NULL,
  first_at       bigint NOT NULL,
  discovered_at  bigint,
  smelled_at     bigint,
  PRIMARY KEY (player_id, colony_id)
);
CREATE INDEX IF NOT EXISTS known_colonies_colony ON known_colonies (colony_id);

-- Colonies you have already scouted or raided stay known (Marz, 29 Oct 2026).
-- Surveys of the wilds have no target colony, and your own colonies never need a row.
INSERT INTO known_colonies (player_id, colony_id, via, first_at, discovered_at)
SELECT m.player_id, m.target_colony_id, 'earlier', min(m.depart_at), min(m.depart_at)
  FROM missions m
  JOIN colonies c ON c.id = m.target_colony_id
  JOIN players p ON p.id = m.player_id
 WHERE m.type IN ('scout', 'raid') AND c.player_id <> m.player_id AND NOT p.is_npc
 GROUP BY m.player_id, m.target_colony_id
ON CONFLICT (player_id, colony_id) DO NOTHING;

-- Colonies that scouted or raided you become familiar: you know their name, but scout them before raiding back.
-- One row per (player, colony that came at them), including raids still on their way. Wild-nest raids count; army-ant swarms have no home to remember.
INSERT INTO known_colonies (player_id, colony_id, via, first_at, smelled_at)
SELECT t.player_id, m.origin_colony_id,
       CASE WHEN bool_or(m.type = 'raid') THEN 'raided_you' ELSE 'scouted_you' END,
       min(m.depart_at), LEAST(max(m.arrive_at), (extract(epoch FROM now()) * 1000)::bigint)
  FROM missions m
  JOIN colonies t ON t.id = m.target_colony_id
  JOIN colonies o ON o.id = m.origin_colony_id
  JOIN players tp ON tp.id = t.player_id
 WHERE m.type IN ('scout', 'raid') AND o.player_id <> t.player_id AND NOT tp.is_npc
 GROUP BY t.player_id, m.origin_colony_id
ON CONFLICT (player_id, colony_id) DO UPDATE SET smelled_at = EXCLUDED.smelled_at;
