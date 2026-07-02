import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRouteOverlay, routePointToWorld } from './RouteOverlay.js';

describe('routePointToWorld', () => {
  it('maps e -> x and negates n -> z', () => {
    expect(routePointToWorld({ e: 12, n: -7 })).toEqual({ x: 12, z: 7 });
    expect(routePointToWorld({ e: 3, n: 4 })).toEqual({ x: 3, z: -4 });
  });
});

describe('buildRouteOverlay', () => {
  const terrain = { getHeightAt: (x, z) => x - z };
  const routeData = {
    points: [
      { e: 10, n: 5 },
      { e: 20, n: 15 },
      { e: 30, n: 25 },
    ],
  };

  it('returns a THREE.Line with lineDistances computed', () => {
    const line = buildRouteOverlay(routeData, terrain);

    expect(line).toBeInstanceOf(THREE.Line);
    expect(line.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(line.geometry.attributes.lineDistance).toBeDefined();
  });

  it('places the first and last curve samples using the shared e/n -> x/z conversion plus the route height offset', () => {
    // buildRouteOverlay resamples the CatmullRomCurve3 for the rendered line, but a
    // Catmull-Rom curve always passes exactly through its own control points, so the
    // densified geometry's first/last vertices coincide with routeData's first/last points.
    const line = buildRouteOverlay(routeData, terrain);
    const positions = line.geometry.attributes.position.array;

    const expectedFirst = routePointToWorld(routeData.points[0]);
    const expectedLast = routePointToWorld(routeData.points[routeData.points.length - 1]);

    expect(positions[0]).toBeCloseTo(expectedFirst.x);
    expect(positions[2]).toBeCloseTo(expectedFirst.z);
    expect(positions[1]).toBeCloseTo(terrain.getHeightAt(expectedFirst.x, expectedFirst.z) + 0.25);

    const lastIndex = positions.length - 3;
    expect(positions[lastIndex]).toBeCloseTo(expectedLast.x);
    expect(positions[lastIndex + 2]).toBeCloseTo(expectedLast.z);
    expect(positions[lastIndex + 1]).toBeCloseTo(
      terrain.getHeightAt(expectedLast.x, expectedLast.z) + 0.25,
    );
  });
});
