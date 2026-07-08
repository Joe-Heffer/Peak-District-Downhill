import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildBrackenMatrices,
  buildBrackenClumpGeometry,
  BRACKEN_LANDCOVER_CLASSES,
  LATERAL_MIN,
  LATERAL_MAX,
  CLUMP_WIDTH,
  CLUMP_HEIGHT,
} from './Bracken.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';

const terrain = {
  getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005,
  // Alternates grass/track in 5m-wide east-west stripes so filtering has a real,
  // checkable effect rather than accepting/rejecting everything.
  getLandcoverAt: (x) => (Math.floor(x / 5) % 2 === 0 ? 'grass' : 'track'),
};

const routeData = {
  points: Array.from({ length: 15 }, (_, i) => ({ e: i * 15, n: i * 4 })),
};

function nearestDistanceToRoute(position) {
  const curve = buildRouteCurve(routeData, terrain);
  const densePoints = curve.getSpacedPoints(1000);
  return densePoints.reduce(
    (min, point) => Math.min(min, Math.hypot(position.x - point.x, position.z - point.z)),
    Infinity,
  );
}

describe('buildBrackenMatrices', () => {
  it('places at least one clump along the route corridor', () => {
    const matrices = buildBrackenMatrices(routeData, terrain);
    expect(matrices.length).toBeGreaterThan(0);
  });

  it('grounds every clump at terrain.getHeightAt(x, z)', () => {
    const matrices = buildBrackenMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      expect(position.y).toBeCloseTo(terrain.getHeightAt(position.x, position.z));
    }
  });

  it('only places clumps on grass landcover', () => {
    const matrices = buildBrackenMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const landcoverClass = terrain.getLandcoverAt(position.x, position.z);
      expect(BRACKEN_LANDCOVER_CLASSES).toContain(landcoverClass);
    }
  });

  it('excludes clumps entirely when nothing is grass', () => {
    const allTrack = { ...terrain, getLandcoverAt: () => 'track' };
    const matrices = buildBrackenMatrices(routeData, allTrack);
    expect(matrices).toHaveLength(0);
  });

  it('keeps every clump within the lateral offset bounds of the route', () => {
    const matrices = buildBrackenMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const distance = nearestDistanceToRoute(position);
      expect(distance).toBeGreaterThanOrEqual(LATERAL_MIN - 0.5);
      expect(distance).toBeLessThanOrEqual(LATERAL_MAX + 0.5);
    }
  });

  it('is deterministic across calls with the same inputs', () => {
    const first = buildBrackenMatrices(routeData, terrain);
    const second = buildBrackenMatrices(routeData, terrain);
    expect(second).toHaveLength(first.length);
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));
  });

  it('accepts an injected random generator for isolated determinism checks', () => {
    const first = buildBrackenMatrices(routeData, terrain, createRandom(7));
    const second = buildBrackenMatrices(routeData, terrain, createRandom(7));
    expect(second).toHaveLength(first.length);
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));

    const third = buildBrackenMatrices(routeData, terrain, createRandom(8));
    const anyDifferent = third.length !== first.length
      || third.some((matrix, i) => !matrix.equals(first[i]));
    expect(anyDifferent).toBe(true);
  });
});

describe('buildBrackenClumpGeometry', () => {
  it('builds a fuller 3-plane clump: 12 vertices, 6 triangles', () => {
    const geometry = buildBrackenClumpGeometry();
    expect(geometry.attributes.position.count).toBe(12);
    expect(geometry.index.count).toBe(18);
  });

  it('spans from y=0 (base) to y=height (tip)', () => {
    const geometry = buildBrackenClumpGeometry(CLUMP_WIDTH, CLUMP_HEIGHT);
    const position = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
    }
    expect(minY).toBeCloseTo(0);
    expect(maxY).toBeCloseTo(CLUMP_HEIGHT);
  });

  it('bakes an amber-orange vertex-colour gradient, darker at the base than the tip', () => {
    const geometry = buildBrackenClumpGeometry();
    const uv = geometry.attributes.uv;
    const color = geometry.attributes.color;
    expect(color).toBeDefined();

    const luminance = (i) => color.getX(i) + color.getY(i) + color.getZ(i);
    const baseLuminances = [];
    const tipLuminances = [];
    for (let i = 0; i < uv.count; i += 1) {
      if (uv.getY(i) === 0) baseLuminances.push(luminance(i));
      else if (uv.getY(i) === 1) tipLuminances.push(luminance(i));
    }

    expect(baseLuminances.length).toBeGreaterThan(0);
    expect(tipLuminances.length).toBeGreaterThan(0);
    for (const base of baseLuminances) {
      for (const tip of tipLuminances) {
        expect(base).toBeLessThan(tip);
      }
    }
  });
});
