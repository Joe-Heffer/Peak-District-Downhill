# Terrain & route data pipeline

Dev-only Node scripts (not part of the shipped browser bundle) that turn real UK open
geodata into the small baked JSON files the game loads at runtime
(`public/data/terrain/cutgate.json`, `public/data/routes/cutgate.json`,
`public/data/terrain/cutgate-landcover.json`). Covers a single location for now: Cut
Gate, the Peak District bridleway descent from Margery Hill down to the Upper Derwent
Visitor Centre.

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

## Or: run all three together

```bash
npm run terrain:build
```

## Placeholder data

`public/data/**/*.json` are generated artifacts checked into git (like a lockfile) so
the app runs without anyone having to fetch real data first. Until the three steps above
have been run with real source data, those files are a synthetic placeholder (see
`generatePlaceholder.js`) — clearly marked with `"placeholder": true` and a notice in
their `source`/`license` fields, and flagged in the in-game credits overlay. Regenerate
the placeholder with:

```bash
npm run terrain:placeholder
```

## Why this isn't fully automated

The Environment Agency LIDAR portal is a browser download UI, not a stable
unauthenticated REST endpoint suitable for scripting — selecting the area and downloading
the tile(s) (steps 1-2 above) is a manual, one-time step, even though
`generateAoiShapefile.js` can produce the area-of-interest upload for you. Everything else
is scriptable and rerunnable.
