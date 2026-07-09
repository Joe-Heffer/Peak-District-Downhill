# Terrain & route data pipeline

Dev-only Node scripts (not part of the shipped browser bundle) that turn real UK open
geodata into the small baked JSON files the game loads at runtime
(`public/data/terrain/cutgate.json`, `public/data/routes/cutgate.json`,
`public/data/terrain/cutgate-landcover.json`, `public/data/routes/cutgate-paths.json`,
`public/data/terrain/cutgate-trees.json`, `public/data/terrain/cutgate-buildings.json`,
`public/data/terrain/cutgate-water.json`, `public/data/terrain/cutgate-groundtexture.json`)
plus one baked image asset (`public/assets/textures/ground.jpg`). Covers a single location
for now: Cut Gate, the Peak District bridleway descent from Margery Hill down to the Upper
Derwent Visitor Centre.

## 1. Terrain — Environment Agency LIDAR

1. Go to <https://environment.data.gov.uk/survey> and select the area covering
   `BNG_BBOX` in `config.js` (British National Grid easting/northing), either by drawing
   a box by hand, or, more precisely, via the portal's "Upload shapefile" option using a
   generated shapefile:
   ```bash
   node tools/terrain/generateAoiShapefile.js
   ```
   This writes `tools/terrain/raw/aoi/cutgate-aoi.zip` (gitignored — a throwaway input to
   the portal, not baked game data), a single rectangular polygon matching `BNG_BBOX` in
   OSGB National Grid (EPSG:27700), zipped with the `.shp`/`.shx`/`.dbf`/`.prj` files the
   upload widget requires.
2. Download the **LIDAR Composite DTM** tile(s) covering that area, as ASCII grid
   (`.asc`) or GeoTIFF (`.tif`).
3. Put the downloaded tile(s) in `tools/terrain/raw/` (gitignored — not committed).
4. Run:
   ```bash
   node tools/terrain/buildTerrain.js
   ```
   This resamples the tile(s) onto a uniform grid covering `BNG_BBOX` and writes
   `public/data/terrain/cutgate.json`.

No account or login is required. Data is licensed under the Open Government Licence
v3.0 — see `ATTRIBUTION` in `config.js` for the exact wording baked into the output file.

## 2. Route — OpenStreetMap

1. Find the Cut Gate bridleway on <https://www.openstreetmap.org> (search "Cut Gate")
   and note the way id(s) that make up the route (it's often split into a few segments).
2. Fill in `OSM_WAY_IDS` in `config.js` with those ids.
3. Run:
   ```bash
   node tools/terrain/fetchRoute.js
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
scriptable — no manual step. Must run after steps 1 and 2, since it reads their output
files (`cutgate.json`'s grid dimensions and the route's baked polyline) rather than
recomputing them, to guarantee the landcover grid stays pixel-aligned with `heights`.

```bash
node tools/terrain/fetchLandcover.js
```

This writes `public/data/terrain/cutgate-landcover.json`.

**v1 scope limit:** only simple closed OSM ways are classified as landcover polygons —
multipolygon relations (some larger woods/heaths are mapped this way) are skipped with
a warning, not classified. A documented limitation, not a bug — extend
`buildPolygons()` in `fetchLandcover.js` if broader relation support is needed later.

Same license as Route above (it's the same OSM/ODbL source).

## 4. Paths — OpenStreetMap

Renders the surrounding road/bridleway/footpath network as scenic ribbon meshes
(`src/routes/PathsOverlay.js`) — separate from, and layered under, the Cut Gate route's
own yellow dashed line (`src/routes/RouteOverlay.js`). Fetches `highway=*` ways from
Overpass within the same `BNG_BBOX` as Landcover, classifies each into
road/bridleway/footpath (see `tools/terrain/pathClassification.js`), and explicitly
excludes the Cut Gate way(s) in `OSM_WAY_IDS` so the ridden route isn't rendered twice.
Fully scriptable — no manual step, and no ordering dependency on steps 1-3 (unlike
Landcover, it does not need pixel-alignment with the terrain grid).

```bash
node tools/terrain/fetchPaths.js
```

This writes `public/data/routes/cutgate-paths.json`.

**v1 scope limit:** `highway=track` and horse-tagged `highway=path` are classified as
"bridleway"; `highway=path` otherwise defaults to "footpath" unless bicycle-designated —
both `track` and `path` are inherently ambiguous OSM tags; see `pathClassification.js`
for the exact rules. `highway=cycleway` (and motorway/trunk/proposed/construction ways)
are excluded entirely (out of scope per issue #76's three named categories).

Same license as Route/Landcover above (it's the same OSM/ODbL source).

## 5. Buildings — OpenStreetMap

Bakes real building footprints near the route (dam buildings, barns, farm buildings —
see issue #49) for `src/scenery/Buildings.js` to extrude into simple flat-roofed boxes.
Fetches `building=*` ways from Overpass within the same `BNG_BBOX` as Landcover/Paths,
and estimates an extrusion height per footprint from its `height`/`building:levels`
tags, falling back to a flat default (`DEFAULT_BUILDING_HEIGHT` in
`buildingClassification.js`) for untagged barns/outbuildings. Fully scriptable — no
manual step, no ordering dependency on steps 1-4.

```bash
node tools/terrain/fetchBuildings.js
```

This writes `public/data/terrain/cutgate-buildings.json`.

**v1 scope limit:** only simple closed OSM ways are baked as building footprints —
multipolygon relations (some larger structures, e.g. dam buildings, can be mapped this
way) are skipped with a warning, same documented limitation as Landcover's
`buildPolygons()`.

Same license as Route/Landcover/Paths above (it's the same OSM/ODbL source).

## 6. Water — OpenStreetMap

Bakes real water features near the route — Howden and Derwent Reservoirs, and the
rivers/streams feeding them (see issue #49) — for `src/scenery/Water.js` to render as a
flat tinted plane (lakes/reservoirs) or a terrain-following ribbon (rivers/streams, same
technique as Paths above). Fetches `natural=water`/`landuse=reservoir` polygons and
`waterway=river`/`stream` ways from Overpass within `BNG_BBOX`. Fully scriptable — no
manual step, no ordering dependency on steps 1-5.

```bash
node tools/terrain/fetchWater.js
```

This writes `public/data/terrain/cutgate-water.json`.

**v1 scope limit:** only simple closed OSM ways are baked as water polygons —
multipolygon relations (some larger reservoirs can be mapped this way) are skipped with
a warning, same documented limitation as Buildings/Landcover above.

Same license as Route/Landcover/Paths/Buildings above (it's the same OSM/ODbL source).

## Or: run all six together

```bash
npm run terrain:build
```

## 7. Trees — LIDAR canopy height model (optional)

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
   (covering `BNG_BBOX`) — as of this bbox, that's:
   ```
   SE10se  SE20sw
   SK07ne  SK08se  SK09se
   SK17ne  SK18ne  SK18nw  SK18se  SK19ne  SK19nw  SK19se  SK19sw
   SK27nw  SK28ne  SK28nw  SK28se  SK28sw  SK29nw  SK29sw
   SK38nw  SK39ne  SK39nw  SK39se  SK39sw
   ```
   (Derive this list yourself instead by running `ls tools/terrain/raw/*.tif` and
   stripping the `_DTM_1m.tif` suffix — it must always match the DTM tiles you already
   have, since `buildTrees.js` samples both rasters at the same eastings/northings. If
   `BNG_BBOX` in `config.js` ever changes, regenerate this list the same way rather than
   trusting the one above.)
3. Put the downloaded tile(s) in `tools/terrain/raw/dsm/` (gitignored, separate from the
   DTM tiles in `tools/terrain/raw/` so the two rasters aren't confused with each other).
4. Run:
   ```bash
   npm run terrain:trees
   ```
   This computes `nDSM = DSM - DTM` over a finer grid than the terrain heights grid
   (individual tree crowns are only a few metres across), finds local canopy apexes
   (`tools/terrain/treeDetection.js`) above a minimum height and separation, and writes
   `public/data/terrain/cutgate-trees.json`.

Kept as its own optional step (not part of `npm run terrain:build`) since DSM coverage
on the EA portal is patchier than DTM coverage in some upland areas — the rest of the
pipeline should keep working even where DSM tiles for this bbox aren't available yet.

Same license as Terrain above (it's the same EA/OGL source).

## 8. Ground texture — Environment Agency aerial photography (optional)

Bakes a real, licensed aerial-photography ground texture for
`src/terrain/HeightmapTerrain.js` — see issue #51. `HeightmapTerrain.js` tiles a single
small square texture every 10m across the whole terrain mesh, so this doesn't drape a
full orthophoto over the route; it crops one small, visually homogeneous sample area
(`TEXTURE_SAMPLE_AREA` in `config.js`, picked by hand away from paths/buildings/water,
which already have their own overlays) and makes that seamlessly tileable.

1. On the same <https://environment.data.gov.uk/survey> portal as step 1 (no new account
   needed), select the **Aerial Photography for Great Britain (APGB)** or **Vertical
   Aerial Photography (VAP)** product for the area covering `BNG_BBOX` (reuse the same
   `generateAoiShapefile.js` shapefile upload as step 1).
2. Download the GeoTIFF tile(s) and put them in `tools/terrain/raw/aerial/` (gitignored,
   separate from the DTM/DSM tiles for the same reason `raw/dsm/` is separate from
   `raw/`).
3. Inspect the downloaded imagery and, if the default `TEXTURE_SAMPLE_AREA` centre point
   in `config.js` (the bbox centroid) lands somewhere unsuitable — a building, a path, an
   awkward field boundary — pick a better easting/northing by hand and update it there,
   same as `OSM_WAY_IDS` above.
4. Run:
   ```bash
   npm run terrain:texture
   ```
   This crops the sample area, blends its edges so it tiles without an obvious seam, and
   writes `public/assets/textures/ground.jpg` and
   `public/data/terrain/cutgate-groundtexture.json`.

**v1 scope limit:** `TEXTURE_SAMPLE_AREA` must fall entirely within a single downloaded
tile — no mosaicking across tile boundaries, same kind of documented limitation as
Landcover/Buildings/Water's multipolygon-relation skip.

Kept as its own optional step (not part of `npm run terrain:build`), same reasoning as
Trees above — until it's run, `HeightmapTerrain.js`'s existing procedural canvas texture
is used instead (see "Placeholder data" below).

Same license as Terrain/Trees above (it's the same EA/OGL source).

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
the tile(s) (steps 1-2 above, step 7's DSM download, and step 8's aerial photography
download) is a manual, one-time step, even though `generateAoiShapefile.js` can produce
the area-of-interest upload for you. Everything else is scriptable and rerunnable.
