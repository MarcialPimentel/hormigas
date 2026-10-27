-- Wild nests (docs/17-wild-nests.md): NPC colonies owned by one hidden player per world.
-- Additive only: safe on the live world. Nests are spawned by the server at startup, not here.
ALTER TABLE players ADD COLUMN is_npc boolean NOT NULL DEFAULT false;
-- Nest state for NPC colonies (species, level, when its values were last saved); NULL for player colonies.
ALTER TABLE colonies ADD COLUMN npc jsonb;
