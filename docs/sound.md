# Sound

_Current as of 2026-11-02 (the marching music)._ What plays when, how it's made, the controls, and every recording with its source and licence.

## The idea
The colony's background music is a **march built on the ants' own footsteps**. Ants walk with an alternating tripod gait: three legs land together (front and back on one side, the middle one on the other), then the other three. So every beat of the 4/4 is a tiny three-foot step, and the steps swing left, right, left, right across the speakers. Under the feet is a low, muffled soil drum; over them a sparse wooden marimba tune on a D minor pentatonic scale (D F G A C) that keeps rewriting itself, so a long session never hears the same loop.

The tone follows the game's: a grounded nature documentary, not a cartoon. It sits quietly under play and is meant to be left on.

## What plays when
The march follows the colony. A change waits for the next bar line, so it never stumbles.

| The colony | March | What you hear |
|---|---|---|
| Nobody out (or only parties holding a spot) | **idle**, 92 BPM | Quiet steps, the drum on beat 1, the tune for two bars then rest for two, a bass note every other bar |
| Any of your parties walking out or home | **march**, 100 BPM | Drum on 1 and 3, soil grains rustling on the off-beats, the full tune (A A B A) with a bass note every bar |
| A raid or swarm coming at you | **tense**, 112 BPM | Faster and heavier steps, an extra drum hit, a woodblock on 2 and 4, the tune an octave lower and busier |

Scouts coming at you don't make it tense; raids and swarms do (the same rule as the tab title's "Raid incoming!").

- Nothing plays on the login screen, or before the player's first click or key press (browsers require one).
- The music pauses while the tab is hidden and picks up again when you come back.
- It eases in over a couple of seconds and fades out when turned off.

## Controls
The **speaker** in the top bar opens a small card: **Turn off / Turn on** and a **Music** volume slider, with a line saying what the march follows. On by default at half volume. Saved per browser (`hormigas.sound` in local storage). There are no sound effects yet; the saved setting already has an effects level for when they come.

## How it's made
All in the client, in `client/src/audio/`. Sound only reacts to the game state the client already has; it never changes anything.

- `engine.ts`: the Web Audio graph (ported from Papercut): a music bus and an effects bus into one soft limiter, recordings loaded on the first click with a random take and ±5% pitch each time, and code-made noise bursts and tones. Volume sliders are squared so they feel even; music is ×0.55 under the effects.
- `march.ts`: the music. A scheduler queues notes 120 ms ahead on the audio clock (steady even when the 3D view stutters). Everything except the feet is made in code: the soil drum is a falling sine with a puff of dark noise, the marimba a sine with its quick bright overtone (×3.93), the grains and woodblock filtered noise.
- `useSound.ts`: wakes audio on the first click or key, pauses it when the tab is hidden, and picks the march from the game state (`marchFor`).
- `components/SoundButton.tsx`: the speaker and its card.

Each footstep plays a recorded step pitched up ×1.7 into tiny feet. If the recordings don't load (old Safari can't play `.ogg`), a code-made tick plays instead, so the march never goes missing.

## Recordings
All CC0 (public domain). Kenney doesn't require credit; we give it anyway.

| File | Made from | Pack | Source | Licence |
|---|---|---|---|---|
| `client/public/sfx/ant-step-1.ogg` | `footstep_concrete_000.ogg` | Impact Sounds | [Kenney](https://kenney.nl/assets/impact-sounds) | CC0 |
| `client/public/sfx/ant-step-2.ogg` | `footstep_concrete_002.ogg` | Impact Sounds | [Kenney](https://kenney.nl/assets/impact-sounds) | CC0 |
| `client/public/sfx/ant-step-3.ogg` | `footstep_concrete_004.ogg` | Impact Sounds | [Kenney](https://kenney.nl/assets/impact-sounds) | CC0 |

Each was trimmed to 85 ms with a fade-out, made mono and lowered 5 dB (peaks about −3 dB): one clean, dark tap with no lead-in. The two-hit RPG footsteps were passed over because heel-and-toe would blur the march.

## Changing it
- **Swap the step sound:** replace the three `ant-step-*.ogg` files (short, mono, no silence before the hit). Keep the names, or change the list at the top of `march.ts`.
- **Tempo:** `BPM` in `march.ts`. **Which drums play when:** `KIT`. **How loud the feet are:** `FEET`.
- **The tune's mood:** `SCALE` (the notes) and `RHYTHMS` (where notes may fall) in `march.ts`.
- **When it's tense or marching:** `marchFor` in `useSound.ts`.

## Open Questions
- Sound effects for moments players feel but can't hear (a battle report landing, a raid arriving, a dig finishing): not yet decided.
- Should the Whole Yard or the 3D nest bring the feet closer (louder steps when zoomed to ant height)?
