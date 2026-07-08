import { describe, expect, it } from 'vitest';
import { groundPoints } from './groundPoints.js';

const terrain = { getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005 };

describe('groundPoints', () => {
  it('attaches y from terrain.getHeightAt(x, z) to every point', () => {
    const points = [{ x: 0, z: 0 }, { x: 10, z: 20 }, { x: -5, z: 3 }];
    const grounded = groundPoints(points, terrain);

    grounded.forEach((point, index) => {
      expect(point.x).toBe(points[index].x);
      expect(point.z).toBe(points[index].z);
      expect(point.y).toBeCloseTo(terrain.getHeightAt(points[index].x, points[index].z));
    });
  });

  it('does not mutate the input points', () => {
    const points = [{ x: 1, z: 1 }];
    groundPoints(points, terrain);
    expect(points[0]).toEqual({ x: 1, z: 1 });
  });

  it('preserves other fields already on each point', () => {
    const points = [{ x: 0, z: 0, tag: 'clump' }];
    const grounded = groundPoints(points, terrain);
    expect(grounded[0].tag).toBe('clump');
  });
});
