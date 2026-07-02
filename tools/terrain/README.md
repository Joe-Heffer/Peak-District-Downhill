# Terrain & route data pipeline

Dev-only Node scripts (not part of the shipped browser bundle) that turn real UK open
geodata into the small baked JSON files the game loads at runtime
(`public/data/terrain/cutgate.json`, `public/data/routes/cutgate.json`). Covers a single
location for now: Cut Gate, the Peak District bridleway descent from Margery Hill down
to the Upper Derwent Visitor Centre.

## 1. Terrain — Environment Agency LIDAR

1. Go to <https://environment.data.gov.uk/survey>, draw a box around the Cut Gate area
   (see `BNG_BBOX` in `config.js` for the target bounding box in British National Grid
   easting/northing), and download the **LIDAR Composite DTM** tile(s) covering it, as
   ASCII grid (`.asc`) or GeoTIFF (`.tif`).
2. Put the downloaded tile(s) in `tools/terrain/raw/` (gitignored — not committed).
3. Run:
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

## Or: run both together

```bash
npm run terrain:build
```

## Placeholder data

`public/data/**/*.json` are generated artifacts checked into git (like a lockfile) so
the app runs without anyone having to fetch real data first. Until the two steps above
have been run with real source data, those files are a synthetic placeholder (see
`generatePlaceholder.js`) — clearly marked with `"placeholder": true` and a notice in
their `source`/`license` fields, and flagged in the in-game credits overlay. Regenerate
the placeholder with:

```bash
npm run terrain:placeholder
```

## Why this isn't fully automated

The Environment Agency LIDAR portal is a draw-a-box download UI, not a stable
unauthenticated REST endpoint suitable for scripting — the tile download in step 1 is a
manual, one-time step. Everything else is scriptable and rerunnable.
