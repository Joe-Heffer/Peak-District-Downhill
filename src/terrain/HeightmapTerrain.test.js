import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMaxAnisotropy,
  buildChunkLevelGeometry,
  buildTerrainLOD,
  clamp,
  computeChunkBounds,
  createHeightLookup,
  createLandcoverLookup,
  getGroundQuaternion,
  strideIndices,
} from './HeightmapTerrain.js';

const terrainData = {
  cols: 3,
  rows: 3,
  cellSize: 10,
  heights: [
    [0, 1, 2],
    [1, 2, 3],
    [2, 3, 4],
  ],
};

const landcoverData = {
  cols: 3,
  rows: 3,
  cellSize: 10,
  classes: ['grass', 'rock', 'heather'],
  landcover: [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ],
};

// A bigger grid, large enough to split into multiple chunks with a small chunkCells —
// used by the chunking/LOD tests below. heights[i][j] = i * 10 + j so any vertex's
// grid indices can be read straight back off its height.
const bigCols = 9;
const bigRows = 9;
const bigTerrainData = {
  cols: bigCols,
  rows: bigRows,
  cellSize: 5,
  heights: Array.from({ length: bigCols }, (_, i) => Array.from({ length: bigRows }, (_, j) => i * 10 + j)),
};

const bigLandcoverData = {
  cols: bigCols,
  rows: bigRows,
  cellSize: 5,
  classes: ['grass', 'rock', 'heather'],
  landcover: Array.from({ length: bigCols }, () => Array.from({ length: bigRows }, () => 0)), // all grass
};

describe('clamp', () => {
  it('passes values already inside the range through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps values below the minimum', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamps values above the maximum', () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('applyMaxAnisotropy', () => {
  it('sets the texture anisotropy to the given value', () => {
    const texture = { anisotropy: 1 };
    applyMaxAnisotropy(texture, 16);
    expect(texture.anisotropy).toBe(16);
  });
});

describe('createHeightLookup / getHeightAt', () => {
  // buildTerrainLOD places vertex (i, j) at (i * cellSize, heights[i][j], -j * cellSize)
  // in world space (chunk-local geometry offset by each chunk's own THREE.LOD position)
  // — getHeightAt must invert that exact mapping for the mesh and physics heightfield to
  // stay pixel-aligned (see CLAUDE.md).
  it('returns the exact grid value at (i * cellSize, -j * cellSize)', () => {
    const getHeightAt = createHeightLookup(terrainData);

    for (let i = 0; i < terrainData.cols; i += 1) {
      for (let j = 0; j < terrainData.rows; j += 1) {
        const x = i * terrainData.cellSize;
        const z = -j * terrainData.cellSize;
        expect(getHeightAt(x, z)).toBeCloseTo(terrainData.heights[i][j]);
      }
    }
  });

  it('interpolates the cell centre along the shared (i+1,j)-(i,j+1) diagonal', () => {
    // terrainData's corners happen to lie on a single plane (heights[i][j] = i + j), so
    // the cell centre — which sits exactly on that diagonal — comes out the same whether
    // interpolated via the diagonal split or a naive bilinear blend across all 4 corners.
    // The non-planar-quad test below is what actually distinguishes the two.
    const getHeightAt = createHeightLookup(terrainData);

    const h10 = terrainData.heights[1][0];
    const h01 = terrainData.heights[0][1];
    const expectedMidpoint = (h10 + h01) / 2;

    const x = terrainData.cellSize / 2;
    const z = -terrainData.cellSize / 2;
    expect(getHeightAt(x, z)).toBeCloseTo(expectedMidpoint);
  });

  it('interpolates a non-planar cell as the same two flat triangles buildTerrainMesh renders, not a bilinear blend', () => {
    // A saddle-shaped quad (corners not coplanar) is where triangulated and bilinear
    // interpolation diverge — buildTerrainMesh's two triangles per cell are split along
    // the (i+1,j)-(i,j+1) diagonal (matching cannon-es's Heightfield collision pillars),
    // so getHeightAt must follow that same split rather than blend across the full cell.
    const saddle = {
      cols: 2,
      rows: 2,
      cellSize: 10,
      heights: [
        [0, 10],
        [10, 0],
      ],
    };
    const getHeightAt = createHeightLookup(saddle);
    const x = saddle.cellSize / 2;
    const z = -saddle.cellSize / 2;

    // Bilinear would give (0+10+10+0)/4 = 5 here; the triangulated surface instead sits
    // on the h10-h01 diagonal (10, 10), so the centre is 10, not 5.
    expect(getHeightAt(x, z)).toBeCloseTo(10);

    // Off-centre, on either side of the diagonal, each point should land on its own
    // triangle's plane rather than the bilinear blend.
    const nearA = { x: saddle.cellSize * 0.2, z: -saddle.cellSize * 0.2 }; // near h00 corner, u+v < 1
    expect(getHeightAt(nearA.x, nearA.z)).toBeCloseTo(0 + (10 - 0) * 0.2 + (10 - 0) * 0.2);

    const nearC = { x: saddle.cellSize * 0.8, z: -saddle.cellSize * 0.8 }; // near h11 corner, u+v > 1
    expect(getHeightAt(nearC.x, nearC.z)).toBeCloseTo(10 * (1 - 0.8) + 10 * (1 - 0.8) + 0 * (0.8 + 0.8 - 1));
  });

  it('clamps out-of-bounds coordinates to the nearest edge', () => {
    const getHeightAt = createHeightLookup(terrainData);

    expect(getHeightAt(-1000, 1000)).toBeCloseTo(terrainData.heights[0][0]);

    const lastI = terrainData.cols - 1;
    const lastJ = terrainData.rows - 1;
    expect(getHeightAt(1e6, -1e6)).toBeCloseTo(terrainData.heights[lastI][lastJ]);
  });
});

describe('getGroundQuaternion', () => {
  it('is the identity on flat ground', () => {
    const q = getGroundQuaternion(() => 5, 0, 0);
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(0);
    expect(q.w).toBeCloseTo(1);
  });

  // Bike-falls-over-at-spawn regression: on a slope, the chassis's local up should tip
  // to match the terrain's surface normal instead of staying world-up.
  it('tips the up vector to match the terrain normal on a sloped plane', () => {
    const slope = 0.3; // rise/run — a real ~16-degree camber is tan(16deg) =~ 0.29
    const getHeightAt = (x) => slope * x; // rises along +x, flat along z
    const q = getGroundQuaternion(getHeightAt, 0, 0);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const expectedNormal = new THREE.Vector3(-slope, 1, 0).normalize();
    expect(up.x).toBeCloseTo(expectedNormal.x);
    expect(up.y).toBeCloseTo(expectedNormal.y);
    expect(up.z).toBeCloseTo(expectedNormal.z);
  });
});

describe('createLandcoverLookup / getLandcoverAt', () => {
  it('returns the exact class name at (i * cellSize, -j * cellSize)', () => {
    const getLandcoverAt = createLandcoverLookup(landcoverData);

    for (let i = 0; i < landcoverData.cols; i += 1) {
      for (let j = 0; j < landcoverData.rows; j += 1) {
        const x = i * landcoverData.cellSize;
        const z = -j * landcoverData.cellSize;
        const expectedClass = landcoverData.classes[landcoverData.landcover[i][j]];
        expect(getLandcoverAt(x, z)).toBe(expectedClass);
      }
    }
  });

  it('snaps to the nearest cell rather than interpolating', () => {
    const getLandcoverAt = createLandcoverLookup(landcoverData);
    // Just past the midpoint between cell (0,0)="grass" and (1,0)="rock" — nearest is (1,0).
    expect(getLandcoverAt(landcoverData.cellSize * 0.6, 0)).toBe('rock');
  });

  it('clamps out-of-bounds coordinates to the nearest edge', () => {
    const getLandcoverAt = createLandcoverLookup(landcoverData);

    expect(getLandcoverAt(-1000, 1000)).toBe(landcoverData.classes[landcoverData.landcover[0][0]]);

    const lastI = landcoverData.cols - 1;
    const lastJ = landcoverData.rows - 1;
    expect(getLandcoverAt(1e6, -1e6)).toBe(landcoverData.classes[landcoverData.landcover[lastI][lastJ]]);
  });

  it('returns null unconditionally when no landcover data is provided', () => {
    const getLandcoverAt = createLandcoverLookup(null);
    expect(getLandcoverAt(0, 0)).toBeNull();
  });
});

describe('computeChunkBounds', () => {
  it('splits a count into chunks of at most chunkCells cells, sharing boundaries', () => {
    expect(computeChunkBounds(9, 4)).toEqual([
      [0, 4],
      [4, 8],
    ]);
  });

  it('returns a single degenerate chunk when count is 1 or less', () => {
    expect(computeChunkBounds(1, 4)).toEqual([[0, 0]]);
  });

  it('returns a single chunk when chunkCells covers the whole grid', () => {
    expect(computeChunkBounds(9, 100)).toEqual([[0, 8]]);
  });
});

describe('strideIndices', () => {
  it('returns every index for stride 1', () => {
    expect(strideIndices(0, 4, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  it('steps by stride but always includes the end exactly', () => {
    expect(strideIndices(0, 10, 4)).toEqual([0, 4, 8, 10]);
  });

  it('handles a span shorter than the stride by returning just the two endpoints', () => {
    expect(strideIndices(4, 6, 8)).toEqual([4, 6]);
  });
});

describe('buildChunkLevelGeometry', () => {
  it('places vertices chunk-local, offset from the chunk corner', () => {
    const bounds = { i: [4, 8], j: [4, 8] };
    const geometry = buildChunkLevelGeometry(bigTerrainData, null, bounds, 1);
    const position = geometry.getAttribute('position');

    // First vertex is the chunk's own corner (absolute i=4, j=4) -> local (0, height, 0).
    expect(position.getX(0)).toBeCloseTo(0);
    expect(position.getY(0)).toBeCloseTo(bigTerrainData.heights[4][4]);
    expect(position.getZ(0)).toBeCloseTo(0);

    // Last vertex is the opposite corner (absolute i=8, j=8), 4 cells away on both axes.
    const last = position.count - 1;
    expect(position.getX(last)).toBeCloseTo(4 * bigTerrainData.cellSize);
    expect(position.getY(last)).toBeCloseTo(bigTerrainData.heights[8][8]);
    expect(position.getZ(last)).toBeCloseTo(-4 * bigTerrainData.cellSize);
  });

  it('decimates by stride while still reaching the exact chunk edge', () => {
    const bounds = { i: [0, 8], j: [0, 8] };
    const geometry = buildChunkLevelGeometry(bigTerrainData, null, bounds, 4);
    const position = geometry.getAttribute('position');

    // strideIndices(0, 8, 4) -> [0, 4, 8]: a 3x3 grid of vertices.
    expect(position.count).toBe(9);
    const last = position.count - 1;
    expect(position.getX(last)).toBeCloseTo(8 * bigTerrainData.cellSize);
    expect(position.getZ(last)).toBeCloseTo(-8 * bigTerrainData.cellSize);
  });

  it('derives vertex colors from the landcover class at each vertex', () => {
    const bounds = { i: [0, 4], j: [0, 4] };
    const geometry = buildChunkLevelGeometry(bigTerrainData, bigLandcoverData, bounds, 1);
    const color = geometry.getAttribute('color');

    expect(color).toBeDefined();
    // bigLandcoverData is all class 0 ("grass"), whose CLASS_COLORS tint is neutral white.
    expect(color.getX(0)).toBeCloseTo(1);
    expect(color.getY(0)).toBeCloseTo(1);
    expect(color.getZ(0)).toBeCloseTo(1);
  });

  it('omits the color attribute when no landcover data is given', () => {
    const geometry = buildChunkLevelGeometry(bigTerrainData, null, { i: [0, 4], j: [0, 4] }, 1);
    expect(geometry.getAttribute('color')).toBeUndefined();
  });

  it('keeps adjacent chunks seamless at the same LOD level (matching world position and UV)', () => {
    const stride = 1;
    const leftBounds = { i: [0, 4], j: [0, 4] };
    const rightBounds = { i: [4, 8], j: [0, 4] };
    const left = buildChunkLevelGeometry(bigTerrainData, null, leftBounds, stride);
    const right = buildChunkLevelGeometry(bigTerrainData, null, rightBounds, stride);

    const leftPos = left.getAttribute('position');
    const leftUv = left.getAttribute('uv');
    const rightPos = right.getAttribute('position');
    const rightUv = right.getAttribute('uv');

    const rowsPerChunk = 5; // strideIndices(0, 4, 1) -> 5 indices
    for (let j = 0; j < rowsPerChunk; j += 1) {
      const leftIndex = 4 * rowsPerChunk + j; // left chunk's last column (absolute i=4)
      const rightIndex = 0 * rowsPerChunk + j; // right chunk's first column (absolute i=4)

      const leftWorldX = leftPos.getX(leftIndex) + leftBounds.i[0] * bigTerrainData.cellSize;
      const rightWorldX = rightPos.getX(rightIndex) + rightBounds.i[0] * bigTerrainData.cellSize;
      expect(rightWorldX).toBeCloseTo(leftWorldX);
      expect(rightPos.getY(rightIndex)).toBeCloseTo(leftPos.getY(leftIndex));
      expect(rightUv.getX(rightIndex)).toBeCloseTo(leftUv.getX(leftIndex));
      expect(rightUv.getY(rightIndex)).toBeCloseTo(leftUv.getY(leftIndex));
    }
  });
});

describe('buildTerrainLOD', () => {
  it('tiles the grid into one THREE.LOD per chunk, positioned at that chunk\'s world corner', () => {
    const material = new THREE.MeshStandardMaterial();
    const group = buildTerrainLOD(bigTerrainData, null, material, 4);

    // computeChunkBounds(9, 4) -> [[0,4],[4,8]] on both axes -> a 2x2 grid of chunks.
    expect(group.children).toHaveLength(4);
    group.children.forEach((lod) => expect(lod).toBeInstanceOf(THREE.LOD));

    // +0 vs -0 (from -jStart * cellSize when jStart is 0) compare equal numerically but
    // not via toEqual's deep equality, so round-trip through a plain "x,z" string instead.
    const corners = group.children.map((lod) => `${lod.position.x},${lod.position.z}`);
    expect(corners.sort()).toEqual(
      [
        [0, 0],
        [0, -4 * bigTerrainData.cellSize],
        [4 * bigTerrainData.cellSize, 0],
        [4 * bigTerrainData.cellSize, -4 * bigTerrainData.cellSize],
      ]
        .map(([x, z]) => `${x},${z}`)
        .sort(),
    );
  });

  it('adds a decimated level only once the chunk is bigger than that level\'s stride', () => {
    const material = new THREE.MeshStandardMaterial();
    const group = buildTerrainLOD(bigTerrainData, null, material, 4);

    // Each chunk spans 4 cells: stride 2 still applies (2 < 4), stride 4 doesn't (4 >= 4)
    // — so every chunk should end up with exactly 2 levels (full res + half res).
    group.children.forEach((lod) => {
      expect(lod.levels).toHaveLength(2);
    });
  });

  it('shares the same material instance across every chunk/level mesh', () => {
    const material = new THREE.MeshStandardMaterial();
    const group = buildTerrainLOD(bigTerrainData, null, material, 4);

    group.children.forEach((lod) => {
      lod.levels.forEach(({ object }) => expect(object.material).toBe(material));
    });
  });

  it('throws when landcover grid dimensions do not match the terrain grid', () => {
    const material = new THREE.MeshStandardMaterial();
    const mismatchedLandcover = { ...bigLandcoverData, cols: bigCols - 1 };
    expect(() => buildTerrainLOD(bigTerrainData, mismatchedLandcover, material, 4)).toThrow();
  });
});
