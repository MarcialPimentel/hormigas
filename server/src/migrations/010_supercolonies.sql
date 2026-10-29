-- Truces and supercolonies (docs/23-supercolonies.md).
-- Additive only: new tables and one new index. No existing row is changed. Safe to run twice.
-- Hold Position needs no new column: a mission that is holding at an ally's colony has status 'holding'.

-- A no-raid pact between two players. player_a < player_b, so a pair has one row however it was proposed.
CREATE TABLE IF NOT EXISTS truces (
  id            bigserial PRIMARY KEY,
  world_id      int NOT NULL REFERENCES worlds(id),
  player_a      int NOT NULL REFERENCES players(id),
  player_b      int NOT NULL REFERENCES players(id),
  proposed_by   int NOT NULL REFERENCES players(id),
  status        text NOT NULL, -- proposed | active | ending | ended | declined | withdrawn
  created_at    bigint NOT NULL,
  accepted_at   bigint,
  ends_at       bigint,        -- set when notice is given: raids stay off until then
  closed_at     bigint,
  CHECK (player_a < player_b)
);
-- At most one open truce (or proposal) per pair.
CREATE UNIQUE INDEX IF NOT EXISTS truces_open_pair ON truces (player_a, player_b) WHERE status IN ('proposed', 'active', 'ending');
CREATE INDEX IF NOT EXISTS truces_b ON truces (player_b);

CREATE TABLE IF NOT EXISTS supercolonies (
  id            bigserial PRIMARY KEY,
  world_id      int NOT NULL REFERENCES worlds(id),
  name          text NOT NULL,
  founder_id    int NOT NULL REFERENCES players(id), -- the current founder (passes on if they leave)
  created_at    bigint NOT NULL,
  dissolved_at  bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS supercolonies_name ON supercolonies (world_id, lower(name)) WHERE dissolved_at IS NULL;

-- One row per time a player joined. 'fading' = left, but the shared scent still blocks raids until fade_until.
CREATE TABLE IF NOT EXISTS supercolony_members (
  id              bigserial PRIMARY KEY,
  supercolony_id  bigint NOT NULL REFERENCES supercolonies(id),
  player_id       int NOT NULL REFERENCES players(id),
  status          text NOT NULL, -- member | fading | gone
  joined_at       bigint NOT NULL,
  fade_until      bigint,
  left_at         bigint
);
-- A player belongs to (or is fading from) at most one supercolony at a time.
CREATE UNIQUE INDEX IF NOT EXISTS supercolony_members_one ON supercolony_members (player_id) WHERE status IN ('member', 'fading');
CREATE INDEX IF NOT EXISTS supercolony_members_sc ON supercolony_members (supercolony_id);

CREATE TABLE IF NOT EXISTS supercolony_invites (
  supercolony_id  bigint NOT NULL REFERENCES supercolonies(id),
  player_id       int NOT NULL REFERENCES players(id),
  invited_by      int NOT NULL REFERENCES players(id),
  created_at      bigint NOT NULL,
  PRIMARY KEY (supercolony_id, player_id)
);
CREATE INDEX IF NOT EXISTS supercolony_invites_player ON supercolony_invites (player_id);

-- Soldiers holding position at an ally's colony join its battles.
CREATE INDEX IF NOT EXISTS missions_target_holding ON missions (target_colony_id) WHERE status = 'holding';
