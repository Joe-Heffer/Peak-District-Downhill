# Atmosphere: sky, lighting, fog and ground mist

Prompted by issue #156 pointing out a gap in the sky/lighting/fog system built for #19:
distance fog alone can't sell "moody valley mist" on terrain with real elevation relief.
This doc covers the atmosphere system as it stands today and the height-based ground
mist layered on top of it, and gives the other open, related issue (#144, changeable
weather) a documented starting point.

## Current state

`src/scene/setupSky.js` is the atmosphere system: `SKY_PRESETS` defines five static,
randomly-picked-per-session presets (`dawn`, `goldenHour`, `overcastMidday`, `dusk`,
`night`), each bundling a `Sky` shader configuration (`turbidity`/`rayleigh`/
`mieCoefficient`/`mieDirectionalG` plus custom `cloudCoverage`/`cloudDensity`
uniforms), sun/moon direction, `dirLight`/`hemiLight` colour and intensity, distance fog
(`fogColor`/`fogNear`/`fogFar` → `THREE.Fog`), and renderer tone mapping exposure.
`applySky({ scene, camera, renderer, dirLight, hemiLight })` builds the sky dome and
points every one of those systems at the chosen preset; for `night` it additionally adds
a moon disc and a star field. The sky dome, moon and stars all re-centre on the camera
every frame via `onBeforeRender` closures, so they read as "infinitely far" without any
`main.js` tick-loop wiring. `?sky=<name>` overrides the random pick for manual tuning.
`src/scene/setupScene.js` wires this into the renderer/scene/camera and forwards the
chosen preset out to `main.js`.

Until #156, the only fog was `THREE.Fog`'s pure distance falloff — density depending
only on how far a point is from the camera, with no regard for terrain height. Cut
Gate's real LIDAR terrain (`public/data/terrain/cutgate.json`, ~250m of elevation relief
across the route) has genuine ridges and gullies, but fog looked identical whether the
bike was up on a ridge or down in a dip.

## Constraints

- **No heavy post-processing.** Established by #19 and reaffirmed by #156: no
  `EffectComposer`/render-pass budget. `package.json` has no postprocessing dependency;
  `src/main.js`'s render loop is a single direct `renderer.render(scene, camera)` call.
- **Chunked terrain mesh (issue #71).** `src/terrain/HeightmapTerrain.js`'s
  `buildTerrainLOD` tiles the course into a grid of `THREE.LOD` chunks (each with 1-3
  decimated geometries swapped by distance to camera) rather than one `BufferGeometry` —
  any atmosphere effect that touches terrain rendering has to work with many meshes
  sharing one material, not a single mesh/geometry.
- **Static per-session presets, not a live cycle.** `SKY_PRESETS` is chosen once per
  page load, not simulated continuously — matches `docs/procedural-generation.md`'s
  "one fixed real location baked at build time" premise. A live day/night cycle is
  future scope, not assumed here (see #144 below).
- **Mobile budget.** `shadowMap.enabled = false` globally (`setupScene.js`); touch
  controls imply lower-power devices are a real target, not just desktop.

## Design: height-based ground mist (#156)

**The problem with a terrain-only shader hook.** One option considered was an
`onBeforeCompile` hook on the terrain's `MeshStandardMaterial`
(`src/terrain/HeightmapTerrain.js`) mixing extra fog density in by world-space vertex
height. That only affects the terrain mesh's own fragments — trees, rocks, grass and the
bike standing in a misty dip wouldn't read as "in the mist" unless the same hook were
duplicated across `Scenery.js`'s/`Grass.js`'s/`BikeController.js`'s materials too, a
bigger fan-out than the issue's "keep it lightweight" ask justifies.

**The chosen approach: camera-following layered mist discs**
(`src/scene/GroundMist.js`, `buildGroundMist(terrain, preset)`). Three stacked,
semi-transparent, alpha-gradiented `THREE.CircleGeometry` discs (not one hard-edged
sheet — `LAYER_FRACTIONS`/`LAYER_WEIGHTS` place them at increasing height with
decreasing opacity for a soft "wall of mist" gradient), textured with a shared,
in-code-generated radial-gradient canvas texture (same no-external-asset pattern as
`HeightmapTerrain.js`'s `createPlaceholderGroundTexture()`). Real 3D geometry gets
correct depth-buffer occlusion for free: rendered with default `depthTest: true`, a disc
is naturally clipped by anything nearer (a ridge poking through) and blends over
anything farther (a dip, and any tree/rock/bike standing in it) — no custom per-fragment
height math needed. `depthWrite: false` avoids z-fighting between the three overlapping
layers. `fog: false` on the mist material is deliberate: the mist itself *is* extra fog,
so also subjecting it to the scene's own distance `THREE.Fog` would double-fade it; the
whole group is still ordinary transparent scene geometry, so distance fog naturally
swallows it at range regardless.

The group is **camera-relative**, not pinned to a fixed world-space Y (e.g.
`terrain.data.minElevation`) — a fixed global band, viewed from a high ridge looking
into a distant valley, would be seen nearly edge-on and barely register. Each frame,
`update(camera, dt)` samples `terrain.getHeightAt(camera.position.x,
camera.position.z)` (the same bilinear height lookup shared by physics/bike/route code)
and repositions all three layers to that local ground height plus their fraction of
`preset.mistHeight`, so nearby dips within `preset.mistRadius` fall below the mist and
read misty while nearby high ground pokes above it and reads clear — and adds a small
independent rotation drift per layer for a living, non-static feel.

## Shared tuning surface

`fogColor`/`fogNear`/`fogFar` (distance fog) and `mistColor`/`mistOpacity`/
`mistHeight`/`mistRadius` (ground mist) all hang off the same `SKY_PRESETS` entry that
`applySky()` returns — one preset object, one place to tune a time-of-day's whole
atmosphere. `mistOpacity <= 0` is the single gate `GroundMist.js` uses to skip building
the mist layer entirely for a preset (`overcastMidday`), so no call site needs a
null-check — `buildGroundMist` always returns a real `THREE.Group` with a working
`update`, empty or not.

| preset | mistColor | mistOpacity | mistHeight | mistRadius |
| --- | --- | --- | --- | --- |
| dawn | `#cfd3d6` | 0.55 | 14m | 220m |
| goldenHour | `#e8c9a0` | 0.25 | 8m | 180m |
| overcastMidday | `#c7cdd0` | 0 (none) | 6m | 150m |
| dusk | `#8f96b0` | 0.4 | 12m | 200m |
| night | `#141a2e` | 0.6 | 16m | 240m |

## Roadmap

| Phase | Work | Tracking issue |
| --- | --- | --- |
| 1 | Sky dome, dynamic per-preset lighting, distance fog, moon/stars | Landed — #19 |
| 2 | Height-based ground mist layered on top of distance fog | This doc — #156 |
| 3 | Changeable/dynamic weather (rain, live transitions, etc.) | #144 |

## Out of scope (considered, deliberately dropped)

- **A shared `onBeforeCompile` height-fog mixin across every material** — more
  physically correct (real per-fragment height rather than a proxy disc) but multiplies
  integration points across terrain/rocks/trees/grass/bike materials. Revisit only if
  the disc silhouette proves visually insufficient.
- **Volumetric or screen-space fog** — exactly the "heavy post-processing" budget #19
  already ruled out for this project.
- **A fixed world-space mist band** tied to `terrain.data.minElevation` — considered and
  dropped: seen from a high ridge looking into a distant valley, a horizontal plane at a
  single fixed height is nearly edge-on and barely visible, defeating the point.
- **Live day/night cycling** — `#144`'s territory, not assumed by this design.

## References

- #19 — base sky/lighting/fog system this builds on
- #156 — height-based ground fog / valley mist
- #144 — changeable weather (future work)
- `docs/vegetation-rendering.md` — sibling design doc, same house style
