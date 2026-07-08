// Shared constants and the location registry for the terrain/route preprocessing
// pipeline (tools/terrain/*). Each entry in LOCATIONS is a self-contained real-world
// descent — its own BNG bounding box and OSM way id(s) — that buildTerrain.js,
// fetchRoute.js, fetchLandcover.js, fetchPaths.js, buildTrees.js and
// generatePlaceholder.js can all be pointed at via `--location=<slug>` (see
// resolveLocationSlugs below and tools/terrain/README.md for how to add a new one).
//
// Only `cutgate` is populated today — adding a second location means researching its
// own BNG_BBOX/osmWayIds (issue #52) and downloading LIDAR tiles covering that area
// before the pipeline scripts have anything to build from.

export const LOCATIONS = {
  cutgate: {
    slug: 'cutgate',
    name: 'Cut Gate',
    // British National Grid (EPSG:27700) bounding box covering the Cut Gate bridleway,
    // from Margery Hill in the north down to the Upper Derwent Visitor Centre
    // (~GR172893) in the south, with a buffer on each side. Tightened against the
    // actual OSM way 24188390 geometry (real easting 418665-419395, northing
    // 396110-398716) — the original values here were an illustrative estimate that
    // didn't actually overlap the route at all, which put the game's spawn point
    // outside the baked terrain grid entirely.
    bbox: {
      minE: 418200,
      minN: 395600,
      maxE: 419800,
      maxN: 399300,
    },
    // The OSM way id(s) that make up the Cut Gate bridleway, found by hand by
    // searching "Cut Gate" on https://www.openstreetmap.org. Deliberately a curated
    // list of specific ways rather than a fuzzy highway=bridleway/bbox query, since
    // this is one specific known route.
    osmWayIds: [24188390],
  },
};

export const DEFAULT_LOCATION_SLUG = 'cutgate';

export function getLocation(slug) {
  const location = LOCATIONS[slug];
  if (!location) {
    throw new Error(
      `Unknown location "${slug}" — add it to LOCATIONS in tools/terrain/config.js first. ` +
        `Known locations: ${Object.keys(LOCATIONS).join(', ')}.`,
    );
  }
  return location;
}

// Local coordinate space origin for a location — every baked e/n and every reprojected
// OSM point is expressed relative to this, so 0,0 is the location's own bbox corner.
export function localOriginOf(location) {
  return { easting: location.bbox.minE, northing: location.bbox.minN };
}

// Reads `--location=<slug>` off argv (defaults to `process.argv`), returning the list of
// location slugs a pipeline script should process. Omitting the flag, or passing
// `--location=all`, means "every configured location" — matches `npm run terrain:build`
// building every registered location by default once more than one exists; today that's
// just `cutgate`, so the default behaviour is unchanged.
export function resolveLocationSlugs(argv = process.argv.slice(2)) {
  const flag = argv.find((arg) => arg.startsWith('--location='));
  if (!flag) return Object.keys(LOCATIONS);
  const value = flag.slice('--location='.length);
  if (value === 'all') return Object.keys(LOCATIONS);
  return [getLocation(value).slug];
}

// Keeps the baked terrain grid small enough to commit to git and cheap to triangulate —
// targets a resulting grid within roughly 128-256 samples on its longer side.
export const TARGET_MAX_SAMPLES_PER_SIDE = 220;

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// overpass-api.de rejects requests that lack a descriptive User-Agent (returns 406) as an
// anti-abuse measure — identify ourselves per https://wiki.openstreetmap.org/wiki/Overpass_API#Introduction.
export const OVERPASS_USER_AGENT =
  'Peak-District-Downhill/1.0 (+https://github.com/Joe-Heffer/Peak-District-Downhill)';

// Raw LIDAR tiles are shared across all locations (tiles are named by OS National Grid
// square, not by location) rather than nested per-slug — download whatever tiles cover
// whichever location(s)' bboxes you're currently building and drop them all in here.
export const RAW_DIR = new URL('./raw/', import.meta.url);
// DSM tiles live in their own subdirectory rather than alongside the DTM tiles in
// RAW_DIR, since buildTrees.js (unlike buildTerrain.js) needs both rasters at once and
// they'd otherwise be indistinguishable by filename alone.
export const RAW_DSM_DIR = new URL('./raw/dsm/', import.meta.url);

// Baked output file URLs for a location, derived from its slug rather than hardcoded
// per-location filenames.
export function outputPathsFor(slug) {
  return {
    terrain: new URL(`../../public/data/terrain/${slug}.json`, import.meta.url),
    route: new URL(`../../public/data/routes/${slug}.json`, import.meta.url),
    landcover: new URL(`../../public/data/terrain/${slug}-landcover.json`, import.meta.url),
    paths: new URL(`../../public/data/routes/${slug}-paths.json`, import.meta.url),
    trees: new URL(`../../public/data/terrain/${slug}-trees.json`, import.meta.url),
  };
}

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
