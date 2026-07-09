// Pure, side-effect-free helpers for turning OSM building=* way tags into an extrusion
// height and a consistently-wound footprint polygon — shared by fetchBuildings.js (real
// data) and generatePlaceholder.js (synthetic data). No network calls, no fs — kept
// importable/testable in isolation, same spirit as pathClassification.js.

const METRES_PER_LEVEL = 3; // typical UK storey height, used when only building:levels is tagged

// Flat default extrusion height for footprints with no height/levels tag at all — common
// for barns/outbuildings in rural areas (see issue #49's open question: pick a sensible
// default rather than skipping them).
export const DEFAULT_BUILDING_HEIGHT = 5;

// OSM height/building:height tags are usually a bare number of metres, occasionally
// suffixed "m" (e.g. "12 m") or with stray whitespace — this strips any non-numeric part.
function parseMetres(value) {
  if (value === undefined || value === null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function estimateBuildingHeight(tags = {}) {
  const height = parseMetres(tags.height ?? tags['building:height']);
  if (height !== null && height > 0) return height;

  const levels = parseMetres(tags['building:levels']);
  if (levels !== null && levels > 0) return levels * METRES_PER_LEVEL;

  return DEFAULT_BUILDING_HEIGHT;
}

export function isBuildingWay(tags = {}) {
  return Boolean(tags.building) && tags.building !== 'no';
}

// Signed area of a closed {e,n} ring via the shoelace formula — positive for
// counter-clockwise winding. Used by ensureCcw below.
function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    sum += points[i].e * points[i + 1].n - points[i + 1].e * points[i].n;
  }
  return sum / 2;
}

// OSM way winding is authored inconsistently (some clockwise, some counter-clockwise),
// but THREE.Shape (used to extrude/triangulate footprints in src/scenery/Buildings.js
// and src/scenery/Water.js) expects a counter-clockwise outer ring to produce
// outward-facing normals — reversing a clockwise ring here keeps that rendering code
// simple and correct regardless of source winding.
export function ensureCcw(points) {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}
