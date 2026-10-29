# 01 — Core Loop

**Version:** 0.1

Hormigas has nested loops. Early in a colony's life the short loops dominate; later the long loops do (see [02-progression](02-progression.md)).

## Minute loop (inside a session)
1. Check resources and what finished while you were away.
2. Spend: queue a chamber upgrade, raise castes, start research.
3. Send missions: forage, scout, raid, haul corpses.
4. Protect: make sure nothing valuable is left exposed before leaving.

## Session loop (one check-in, 2–10 minutes)
```
Return → collect results (reports, finished builds, returned foragers)
       → decide (what to grow next, who to raid, what's threatening me)
       → commit (queue builds/research, dispatch missions)
       → secure (spend or protect resources, send army out on a long mission)
       → leave (with a reason to come back: a timer finishing, a raid landing)
```
**Design rule:** every session should end with at least one timer the player cares about. That timer is the reason to return.

## Day loop
- Production accumulates while offline (uncapped time, capped by storage).
- Several check-ins per day. Notifications for: build/research complete, mission returned, **raid incoming**.
- Storage caps are the natural "come back and spend" nudge — full storage means wasted production.

## Week loop
- Bigger goals: a new chamber tier, a new caste, founding a second colony (nuptial flight), climbing the rankings.
- Social layer: truces, supercolonies and holding position at an ally's nest ([23-supercolonies](23-supercolonies.md)); coordinated raids next.

## Loss and recovery loop
Being raided is part of the loop, not the end of it:
1. Raid lands → report shows what was lost.
2. Protected storage (Honeypot Gallery) keeps a baseline safe.
3. Corpses from the battle become a debris field anyone can haul — including the defender.
4. Defenses partially rebuild for free.
5. The player learns (scout more, protect better, send the army away) and returns stronger.

## What the player does while waiting (anti-dead-air)
As build timers get longer, the game must still offer meaningful actions per session:
- **Foraging expeditions** — random outcomes, independent of the build queue.
- **Scouting and raiding** — PvP and inactive colonies.
- **Corpse hauling** — race other players to battle debris.
- **Aphid herding** (v1) — tend and defend a second economy.

## Open Questions
- Should there be a daily objective / quest list to anchor the day loop?
- How many simultaneous missions at the start (mission slots)? Proposal: 2.
