import * as THREE from 'three';

// Metres per texture tile — shared between the procedural placeholder and any real
// ground texture dropped in at GROUND_TEXTURE_URL, so both tile at the same scale.
const TILE_SIZE = 10;
const GROUND_TEXTURE_URL = `${import.meta.env.BASE_URL}assets/textures/ground.jpg`;

const textureLoader = new THREE.TextureLoader();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// A mottled green/brown placeholder standing in for a real ground texture until one is
// dropped in at GROUND_TEXTURE_URL — generated in-browser so it needs no asset file.
function createPlaceholderGroundTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a5d3a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i += 1) {
    const shade = Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${70 + shade}, ${90 + shade}, ${50 + shade}, 0.5)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Swaps in a real ground texture if one exists at GROUND_TEXTURE_URL — silently keeps
// the procedural placeholder material if not (dev/CI default).
function loadRealGroundTexture(material) {
  textureLoader.load(
    GROUND_TEXTURE_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {}, // no real texture yet — keep the procedural placeholder
  );
}

// Builds the terrain mesh directly in final world coordinates: vertex (i, j) sits at
// (i * cellSize, heights[i][j], -j * cellSize). No rotation/position offset is applied —
// this exact axis mapping is deliberately mirrored by the CANNON.Heightfield body built
// in setupWorld.js (see the comment there) so the visual mesh and physics collider stay
// pixel-aligned from the same `heights` array.
export function buildTerrainMesh(terrainData) {
  const { cols, rows, cellSize, heights } = terrainData;

  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const posIndex = (i * rows + j) * 3;
      positions[posIndex] = i * cellSize;
      positions[posIndex + 1] = heights[i][j];
      positions[posIndex + 2] = -j * cellSize;

      const uvIndex = (i * rows + j) * 2;
      uvs[uvIndex] = (i * cellSize) / TILE_SIZE;
      uvs[uvIndex + 1] = (j * cellSize) / TILE_SIZE;
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
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ map: createPlaceholderGroundTexture() });
  loadRealGroundTexture(material);
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
