import { describe, expect, it } from 'vitest';
import { densifyPolyline, buildRibbonArrays } from './ribbonGeometry.js';

describe('densifyPolyline', () => {
  it('preserves the first and last point exactly', () => {
    const points = [{ e: 0, n: 0 }, { e: 30, n: 0 }, { e: 30, n: 40 }];
    const result = densifyPolyline(points, 2);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('inserts enough points that no gap exceeds maxSegmentMetres', () => {
    const points = [{ e: 0, n: 0 }, { e: 10, n: 0 }];
    const result = densifyPolyline(points, 2.5);
    expect(result.length).toBeGreaterThan(2);
    for (let i = 1; i < result.length; i += 1) {
      const dist = Math.hypot(result[i].e - result[i - 1].e, result[i].n - result[i - 1].n);
      expect(dist).toBeLessThanOrEqual(2.5 + 1e-6);
    }
  });

  it('leaves an already-dense polyline unchanged in point count', () => {
    const points = [{ e: 0, n: 0 }, { e: 1, n: 0 }, { e: 2, n: 0 }];
    const result = densifyPolyline(points, 2.5);
    expect(result).toHaveLength(3);
  });

  it('returns short inputs unchanged', () => {
    expect(densifyPolyline([], 2)).toEqual([]);
    expect(densifyPolyline([{ e: 1, n: 1 }], 2)).toEqual([{ e: 1, n: 1 }]);
  });
});

describe('buildRibbonArrays', () => {
  const flatStyle = { width: 2, color: 0xffffff, heightOffset: 0.1 };
  const rockyStyle = {
    width: 2.2,
    color: 0xc9bb98,
    heightOffset: 0.16,
    rockiness: {
      segments: 4,
      amplitudeCoarse: 0.05,
      amplitudeFine: 0.02,
      wavelengthCoarse: 0.8,
      wavelengthFine: 0.22,
      seed: 4242,
    },
  };
  const points = [
    { e: 0, n: 0 },
    { e: 10, n: 0 },
    { e: 20, n: 5 },
  ];
  const terrain = { getHeightAt: (x, z) => x * 0.1 - z * 0.05 };

  function newArrays() {
    return { positions: [], colors: [], uvs: [], indices: [] };
  }

  it('without rockiness, emits exactly 2 vertices per sample (unchanged flat behaviour)', () => {
    const arrays = newArrays();
    buildRibbonArrays(points, terrain, flatStyle, arrays);
    expect(arrays.positions.length / 3).toBe(points.length * 2);
    expect(arrays.indices.length).toBe((points.length - 1) * 2 * 3);
  });

  it('with rockiness, emits segments+1 vertices per sample and the matching index count', () => {
    const arrays = newArrays();
    buildRibbonArrays(points, terrain, rockyStyle, arrays);
    const columns = rockyStyle.rockiness.segments + 1;
    expect(arrays.positions.length / 3).toBe(points.length * columns);
    expect(arrays.indices.length).toBe((points.length - 1) * (columns - 1) * 2 * 3);
  });

  it('rail columns (both edges) sit exactly at the flat heightOffset baseline for every row', () => {
    const arrays = newArrays();
    buildRibbonArrays(points, terrain, rockyStyle, arrays);
    const columns = rockyStyle.rockiness.segments + 1;

    for (let row = 0; row < points.length; row += 1) {
      const leftIndex = (row * columns) * 3;
      const rightIndex = (row * columns + (columns - 1)) * 3;
      const world = { x: points[row].e, z: -points[row].n };
      const expectedY = terrain.getHeightAt(world.x, world.z) + rockyStyle.heightOffset;

      expect(arrays.positions[leftIndex + 1]).toBeCloseTo(expectedY);
      expect(arrays.positions[rightIndex + 1]).toBeCloseTo(expectedY);
    }
  });

  it('every vertex height is at or above the flat baseline and within the amplitude budget (additive-only relief)', () => {
    const arrays = newArrays();
    buildRibbonArrays(points, terrain, rockyStyle, arrays);
    const columns = rockyStyle.rockiness.segments + 1;
    const maxBump = rockyStyle.rockiness.amplitudeCoarse + rockyStyle.rockiness.amplitudeFine;

    for (let row = 0; row < points.length; row += 1) {
      const world = { x: points[row].e, z: -points[row].n };
      const baseY = terrain.getHeightAt(world.x, world.z) + rockyStyle.heightOffset;
      for (let c = 0; c < columns; c += 1) {
        const y = arrays.positions[(row * columns + c) * 3 + 1];
        expect(y).toBeGreaterThanOrEqual(baseY - 1e-9);
        expect(y).toBeLessThanOrEqual(baseY + maxBump + 1e-9);
      }
    }
  });

  it('produces no NaN/non-finite values', () => {
    const arrays = newArrays();
    buildRibbonArrays(points, terrain, rockyStyle, arrays);
    for (const value of [...arrays.positions, ...arrays.colors, ...arrays.uvs]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is deterministic across repeated calls with identical inputs', () => {
    const a = newArrays();
    const b = newArrays();
    buildRibbonArrays(points, terrain, rockyStyle, a);
    buildRibbonArrays(points, terrain, rockyStyle, b);
    expect(a.positions).toEqual(b.positions);
  });
});
