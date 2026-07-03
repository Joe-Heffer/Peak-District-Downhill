// Pure, side-effect-free helpers for classifying and clipping OSM highway=* ways into
// the road/bridleway/footpath categories baked into cutgate-paths.json. No network
// calls, no fs — kept importable/testable in isolation, unlike fetchRoute.js/
// fetchLandcover.js which both call main() unconditionally at import time.

export const PATH_CATEGORIES = ['road', 'bridleway', 'footpath'];

const ROAD_HIGHWAY_VALUES = [
  'unclassified',
  'residential',
  'tertiary',
  'secondary',
  'primary',
  'service',
  'living_street',
];

// Ordered rules, first match wins — mirrors fetchLandcover.js's LANDCOVER_TAG_RULES
// priority-list pattern. A rule returning no match means "excluded from v1" (e.g.
// cycleway, motorway/trunk/proposed/construction, bicycle-designated paths, private
// tracks). highway=track and horse-tagged highway=path are folded into "bridleway"
// (not "road") per product decision — Peak District farm/estate tracks are ridden/
// walked more like a bridleway in practice despite being vehicle-width.
const HIGHWAY_CATEGORY_RULES = [
  { cls: 'bridleway', test: (tags) => tags.highway === 'bridleway' },
  { cls: 'bridleway', test: (tags) => tags.highway === 'track' && tags.access !== 'private' },
  { cls: 'bridleway', test: (tags) => tags.highway === 'path' && (tags.horse === 'yes' || tags.horse === 'designated') },
  { cls: 'footpath', test: (tags) => tags.highway === 'footway' || tags.highway === 'steps' },
  { cls: 'footpath', test: (tags) => tags.highway === 'path' && tags.bicycle !== 'designated' },
  { cls: 'road', test: (tags) => ROAD_HIGHWAY_VALUES.includes(tags.highway) },
];

export function categorizeHighway(tags = {}) {
  const rule = HIGHWAY_CATEGORY_RULES.find((r) => r.test(tags));
  return rule ? rule.cls : null;
}

// Excludes the Cut Gate way(s) themselves (OSM_WAY_IDS) so the ridden route is never
// double-rendered as both the yellow dashed RouteOverlay line AND a generic bridleway
// ribbon underneath/on top of it.
export function excludeKnownRouteWays(ways, excludedWayIds) {
  const excluded = new Set(excludedWayIds);
  return ways.filter((way) => !excluded.has(way.id));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Clips a single segment [a,b] against the axis-aligned rect bbox = {minE,maxE,minN,maxN}
// (Liang-Barsky). Returns the clipped [a', b'] pair, or null if the segment doesn't
// intersect the rect at all.
function clipSegmentToBbox(a, b, bbox) {
  const dE = b.e - a.e;
  const dN = b.n - a.n;
  let t0 = 0;
  let t1 = 1;

  const clipEdge = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    !clipEdge(-dE, a.e - bbox.minE) ||
    !clipEdge(dE, bbox.maxE - a.e) ||
    !clipEdge(-dN, a.n - bbox.minN) ||
    !clipEdge(dN, bbox.maxN - a.n)
  ) {
    return null;
  }

  return [
    { e: a.e + t0 * dE, n: a.n + t0 * dN },
    { e: a.e + t1 * dE, n: a.n + t1 * dN },
  ];
}

// Clips a way's local {e,n} polyline against the local bbox rectangle, so ways whose
// OSM geometry runs far outside BNG_BBOX don't produce off-grid ribbon vertices that
// terrain.getHeightAt would otherwise clamp flat against the terrain edge. Ways that
// cross the boundary more than once are split into multiple contiguous sub-polylines.
export function clipPolylineToBbox(points, bbox) {
  const runs = [];
  let current = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const clipped = clipSegmentToBbox(points[i], points[i + 1], bbox);
    if (!clipped) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }

    const [start, end] = clipped;
    if (current.length === 0) {
      current.push(start);
    }
    current.push(end);
  }

  if (current.length > 0) runs.push(current);
  return runs.filter((run) => run.length >= 2);
}
