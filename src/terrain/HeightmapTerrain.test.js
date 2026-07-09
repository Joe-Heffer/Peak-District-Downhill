import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMaxAnisotropy,
  clamp,
  createHeightLookup,
  createLandcoverLookup,
  getGroundQuaternion,
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
  // buildTerrainMesh places vertex (i, j) at (i * cellSize, heights[i][j], -j * cellSize)
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
