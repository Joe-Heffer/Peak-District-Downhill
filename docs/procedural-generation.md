# Procedural content generation

Prompted by [issue #150](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/150),
which links a breakdown of *Project Tomorrow*, a solo-dev game built almost entirely
from rule-driven, data-oriented systems. Its four pillars: automated
material/texture art (rules and noise instead of hand-painted textures), a world that
reacts live to gameplay (terraforming, spreading vegetation), emergent gameplay from
overlapping systems rather than scripted events, and technical scaling (object
pooling, DOTS) for thousands of simultaneous entities.

This doc works out which of those pillars actually transfer to this game, what
library would help, and what a "procedural content generation graph" would look like
here — grounded in what the codebase already does, not aspirationally.

## What already exists here

This game is not a blank-slate procedural world: `tools/terrain/` bakes one real
location (the Cut Gate descent) from LIDAR elevation + OSM route/landcover data into
static JSON at build time (see the root `CLAUDE.md`), and that's a deliberate design
choice, not a gap to fill in with generation. Even so, three genuinely procedural
seams already exist, each doing a smaller version of something in the video:

- **Scattering** — `src/scenery/Scenery.js` uses a seeded PRNG (mulberry32, `SEED =
  1337`) to scatter rocks along the route corridor, with tunable constants
  (`SAMPLE_SPACING`, `ROCK_SKIP_PROBABILITY`, `LATERAL_MIN`/`LATERAL_MAX`). It's
  bespoke, one-off scatter code written specifically for rocks — there's no reusable
  pipeline behind it, so every future scattered content type (mud patches, warning
  signs before jumps, puddles) would mean copy-pasting and re-tuning this script.
  Trees are the opposite case: their positions come straight from real LIDAR canopy
  detection (`cutgate-trees.json`), not generated, and should stay that way.
- **Procedural texturing** — `src/terrain/HeightmapTerrain.js` colours each terrain
  vertex from a fixed `CLASS_COLORS` lookup keyed on landcover class (grass/wood/
  rock/heather/track), and `src/terrain/RockTrackTexture.js` draws a rock/track detail
  texture out of `Math.random()`-placed canvas ellipses and lines. This is already the
  "rule-based texture instead of hand-painting" idea from the video, just uncorrelated
  per-pixel/per-vertex randomness rather than coherent noise, so landcover boundaries
  are a hard edge rather than a blend.
- **Procedural animation** — `src/bike/BikeController.js`'s `updateRiderPose()` blends
  a pose factor from slope/speed/boost/brake state into the rider's torso pitch,
  crouch, and setback, continuously and reactively rather than via baked animation
  clips. This is already at parity with the video's "gun leads, body procedurally
  follows" idea — the natural move is to extend it, not replace it.

## What transfers vs what doesn't

| Video idea | Applies here? | Why |
| --- | --- | --- |
| Rule-based procedural textures | **Yes** | Already started (`RockTrackTexture.js`, `CLASS_COLORS`) — just needs coherent noise instead of uncorrelated randomness. |
| System-driven procedural animation | **Yes** | Already exists (`updateRiderPose()`) — extend with secondary motion rather than build from scratch. |
| Rule-based content scattering | **Yes, generalise it** | Rock scatter exists but is a one-off script; worth turning into a small reusable pipeline for future scattered content. |
| Reactive/terraformable world | **No** | The game models one real, fixed location baked from LIDAR/OSM at build time — there's no live world-state simulation to react to, and adding one would contradict the "real place" premise of the game. |
| Emergent gameplay from overlapping systems | **No** | This is a single-route downhill time-trial, not an open sim with farming/defense/water systems in tension. Nothing to overlap. |
| Object pooling / DOTS for thousands of entities | **No** | No enemies, no projectiles, no entity counts anywhere near where pooling or data-oriented ECS would pay for its complexity. |

## Recommended library: `simplex-noise`

For the "yes" items above, [`simplex-noise`](https://www.npmjs.com/package/simplex-noise)
is the right fit: a few KB, zero runtime dependencies, actively maintained, and it
does exactly the two jobs needed —

- Blending `CLASS_COLORS` at landcover class boundaries in `HeightmapTerrain.js`
  (sample noise per-vertex, use it to interpolate between neighbouring classes near a
  boundary) instead of the current hard per-vertex lookup.
- Driving the canvas-based textures in `RockTrackTexture.js` and the ground
  placeholder texture in `HeightmapTerrain.js` with coherent noise instead of
  uncorrelated `Math.random()` speckle, for a more natural, less "static-y" look.

Deliberately **not** recommending a node-graph-authoring library (Substance
Designer-style live graphs). That's an offline-authoring-tool problem, and this
codebase already solves the equivalent problem the right way for a browser game:
`tools/terrain/` bakes the expensive/complex generation step at build time into
static JSON, and the runtime just consumes it. Trying to run a live procedural
material graph in the browser would add real complexity for a game that renders one
fixed terrain.

## Proposed procgen graph

Not a generic engine — a small composable pipeline for scattering content along the
route, living in a new `src/procgen/` module (unit tests colocated as
`src/procgen/*.test.js`, matching the rest of the repo).

Shape: plain functions chained together, e.g.

```
sampleAlongRoute(route, spacing)
  → filterByLandcover(landcover, allowedClasses)
  → filterBySlope(terrain, maxSlope)
  → jitter(seededRandom, lateralRange)
  → toInstanceMatrices()
```

Each stage takes and returns plain point/data arrays, so stages compose in any order
and new stages (e.g. `filterByDistanceFromRoute`, `poissonThin`) can be added without
touching existing ones.

**First migration**: rewrite `Scenery.js`'s rock scatter as a call through this
pipeline, behaviour-preserving — same seed, same constants, `Scenery.test.js` should
keep passing unmodified. Tree placement is explicitly *not* migrated, since tree
positions are real LIDAR ground truth rather than generated data.

**Payoff**: future scattered content — mud patches on wet corners, warning signs
before jumps, puddles — becomes composing 2-3 existing nodes instead of writing a new
bespoke scatter script per feature.

## Procedural animation extension

Rather than adopt an IK library, extend the existing bespoke approach in
`updateRiderPose()`: secondary motion such as arms reacting to bump impacts, or
subtle suspension-linked visual wheel compression, layered onto the current
slope/speed/boost/brake pose-blend as additional reactive terms.

## Roadmap

| Phase | Work | Tracking issue |
| --- | --- | --- |
| 1 | Procgen graph (`src/procgen/`) + migrate rock scattering onto it | Sub-issue A |
| 2 | `simplex-noise` dependency; noise-blended landcover + procedural textures | Sub-issue B |
| 3 | Rider secondary motion (bump/impact-reactive) | Sub-issue C |

## Out of scope (considered, deliberately dropped)

- **Reactive terraforming / spreading vegetation** — no live world-state to simulate;
  the terrain is one real, fixed place.
- **Emergent systems tension (farming/defense/water)** — no such systems exist or are
  planned; this is a single-route time-trial, not an open sim.
- **Enemy AI / DOTS** — no enemies or large dynamic entity counts.
- **Object pooling** — nothing is spawned/destroyed at a rate that would justify it.
