// Shared constants for the Cut Gate terrain/route preprocessing pipeline (tools/terrain/*).
// Single source of truth so buildTerrain.js, fetchRoute.js and generatePlaceholder.js all
// agree on the same bounding box, local origin, and licensing text baked into the output
// files. See tools/terrain/README.md for how to run the pipeline.

// British National Grid (EPSG:27700) bounding box covering the Cut Gate bridleway, from
// Margery Hill in the north down to the Upper Derwent Visitor Centre (~GR172893) in the
// south, with a buffer on each side. Tightened against the actual OSM way 24188390
// geometry (real easting 418665-419395, northing 396110-398716) — the original values
// here were an illustrative estimate that didn't actually overlap the route at all,
// which put the game's spawn point outside the baked terrain grid entirely.
export const BNG_BBOX = {
  minE: 418200,
  minN: 395600,
  maxE: 419800,
  maxN: 399300,
};

export const LOCAL_ORIGIN = { easting: BNG_BBOX.minE, northing: BNG_BBOX.minN };

// Keeps the baked terrain grid small enough to commit to git and cheap to triangulate —
// targets a resulting grid within roughly 128-256 samples on its longer side.
export const TARGET_MAX_SAMPLES_PER_SIDE = 220;

// The OSM way id(s) that make up the Cut Gate bridleway, found by hand by searching
// "Cut Gate" on https://www.openstreetmap.org. Deliberately a curated list of specific
// ways rather than a fuzzy highway=bridleway/bbox query, since this is one specific known
// route. Fill this in before running fetchRoute.js.
export const OSM_WAY_IDS = [24188390];

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// overpass-api.de rejects requests that lack a descriptive User-Agent (returns 406) as an
// anti-abuse measure — identify ourselves per https://wiki.openstreetmap.org/wiki/Overpass_API#Introduction.
export const OVERPASS_USER_AGENT =
  'Peak-District-Downhill/1.0 (+https://github.com/Joe-Heffer/Peak-District-Downhill)';

export const RAW_DIR = new URL('./raw/', import.meta.url);
// DSM tiles live in their own subdirectory rather than alongside the DTM tiles in
// RAW_DIR, since buildTrees.js (unlike buildTerrain.js) needs both rasters at once and
// they'd otherwise be indistinguishable by filename alone.
export const RAW_DSM_DIR = new URL('./raw/dsm/', import.meta.url);
export const TERRAIN_OUT = new URL('../../public/data/terrain/cutgate.json', import.meta.url);
export const ROUTE_OUT = new URL('../../public/data/routes/cutgate.json', import.meta.url);
export const LANDCOVER_OUT = new URL('../../public/data/terrain/cutgate-landcover.json', import.meta.url);
export const PATHS_OUT = new URL('../../public/data/routes/cutgate-paths.json', import.meta.url);
export const TREES_OUT = new URL('../../public/data/terrain/cutgate-trees.json', import.meta.url);

export const ATTRIBUTION = {
  terrain:
    'Contains public sector information licensed under the Open Government Licence v3.0. ' +
    '© Environment Agency copyright and/or database right. Derived from the LIDAR ' +
    'Composite Digital Terrain Model (DTM).',
  route: '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).',
  trees:
    'Contains public sector information licensed under the Open Government Licence v3.0. ' +
    '© Environment Agency copyright and/or database right. Derived from the LIDAR ' +
    'Composite Digital Surface Model (DSM) minus Composite Digital Terrain Model (DTM).',
};
