-- Build 10, "Castes with a purpose" (docs/05-castes-units.md, docs/06-defense.md, docs/08-combat.md).
-- Safe on the live world: one new column with a default, and one report per player. No existing data changes.

-- The fall-back order a raider picked (0 = fight to the end).
ALTER TABLE missions ADD COLUMN IF NOT EXISTS retreat_pct int NOT NULL DEFAULT 0;

-- Tell every player that combat changed: the new castes, the new defense, and that existing armies
-- fight differently from now on (decided by Marz, 2026-10-29: announce, no refunds).
INSERT INTO reports (world_id, player_id, type, title, data, created_at)
SELECT p.world_id, p.id, 'milestone', 'New castes: every soldier now has a counter',
       jsonb_build_object(
         'id', 'build10',
         'text', 'Combat has changed. Minor Soldiers overwhelm Major Soldiers by numbers, Major Soldiers crush the new Acid Sprayers, and Acid Sprayers mow down Minor Soldiers. The new Trap-jaw Ant breaks defenses but is fragile against ants. Pit Traps now catch small ants, the Soil Wall shields your other defenses, and a new Narrow Tunnel squeezes raiders in the first round. Raids can fall back after heavy losses. Your army is unchanged, but check the Brood Hall to see what each caste is strong and weak against.'
       ),
       (extract(epoch FROM now()) * 1000)::bigint
  FROM players p
 WHERE NOT p.is_npc;
