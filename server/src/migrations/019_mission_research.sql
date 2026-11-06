-- Build 20 (docs/07-research.md): research for the missions players already run.
-- Necrophoresis: a corpse field starts to rot this many hours later. Existing fields keep the old 24 h (0 extra).
ALTER TABLE corpse_fields ADD COLUMN IF NOT EXISTS rot_delay_hours real NOT NULL DEFAULT 0;

INSERT INTO reports (world_id, player_id, type, title, data, created_at)
SELECT p.world_id, p.id, 'milestone', 'New research for your missions',
       jsonb_build_object(
         'id', 'mission_research',
         'text', 'Five new research and one upgrade make the missions you already run better. Rescue (Jaws) brings some of your fallen raiders home. Social Stomach (Scent) burns less Nectar on every trip. Recruitment Trails (Harvest) brings windfall loads home sooner. Necrophoresis (Nest) keeps corpse fields fresh longer. Trophallaxis (Harvest) keeps trade trails open longer. And Aphid Husbandry now also boosts the honeydew your herds bring home.'
       ),
       (extract(epoch FROM now()) * 1000)::bigint
  FROM players p
 WHERE NOT p.is_npc;
