-- Build 19: joint raids and the members' board (docs/23-supercolonies.md § Joint raids).
-- New tables and one nullable column only: nothing existing is changed or rewritten.

-- A supercolony's joint raid on a wild target. Members' armies are ordinary raid missions with joint_raid_id set;
-- they all land at land_at, when one 'joint_raid_land' event fights the battle for everyone.
CREATE TABLE IF NOT EXISTS joint_raids (
  id               bigserial PRIMARY KEY,
  world_id         int NOT NULL,
  supercolony_id   bigint NOT NULL REFERENCES supercolonies(id),
  leader_id        int NOT NULL REFERENCES players(id),
  target_colony_id bigint NOT NULL,
  target_region    int NOT NULL,
  target_patch     int NOT NULL,
  target_spot      int NOT NULL,
  land_at          bigint NOT NULL,
  -- the fall-back order the opener picked; it holds for the whole joint army
  retreat_pct      int NOT NULL DEFAULT 0,
  -- open → fought | called_off | cancelled
  status           text NOT NULL DEFAULT 'open',
  event_id         bigint,
  result           jsonb,
  created_at       bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS joint_raids_open ON joint_raids (supercolony_id, status);

ALTER TABLE missions ADD COLUMN IF NOT EXISTS joint_raid_id bigint;
CREATE INDEX IF NOT EXISTS missions_joint_raid ON missions (joint_raid_id) WHERE joint_raid_id IS NOT NULL;

-- The members' board: short posts from members, and notes the game writes when a joint raid opens or lands.
CREATE TABLE IF NOT EXISTS board_posts (
  id              bigserial PRIMARY KEY,
  world_id        int NOT NULL,
  supercolony_id  bigint NOT NULL REFERENCES supercolonies(id),
  -- null for the game's own notes
  player_id       int REFERENCES players(id),
  kind            text NOT NULL DEFAULT 'post',
  text            text NOT NULL,
  data            jsonb,
  created_at      bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS board_posts_by_supercolony ON board_posts (supercolony_id, id DESC);
