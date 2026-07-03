import * as THREE from 'three';
import { routePointToWorld } from './RouteOverlay.js';

// Width (metres) + tint + terrain-height offset per category. All offsets are smaller
// than RouteOverlay.js's ROUTE_HEIGHT_OFFSET so the Cut Gate green dashed route always
// renders visibly above at any junction/crossing, and are distinct per category so two
// crossing ribbons don't sit exactly coplanar with each other.
export const PATH_STYLES = {
  road: { width: 3.5, color: 0x8c8c8c, heightOffset: 0.1 }, // grey — tarmac/estate-track width
  bridleway: { width: 1.8, color: 0xa9895f, heightOffset: 0.12 }, // tan dirt, medium
  footpath: { width: 0.9, color: 0x7a6a52, heightOffset: 0.14 }, // narrow worn dirt
};

export async function loadPathsData(url = `${import.meta.env.BASE_URL}data/routes/cutgate-paths.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load paths data (${response.status})`);
  }
  return response.json();
}

// Appends one path's ribbon (a flat quad-strip following the terrain) into the shared
// {positions, colors, indices} arrays. Per-vertex perpendicular is the averaged normal
// of the incoming/outgoing segment directions — simple, no miter-length clamping
// (acceptable v1 scope limit at this path density, same spirit as fetchLandcover.js's
// documented multipolygon-skip limit).
export function buildRibbonArrays(points, terrain, style, arrays) {
  const world = points.map((p) => routePointToWorld(p));
  if (world.length < 2) return;

  const color = new THREE.Color(style.color);
  const halfWidth = style.width / 2;
  const baseIndex = arrays.positions.length / 3;

  for (let i = 0; i < world.length; i += 1) {
    const prev = world[Math.max(i - 1, 0)];
    const next = world[Math.min(i + 1, world.length - 1)];
    const dirX = next.x - prev.x;
    const dirZ = next.z - prev.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const perpX = -dirZ / len;
    const perpZ = dirX / len;

    const { x, z } = world[i];
    const y = terrain.getHeightAt(x, z) + style.heightOffset;

    arrays.positions.push(x + perpX * halfWidth, y, z + perpZ * halfWidth);
    arrays.positions.push(x - perpX * halfWidth, y, z - perpZ * halfWidth);
    arrays.colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }

  for (let i = 0; i < world.length - 1; i += 1) {
    const a = baseIndex + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    arrays.indices.push(a, b, d, a, d, c);
  }
}

// Merges every path of a given category into a single THREE.Mesh (one BufferGeometry
// per category present in the data) rather than one mesh per OSM way, so draw calls
// stay bounded (at most one per category) regardless of how many path segments the
// bbox network contains.
export function buildPathsOverlay(pathsData, terrain) {
  const group = new THREE.Group();

  for (const category of Object.keys(PATH_STYLES)) {
    const style = PATH_STYLES[category];
    const arrays = { positions: [], colors: [], indices: [] };

    for (const path of pathsData.paths) {
      if (path.category !== category) continue;
      buildRibbonArrays(path.points, terrain, style, arrays);
    }
    if (arrays.positions.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arrays.positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(arrays.colors), 3));
    geometry.setIndex(arrays.indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `paths-${category}`;
    group.add(mesh);
  }

  return group;
}
