-- One-time (docs/20-swarms.md): the first army-ant swarms after Build 5 were scheduled 72–120 h out.
-- Bring every pending sighting forward to a random moment 2–24 h from now, so players meet a swarm
-- within about a day (each still lands 4 h after it's spotted). Sightings already due sooner are left alone.
-- The usual checks still run when a sighting fires: no swarm during new-colony protection or for inactive players.
-- Data only; on a fresh database (tests, a new world) there are no sightings yet and this does nothing.
UPDATE events
   SET due_at = LEAST(due_at, (extract(epoch FROM now()) * 1000)::bigint + 7200000 + floor(random() * 79200000)::bigint)
 WHERE type = 'swarm_spotted' AND NOT done;
