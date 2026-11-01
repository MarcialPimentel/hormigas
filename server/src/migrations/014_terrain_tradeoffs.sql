-- Every ground has one strength and one weakness (docs/04-colony.md § Terrain, 1 Nov 2026).
-- Sandy Soil's space went from 140–170 to 160–200. Space is rolled once when a colony is founded,
-- so existing player colonies on Sandy Soil move up by the same 20: it only ever raises space,
-- so no chamber ends up over the limit. Wild nests don't use space and are left alone.
UPDATE colonies
   SET base_space = base_space + 20
 WHERE terrain = 'sandy_soil'
   AND npc IS NULL;
