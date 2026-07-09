import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';
import { buildRibbonArrays, finalizeRibbonGeometry, densifyPolyline } from '../routes/ribbonGeometry.js';

// Widths (metres) mirror tools/terrain/waterClassification.js's WATERWAY_WIDTHS — kept
// as a separate constant here (not imported) since tools/terrain is a dev-only Node
// pipeline deliberately kept independent of the Vite app bundle, same spirit as
// generatePlaceholder.js not importing PathsOverlay.js's PATH_STYLES widths.
const WATERWAY_STYLES = {
  river: { width: 6, color: 0x3f6f94, heightOffset: 0.05 },
  stream: { width: 1.5, color: 0x4f7fa4, heightOffset: 0.05 },
};

const WATER_COLOR = 0x3f6f94;

function buildPolygonMaterial() {
  // Slightly reflective/tinted, per issue #49 — low roughness + a little metalness reads
  // as still water under the scene's directional/hemisphere lighting without needing a
  // real reflection probe.
  return new THREE.MeshStandardMaterial({
    color: WATER_COLOR,
    roughness: 0.15,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
}

function buildLineMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });
}

// Average ground height across a polygon's vertices — reads as a plausible still-water
// surface without needing real bathymetry; a min/max would either bury the banks or
// float above them on anything but perfectly flat real terrain.
function polygonElevation(points, terrain) {
  const heights = points.map(({ e, n }) => {
    const { x, z } = routePointToWorld({ e, n });
    return terrain.getHeightAt(x, z);
  });
  return heights.reduce((sum, h) => sum + h, 0) / heights.length;
}

// Flat plane for a lake/reservoir footprint (local {e,n} points, expected
// counter-clockwise — see tools/terrain/buildingClassification.js's ensureCcw). Built
// the same way as Buildings.js's extruded footprints: the shape lives directly in the
// e/n plane (shape X = e, shape Y = n), then a -90° rotation about X maps it flat into
// the world x/z plane matching routePointToWorld's convention.
function buildPolygonMesh(polygon, terrain, material) {
  const shape = new THREE.Shape();
  polygon.points.forEach(({ e, n }, index) => {
    if (index === 0) shape.moveTo(e, n);
    else shape.lineTo(e, n);
  });

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = polygonElevation(polygon.points, terrain);
  mesh.name = `water-${polygon.cls}`;
  return mesh;
}

// Purely decorative. Lakes/reservoirs render as a flat tinted plane; rivers/streams
// render as a terrain-following ribbon, the same technique as PathsOverlay.js's highway
// ribbons (merged into one mesh per class so draw calls stay bounded). No physics body,
// same as Scenery.js's trees/rocks and Buildings.js's building boxes.
export function buildWater(waterData, terrain) {
  const group = new THREE.Group();
  const polygonMaterial = buildPolygonMaterial();
  const lineMaterial = buildLineMaterial();

  for (const polygon of waterData.polygons ?? []) {
    if (polygon.points.length < 3) continue;
    group.add(buildPolygonMesh(polygon, terrain, polygonMaterial));
  }

  for (const cls of Object.keys(WATERWAY_STYLES)) {
    const style = WATERWAY_STYLES[cls];
    const arrays = { positions: [], colors: [], uvs: [], indices: [] };

    for (const line of waterData.lines ?? []) {
      if (line.cls !== cls) continue;
      buildRibbonArrays(densifyPolyline(line.points), terrain, style, arrays);
    }
    if (arrays.positions.length === 0) continue;

    const geometry = finalizeRibbonGeometry(arrays);
    const mesh = new THREE.Mesh(geometry, lineMaterial);
    mesh.name = `water-${cls}`;
    group.add(mesh);
  }

  return group;
}
