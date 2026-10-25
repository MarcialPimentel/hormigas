-- Battlefield corpses (Protein anyone can haul) and raid history (bash limit).
CREATE TABLE corpse_fields (
  world_id    int NOT NULL REFERENCES worlds(id),
  region      int NOT NULL,
  patch       int NOT NULL,
  spot        int NOT NULL,
  protein     double precision NOT NULL,
  created_at  bigint NOT NULL,
  PRIMARY KEY (world_id, region, patch, spot)
);

CREATE TABLE raid_log (
  id           bigserial PRIMARY KEY,
  world_id     int NOT NULL REFERENCES worlds(id),
  attacker_id  int NOT NULL REFERENCES players(id),
  colony_id    int NOT NULL REFERENCES colonies(id),
  winner       text NOT NULL,
  at           bigint NOT NULL
);
CREATE INDEX raid_log_lookup ON raid_log (attacker_id, colony_id, at);
