-- Core tables. All timestamps are epoch milliseconds (bigint).

CREATE TABLE worlds (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  speed       real NOT NULL DEFAULT 1,
  created_at  bigint NOT NULL
);

CREATE TABLE players (
  id               serial PRIMARY KEY,
  world_id         int NOT NULL REFERENCES worlds(id),
  username         text NOT NULL,
  password_hash    text NOT NULL,
  created_at       bigint NOT NULL,
  last_active      bigint NOT NULL,
  protected_until  bigint NOT NULL DEFAULT 0,
  research         jsonb NOT NULL DEFAULT '{}',
  research_job     jsonb,
  points           jsonb NOT NULL DEFAULT '{"total":0,"economy":0,"research":0,"military":0}',
  points_total     int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX players_world_username ON players (world_id, lower(username));

CREATE TABLE sessions (
  token       text PRIMARY KEY,
  player_id   int NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL
);

CREATE TABLE colonies (
  id            serial PRIMARY KEY,
  world_id      int NOT NULL REFERENCES worlds(id),
  player_id     int NOT NULL REFERENCES players(id),
  name          text NOT NULL,
  region        int NOT NULL,
  patch         int NOT NULL,
  spot          int NOT NULL,
  terrain       text NOT NULL,
  base_space    int NOT NULL,
  foliage       double precision NOT NULL DEFAULT 0,
  protein       double precision NOT NULL DEFAULT 0,
  nectar        double precision NOT NULL DEFAULT 0,
  last_updated  bigint NOT NULL,
  chambers      jsonb NOT NULL DEFAULT '{}',
  units         jsonb NOT NULL DEFAULT '{}',
  defenses      jsonb NOT NULL DEFAULT '{}',
  build_job     jsonb,
  unit_queue    jsonb NOT NULL DEFAULT '[]',
  created_at    bigint NOT NULL
);
CREATE UNIQUE INDEX colonies_coords ON colonies (world_id, region, patch, spot);
CREATE INDEX colonies_player ON colonies (player_id);

-- Everything with a duration is a scheduled event, resolved in due_at order.
CREATE TABLE events (
  id        bigserial PRIMARY KEY,
  world_id  int NOT NULL REFERENCES worlds(id),
  type      text NOT NULL,
  due_at    bigint NOT NULL,
  payload   jsonb NOT NULL DEFAULT '{}',
  done      boolean NOT NULL DEFAULT false
);
CREATE INDEX events_due ON events (due_at, id) WHERE NOT done;
