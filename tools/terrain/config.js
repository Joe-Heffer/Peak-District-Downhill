// Shared constants for the Cut Gate terrain/route preprocessing pipeline (tools/terrain/*).
// Single source of truth so buildTerrain.js, fetchRoute.js and generatePlaceholder.js all
// agree on the same bounding box, local origin, and licensing text baked into the output
// files. See tools/terrain/README.md for how to run the pipeline.

// British National Grid (EPSG:27700) bounding box covering the Cut Gate bridleway, from
// Margery Hill in the north down to the Upper Derwent Visitor Centre (~GR172893) in the
// south, with a buffer on each side. These are an illustrative starting estimate from the
// route's known grid references, not a survey — confirm/tighten them against the actual
// OSM way geometry once OSM_WAY_IDS below is filled in.
export const BNG_BBOX = {
  minE: 417000,
  minN: 388500,
  maxE: 418200,
  maxN: 393200,
};

export const LOCAL_ORIGIN = { easting: BNG_BBOX.minE, northing: BNG_BBOX.minN };

// Keeps the baked terrain grid small enough to commit to git and cheap to triangulate —
// targets a resulting grid within roughly 128-256 samples on its longer side.
export const TARGET_MAX_SAMPLES_PER_SIDE = 220;

// The OSM way id(s) that make up the Cut Gate bridleway, found by hand by searching
// "Cut Gate" on https://www.openstreetmap.org. Deliberately a curated list of specific
// ways rather than a fuzzy highway=bridleway/bbox query, since this is one specific known
// route. Fill this in before running fetchRoute.js.
export const OSM_WAY_IDS = [];

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export const RAW_DIR = new URL('./raw/', import.meta.url);
export const TERRAIN_OUT = new URL('../../public/data/terrain/cutgate.json', import.meta.url);
export const ROUTE_OUT = new URL('../../public/data/routes/cutgate.json', import.meta.url);

export const ATTRIBUTION = {
  terrain:
    'Contains public sector information licensed under the Open Government Licence v3.0. ' +
    '© Environment Agency copyright and/or database right. Derived from the LIDAR ' +
    'Composite Digital Terrain Model (DTM).',
  route: '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).',
};
