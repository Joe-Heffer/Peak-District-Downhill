# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Peak District Downhill is a browser-based 3D mountain biking game rendered with
[Three.js](https://threejs.org/) and simulated with [cannon-es](https://github.com/pmndrs/cannon-es),
built and served with [Vite](https://vitejs.dev/). Plain JavaScript (ES modules) —
no TypeScript, no UI framework, no test runner, no linter currently configured.

## Commands

```bash
npm install                  # install dependencies
npm run dev                  # start the Vite dev server (--host)
npm run build                # production build, outputs to dist/
npm run preview              # preview the production build (--host)
npm run terrain:build        # rerun the LIDAR+OSM pipeline (see tools/terrain/README.md)
npm run terrain:placeholder  # regenerate the synthetic placeholder data
```

There is no test or lint command yet. `npm run build` is the only automated
correctness check (run by CI on every push/PR to `main`).

## Structure

- `index.html` — page shell, loads `src/main.js` as a module script.
- `src/main.js` — async `init()`: loads baked terrain/route/landcover JSON, then wires
  up the scene, physics world, bike, and input, then runs the render/physics tick loop.
  Also spawns the bike at `routeData.points[0]` and renders the in-game credits/notice
  text (into `#credits`): a placeholder-data warning when terrain, route, or landcover
  data has `placeholder: true`, otherwise the real OGL/ODbL attribution line.
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
  coupling, but `main.js` does use the route's first point to place the bike's spawn.
- `vite.config.js` — sets `base` to `/Peak-District-Downhill/` under GitHub Actions
  (GitHub Pages subpath), `/` otherwise. Runtime `fetch()` calls for terrain/route data
  must build their URL from `import.meta.env.BASE_URL`, not a hardcoded leading slash,
  or they 404 under the Pages subpath.

## Terrain & route data

The game currently models one real location: Cut Gate, a Peak District bridleway
descent. `tools/terrain/` is a dev-only, rerunnable Node pipeline (`npm run
terrain:build`) that turns Environment Agency LIDAR elevation data and OpenStreetMap
route/landcover data into the three baked JSON files under `public/data/` that the app
fetches at runtime — see `tools/terrain/README.md` for the manual LIDAR download step
and how to rerun it. The pipeline relies on the `geotiff` devDependency to parse LIDAR
GeoTIFF tiles and `proj4` to reproject OSM's WGS84 coordinates into British National
Grid. `public/data/**/*.json` are committed generated artifacts, like a lockfile;
until real source data has been processed they hold a synthetic placeholder (`npm run
terrain:placeholder`), clearly marked via a `placeholder: true` field.

The terrain mesh (`src/terrain/HeightmapTerrain.js`) and the physics heightfield
(`src/physics/setupWorld.js`) are built from the exact same `heights[i][j]` array with a
deliberately matched axis mapping (`i`→world x, `j`→world `-z`, value→world y, achieved
via the heightfield body's -90°-about-X rotation) so they stay pixel-aligned. Don't
change one side's indexing/rotation without updating the other to match.

## CI/CD

- `.github/workflows/ci.yml` — installs and builds on push/PR to `main`.
- `.github/workflows/deploy.yml` — builds and deploys `dist/` to GitHub Pages on push
  to `main`, or on manual `workflow_dispatch`.
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
