import { describe, expect, it } from 'vitest';
import { densifyPolyline } from './ribbonGeometry.js';

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
