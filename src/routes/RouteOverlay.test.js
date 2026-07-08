import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRouteOverlay, routePointToWorld, computeSpawnYaw } from './RouteOverlay.js';

const ROUTE_HEIGHT_OFFSET = 0.16; // matches RouteOverlay.js's ROUTE_STYLE.heightOffset
const ROUTE_COLUMNS = 5; // matches RouteOverlay.js's ROUTE_STYLE.rockiness.segments (4) + 1

describe('routePointToWorld', () => {
  it('maps e -> x and negates n -> z', () => {
    expect(routePointToWorld({ e: 12, n: -7 })).toEqual({ x: 12, z: 7 });
    expect(routePointToWorld({ e: 3, n: 4 })).toEqual({ x: 3, z: -4 });
  });
});

describe('computeSpawnYaw', () => {
  it('faces from the first point toward the second (east: +x -> yaw +90deg)', () => {
    const routeData = { points: [{ e: 0, n: 0 }, { e: 10, n: 0 }] };
    expect(computeSpawnYaw(routeData)).toBeCloseTo(Math.PI / 2);
  });

  it('faces south (n decreases -> world +z -> yaw 0)', () => {
    const routeData = { points: [{ e: 0, n: 10 }, { e: 0, n: 0 }] };
    expect(computeSpawnYaw(routeData)).toBeCloseTo(0);
  });

  it('matches the forward = (sin(yaw), 0, cos(yaw)) convention for an arbitrary heading', () => {
    const routeData = { points: [{ e: 0, n: 0 }, { e: 3, n: -4 }] };
    const yaw = computeSpawnYaw(routeData);
    const a = routePointToWorld(routeData.points[0]);
    const b = routePointToWorld(routeData.points[1]);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    expect(Math.sin(yaw) * dist).toBeCloseTo(b.x - a.x);
    expect(Math.cos(yaw) * dist).toBeCloseTo(b.z - a.z);
  });

  it('falls back to 0 for fewer than two points or coincident first two points', () => {
    expect(computeSpawnYaw({ points: [{ e: 5, n: 5 }] })).toBe(0);
    expect(computeSpawnYaw({ points: [] })).toBe(0);
    expect(computeSpawnYaw({ points: [{ e: 1, n: 1 }, { e: 1, n: 1 }] })).toBe(0);
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
    // first/last points. Each centerline sample emits ROUTE_COLUMNS ribbon
    // cross-section vertices (rockiness relief adds interior columns beyond the plain
    // left/right rail — see RouteOverlay.js's ROUTE_STYLE.rockiness.segments), so the
    // centerline is the average of the first (left rail) and last (right rail) column
    // of each row — the rail columns sit exactly on the flat baseline regardless of
    // rockiness (edgeFalloff is zero there), so this still holds.
    const mesh = buildRouteOverlay(routeData, terrain, material);
    const positions = mesh.geometry.attributes.position.array;
    const rowStride = ROUTE_COLUMNS * 3;

    const expectedFirst = routePointToWorld(routeData.points[0]);
    const expectedLast = routePointToWorld(routeData.points[routeData.points.length - 1]);

    const firstLeft = 0;
    const firstRight = (ROUTE_COLUMNS - 1) * 3;
    const firstCenter = {
      x: (positions[firstLeft] + positions[firstRight]) / 2,
      y: (positions[firstLeft + 1] + positions[firstRight + 1]) / 2,
      z: (positions[firstLeft + 2] + positions[firstRight + 2]) / 2,
    };
    expect(firstCenter.x).toBeCloseTo(expectedFirst.x);
    expect(firstCenter.z).toBeCloseTo(expectedFirst.z);
    expect(firstCenter.y).toBeCloseTo(
      terrain.getHeightAt(expectedFirst.x, expectedFirst.z) + ROUTE_HEIGHT_OFFSET,
    );

    const lastRowStart = positions.length - rowStride;
    const lastLeft = lastRowStart;
    const lastRight = lastRowStart + (ROUTE_COLUMNS - 1) * 3;
    const lastCenter = {
      x: (positions[lastLeft] + positions[lastRight]) / 2,
      y: (positions[lastLeft + 1] + positions[lastRight + 1]) / 2,
      z: (positions[lastLeft + 2] + positions[lastRight + 2]) / 2,
    };
    expect(lastCenter.x).toBeCloseTo(expectedLast.x);
    expect(lastCenter.z).toBeCloseTo(expectedLast.z);
    expect(lastCenter.y).toBeCloseTo(
      terrain.getHeightAt(expectedLast.x, expectedLast.z) + ROUTE_HEIGHT_OFFSET,
    );
  });
});
