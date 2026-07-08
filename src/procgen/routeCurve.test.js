import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRouteCurve } from './routeCurve.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const terrain = { getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005 };
const routeData = {
  points: [
    { e: 10, n: 5 },
    { e: 20, n: 15 },
    { e: 30, n: 25 },
    { e: 45, n: 40 },
  ],
};

describe('buildRouteCurve', () => {
  it('returns a CatmullRomCurve3 grounded via terrain.getHeightAt at every route point', () => {
    const curve = buildRouteCurve(routeData, terrain);

    expect(curve).toBeInstanceOf(THREE.CatmullRomCurve3);
    expect(curve.points).toHaveLength(routeData.points.length);
    curve.points.forEach((point, index) => {
      const { x, z } = routePointToWorld(routeData.points[index]);
      expect(point.x).toBeCloseTo(x);
      expect(point.z).toBeCloseTo(z);
      expect(point.y).toBeCloseTo(terrain.getHeightAt(x, z));
    });
  });
});
