import * as THREE from 'three';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Builds the terrain mesh directly in final world coordinates: vertex (i, j) sits at
// (i * cellSize, heights[i][j], -j * cellSize). No rotation/position offset is applied —
// this exact axis mapping is deliberately mirrored by the CANNON.Heightfield body built
// in setupWorld.js (see the comment there) so the visual mesh and physics collider stay
// pixel-aligned from the same `heights` array.
export function buildTerrainMesh(terrainData) {
  const { cols, rows, cellSize, heights } = terrainData;

  const positions = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const index = (i * rows + j) * 3;
      positions[index] = i * cellSize;
      positions[index + 1] = heights[i][j];
      positions[index + 2] = -j * cellSize;
    }
  }

  const indices = [];
  for (let i = 0; i < cols - 1; i += 1) {
    for (let j = 0; j < rows - 1; j += 1) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      const c = (i + 1) * rows + (j + 1);
      const d = i * rows + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x4a5d3a });
  return new THREE.Mesh(geometry, material);
}

// Bilinear height lookup shared by bike grounding and route elevation sampling — no raw
// physics raycasting needed anywhere.
export function createHeightLookup(terrainData) {
  const { cols, rows, cellSize, heights } = terrainData;

  return function getHeightAt(x, z) {
    const fi = clamp(x / cellSize, 0, cols - 1);
    const fj = clamp(-z / cellSize, 0, rows - 1);

    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const i1 = Math.min(i0 + 1, cols - 1);
    const j1 = Math.min(j0 + 1, rows - 1);
    const ti = fi - i0;
    const tj = fj - j0;

    const h00 = heights[i0][j0];
    const h10 = heights[i1][j0];
    const h01 = heights[i0][j1];
    const h11 = heights[i1][j1];

    const hTop = h00 + (h10 - h00) * ti;
    const hBottom = h01 + (h11 - h01) * ti;
    return hTop + (hBottom - hTop) * tj;
  };
}

export function createTerrain(terrainData) {
  return {
    mesh: buildTerrainMesh(terrainData),
    getHeightAt: createHeightLookup(terrainData),
    data: terrainData,
  };
}
