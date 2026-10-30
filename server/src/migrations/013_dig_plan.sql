-- The dig plan (docs/04-colony.md): chambers lined up behind the dig in progress, paid for when each starts.
-- A new nullable column, so it's safe on live data: every colony starts with an empty plan.
ALTER TABLE colonies ADD COLUMN IF NOT EXISTS dig_plan jsonb;

-- Tell every player what arrived.
INSERT INTO reports (world_id, player_id, type, title, data, created_at)
SELECT p.world_id, p.id, 'milestone', 'Your diggers can plan ahead',
       jsonb_build_object(
         'id', 'dig_plan',
         'text', 'Once a colony''s Queen''s Chamber reaches level 4, you can plan its next dig while one is under way. The planned chamber costs nothing until it starts: the diggers begin it the moment the current dig ends and the stores can pay for it, even while you sleep. Pick a chamber while your diggers are busy and choose Plan next.'
       ),
       (extract(epoch FROM now()) * 1000)::bigint
  FROM players p
 WHERE NOT p.is_npc;
