import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';

// Utilitarian tones — most real structures near Cut Gate are dam buildings, barns, and
// a packhorse bridge, not anything architecturally detailed (see issue #49). Roof reuses
// HeightmapTerrain's CLASS_COLORS.rock family so buildings read as part of the same
// warm-grey gritstone palette as the rest of the scene, rather than a jarring new hue.
const WALL_COLOR = 0xb0a894; // pale stone/render
const ROOF_COLOR = 0x554b45; // dark slate

// THREE.ExtrudeGeometry's material-group convention: index 0 = top/bottom caps,
// index 1 = side walls (see ExtrudeGeometry.js's buildLidFaces/buildSideFaces).
function buildMaterials() {
  return [new THREE.MeshStandardMaterial({ color: ROOF_COLOR }), new THREE.MeshStandardMaterial({ color: WALL_COLOR })];
}

// Ground height at the lowest footprint corner, so the extruded box's base never floats
// above sloped ground — the uphill side simply runs a little into the terrain, which
// reads better than a visible gap under the eaves on the downhill side.
function footprintBaseElevation(points, terrain) {
  return points.reduce((min, point) => {
    const { x, z } = routePointToWorld(point);
    return Math.min(min, terrain.getHeightAt(x, z));
  }, Infinity);
}

// Extrudes a footprint polygon (local {e,n} points, expected counter-clockwise — see
// tools/terrain/buildingClassification.js's ensureCcw) into a flat-roofed box. The
// shape is built directly in the local e/n plane (shape X = e, shape Y = n) and the
// resulting geometry is rotated -90° about X, which maps local (e, n, extrudeZ) to
// world (x=e, y=extrudeZ, z=-n) — exactly routePointToWorld's e/n -> x/z convention,
// with the extrusion axis becoming world-up.
function buildFootprintGeometry(points, height) {
  const shape = new THREE.Shape();
  points.forEach(({ e, n }, index) => {
    if (index === 0) shape.moveTo(e, n);
    else shape.lineTo(e, n);
  });

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// Purely decorative flat-roofed boxes, one per baked footprint (see
// tools/terrain/fetchBuildings.js) — no physics body, same as Scenery.js's trees/rocks.
// Individual meshes rather than InstancedMesh since footprints vary in both shape and
// height, unlike the uniform cone/icosahedron instances in Scenery.js.
export function buildBuildings(buildingsData, terrain) {
  const group = new THREE.Group();
  const materials = buildMaterials();

  for (const building of buildingsData.buildings ?? []) {
    if (building.points.length < 3) continue;

    const geometry = buildFootprintGeometry(building.points, building.height);
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.y = footprintBaseElevation(building.points, terrain);
    mesh.name = 'building';
    group.add(mesh);
  }

  return group;
}
