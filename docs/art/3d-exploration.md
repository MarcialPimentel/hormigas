# 3D exploration: the colony as a block of earth

**Status:** approved on 2026-10-28, with these answers:
1. Build it (the test slice); phones aren't a priority for 3D.
2. Gentle orbit, no zoom and no inside views.
3. The 2D nest stays for phones (and as the fallback).
4. Yes to the light "field-guide paper" theme for menus.
5. No 3D models for now: use the existing 2D art inside the 3D block ("2D in 3D"); replace later.

Built in `client/src/components/nest3d/`; see [12-ui-nest-view.md](../12-ui-nest-view.md), "The 3D slab".
**Mock-up:** [3d-nest-mockup.html](3d-nest-mockup.html) (open in a browser; published as "Hormigas in 3D"). The source with icon placeholders is `3d-nest-mockup.src.html`; icons are in `icons/`.

## The short version

| | Call |
|---|---|
| World | The nest as a slab of soil cut open at the front, like an ant farm on a museum plinth. The front stays a readable cross-section; a gentle orbit (about ±50°) shows it's solid. |
| Palette | Keep the soil, amber ants and food colours. Add a sky that follows the player's clock, glowing chambers at night, and a light "field-guide paper" menu theme. |
| Interaction | Same verbs, more physical: parties walk out across the surface, raids march in, diggers haul soil up the shaft. Menus open from the world; the server still decides. |
| Technology | Plain Three.js as a lazy-loaded scene on the Colony screen. The PixiJS nest stays as the fallback (no WebGL, low-power phones, Motion off). No server change. |
| Art | Ants stay procedural (the 3D twin of `client/src/art/ants.ts`). Soil and chambers built in code. A handful of hero props as 3D models. |

## The world: two options

**A. Recommended: the specimen slab.** A block of earth on a plinth, cut open at the front. Chambers are carved hollows; tunnels are grooves; the surface on top carries parties, raids and events. It is literally an ant farm, and the cross-section that makes the 2D nest readable is untouched. Costs: a new renderer, 3D versions of the chamber art, care on cheap phones.

**B. Low-change: 2.5D in PixiJS.** Stay 2D and fake depth: carved rims, soft shadows, parallax soil layers, glow at night. Almost no code risk, but never a place you can turn.

Not proposed: a free camera through the tunnels. It loses the at-a-glance read of the whole colony.

No rename map: setting and names don't change.

## Palette

World (never used as menu text):

| Name | Hex | Role |
|---|---|---|
| Topsoil | `#6B4F37` | Strata 1 |
| Subsoil | `#4A3726` | Strata 2 |
| Deep soil | `#33261A` | Strata 3 |
| Hollow | `#1C140E` | Cavity backs |
| Grass | `#6F9A3E` | Surface |
| Worker | `#C98B52` | Ants |
| Raider | `#C4473A` | Other colonies' ants |
| Honey glow | `#FFCF5A` | Chamber lights at night |
| Scent glow | `#C59BFF` | Research |

Menus (contrast checked, all text WCAG AA):

| Token | Day | Night |
|---|---|---|
| Page | `#E9ECE0` lichen paper | `#1D1611` soil |
| Panel | `#F6F7F0` | `#2A2018` |
| Text | `#2B1D13` (13.6:1) | `#EFE4D2` (14.2:1) |
| Muted text | `#5A4F3C` (6.7:1) | `#B3A089` (7.1:1) |
| Links / primary | `#3B6522` (5.7:1) | `#A9CB78` (9.8:1) |
| Buttons | `#E8B23A` fill, `#2B1D13` text (8.4:1) | same |

Honey is only ever a fill with dark text on it. Leaf, protein and honey keep their meaning: cargo and stores, never ant bodies.

## Type and icons

Keep Bricolage Grotesque (display) and Atkinson Hyperlegible (body), both already in the game.

Icon rules: side view, like the nest. 3px ant-ink outline, one base colour and one shade, one highlight stroke. Always on a light tile with a leaf-green inner ring, so they read in both themes and on the 3D sky. Starter set in `icons/`: foliage, protein, nectar, worker, soldier.

## Interaction map

Every system gets a place and a verb; menus open from the world; the server decides.

| System | Where it lives | What the player does | Builds on |
|---|---|---|---|
| Chambers | Carved hollows; size grows with level | Tap, read the sheet, Dig deeper; diggers haul soil to a spoil heap | Build job, chamber sheet |
| Stores | Granary, Larder, Nectar Cellar floors | See piles grow; tap for amounts | Resources, storage capacity |
| Production | Fungus garden, Hunting Grounds, aphid root | Watch workers; short of workers, the chamber dims | Production, workforce |
| Brood | Brood Hall | Tap to raise units; new ants crawl out | Brood queue |
| Research | Pheromone Chamber glow | Tap to open research; glow pulses while learning | Research job |
| Missions | Entrance mound and surface | Tap the entrance to send a party; it walks out and comes home with cargo | Missions |
| Incoming | Surface, from the attacker's side | Red soldiers march in with a timer; the entrance rings red | Incoming list, battle on arrival |
| Nest events | Surface and chambers | Watch: beetle dragged down, rain, winged ants rising | Nest events |
| Ant names | Every ant | Hover or tap | Names |
| Map, reports, rankings | Menus | Unchanged | Unchanged |

## Technology

Layers: React menus (unchanged) → Three.js 3D nest (new, lazy-loaded) beside the PixiJS 2D nest (kept as fallback) → the same colony, missions and incoming data → server (unchanged).

| Option | Verdict |
|---|---|
| **Three.js, plain** | **Recommended.** The nest is one hand-driven scene like `nestScene`/`nestFx`; ~160 KB extra, Colony screen only. |
| React Three Fiber | Wrong fit: suits many React-managed objects; ours is one animated scene. |
| Babylon.js | About three times heavier, features we won't use. |
| PixiJS 2.5D | Option B. Cheapest, no real depth. |
| Godot / Unity web | No: second app, slow downloads, can't share the React menus. |

Budgets: under 250 KB compressed for Three.js plus the scene, loaded after the Colony screen opens; hero models under 150 KB each, at most six. Under 60,000 triangles; ants from shared shapes, at most 200 on screen; flat colours. 30 fps on a mid-range phone; stop drawing when hidden or off screen; smaller shadows on phones; Motion off shows a still frame or the 2D nest.

## Making the art

- **Now, in code:** the slab, strata, chambers, tunnels, grass and every ant (as in the mock-up).
- **Hero pieces:** queen, fungus garden, honeypot ant, beetle, fallen leaf. Concept image → image-to-3D (Meshy, Tripo or Rodin) → `.glb`, reduced under 3,000 triangles.
- **Later:** a 3D artist for a consistent set and cosmetic nest themes.

Owner steps: paste the prompt into an image generator (plain background) → upload the image to Meshy or Tripo, choose low poly, download `.glb` → drop the file in the chat.

```
A honeypot ant hanging upside down, its abdomen swollen into a translucent amber sphere of honeydew.
Stylised low-poly 3D model, flat-shaded facets, chunky readable silhouette, field-guide naturalism, no cartoon face.
Colours: rust-brown body #A95F2F, amber #E8B23A with dark plate bands, warm rim light.
Isolated on a plain light background, three-quarter side view, whole model in frame.
```

Check each tool's terms allow commercial use before anything ships.

## Conflicts with the design docs

| Where | Says today | Would say |
|---|---|---|
| `CLAUDE.md` stack | Vite + React, with PixiJS for the nest view | Three.js for the nest, PixiJS nest kept as fallback |
| `13-tech.md` client row | PixiJS for Nest View | Three.js 3D nest (lazy-loaded), PixiJS 2D fallback |
| `12-ui-nest-view.md` Nest View | Side cross-section; rounded shapes | Block of soil cut open at the front; carved chambers; gentle orbit |
| `12-ui-nest-view.md` reduce motion | Moving parts stop | Motion off shows the 2D nest or a still 3D frame |
| `18-art-direction.md` scale and assets | 2D sprites 11–15px; SVG portraits | 3D ants from the same body plan; SVG kept for icons, cards, 2D fallback |
| `00-vision.md` non-goals | Not a detailed nest simulation | Unchanged |

These change, with the decision log, in the same pull request as the first 3D work, once approved.

## Plan

1. **Hidden test slice:** the 3D slab on the Colony screen behind a hidden switch, with real chambers, tunnels and walking ants. Play it on a phone; measure load and frame rate.
2. **Port the moving parts:** parties, raids, digging, brood, events; sheet and close-up open from the slab.
3. **Day, night and hero models.**
4. **3D by default,** 2D kept for old phones and Motion off.

## Decisions needed

1. Build the hidden 3D test slice, or stay 2D and do option B?
2. Gentle orbit (as in the mock-up), or a fixed front view with depth only?
3. Keep the 2D nest permanently as the fallback and Motion-off view?
4. Add the light "field-guide paper" theme to the menus, following each player's device?
5. Code-only art for now, or start on hero models (some tools are paid)?

Risks: every nest feature costs work in 3D and, while it exists, in 2D; cheap phones are the real test; art is the slowest part. Menus remain the fallback for everything.
