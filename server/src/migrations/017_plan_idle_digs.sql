-- Build 15 (docs/04-colony.md): digs you can't afford yet can be planned while the diggers are idle.
-- No schema change (the dig plan already lives in colonies.dig_plan); this only tells every player what arrived.
INSERT INTO reports (world_id, player_id, type, title, data, created_at)
SELECT p.world_id, p.id, 'milestone', 'Plan digs you can''t afford yet',
       jsonb_build_object(
         'id', 'dig_plan_idle',
         'text', 'When your diggers are idle and the stores can''t pay for a chamber, choose Plan next to Dig. The dig waits in line and starts on its own the moment the stores can pay, even while you sleep, and it is only paid for then. You can line up two this way. Needs Queen''s Chamber 4.'
       ),
       (extract(epoch FROM now()) * 1000)::bigint
  FROM players p
 WHERE NOT p.is_npc;
