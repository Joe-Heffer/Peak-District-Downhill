# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Peak District Downhill is a browser-based 3D mountain biking game rendered with
[Three.js](https://threejs.org/) and simulated with [cannon-es](https://github.com/pmndrs/cannon-es),
built and served with [Vite](https://vitejs.dev/). Plain JavaScript (ES modules) —
no TypeScript, no UI framework, no linter currently configured.

## Commands

```bash
npm install                  # install dependencies
npm run dev                  # start the Vite dev server (--host)
npm run build                # production build, outputs to dist/
npm run preview              # preview the production build (--host)
npm test                     # run the Vitest unit suite once (src/**/*.test.js)
npx vitest                   # unit tests in interactive watch mode
npm run test:e2e             # Playwright e2e smoke test (needs `npm run build` first)
npm run terrain:build        # rerun the LIDAR+OSM pipeline (see tools/terrain/README.md)
npm run terrain:placeholder  # regenerate the synthetic placeholder data
```

`npm run build`, `npm test`, and `npm run test:e2e` all run in CI (as independent
parallel jobs) on every push/PR to `main`. There is still no linter configured.

## Structure

- `index.html` — page shell, loads `src/main.js` as a module script.
- `src/main.js` — async `init()`: shows the course-select overlay (`src/courses/`) and
  awaits the player's choice, then loads that course's baked terrain/route/landcover/trees
  JSON, then wires up the scene, physics world, bike, and input, then runs the
  render/physics tick loop. Also spawns the bike at `routeData.points[0]` and renders the
  in-game credits/notice text (into `#credits`): a placeholder-data warning when any of
  those datasets has `placeholder: true`, otherwise the real OGL/ODbL attribution line.
- `src/courses/` — `courses.js` is the course registry (currently one entry, Cut Gate,
  manually maintained until #47 generalizes `tools/terrain/` into a multi-location
  pipeline that could generate it instead); `CourseSelect.js` is the pre-run overlay that
  lets the player pick a course before `main.js` loads its data, remembering the last
  choice in `localStorage`; `courseGeometry.js` projects each course's real-world BNG bbox
  onto the overview map so marker positions stay derived from route data, not hardcoded
  per-course pixels.
- `src/scene/setupScene.js` — Three.js scene, camera, renderer, lighting. Does not build
  any ground mesh itself — `main.js` adds the loaded terrain mesh.
- `src/physics/setupWorld.js` — cannon-es world and a `CANNON.Heightfield` ground body
  built from the same baked elevation grid as the visual terrain mesh.
- `src/bike/BikeController.js` — bike mesh/body, steering, jump, camera follow,
  terrain-aware grounding (samples the shared height-lookup, not a hardcoded height).
- `src/input/InputController.js` — keyboard and on-screen touch control state.
- `src/terrain/` — loads `public/data/terrain/*.json` (elevation + landcover) and builds
  the terrain mesh + the `getHeightAt(x, z)` lookup shared by physics and the route
  overlay. Landcover drives per-vertex tint colors (grass/wood/rock/heather/track) on
  the mesh's single `MeshStandardMaterial`, blended via `vertexColors`.
- `src/routes/` — loads `public/data/routes/*.json` and renders the route as a
  decorative trail line on the terrain. `RouteOverlay.js` itself has no gameplay
  coupling, but `main.js` does use the route's first point (via the shared
  `routePointToWorld` helper) to place the bike's spawn.
- `src/procgen/` — small composable pipeline (`sampleAlongRoute` → `jitterLateral` →
  `filterByLandcover` → `groundPoints` → `toInstanceMatrices`, plus `buildRouteCurve`
  and the shared `createRandom` seeded PRNG) for scattering content along the route.
  Each stage is a pure function with its own colocated test; see
  `docs/procedural-generation.md`. Currently consumed by `Scenery.js` (rocks) and
  `Grass.js` (grass sprites) — new scattered content types should compose these stages
  rather than writing bespoke scatter code.
- `src/scenery/Scenery.js` — purely decorative `InstancedMesh` trees, rocks, and grass.
  Trees are placed at real positions/heights from `public/data/terrain/cutgate-trees.json`
  (LIDAR-derived canopy data, see below), not randomly; rocks and grass (`Grass.js`) are
  seeded random scatters within the route corridor, built through `src/procgen/`.
  `buildScenery()` returns a `THREE.Group` with an `update(dt)` attached, which advances
  the shared `uTime` uniform grass's wind-sway shader reads — `main.js`'s `tick()` calls
  it once per frame alongside `miniMap.update()`/`scoreTracker.update()`.
- `vite.config.js` — sets `base` to `/Peak-District-Downhill/` under GitHub Actions
  (GitHub Pages subpath), `/` otherwise. Runtime `fetch()` calls for terrain/route data
  must build their URL from `import.meta.env.BASE_URL`, not a hardcoded leading slash,
  or they 404 under the Pages subpath.

## Terrain & route data

The game currently models one real location: Cut Gate, a Peak District bridleway
descent. `tools/terrain/` is a dev-only, rerunnable Node pipeline (`npm run
terrain:build`) that turns Environment Agency LIDAR elevation data and OpenStreetMap
route/landcover data into baked JSON files under `public/data/` that the app fetches at
runtime — see `tools/terrain/README.md` for the manual LIDAR download step and how to
rerun it. The pipeline relies on the `geotiff` devDependency to parse LIDAR GeoTIFF
tiles and `proj4` to reproject OSM's WGS84 coordinates into British National Grid.
`public/data/**/*.json` are committed generated artifacts, like a lockfile; until real
source data has been processed they hold a synthetic placeholder (`npm run
terrain:placeholder`), clearly marked via a `placeholder: true` field.

`public/data/terrain/cutgate-trees.json` (real tree positions/heights, consumed by
`src/scenery/Scenery.js`) is a separate, optional pipeline step — `npm run
terrain:trees` (`tools/terrain/buildTrees.js`) — derived from a canopy height model
(LIDAR Composite DSM minus DTM). Not part of `npm run terrain:build` since it needs a
second manually-downloaded raster (the DSM) beyond the DTM the rest of the pipeline
already requires; see `tools/terrain/README.md` step 5.

The terrain mesh (`src/terrain/HeightmapTerrain.js`) and the physics heightfield
(`src/physics/setupWorld.js`) are built from the exact same `heights[i][j]` array with a
deliberately matched axis mapping (`i`→world x, `j`→world `-z`, value→world y, achieved
via the heightfield body's -90°-about-X rotation) so they stay pixel-aligned. Don't
change one side's indexing/rotation without updating the other to match.

## Tests

- Unit tests (Vitest) are colocated as `src/**/*.test.js`/`tools/**/*.test.js` next to
  the module they cover — e.g. `src/terrain/HeightmapTerrain.test.js`,
  `src/physics/setupWorld.test.js`, `src/routes/RouteOverlay.test.js`,
  `src/scenery/Scenery.test.js`, `src/input/InputController.test.js` (runs under jsdom
  via a `// @vitest-environment jsdom` docblock), `src/bike/BikeController.test.js`,
  `tools/terrain/pathClassification.test.js`, `tools/terrain/treeDetection.test.js`.
  Most run under Vitest's default `node` environment using real `three`/`cannon-es`
  objects with a stub `terrain`, no DOM needed.
- The e2e smoke test (`e2e/smoke.spec.js`, Playwright) boots `vite preview` and checks
  the canvas renders, there are no console/page errors, `#credits` shows the correct
  placeholder-vs-real-data text, and the mute button toggles — this is what catches the
  GitHub Pages `base`/`BASE_URL` subpath class of bug.

## CI/CD

- `.github/workflows/ci.yml` — installs and builds, runs the Vitest unit suite, and
  runs the Playwright e2e smoke suite (three independent parallel jobs) on push/PR to
  `main`.
- `.github/workflows/deploy.yml` — builds and deploys `dist/` to GitHub Pages on push
  to `main`, or on manual `workflow_dispatch`.
- `.github/workflows/itch-deploy.yml` — builds with `npm run build:itch` and publishes
  `dist-itch/` to itch.io via `butler` (see `docs/itch-io.md`) on push to `main`, or on
  manual `workflow_dispatch`.
- `.github/workflows/release-please.yml` — maintains a release PR and cuts GitHub
  Releases from Conventional Commits on `main` (config: `release-please-config.json`,
  `.release-please-manifest.json`).

Neither `ci.yml` nor `deploy.yml` ever regenerates terrain/route data — both just run
`npm run build`, which uses whatever is already committed under `public/data/`.
Regenerating that data is a manual, local `npm run terrain:build` step (see above).

## Commit conventions

Commits on `main` must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, etc.) — release-please parses them to determine
version bumps and changelog entries. See `CONTRIBUTING.md` for details.
