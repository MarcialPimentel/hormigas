-- In-game feedback from players, who may read it, and a lookup index for the first-forage rule.
-- Additive only: safe on the live world.
ALTER TABLE players ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE feedback (
  id          serial PRIMARY KEY,
  world_id    int NOT NULL REFERENCES worlds(id),
  player_id   int NOT NULL REFERENCES players(id),
  kind        text NOT NULL,
  message     text NOT NULL,
  -- where the player was: screen, colony, browser, screen size
  context     jsonb NOT NULL DEFAULT '{}',
  created_at  bigint NOT NULL,
  handled     boolean NOT NULL DEFAULT false
);
CREATE INDEX feedback_recent ON feedback (world_id, created_at DESC);
CREATE INDEX feedback_player ON feedback (player_id, created_at);

-- "Has this player foraged before?" is asked on every state load (first forage is guaranteed).
CREATE INDEX missions_player_type ON missions (player_id, type);
