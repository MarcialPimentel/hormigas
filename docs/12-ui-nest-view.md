# 12 — UI & Nest View

**Version:** 0.1

## Principles
- **Mobile-browser first.** Every screen works one-handed on a phone. Desktop gets more columns, not more features.
- **Show the "why."** Any blocked action explains why (not enough Nectar, workforce short, slot in use).
- **Few clicks.** Common actions (send army away until X, repeat last forage) are one or two taps.

## Screens (MVP)
| Screen | Purpose |
|---|---|
| **Overview** | Colony summary: resources, workforce, active timers, incoming/outgoing missions |
| **Nest View** | Schematic nest (below); tap a chamber to open it |
| **Chambers** | List view of all chambers, costs, upgrade buttons |
| **Brood Hall** | Raise castes and defenses |
| **Research** | Instinct tree |
| **Map** | Region/patch browser |
| **Missions** | Send missions; "return at" picker; preview battles |
| **Reports** | Battle, scout, forage reports |
| **Rankings** | Leaderboards |

A persistent **resource bar** (Foliage, Protein, Nectar, Workforce) sits at the top of every screen.

## Nest View (simple, schematic)
- Side cross-section of soil.
- **Chambers** = rounded shapes; size grows with level; locked chambers appear as faint outlines (shows what's coming).
- **Tunnels** = lines connecting chambers to the entrance.
- **Ants** = small dots moving along tunnels:
  - Workers traveling between gardens and storage
  - Soldiers clustered near the entrance
  - Dots leaving/arriving when missions depart/return
- Under-construction chambers show a digging animation (dots + progress ring).
- Tap a chamber → its upgrade panel.
- No art assets in v0.1 — colors and shapes only (PixiJS). Real art can replace it later without changing behavior.

## Notifications
- **Browser notifications** (opt-in, prompted after the tutorial, not on first load):
  - Raid incoming (highest priority)
  - Mission returned
  - Construction / research complete
  - Storage full
- **Tab title badges:** `(1) Raid incoming! – Hormigas`.
- In-game notification list on the Overview.

## Open Questions
- Dark mode by default (soil theme) or light?
- Should the Nest View be the home screen, or the Overview?
