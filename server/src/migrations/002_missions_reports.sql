CREATE TABLE missions (
  id                bigserial PRIMARY KEY,
  world_id          int NOT NULL REFERENCES worlds(id),
  player_id         int NOT NULL REFERENCES players(id),
  type              text NOT NULL,
  origin_colony_id  int NOT NULL REFERENCES colonies(id),
  origin_region     int NOT NULL,
  origin_patch      int NOT NULL,
  origin_spot       int NOT NULL,
  target_region     int NOT NULL,
  target_patch      int NOT NULL,
  target_spot       int NOT NULL,
  target_colony_id  int REFERENCES colonies(id),
  units             jsonb NOT NULL,
  cargo             jsonb NOT NULL DEFAULT '{"foliage":0,"protein":0,"nectar":0}',
  speed_pct         int NOT NULL,
  fuel              int NOT NULL,
  depart_at         bigint NOT NULL,
  arrive_at         bigint NOT NULL,
  return_at         bigint,
  status            text NOT NULL, -- outbound | returning | done
  arrive_event_id   bigint,
  return_event_id   bigint,
  result            jsonb,
  created_at        bigint NOT NULL
);
CREATE INDEX missions_player_active ON missions (player_id) WHERE status <> 'done';
CREATE INDEX missions_target_active ON missions (target_colony_id) WHERE status = 'outbound';

CREATE TABLE reports (
  id          bigserial PRIMARY KEY,
  world_id    int NOT NULL REFERENCES worlds(id),
  player_id   int NOT NULL REFERENCES players(id),
  type        text NOT NULL,
  title       text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  bigint NOT NULL,
  read        boolean NOT NULL DEFAULT false
);
CREATE INDEX reports_player ON reports (player_id, created_at DESC);
