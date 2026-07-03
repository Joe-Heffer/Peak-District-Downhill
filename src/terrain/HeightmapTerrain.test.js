import { describe, expect, it } from 'vitest';
import { applyMaxAnisotropy, clamp, createHeightLookup } from './HeightmapTerrain.js';

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

  it('bilinearly interpolates the midpoint between four grid corners', () => {
    const getHeightAt = createHeightLookup(terrainData);

    const h00 = terrainData.heights[0][0];
    const h10 = terrainData.heights[1][0];
    const h01 = terrainData.heights[0][1];
    const h11 = terrainData.heights[1][1];
    const expectedMidpoint = (h00 + h10 + h01 + h11) / 4;

    const x = terrainData.cellSize / 2;
    const z = -terrainData.cellSize / 2;
    expect(getHeightAt(x, z)).toBeCloseTo(expectedMidpoint);
  });

  it('clamps out-of-bounds coordinates to the nearest edge', () => {
    const getHeightAt = createHeightLookup(terrainData);

    expect(getHeightAt(-1000, 1000)).toBeCloseTo(terrainData.heights[0][0]);

    const lastI = terrainData.cols - 1;
    const lastJ = terrainData.rows - 1;
    expect(getHeightAt(1e6, -1e6)).toBeCloseTo(terrainData.heights[lastI][lastJ]);
  });
});
