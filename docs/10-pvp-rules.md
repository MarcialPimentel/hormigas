# 10 — PvP Rules

**Version:** 0.1

## Stance
PvP is **open early**. The rules below exist so that open PvP doesn't turn new players into permanent food. One world + open PvP is the highest-churn combination, so these rules are MVP scope, not polish.

## Scout first
You can't raid (or send to) a colony you haven't scouted: until then it's a scent ([22-discovery](22-discovery.md)). Being scouted or raided shows you who it was, but you still scout before striking back.

## New colony protection
- A brand-new account is protected for **72 hours** or until it sends its first Raid, whichever comes first.
- Protected colonies can still be scouted (they learn the game's threats safely).

## Wild nests
Wild nests (NPC colonies, see [17-wild-nests](17-wild-nests.md)) have no new-colony or strength protection, but the bash limit applies. Raiding a nest does **not** end your own new-colony protection. Nests raid back gently, never at protected or inactive players, at most once per player per 24 h.

## Army-ant swarms
Swarms from the wilds ([20-swarms](20-swarms.md)) never come during new-colony protection or at inactive players, and don't count toward anyone's bash limit. They take only unprotected food.

## Strength protection
- You can't raid a colony whose owner has **less than 20%** of your points.
- Exception: **inactive** players (no login for 7+ days) can be raided regardless — they're the world's PvE farmland. They're marked on the map.
- A strong player can be raided by anyone weaker (no reverse protection).

## Truces and supercolonies
See [23-supercolonies](23-supercolonies.md). Raids are refused between players with a truce, between members of the same supercolony, and while a truce's 24 h notice or a leaver's 3-day scent fade is running. A raid already on its way when such a pact starts turns back on arrival without a fight. Scouting is never blocked.

## Bash limit
- Max **4 successful raids per 24 h** against the same colony from the same attacker.
- Raids still on their way to that colony count toward the 4, so sending several at once can't get around the limit. A recalled raid stops counting.
- During declared wars (v1 supercolonies), the limit is lifted between participants.

## Protected storage
The Honeypot Gallery (see [03-economy](03-economy.md#protected-storage--the-honeypot-gallery)) protects a baseline of each resource. Raids can never wipe a colony out.

## Catch-up for late joiners
- **Late Founding Boost:** players below the world's median points get build & research time × **0.5–1.0**, scaling smoothly with how far below the median they are.
- Boost turns off when they reach the median.
- Rationale: one persistent world means new players join months behind. Catching up to "competitive" must take weeks, not years.

## Vacation mode
- Freezes a colony: no production, no raids in or out, timers paused.
- Min 48 h; can't be entered with missions in flight.

## Open Questions
- Are 72 h protection and 20% strength protection right? Tune after first playtest.
- Should raided players get a short (e.g., 1 h) post-raid shield?
- Do inactive players get deleted after N weeks, or stay as farms?
