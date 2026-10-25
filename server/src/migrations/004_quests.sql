-- Onboarding quests claimed by each player.
ALTER TABLE players ADD COLUMN quests_claimed jsonb NOT NULL DEFAULT '[]';
CREATE INDEX players_points ON players (world_id, points_total DESC);
