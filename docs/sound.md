# Sound

_Current as of 2026-11-04 (the three songs)._ What plays when, how it's made, the controls, and every recording with its source and licence.

## The idea
The colony's background music is **a military march for a miniature army**: a marimba tune over snare cadences and tiny footsteps, in D minor. There are three songs, one for each thing the colony can be doing, and the music follows the colony from one to the next. Marz made them in Suno (paid plan, so they can be used commercially) after trying a code-made march first (2026-11-02, see "Before the songs" below).

It sits under play and is meant to be left on.

## What plays when
| The colony | Song | Tempo | File |
|---|---|---|---|
| Nobody out (or only parties holding a spot) | **Home in the Dirt** | 92 BPM | `client/public/music/home-in-the-dirt.mp3` (2:21) |
| Any of your parties walking out or home | **Ants on the March** | 100 BPM | `client/public/music/ants-on-the-march.mp3` (1:40) |
| A raid or swarm coming at you | **Raid on the Nest** | 112 BPM | `client/public/music/raid-on-the-nest.mp3` (0:58) |

Scouts coming at you don't count as a raid; raids and swarms do (the same rule as the tab title's "Raid incoming!").

- Moving from one song to another fades across over 2.5 seconds.
- A raid always starts from the top. Home in the Dirt and Ants on the March carry on where they left off, so going out and coming home doesn't replay the same opening every time.
- Near its end, a song starts again from the top and overlaps itself for 3 seconds, so it loops with no gap.
- Nothing plays on the login screen, or before the player's first click or key press (browsers require one).
- The music pauses while the tab is hidden and picks up again when you come back.
- It fades in when the game starts and fades out when turned off.

## Controls
The **speaker** in the top bar opens a small card: **Turn off / Turn on** and a **Music** volume slider, with a line naming the three songs. On by default at half volume. Saved per browser (`hormigas.sound` in local storage). There are no sound effects yet; the saved setting already has an effects level for when they come.

## How it's made
All in the client, in `client/src/audio/`. Sound only reacts to the game state the client already has; it never changes anything.

- `engine.ts`: the Web Audio graph (ported from Papercut): a music bus and an effects bus into one soft limiter. Volume sliders are squared so they feel even; music is ×0.55 under the effects. It can also load short recordings and make code-made noise bursts and tones, for sound effects later.
- `music.ts`: the songs. They stream through three `<audio>` players routed into the music bus (decoding all three songs would hold over 100 MB in memory, too much for phones). The players take turns, which is how songs fade into each other and loop: whichever player becomes the one you hear, every other player fades out, so only one song is left once a fade ends (a third player means a quick switch mid-fade never has to cut a song off). Phones only let a page start a player during a tap, so all players are started silently on the first tap or key press.
- `useSound.ts`: wakes audio on the first click or key, pauses it when the tab is hidden, and picks the song from the game state (`musicFor`).
- `components/SoundButton.tsx`: the speaker and its card.

## The song files
Marz's originals are 48 kHz WAVs in `GameDev/_suno/Hormiga` (not in the repo). Each was turned into the game's file like this:

- The last 1.2–2 seconds cut off (each song ends in a short fade, which would dip the loop), with a 40 ms fade at the new end.
- Levelled so calm sits a little under the raid: Home in the Dirt about −19 LUFS, Ants on the March −18, Raid on the Nest −17. `LEVEL` in `music.ts` (0.55) brings them down to the loudness the code-made march had.
- MP3, 128 kbps, 44.1 kHz stereo (every browser plays MP3). About 4.8 MB for all three; only the song you're hearing loads.

## Changing it
- **Swap a song:** make the new file the same way (trim the ending, level it, MP3) and keep its name, or change `SONGS` in `music.ts`.
- **Louder or quieter overall:** `LEVEL` in `music.ts`. **Fade lengths:** `SWITCH` (between songs) and `WRAP` (loop overlap).
- **When it's tense or marching:** `musicFor` in `useSound.ts`.

## Before the songs
From 2026-11-02 to the songs, the music was made in code: tiny recorded footsteps (Kenney's CC0 Impact Sounds, pitched up) swinging left and right on every beat like an ant's tripod gait, a soil drum and a sine-wave marimba tune that rewrote itself. Marz liked the idea, then wanted something fuller and more like video game military music, and made the songs to replace it. The code is in git history (`client/src/audio/march.ts`, removed in the songs PR), and recordings of it are in `GameDev/_audio/renders/hormigas-march/`.

The trailer's soundtrack is this code-made march, rendered offline to follow the edit before the songs replaced it (`tools/trailer/music.mjs`, [trailer.md](trailer.md)). That script loads `march.ts`, which is gone, so re-rendering the trailer needs it switched to the songs first.

## Open Questions
- Sound effects for moments players feel but can't hear (a battle report landing, a raid arriving, a dig finishing): not yet decided.
- More than one song per mood, so long sessions hear some variety?
