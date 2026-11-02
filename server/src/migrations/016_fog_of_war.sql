-- Fog of war (docs/22-discovery.md#fog-of-war): the patches each player has explored, and when they last saw each.
-- New table only; no existing row changes.
CREATE TABLE IF NOT EXISTS explored_patches (
  player_id  int NOT NULL REFERENCES players(id),
  region     int NOT NULL,
  patch      int NOT NULL,
  -- the last time this patch was in sight: colonies founded after it stay hidden until the player looks again
  seen_at    bigint NOT NULL,
  PRIMARY KEY (player_id, region, patch)
);

-- Launch on the live world: everyone keeps what they had already seen, as it is today. That is every patch their
-- ants have been to, and every patch holding a colony they had scouted. (Patches round their own colonies are
-- always in sight and need no row.)
INSERT INTO explored_patches (player_id, region, patch, seen_at)
SELECT player_id, target_region, target_patch, (extract(epoch FROM now()) * 1000)::bigint
  FROM missions
 WHERE status <> 'outbound' AND NOT coalesce((result->>'recalled')::boolean, false)
 GROUP BY player_id, target_region, target_patch
ON CONFLICT DO NOTHING;

INSERT INTO explored_patches (player_id, region, patch, seen_at)
SELECT k.player_id, c.region, c.patch, (extract(epoch FROM now()) * 1000)::bigint
  FROM known_colonies k JOIN colonies c ON c.id = k.colony_id
 WHERE k.discovered_at IS NOT NULL
 GROUP BY k.player_id, c.region, c.patch
ON CONFLICT DO NOTHING;
