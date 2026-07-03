import * as THREE from 'three';
import { buildRibbonArrays, finalizeRibbonGeometry, densifyPolyline } from './ribbonGeometry.js';

// Width (metres) + tint + terrain-height offset per category. Tints are kept light
// (see RouteOverlay.js's ROUTE_STYLE comment) so they read as a hue cast over the
// shared rocky texture rather than crushing its stone/gravel contrast to a flat color.
// All offsets are smaller than RouteOverlay.js's ROUTE_STYLE.heightOffset so the Cut
// Gate route always renders visibly above at any junction/crossing, and are distinct
// per category so two crossing ribbons don't sit exactly coplanar with each other.
export const PATH_STYLES = {
  road: { width: 3.5, color: 0xc7c7c7, heightOffset: 0.1 }, // light grey — tarmac/estate-track width
  bridleway: { width: 1.8, color: 0xd9c4a0, heightOffset: 0.12 }, // pale tan dirt, medium
  footpath: { width: 0.9, color: 0xc0ac8a, heightOffset: 0.14 }, // narrow worn dirt, slightly darker tan
};

export async function loadPathsData(url = `${import.meta.env.BASE_URL}data/routes/cutgate-paths.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load paths data (${response.status})`);
  }
  return response.json();
}

export { buildRibbonArrays };

// Merges every path of a given category into a single THREE.Mesh (one BufferGeometry
// per category present in the data) rather than one mesh per OSM way, so draw calls
// stay bounded (at most one per category) regardless of how many path segments the
// bbox network contains. All categories share the same rocky-track material so the
// stone texture reads consistently everywhere; only the per-category vertex color tint
// (and width) tells road/bridleway/footpath apart.
export function buildPathsOverlay(pathsData, terrain, material) {
  const group = new THREE.Group();

  for (const category of Object.keys(PATH_STYLES)) {
    const style = PATH_STYLES[category];
    const arrays = { positions: [], colors: [], uvs: [], indices: [] };

    for (const path of pathsData.paths) {
      if (path.category !== category) continue;
      buildRibbonArrays(densifyPolyline(path.points), terrain, style, arrays);
    }
    if (arrays.positions.length === 0) continue;

    const geometry = finalizeRibbonGeometry(arrays);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `paths-${category}`;
    group.add(mesh);
  }

  return group;
}
