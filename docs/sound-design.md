# Sound design

Ties together the game's three audio layers — sound effects, environmental ambience,
and music — into one picture, and works out what's already built, what's already
tracked as follow-up work, and what's still an open creative decision. Two pieces of
this are already scoped as their own issues and are only summarised here, not
redesigned: [#158](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/158)
(gameplay-reactive SFX — speed/impact-driven volume and pitch) and
[#160](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/160) (locale-reactive
ambience — per-landcover-class soundscapes). This doc's own contribution is the piece
neither of those covers: **the soundtrack** — what the game's music should actually
sound like, and how to produce it — plus where procedural generation can help across
all three layers.

## Current state

`src/audio/AudioManager.js` is the whole audio system today: a fixed roster of five
named sounds (`SOUND_DEFS`) — `wind`, `tireRoll`, `jump`, `crash`, `music` — each with a
real-file drop-in point (`public/assets/audio/<name>.mp3`) and a `synthesize()`
fallback (brown noise, white noise, a rising tone, a decaying noise burst, and a
three-note sine drone respectively) used until a real file exists. `src/main.js` wires
these up: `wind` and `music` loop continuously (0.3 and `MUSIC_VOLUME` = 0.25 volume),
`tireRoll` toggles between 0 and `TIRE_ROLL_VOLUME` based on `bike.isGrounded()`, and
`jump`/`crash` fire as one-shots. A mute button (`#mute-btn`) toggles `musicAudio`'s
volume and persists the choice in `localStorage`.

So today's "soundtrack" is a single 8-second looping three-note drone
(`synthMusicLoop`) — a functional placeholder, not a composed piece. That's the gap
this doc is mainly about closing.

| Layer | Current state | Tracked in |
| --- | --- | --- |
| SFX (jump, crash, tire roll) | Placeholder synths, fixed volumes | This doc (baseline) + [#158](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/158) (reactive scaling) |
| Ambience (wind) | One flat, constant-volume loop regardless of location | [#160](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/160) (per-landcover-class, locale-reactive) |
| Music (soundtrack) | One placeholder drone loop, no variation | **This doc** |

## Soundtrack concept

The visual identity is already settled — `docs/concept-art-prompts.md` and
`docs/style-guide.md` describe a "Tony Hawk's Pro Skater/SSX energy meets British
countryside travel poster" mood: gritty, weather-beaten gritstone moorland, cel-shaded,
not cute or soft. The soundtrack should read as the audio equivalent of that same
mood.

**Decided direction (Joe, 2026-07-05): organic/folk-tinged hybrid.** Acoustic
instrumentation — fiddle, guitar, drone textures — blended with electronic percussion
underneath, leaning into the "British countryside" half of the mood reference and the
game's real-place identity (real LIDAR terrain, real OSM routes, real tree data)
rather than a generic extreme-sports electronic register. The percussion/electronic
layer keeps it energetic at speed; the acoustic layer keeps it grounded in place.
Suno prompts (see below) should target this blend specifically, not the pure
electronic/breakbeat alternative that was also considered.

## Adaptive music system

**Sequencing decision (Joe, 2026-07-05): ship one well-produced static loop first.**
Replace today's placeholder `synthMusicLoop` drone with a single polished
organic/folk-hybrid Suno-produced loop before building any adaptive layering — get a
real soundtrack shipped, then layer adaptivity in as follow-up work rather than
blocking the first real music on the more involved multi-stem system. The design
below is captured now so the follow-up issue has a concrete spec, but it is
deliberately *not* phase-1 work.

Rather than one static loop, a later phase could structure the soundtrack as a small
set of layered stems that crossfade based on run state, the same crossfading approach
[#160](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/160) proposes for
ambience (smooth blends, not hard cuts):

- **Base layer** — always playing, low-energy (pad/drone), analogous to today's
  `synthMusicLoop` but composed rather than a placeholder.
- **Drive layer** — percussion/bass that fades in with speed (`bike.speed`, already
  tracked by `BikeController` per `#158`'s notes), so the track visibly picks up energy
  on fast descents and drops back on climbs/slow sections.
- **Accent stings** — short one-shots for jumps/big air and crashes, distinct from the
  base/drive loops, layered on top rather than replacing them (keeps continuity instead
  of the music cutting out for an SFX moment).

This only requires `AudioManager` to manage multiple concurrently-playing,
independently-volume-controlled `THREE.Audio` loops instead of one — the same pattern
`main.js` already uses for `musicAudio`/`tireRollAudio` today, just extended to 3-4
simultaneous stems with speed-driven crossfade logic instead of a single track.

## Suno production workflow

[Suno](https://suno.com) generates full tracks (including stems in some plans) from a
text prompt, and is the intended tool for producing the real music assets called for
above. Practical notes for using it here:

- **Match the drop-in convention.** `AudioManager`'s `SOUND_DEFS` already expects real
  files at `public/assets/audio/<name>.mp3`, falling back to synthesis until they
  exist. Suno exports (typically MP3) can drop straight into that convention —
  `music.mp3` for the base loop, plus new named entries (e.g. `music-drive.mp3`,
  `jump-sting.mp3`) as the adaptive layers above are built out.
- **Looping needs editing, not just generation.** Suno output isn't guaranteed to loop
  seamlessly — expect a manual trim/crossfade pass (e.g. in Audacity) to find/create a
  clean loop point before a generated track replaces a placeholder, the same way a
  real recording would need editing before becoming a `wind.mp3`.
- **Generate stems separately, not as one mixed track**, for the adaptive layering
  above — a base pad track and a separate percussion/drive track prompted and
  generated independently (or split via Suno's stem export where available) so they
  can crossfade independently at runtime, rather than trying to slice apart one mixed
  export.
- **Check licensing terms** for the Suno plan in use before shipping generated tracks
  in a released build (itch.io and GitHub Pages are both public distribution) —
  ownership/commercial-use terms vary by subscription tier.
- **Prompt direction**: organic/folk-tinged hybrid per the [decided
  direction](#soundtrack-concept) above — e.g. fiddle/acoustic guitar/drone
  instrumentation over a steady electronic percussion bed, mid-tempo enough to loop
  under both climbs and fast descents without feeling mismatched to either. Treat this
  as a starting brief for prompt iteration, not a literal prompt string — refine
  against actual Suno output.

## Procedural generation opportunities

Beyond the composed soundtrack, there's room for algorithmic variation across all
three audio layers, in the same spirit as `docs/procedural-generation.md`'s "rule-based
generation instead of hand-authoring everything" theme:

- **Adaptive mixing is itself procedural** — the speed/state-driven crossfading in
  [Adaptive music system](#adaptive-music-system) above is procedural composition:
  the same stems recombine differently every run rather than playing back one fixed
  arrangement.
- **Per-play variation on one-shots** — `jump`/`crash` currently play identically every
  time. Small randomised pitch/timbre jitter per play (already easy with
  `THREE.Audio.setPlaybackRate`, in the same vein as `#158`'s severity-scaling
  proposal) would reduce repetition fatigue over a long play session without needing
  more source assets.
- **Procedural SFX synthesis already exists as a pattern to extend** —
  `synthWindLoop`/`synthTireRollLoop`/`synthJump`/`synthCrash` in `AudioManager.js` are
  already parametric noise/tone generators, not fixed samples. `#160`'s proposed
  per-landcover ambience beds and `#158`'s severity-scaled crash intensity are both
  natural extensions of this same existing parametric-synthesis approach — worth
  building as extensions of it rather than a new system.
- **Where procedural generation is *not* the fit**: the core soundtrack's musical
  identity (melody, harmony, genre) is a creative/compositional decision, not something
  procedural generation should originate — Suno (or a composer) sets that, and
  procedural logic only recombines/varies pre-produced material at runtime.

## Creative direction (decided)

Resolved by Joe (2026-07-05) — captured here so the decisions live with the design
doc, not just in an issue thread:

1. **Genre**: organic/folk-tinged hybrid (acoustic instrumentation + electronic
   percussion), not pure electronic/breakbeat. See [Soundtrack
   concept](#soundtrack-concept).
2. **Sequencing**: ship one well-produced static loop first; adaptive layering
   (base/drive/accent stems) is deliberately deferred follow-up work, not phase 1. See
   [Adaptive music system](#adaptive-music-system).
3. **SFX style**: keep jump/crash/tire-roll naturalistic — don't push them toward
   stylised/arcade SSX-style hits, even though the music has energetic percussion.
   Naturalistic SFX + organic-hybrid music was chosen as the combination that best
   matches the game's real-place identity.

Still open, and worth revisiting once the first real loop is in-game: concrete
reference tracks/artists to prompt Suno against, beyond the genre description above —
useful to gather once there's a first draft to react to rather than in the abstract.

## Roadmap

| Phase | Work | Tracking issue |
| --- | --- | --- |
| 1 | Creative direction decided (genre, sequencing, SFX style) | Done — see [Creative direction](#creative-direction-decided) above |
| 2 | Produce a real base soundtrack loop via Suno, replacing `synthMusicLoop` | [#184](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/184) |
| 3 | Adaptive layered music system (base/drive/accent stems, speed-crossfaded) | [#185](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/185) |
| 4 | Gameplay-reactive SFX (speed/impact scaling) | [#158](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/158) (existing) |
| 5 | Locale-reactive ambience (per-landcover soundscapes) | [#160](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/160) (existing) |
| 6 | Per-play SFX variation (pitch/timbre jitter on one-shots) | [#186](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/186) |

## Out of scope (considered, deliberately dropped)

- **Full 3D positional/spatial audio panning** — already noted as out of scope by
  `#160`; `THREE.AudioListener`/`THREE.Audio` give basic camera-attached listening,
  which is enough for this game's needs.
- **Weather-driven audio** (rain/storm layers) — only relevant once weather exists as a
  feature; not currently planned.
- **Licensed/stock music or hired composition** — Suno-generated and procedurally-varied
  audio is the stated direction; not evaluating paid licensing or commissioning a
  composer here.
