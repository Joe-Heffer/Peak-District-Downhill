import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildShrubMatrices, buildShrubClumpGeometry } from './Shrubs.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';

const terrain = {
  getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005,
  // Alternates heather/track in 5m-wide east-west stripes so filtering has a real,
  // checkable effect rather than accepting/rejecting everything.
  getLandcoverAt: (x) => (Math.floor(x / 5) % 2 === 0 ? 'heather' : 'track'),
};

const routeData = {
  points: Array.from({ length: 15 }, (_, i) => ({ e: i * 15, n: i * 4 })),
};

const options = {
  sampleSpacing: 4,
  lateralMin: 0.5,
  lateralMax: 10,
  sides: [-1, 1],
  skipProbability: 0.3,
  landcoverClasses: ['heather'],
  scaleMin: 0.8,
  scaleMax: 1.3,
};

function nearestDistanceToRoute(position) {
  const curve = buildRouteCurve(routeData, terrain);
  const densePoints = curve.getSpacedPoints(1000);
  return densePoints.reduce(
    (min, point) => Math.min(min, Math.hypot(position.x - point.x, position.z - point.z)),
    Infinity,
  );
}

describe('buildShrubMatrices', () => {
  it('places at least one clump along the route corridor', () => {
    const matrices = buildShrubMatrices(routeData, terrain, createRandom(1), options);
    expect(matrices.length).toBeGreaterThan(0);
  });

  it('grounds every clump at terrain.getHeightAt(x, z)', () => {
    const matrices = buildShrubMatrices(routeData, terrain, createRandom(1), options);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      expect(position.y).toBeCloseTo(terrain.getHeightAt(position.x, position.z));
    }
  });

  it('only places clumps on the requested landcover classes', () => {
    const matrices = buildShrubMatrices(routeData, terrain, createRandom(1), options);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const landcoverClass = terrain.getLandcoverAt(position.x, position.z);
      expect(options.landcoverClasses).toContain(landcoverClass);
    }
  });

  it('excludes clumps entirely when the landcover never matches', () => {
    const allTrack = { ...terrain, getLandcoverAt: () => 'track' };
    const matrices = buildShrubMatrices(routeData, allTrack, createRandom(1), options);
    expect(matrices).toHaveLength(0);
  });

  it('keeps every clump within the lateral offset bounds of the route', () => {
    const matrices = buildShrubMatrices(routeData, terrain, createRandom(1), options);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const distance = nearestDistanceToRoute(position);
      expect(distance).toBeGreaterThanOrEqual(options.lateralMin - 0.5);
      expect(distance).toBeLessThanOrEqual(options.lateralMax + 0.5);
    }
  });

  it('is deterministic across calls with the same seed', () => {
    const first = buildShrubMatrices(routeData, terrain, createRandom(7), options);
    const second = buildShrubMatrices(routeData, terrain, createRandom(7), options);
    expect(second).toHaveLength(first.length);
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));

    const third = buildShrubMatrices(routeData, terrain, createRandom(8), options);
    const anyDifferent = third.length !== first.length
      || third.some((matrix, i) => !matrix.equals(first[i]));
    expect(anyDifferent).toBe(true);
  });
});

describe('buildShrubClumpGeometry', () => {
  const baseColor = new THREE.Color(0x202020);
  const tipColor = new THREE.Color(0xe0e0e0);

  it('matches the grass 2-plane cross at planeCount=2 (regression guard)', () => {
    const geometry = buildShrubClumpGeometry(0.6, 0.45, 2, baseColor, tipColor);
    expect(geometry.attributes.position.count).toBe(8);
    expect(geometry.index.count).toBe(12);
  });

  it('builds a fuller clump at planeCount=3: three unsubdivided planes, 6 triangles total', () => {
    const geometry = buildShrubClumpGeometry(0.75, 0.9, 3, baseColor, tipColor);
    // Each PlaneGeometry(w, h) has 4 vertices / 2 triangles; three merged planes -> 12/6.
    expect(geometry.attributes.position.count).toBe(12);
    expect(geometry.index.count).toBe(18); // 6 triangles * 3 indices
  });

  it('spans from y=0 (base) to y=height (tip)', () => {
    const height = 0.9;
    const geometry = buildShrubClumpGeometry(0.75, height, 3, baseColor, tipColor);
    const position = geometry.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      minY = Math.min(minY, position.getY(i));
      maxY = Math.max(maxY, position.getY(i));
    }
    expect(minY).toBeCloseTo(0);
    expect(maxY).toBeCloseTo(height);
  });

  it('bakes a vertex-colour gradient that is darker at the base than at the tip', () => {
    const geometry = buildShrubClumpGeometry(0.75, 0.9, 3, baseColor, tipColor);
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

  it('respects custom width/height', () => {
    const geometry = buildShrubClumpGeometry(2, 3, 3, baseColor, tipColor);
    const position = geometry.attributes.position;
    let maxY = -Infinity;
    let maxAbsX = 0;
    let maxAbsZ = 0;
    for (let i = 0; i < position.count; i += 1) {
      maxY = Math.max(maxY, position.getY(i));
      maxAbsX = Math.max(maxAbsX, Math.abs(position.getX(i)));
      maxAbsZ = Math.max(maxAbsZ, Math.abs(position.getZ(i)));
    }
    expect(maxY).toBeCloseTo(3);
    expect(Math.max(maxAbsX, maxAbsZ)).toBeCloseTo(1); // half of width 2
  });
});
