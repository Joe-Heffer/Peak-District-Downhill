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

// Number of cells (not vertices) a chunk spans along one axis before the grid is split
// again — see buildTerrainLOD. Chosen so the production grid (108x248) yields a 4x8
// chunk layout: enough chunks for LOD to matter, not so many that per-chunk overhead
// (draw calls, duplicated boundary vertices) dominates.
const CHUNK_CELLS = 32;

// Decimation stride per LOD level (1 = full resolution) and the camera distance (metres)
// at which THREE.LOD switches to it. Index-aligned with each other.
const LOD_STRIDES = [1, 2, 4];
const LOD_DISTANCES = [0, 150, 400];

// Splits [0, count - 1] into contiguous [start, end] index ranges of at most `chunkCells`
// cells each. Adjacent ranges share their boundary index (chunk N's `end` === chunk N+1's
// `start`) so same-LOD-level chunks meet without a seam.
export function computeChunkBounds(count, chunkCells) {
  const last = count - 1;
  if (last <= 0) return [[0, 0]];

  const bounds = [];
  let start = 0;
  while (start < last) {
    const end = Math.min(start + chunkCells, last);
    bounds.push([start, end]);
    start = end;
  }
  return bounds;
}

// Grid indices from `start` to `end` (inclusive) in steps of `stride`, always including
// `end` itself even when it isn't an exact multiple of stride away from the last step —
// this keeps every chunk's outer edge exact at every LOD level, at the cost of one
// slightly uneven row/column of quads just inside that edge for non-divisible spans.
export function strideIndices(start, end, stride) {
  const indices = [];
  for (let v = start; v < end; v += stride) indices.push(v);
  indices.push(end);
  return indices;
}

// Builds one chunk's geometry at a given decimation stride, in coordinates local to the
// chunk's own (iStart, jStart) corner — i.e. vertex (i, j) sits at
// ((i - iStart) * cellSize, heights[i][j], -(j - jStart) * cellSize). buildTerrainLOD
// positions the wrapping THREE.LOD object at (iStart * cellSize, 0, -jStart * cellSize)
// so the final world position is still exactly (i * cellSize, heights[i][j],
// -j * cellSize) — the same mapping the CANNON.Heightfield in setupWorld.js mirrors, and
// it's the *absolute* i/j (not chunk-local) that still drives UVs so the ground texture
// tiles continuously across chunk boundaries.
export function buildChunkLevelGeometry(terrainData, landcoverData, bounds, stride) {
  const { cellSize, heights } = terrainData;
  const [iStart, iEnd] = bounds.i;
  const [jStart, jEnd] = bounds.j;
  const is = strideIndices(iStart, iEnd, stride);
  const js = strideIndices(jStart, jEnd, stride);
  const cols = is.length;
  const rows = js.length;

  const palette = landcoverData
    ? landcoverData.classes.map((name) => CLASS_COLORS[name] ?? CLASS_COLORS.grass)
    : null;

  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const colors = landcoverData ? new Float32Array(cols * rows * 3) : null;
  for (let ci = 0; ci < cols; ci += 1) {
    const i = is[ci];
    for (let cj = 0; cj < rows; cj += 1) {
      const j = js[cj];
      const posIndex = (ci * rows + cj) * 3;
      positions[posIndex] = (i - iStart) * cellSize;
      positions[posIndex + 1] = heights[i][j];
      positions[posIndex + 2] = -(j - jStart) * cellSize;

      const uvIndex = (ci * rows + cj) * 2;
      uvs[uvIndex] = (i * cellSize) / TILE_SIZE;
      uvs[uvIndex + 1] = (j * cellSize) / TILE_SIZE;

      if (colors) {
        const color = palette[landcoverData.landcover[i][j]];
        const colorIndex = (ci * rows + cj) * 3;
        colors[colorIndex] = color.r;
        colors[colorIndex + 1] = color.g;
        colors[colorIndex + 2] = color.b;
      }
    }
  }

  const indices = [];
  for (let ci = 0; ci < cols - 1; ci += 1) {
    for (let cj = 0; cj < rows - 1; cj += 1) {
      const a = ci * rows + cj;
      const b = (ci + 1) * rows + cj;
      const c = (ci + 1) * rows + (cj + 1);
      const d = ci * rows + (cj + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Tiles the terrain into a grid of THREE.LOD chunks sharing one material, each swapping
// between 1-3 decimated geometries (LOD_STRIDES/LOD_DISTANCES) by its own distance to the
// camera — unlike a single whole-grid THREE.LOD, per-chunk distance is a meaningful proxy
// for detail here since the bike (and camera) can be anywhere across this ~1.6km x 3.7km
// grid. THREE.LOD.autoUpdate defaults to true, so WebGLRenderer switches levels itself;
// no per-frame code is needed in main.js.
//
// Known limitation: chunks share exact boundary vertices at the *same* LOD level (see
// computeChunkBounds), but two adjacent chunks showing *different* levels can show a thin
// T-junction seam along that edge, since the coarser chunk skips vertices the finer one
// keeps. Not fixed here (would need skirts or edge-stitching) — acceptable for this game's
// stylised, non-photorealistic terrain; revisit if it reads as a visible crack in practice.
export function buildTerrainLOD(terrainData, landcoverData, material, chunkCells = CHUNK_CELLS) {
  const { cols, rows, cellSize } = terrainData;

  if (landcoverData && (landcoverData.cols !== cols || landcoverData.rows !== rows)) {
    throw new Error(
      'Landcover grid dimensions do not match the terrain grid — rerun tools/terrain/fetchLandcover.js.',
    );
  }

  const iBounds = computeChunkBounds(cols, chunkCells);
  const jBounds = computeChunkBounds(rows, chunkCells);

  const group = new THREE.Group();
  for (const [iStart, iEnd] of iBounds) {
    for (const [jStart, jEnd] of jBounds) {
      const bounds = { i: [iStart, iEnd], j: [jStart, jEnd] };
      const lod = new THREE.LOD();
      LOD_STRIDES.forEach((stride, level) => {
        // A stride coarser than the chunk itself would just repeat level 0's geometry —
        // stop adding levels once that happens instead of building redundant meshes.
        if (level > 0 && stride >= iEnd - iStart && stride >= jEnd - jStart) return;
        const geometry = buildChunkLevelGeometry(terrainData, landcoverData, bounds, stride);
        lod.addLevel(new THREE.Mesh(geometry, material), LOD_DISTANCES[level]);
      });
      lod.position.set(iStart * cellSize, 0, -jStart * cellSize);
      group.add(lod);
    }
  }
  return group;
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

// Orientation whose local up matches the terrain's surface normal at (x, z), estimated
// via central finite differences over getHeightAt — used to spawn/reset the bike flush
// with the actual slope instead of always dead level (see BikeController.js's
// constructor/respawn/recoverFromStuckContact). On flat ground the gradient is zero and
// this reduces to the identity quaternion, matching the old always-level behaviour.
// sampleRadius default roughly matches the bike chassis's own half-footprint.
export function getGroundQuaternion(getHeightAt, x, z, sampleRadius = 0.5) {
  const dhdx = (getHeightAt(x + sampleRadius, z) - getHeightAt(x - sampleRadius, z)) / (2 * sampleRadius);
  const dhdz = (getHeightAt(x, z + sampleRadius) - getHeightAt(x, z - sampleRadius)) / (2 * sampleRadius);
  const normal = new THREE.Vector3(-dhdx, 1, -dhdz).normalize();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
}

// Nearest-cell landcover lookup — unlike height, class indices aren't numerically
// interpolable, so this snaps to the containing cell rather than bilinear-blending.
export function createLandcoverLookup(landcoverData) {
  if (!landcoverData) return () => null;
  const { cols, rows, cellSize, classes, landcover } = landcoverData;

  return function getLandcoverAt(x, z) {
    const i = clamp(Math.round(x / cellSize), 0, cols - 1);
    const j = clamp(Math.round(-z / cellSize), 0, rows - 1);
    return classes[landcover[i][j]];
  };
}

export function createTerrain(terrainData, landcoverData, maxAnisotropy) {
  const material = new THREE.MeshStandardMaterial({
    map: createPlaceholderGroundTexture(maxAnisotropy),
    vertexColors: Boolean(landcoverData),
  });
  loadRealGroundTexture(material, maxAnisotropy);

  return {
    mesh: buildTerrainLOD(terrainData, landcoverData, material),
    material,
    getHeightAt: createHeightLookup(terrainData),
    getLandcoverAt: createLandcoverLookup(landcoverData),
    data: terrainData,
  };
}
