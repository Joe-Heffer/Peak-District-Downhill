# Terrain & route data pipeline

Dev-only Node scripts (not part of the shipped browser bundle) that turn real UK open
geodata into the small baked JSON files the game loads at runtime
(`public/data/terrain/<slug>.json`, `public/data/routes/<slug>.json`,
`public/data/terrain/<slug>-landcover.json`, `public/data/routes/<slug>-paths.json`,
`public/data/terrain/<slug>-trees.json`).

The pipeline is location-generic — every script processes every location registered in
`LOCATIONS` in `config.js` by default, or just one via `--location=<slug>`, e.g.:

```bash
node tools/terrain/buildTerrain.js --location=cutgate
```

Only one location is registered today: `cutgate`, the Peak District bridleway descent
from Margery Hill down to the Upper Derwent Visitor Centre. The steps below walk through
running the pipeline for it; see "Adding a new location" at the end for extending it to a
second descent (issue #52 is the research half of picking one).

Note: `npm run terrain:build`/`terrain:trees`/`terrain:placeholder` (see "Or: run all
four together" below) chain several scripts with `&&` — a `--location=` flag passed after
`--` only reaches the last command in the chain. Run the scripts directly (as in the
steps below) when you want to target one location specifically; the npm scripts are for
the "build everything registered" case.

## 1. Terrain — Environment Agency LIDAR

1. Go to <https://environment.data.gov.uk/survey> and select the area covering the
   location's `bbox` in `config.js` (British National Grid easting/northing), either by
   drawing a box by hand, or, more precisely, via the portal's "Upload shapefile" option
   using a generated shapefile:
   ```bash
   node tools/terrain/generateAoiShapefile.js --location=cutgate
   ```
   This writes `tools/terrain/raw/aoi/cutgate-aoi.zip` (gitignored — a throwaway input to
   the portal, not baked game data), a single rectangular polygon matching the location's
   bbox in OSGB National Grid (EPSG:27700), zipped with the `.shp`/`.shx`/`.dbf`/`.prj`
   files the upload widget requires.
2. Download the **LIDAR Composite DTM** tile(s) covering that area, as ASCII grid
   (`.asc`) or GeoTIFF (`.tif`).
3. Put the downloaded tile(s) in `tools/terrain/raw/` (gitignored — not committed). Raw
   tiles are shared across all locations rather than kept in per-location folders (tiles
   are named by OS National Grid square, not by location) — just accumulate whatever
   tiles cover whichever location(s) you're building in this one directory.
4. Run:
   ```bash
   node tools/terrain/buildTerrain.js --location=cutgate
   ```
   This resamples the tile(s) onto a uniform grid covering the location's bbox and
   writes `public/data/terrain/cutgate.json`.

No account or login is required. Data is licensed under the Open Government Licence
v3.0 — see `ATTRIBUTION` in `config.js` for the exact wording baked into the output file.

## 2. Route — OpenStreetMap

1. Find the route's bridleway on <https://www.openstreetmap.org> (search its name) and
   note the way id(s) that make up the route (it's often split into a few segments).
2. Fill in `osmWayIds` for the location's entry in `LOCATIONS` in `config.js` with those
   ids.
3. Run:
   ```bash
   node tools/terrain/fetchRoute.js --location=cutgate
   ```
   This queries the public Overpass API, stitches the way segments into one ordered
   polyline, reprojects it into the same local coordinate space as the terrain, and
   writes `public/data/routes/cutgate.json`.

Data is © OpenStreetMap contributors, ODbL 1.0 — attribution required, see
`ATTRIBUTION` in `config.js`.

## 3. Landcover — OpenStreetMap

Classifies the terrain grid into `grass`/`wood`/`rock`/`heather`/`track` for terrain
tinting (`src/terrain/HeightmapTerrain.js`), by fetching `natural=wood`/`bare_rock`/
`scree`/`heath` and `landuse=forest` polygons from Overpass and testing each terrain
cell for containment, plus proximity to the route polyline for `track`. Fully
scriptable — no manual step. Must run after steps 1 and 2 for the same location, since it
reads their output files (the terrain grid's dimensions and the route's baked polyline)
rather than recomputing them, to guarantee the landcover grid stays pixel-aligned with
`heights`.

```bash
node tools/terrain/fetchLandcover.js --location=cutgate
```

This writes `public/data/terrain/cutgate-landcover.json`.

**v1 scope limit:** only simple closed OSM ways are classified as landcover polygons —
multipolygon relations (some larger woods/heaths are mapped this way) are skipped with
a warning, not classified. A documented limitation, not a bug — extend
`buildPolygons()` in `fetchLandcover.js` if broader relation support is needed later.

Same license as Route above (it's the same OSM/ODbL source).

## 4. Paths — OpenStreetMap

Renders the surrounding road/bridleway/footpath network as scenic ribbon meshes
(`src/routes/PathsOverlay.js`) — separate from, and layered under, the route's own
yellow dashed line (`src/routes/RouteOverlay.js`). Fetches `highway=*` ways from
Overpass within the same bbox as Landcover, classifies each into
road/bridleway/footpath (see `tools/terrain/pathClassification.js`), and explicitly
excludes the location's own way(s) in `osmWayIds` so the ridden route isn't rendered
twice. Fully scriptable — no manual step, and no ordering dependency on steps 1-3 (unlike
Landcover, it does not need pixel-alignment with the terrain grid).

```bash
node tools/terrain/fetchPaths.js --location=cutgate
```

This writes `public/data/routes/cutgate-paths.json`.

**v1 scope limit:** `highway=track` and horse-tagged `highway=path` are classified as
"bridleway"; `highway=path` otherwise defaults to "footpath" unless bicycle-designated —
both `track` and `path` are inherently ambiguous OSM tags; see `pathClassification.js`
for the exact rules. `highway=cycleway` (and motorway/trunk/proposed/construction ways)
are excluded entirely (out of scope per issue #76's three named categories).

Same license as Route/Landcover above (it's the same OSM/ODbL source).

## Or: run all four together

```bash
npm run terrain:build
```

## 5. Trees — LIDAR canopy height model (optional)

Places individual trees (`src/scenery/Scenery.js`) at real positions/heights instead of
scattering them randomly along the route, by deriving a canopy height model from LIDAR —
see issue #50. Reuses the same DTM tile(s) from step 1, plus a **second**, separately
downloaded raster:

1. On the EA survey portal, select the **"LIDAR Composite First Return DSM"** product
   (not "Composite DTM", not "Composite Last Return DSM", not "Point Cloud" — those are
   easy to mis-pick from the dropdown). First Return is required, not Last Return:
   first-pulse returns hit the tops of tree canopies, which is what `nDSM = DSM - DTM`
   needs to find canopy apexes; Last Return tends to penetrate closer to the ground
   through gaps in the canopy and would under-count tree heights.
2. Download the tile(s) for the same 24 OS National Grid squares as the DTM in step 1
   (covering the location's bbox) — as of Cut Gate's bbox, that's:
   ```
   SE10se  SE20sw
   SK07ne  SK08se  SK09se
   SK17ne  SK18ne  SK18nw  SK18se  SK19ne  SK19nw  SK19se  SK19sw
   SK27nw  SK28ne  SK28nw  SK28se  SK28sw  SK29nw  SK29sw
   SK38nw  SK39ne  SK39nw  SK39se  SK39sw
   ```
   (Derive this list yourself instead by running `ls tools/terrain/raw/*.tif` and
   stripping the `_DTM_1m.tif` suffix — it must always match the DTM tiles you already
   have, since `buildTrees.js` samples both rasters at the same eastings/northings. If a
   location's `bbox` in `config.js` ever changes, regenerate this list the same way
   rather than trusting the one above.)
3. Put the downloaded tile(s) in `tools/terrain/raw/dsm/` (gitignored, separate from the
   DTM tiles in `tools/terrain/raw/` so the two rasters aren't confused with each other).
4. Run:
   ```bash
   node tools/terrain/buildTrees.js --location=cutgate
   ```
   This computes `nDSM = DSM - DTM` over a finer grid than the terrain heights grid
   (individual tree crowns are only a few metres across), finds local canopy apexes
   (`tools/terrain/treeDetection.js`) above a minimum height and separation, and writes
   `public/data/terrain/cutgate-trees.json`.

Kept as its own optional step (not part of `npm run terrain:build`) since DSM coverage
on the EA portal is patchier than DTM coverage in some upland areas — the rest of the
pipeline should keep working even where DSM tiles for this bbox aren't available yet.

Same license as Terrain above (it's the same EA/OGL source).

## Placeholder data

`public/data/**/*.json` are generated artifacts checked into git (like a lockfile) so
the app runs without anyone having to fetch real data first. Until the steps above have
been run with real source data, those files are a synthetic placeholder (see
`generatePlaceholder.js`) — clearly marked with `"placeholder": true` and a notice in
their `source`/`license` fields, and flagged in the in-game credits overlay. Regenerate
the placeholder with:

```bash
npm run terrain:placeholder
```

## Why this isn't fully automated

The Environment Agency LIDAR portal is a browser download UI, not a stable
unauthenticated REST endpoint suitable for scripting — selecting the area and downloading
the tile(s) (steps 1-2 above, and step 5's DSM download) is a manual, one-time step, even
though `generateAoiShapefile.js` can produce the area-of-interest upload for you.
Everything else is scriptable and rerunnable.

## Adding a new location

The pipeline scripts don't hardcode Cut Gate — they read from `LOCATIONS` in
`config.js`, so a second (or third) real descent is a matter of researching it and
registering it, not writing new pipeline code:

1. Pick a candidate descent (see issue #52 for candidate research: OSM/PROW
   cross-checking, Natural England access-land status).
2. Add an entry to `LOCATIONS` in `config.js` with a new `slug` (used to derive every
   output filename, e.g. `public/data/terrain/<slug>.json`), a display `name`, its BNG
   `bbox`, and (once you've found them on openstreetmap.org) its `osmWayIds`. Leave
   `osmWayIds: []` until you've done that research — `fetchRoute.js`/`fetchPaths.js`
   throw a clear error if it's still empty when you try to fetch.
3. Run steps 1-5 above for that location, passing `--location=<slug>` to each script.
4. Add a matching entry to `COURSES` in `src/courses/courses.js` (`id` must equal the
   pipeline's `slug`) so the in-game course-select overlay offers it — see the comment
   there for how `main.js` derives data file URLs from `id`.

`npm run terrain:build`/`terrain:trees`/`terrain:placeholder` process every registered
location by default once more than one exists, so adding a location doesn't change how
those commands are invoked — it just means they now do more work.
