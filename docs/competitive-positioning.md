# Competitive positioning: what makes this game distinct

Prompted by a design discussion about where this game sits relative to existing
downhill/MTB games, and what would make it a genuinely different kind of fun rather
than a smaller clone of an established genre entry. This doc surveys the field, states
an explicit differentiation thesis, and maps it against the (already large) open
issue backlog so new work builds toward one throughline instead of scattering.
Tracked in [issue #164](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/164).

## The field

| Game | Core fun | Defining trait |
| --- | --- | --- |
| **Descenders** | Speed + flow, roguelike "one more run" | Procedural-feeling runs, crash resets you, chain lines without braking for a flow multiplier, ghost multiplayer |
| **Lonely Mountains: Downhill** | Route mastery / puzzle-solving | Fixed, memorised trails learned through repeated attempts, stylised low-poly minimalism, checkpoint restarts, leaderboards |
| **Riders Republic** | Spectacle, social multiplayer | Huge open world, multi-sport (bike/ski/wingsuit), mass-player events, arcade tricks |
| **Downhill Domination / MTB (PS2 era)** | Arcade racing vs AI | Boost pads, trick scoring, cartoonish physics |
| **Shred! / Shred! 2** | Physics sim + creation | Sim-leaning bike feel, in-app trail editor, replayability from user-built trails |
| **Trials Fusion/Rising** | Precision + balance | 2.5D physics obstacle courses, huge level-editor/community-content ecosystem |
| **Get Rowdy / MTB sim projects** | Hardcore realism | VR, suspension/tyre simulation aimed at real riders |

The genre splits into five broad archetypes: **arcade flow-racers** (Descenders),
**stylised route-mastery puzzlers** (Lonely Mountains), **open-world social spectacle**
(Riders Republic), **precision physics/level-editor** (Trials), and **hardcore sims**
(Get Rowdy). None of them are rooted in *actual, named, real-world terrain* — every one
is fictional or procedurally generated, just dressed up to *feel* plausible.

## What this project already has that none of them do

Per `CLAUDE.md`, this game's whole premise is different: `tools/terrain/` bakes a
**real** bridleway (Cut Gate) from actual Environment Agency LIDAR + OSM data, it runs
free in a browser (no install), it's solo-dev scoped, and it already layers a
stamina/boost mechanic (#61, #139) onto downhill gravity racing — something none of the
pure gravity-racers bother modelling. That combination — real place + zero-friction
distribution — is not contested territory in the list above.

## Differentiation thesis: "authentic-place mastery"

Don't compete with Descenders on arcade flow or Riders Republic on spectacle — compete
on being the only one of these that's an actual place, and build the core loop around
*proving* that authenticity rather than adding systems (open-world, live weather sim,
mass multiplayer) that would dilute a solo-dev scope. Concretely:

1. **Real place, not a fictional level** — more named, real Peak District bridleways,
   sourced and verified the way Cut Gate already was (OSM + Rights of Way data).
2. **Mastery-through-repetition on a fixed route**, closer to Lonely Mountains than
   Descenders — since routes are real and fixed (not regenerated), the loop is ghost
   replays / segment times against your own past runs, not a roguelike crash-reset.
3. **Endurance as a second skill axis**, not just gravity — the stamina/boost mechanic
   is already unusual for the genre; it's the "you have to earn momentum" contrast to
   games where speed is free.
4. **Conditions variety on the same real terrain** — seasonal/weather bakes so the one
   real place still has replay variety, without needing a live-simulated world (already
   ruled out in `docs/procedural-generation.md`).
5. **Place authenticity as flavour, not just backdrop** — real bridleway names, rights-
   of-way status, Peak District identity surfaced in-game, not just in `ATTRIBUTION.md`.

## Mapping the thesis to the existing backlog

Most of this thesis is *already* tracked — the job here is connecting the dots, not
opening a wave of duplicate issues:

| Pillar | Existing issue(s) | Status |
| --- | --- | --- |
| More real routes | #52 (source additional descents via PROW/OSM), #134 (prioritised candidate list) | Open — research done, pipeline generalisation is the blocker |
| Route mastery / ghost replay | #65 (run export / ghost mode) | Open |
| Scoring / segment-style runs | #64 (scoring, sessions, leaderboards) | Open |
| Endurance as a skill axis | #61 (pedal/stamina), #139 (boost mechanic) | **Done** |
| Endurance depth | #62 (gear change mechanic) | Open |
| Conditions variety | #144 (changeable weather) | Open |
| Aesthetic throughline check | #161 (MDA framework analysis) | Open — complementary lens (internal feel), not competitive positioning |
| Rider embodiment | #126 (dynamic rider character/pose) | Open |
| Progression/replayability | #59 (bike selection), #60 (progression/level-up) | Open |

Pillar 5 — **place authenticity as flavour** — was the one gap with no existing issue:
nothing currently surfaces a route's real name, location, or access status in-game.
`public/data/routes/cutgate.json` only carries `crs`/`origin`/`source`/`license`, no
human-readable identity fields, and `RouteOverlay.js` has no UI for it. That gap is
now filed as [issue #163](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/163)
rather than folded into #65/#64, since it's about *identity/discovery*, not scoring or
replay mechanics.

## Recommendation

Prioritise, in order: land #47-style pipeline generalisation + #52/#134 (a second real
route is the highest-leverage proof of the "real place" thesis), then #65 (ghost
replay) and #64 (scoring) together since they're two views of the same session-state
work, then #163 (route identity) as a cheap, high-signal addition to whichever route
ships next.

## Out of scope (deliberately, per the thesis)

- **Mass multiplayer / open world** (#63 territory) — dilutes solo-dev scope and the
  single-real-place premise; asynchronous ghosts (#65) deliver the competitive layer
  Riders Republic gets from live multiplayer, more cheaply.
- **Trick/combo systems copied from THPS-style scoring for their own sake** — already
  flagged as an open question on the existing `ScoreTracker.js` combo model in #161;
  this doc doesn't re-litigate it, just notes that trick depth isn't part of the
  authenticity thesis and shouldn't be chased just because other games have it.
