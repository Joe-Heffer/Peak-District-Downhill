# Vegetation rendering: procedural grass and richer tree foliage

Prompted by a request to make the world feel less flat and more immersive. This doc
works out an efficient way to add ground-cover grass (there is currently none) and
upgrade the placeholder cone trees into something that reads as foliage, without
regressing frame rate on what is a real-time downhill racer with touch-control mobile
support.

## Current state

- **Grass: none.** `src/terrain/HeightmapTerrain.js` colours the ground purely via
  per-vertex `CLASS_COLORS` tinting (`grass` is left `0xffffff`, neutral, so it shows
  whatever `ground.jpg`/the canvas-generated placeholder texture provides) — there is
  no 3D ground-cover geometry at all. At the shallow, near-horizontal viewing angle of
  this game's chase camera, a flat-shaded/textured ground reads noticeably flatter than
  real moorland turf.
- **Trees: flat cones.** `src/scenery/Scenery.js`'s `buildTreeGeometry()` is a 7-sided
  `THREE.ConeGeometry` with a single flat `MeshStandardMaterial` colour (`TREE_COLOR =
  0x3d4d30`), instanced once per real tree position from LIDAR canopy data
  (`public/data/terrain/cutgate-trees.json` — 2,727 trees once real data is baked, see
  `tools/terrain/buildTrees.js`). Functional as a stand-in, but reads as a cone forest,
  not foliage.
- **Renderer/perf ceiling.** `src/scene/setupScene.js` uses `THREE.WebGLRenderer`
  (three.js `0.185.1`) — no WebGPU compute path — with `shadowMap.enabled = false` and
  a `PerspectiveCamera` far plane pushed to `10000` to cover the real multi-kilometre
  Cut Gate terrain. `src/main.js`'s `tick()` already runs a `THREE.Clock`-driven
  requestAnimationFrame loop with `dt` available every frame.
- **Existing scatter pattern to reuse.** `Scenery.js` already has the seeded-PRNG +
  route-corridor pattern this doc leans on: `createRandom(SEED)` (mulberry32),
  `curve.getSpacedPoints()` along a `CatmullRomCurve3` built from `routeData.points`,
  lateral jitter within `LATERAL_MIN`/`LATERAL_MAX`, grounded via
  `terrain.getHeightAt(x, z)`. Grass placement should follow the same shape rather than
  invent a new one.

## Constraint: this is a fixed real route, not an open world

Cut Gate is one baked, finite corridor (`tools/terrain/` runs at build time, per
`CLAUDE.md`) — not a procedurally-infinite terrain. That changes which "efficient
grass/trees" techniques from the wider industry actually apply here:

- Million-instance GPU-compute grass fields and octahedral-impostor forest LOD systems
  (built for open-world scale) are solving a problem this game doesn't have. A route
  corridor only needs grass/tree density within `LATERAL_MIN`/`LATERAL_MAX`-ish metres
  either side of the line, which keeps instance counts in the low thousands.
- The renderer is `WebGLRenderer`, not `WebGPURenderer` — so techniques must be
  achievable with `InstancedMesh` + a custom `ShaderMaterial` (or
  `onBeforeCompile` on `MeshStandardMaterial` to keep existing lighting/fog/sky
  integration), not compute shaders.
- `shadowMap.enabled = false` globally — new foliage shouldn't cast/receive shadows;
  don't add shadow-map cost as part of this work.
- Touch controls (`src/input/InputController.js`) imply a mobile/lower-power device is
  a real target, not just desktop — budget conservatively rather than reaching for the
  heaviest technique found in research (multi-layer wind, subsurface scattering).

## Grass sprite design

**Representation — clumps, not single blades.** Each grass instance is a small
cross-quad clump (2 intersecting alpha-tested planes, ~4 triangles) rather than one
blade, so a visually dense-looking ground cover only needs low-thousands of instances
along the corridor, not hundreds of thousands. One `THREE.InstancedMesh` for all grass,
one draw call.

**Texture — generated, no asset file.** A small canvas-drawn blade-cluster texture,
alpha-tested (not blended, to avoid per-instance sort cost and z-fighting), generated
at runtime the same way `HeightmapTerrain.js`'s `createPlaceholderGroundTexture()`
already generates its placeholder ground texture — consistent with this repo's existing
"no external asset needed for a procedural look" pattern.

**Shading cheat.** A vertical vertex-colour gradient baked into the clump geometry —
darker green near the base, lighter toward the tip (anchored near the style guide's
Moss Green `#5E7A3F`, see `docs/style-guide.md`) — fakes ambient occlusion/backlighting
without real shadows or SSS.

**Wind.** A vertex-shader sway driven by a single `uTime` uniform plus world position
(so patches don't move in lockstep) and weighted by local vertex height (base pinned,
tip swings) — zero per-frame JavaScript beyond updating one uniform in `tick()`.

**Placement.** Extend the existing `buildRockMatrices`-style corridor sampling in
`Scenery.js`: sample along the same route curve, restrict to landcover classes `grass`
and `heather` (via `terrain.getLandcoverAt`, already used elsewhere e.g.
`main.js`'s scoring), jitter laterally, seeded with `createRandom(SEED + n)` for
reproducibility (matches `Scenery.test.js`'s expectation of deterministic scenery).

**Distance cutoff.** A flat max-render-distance cull (fade or hard cutoff around
60–80 m) is enough for a chase-cam racer where the player rarely stops to stare at
distant grass — no need for the octahedral-impostor stippling techniques built for
static architectural/open-world viewing.

## Tree design

Keep the real LIDAR-derived positions/heights/radii in `cutgate-trees.json` exactly as
they are — only the *geometry and material* change, in `Scenery.js`:

- Replace the single flat cone with a slim cylinder trunk + a cross-quad canopy (2–3
  alpha-tested planes using a canvas-generated leaf-cluster texture, same technique as
  the grass texture above). Same instance count (2,727), same per-instance
  `tree.height`/`tree.radius` scaling already baked into the data — this is a
  geometry/material swap, not a data pipeline change.
- Canopy quads reuse the *same* wind shader/uniform as grass (lighter amplitude,
  applied only to canopy vertices, trunk stays rigid) so grass and trees visibly move
  under one shared wind system rather than two disconnected effects.
- Full octahedral-impostor LOD (as used in large procedural-forest demos) is
  deliberately **not** proposed here — 2,727 fixed, known-position trees along one
  corridor is well within what a single instanced cross-quad mesh handles at 60fps;
  impostor baking is complexity this dataset's scale doesn't need yet.

## Shared wind system

One `uTime` uniform, updated once per frame from the `dt` already available in
`main.js`'s `tick()`, shared by the grass `ShaderMaterial` and the tree canopy
`ShaderMaterial`. Cleanest integration point: `buildScenery()` returns an `update(dt)`
function alongside the `THREE.Group`, called from `tick()` the same way
`miniMap.update()`/`scoreTracker.update()` already are — no new clock, no per-frame JS
loop over instances.

## Roadmap

| Phase | Work | Tracking issue |
| --- | --- | --- |
| 1 | Procedural grass sprite system (new `src/scenery/Grass.js`, generated texture, shared wind shader, corridor placement by landcover class) | Sub-issue A |
| 2 | Tree canopy upgrade: replace cone geometry with trunk + cross-quad foliage canopy in `Scenery.js`, wired to the same wind uniform | Sub-issue B |

Stretch, not currently justified by this game's scale (revisit only if grass/tree
instance counts grow far beyond the current fixed-route corridor): octahedral
impostors, WebGPU compute-driven grass, per-instance distance-based mesh swapping.

## Out of scope (considered, deliberately dropped)

- **WebGPU compute grass** — the game targets `WebGLRenderer`; adopting WebGPU is a
  much larger, unrelated change and most browsers/devices this game targets don't need
  it at this instance scale.
- **Octahedral impostor forest LOD** — solves a "tens/hundreds of thousands of trees"
  problem this fixed, real, ~2.7k-tree route doesn't have.
- **Reactive/simulated vegetation growth** — contradicts the "real, fixed baked place"
  premise already established in `docs/procedural-generation.md`'s out-of-scope
  section.
- **Shadow-casting foliage** — `shadowMap.enabled = false` globally; adding shadow cost
  for grass/trees alone would be inconsistent and expensive for the visual payoff.

## References

- [How to Make The Fluffiest Grass With Three.js — Codrops](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)
- [Grass instancing walkthrough — al-ro](https://al-ro.github.io/projects/grass/)
- [Optimizing 3M Instanced Grass in Three.js — three.js forum](https://discourse.threejs.org/t/performance-optimizing-3m-instanced-grass-in-three-js/81286)
- [A forest of octahedral impostors — three.js forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- [Making an efficient tree LOD with impostor baker+ — Medium](https://medium.com/@arnoldpaul/making-an-efficient-tree-lod-with-impostor-baker-plus-e9d152241831)
