import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRouteOverlay, routePointToWorld } from './RouteOverlay.js';

const ROUTE_HEIGHT_OFFSET = 0.16; // matches RouteOverlay.js's ROUTE_STYLE.heightOffset

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
  const material = new THREE.MeshBasicMaterial();

  it('returns a THREE.Mesh with a ribbon geometry (position/color/uv attributes)', () => {
    const mesh = buildRouteOverlay(routeData, terrain, material);

    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.material).toBe(material);
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(mesh.geometry.attributes.color).toBeDefined();
    expect(mesh.geometry.attributes.uv).toBeDefined();
  });

  it('places the first and last curve samples using the shared e/n -> x/z conversion plus the route height offset', () => {
    // buildRouteOverlay resamples the CatmullRomCurve3 for the rendered ribbon, but a
    // Catmull-Rom curve always passes exactly through its own control points, so the
    // densified geometry's first/last centerline vertices coincide with routeData's
    // first/last points. Each centerline sample emits two ribbon rail vertices (offset
    // +-halfWidth), so the centerline is their average.
    const mesh = buildRouteOverlay(routeData, terrain, material);
    const positions = mesh.geometry.attributes.position.array;

    const expectedFirst = routePointToWorld(routeData.points[0]);
    const expectedLast = routePointToWorld(routeData.points[routeData.points.length - 1]);

    const firstCenter = {
      x: (positions[0] + positions[3]) / 2,
      y: (positions[1] + positions[4]) / 2,
      z: (positions[2] + positions[5]) / 2,
    };
    expect(firstCenter.x).toBeCloseTo(expectedFirst.x);
    expect(firstCenter.z).toBeCloseTo(expectedFirst.z);
    expect(firstCenter.y).toBeCloseTo(
      terrain.getHeightAt(expectedFirst.x, expectedFirst.z) + ROUTE_HEIGHT_OFFSET,
    );

    const lastIndex = positions.length - 6;
    const lastCenter = {
      x: (positions[lastIndex] + positions[lastIndex + 3]) / 2,
      y: (positions[lastIndex + 1] + positions[lastIndex + 4]) / 2,
      z: (positions[lastIndex + 2] + positions[lastIndex + 5]) / 2,
    };
    expect(lastCenter.x).toBeCloseTo(expectedLast.x);
    expect(lastCenter.z).toBeCloseTo(expectedLast.z);
    expect(lastCenter.y).toBeCloseTo(
      terrain.getHeightAt(expectedLast.x, expectedLast.z) + ROUTE_HEIGHT_OFFSET,
    );
  });
});
