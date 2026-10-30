-- Build 11, "The full roster" (docs/05-castes-units.md). Data only: new castes and research live in docs/data,
-- and units and research are stored as jsonb, so no column changes. Tell every player what arrived.
INSERT INTO reports (world_id, player_id, type, title, data, created_at)
SELECT p.world_id, p.id, 'milestone', 'New castes and allies join the colony',
       jsonb_build_object(
         'id', 'build11',
         'text', 'Bigger ants and other insects can now join your colony. Supermajors and Rhinoceros Beetles are huge and trample through ranks of mid-sized ants; Bullet Ants and Assassin Bugs hunt the giants; and a swarm of Minor Soldiers can still pull any of them down. Desert Ants make forage parties luckier, Gardener Minims enrich your Leaf Gardens, and Slave-makers carry the dead home after a won raid. Allies come with the Symbiosis research, and each fighting caste has its own instinct research to sharpen it. Check the Brood Hall and the Research tree to see what each one needs.'
       ),
       (extract(epoch FROM now()) * 1000)::bigint
  FROM players p
 WHERE NOT p.is_npc;
