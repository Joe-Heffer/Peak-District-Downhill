import * as THREE from 'three';

// Metres per texture tile — shared between the procedural placeholder and any real
// ground texture dropped in at GROUND_TEXTURE_URL, so both tile at the same scale.
const TILE_SIZE = 10;
const GROUND_TEXTURE_URL = `${import.meta.env.BASE_URL}assets/textures/ground.jpg`;

const textureLoader = new THREE.TextureLoader();

// Landcover class -> vertex tint, multiplied against the ground texture/lighting.
// `new THREE.Color(hex)` already converts from sRGB to the renderer's linear working
// color space (THREE.ColorManagement is on by default) — no separate
// convertSRGBToLinear() call needed here, and adding one would double-convert and
// crush every non-white tint toward black.
// Values are a starting point tuned near setupSky.js's #4a5d3a hemi-ground anchor;
// eyeball against each `?sky=` preset and adjust if a class reads wrong.
const CLASS_COLORS = {
  grass: new THREE.Color(0xffffff), // neutral — texture shows through unchanged
  wood: new THREE.Color(0x3d4d30), // darker olive canopy shade
  rock: new THREE.Color(0x8f8a80), // warm grey — gritstone, not cool blue-grey
  heather: new THREE.Color(0x6b5a5f), // muted brown-purple moorland
  track: new THREE.Color(0x9c8a68), // lighter warm tan — legible rideable line
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Ground textures are viewed at shallow, near-horizontal angles from this game's chase
// camera, where trilinear filtering alone blurs noticeably — anisotropic filtering keeps
// them sharp. `maxAnisotropy` should be `renderer.capabilities.getMaxAnisotropy()`.
export function applyMaxAnisotropy(texture, maxAnisotropy) {
  texture.anisotropy = maxAnisotropy;
}

// A mottled green/brown placeholder standing in for a real ground texture until one is
// dropped in at GROUND_TEXTURE_URL — generated in-browser so it needs no asset file.
function createPlaceholderGroundTexture(maxAnisotropy) {
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
  applyMaxAnisotropy(texture, maxAnisotropy);
  return texture;
}

// Swaps in a real ground texture if one exists at GROUND_TEXTURE_URL — silently keeps
// the procedural placeholder material if not (dev/CI default).
function loadRealGroundTexture(material, maxAnisotropy) {
  textureLoader.load(
    GROUND_TEXTURE_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      applyMaxAnisotropy(texture, maxAnisotropy);
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
//
// No THREE.LOD here: the production grid (108x248, ~54K tris) is trivial for any modern
// GPU, and LOD keyed on distance-to-object doesn't suit a single mesh the camera always
// rides on top of — the bike (and camera) can be anywhere across this ~1.6km x 3.7km grid,
// so distance to one anchor point isn't a useful proxy for which part needs detail. A
// correct fix would chunk the terrain into many tiled meshes, each with its own LOD levels
// — a materially bigger change than issue #71's LOD proposal implies, and left undone here.
export function buildTerrainMesh(terrainData, landcoverData = null, maxAnisotropy = 1) {
  const { cols, rows, cellSize, heights } = terrainData;

  if (landcoverData && (landcoverData.cols !== cols || landcoverData.rows !== rows)) {
    throw new Error(
      'Landcover grid dimensions do not match the terrain grid — rerun tools/terrain/fetchLandcover.js.',
    );
  }
  const palette = landcoverData
    ? landcoverData.classes.map((name) => CLASS_COLORS[name] ?? CLASS_COLORS.grass)
    : null;

  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const colors = landcoverData ? new Float32Array(cols * rows * 3) : null;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const posIndex = (i * rows + j) * 3;
      positions[posIndex] = i * cellSize;
      positions[posIndex + 1] = heights[i][j];
      positions[posIndex + 2] = -j * cellSize;

      const uvIndex = (i * rows + j) * 2;
      uvs[uvIndex] = (i * cellSize) / TILE_SIZE;
      uvs[uvIndex + 1] = (j * cellSize) / TILE_SIZE;

      if (colors) {
        const color = palette[landcoverData.landcover[i][j]];
        const colorIndex = (i * rows + j) * 3;
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
      }
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
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: createPlaceholderGroundTexture(maxAnisotropy),
    vertexColors: Boolean(colors),
  });
  loadRealGroundTexture(material, maxAnisotropy);
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

export function createTerrain(terrainData, landcoverData, maxAnisotropy) {
  return {
    mesh: buildTerrainMesh(terrainData, landcoverData, maxAnisotropy),
    getHeightAt: createHeightLookup(terrainData),
    data: terrainData,
  };
}
