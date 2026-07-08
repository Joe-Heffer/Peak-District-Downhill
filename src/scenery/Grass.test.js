import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildGrassMatrices,
  buildGrassClumpGeometry,
  GRASS_LANDCOVER_CLASSES,
  LATERAL_MIN,
  LATERAL_MAX,
  CLUMP_WIDTH,
  CLUMP_HEIGHT,
} from './Grass.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const terrain = {
  getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005,
  // Alternates grass/track in 5m-wide east-west stripes so filtering has a real,
  // checkable effect rather than accepting/rejecting everything.
  getLandcoverAt: (x) => (Math.floor(x / 5) % 2 === 0 ? 'grass' : 'track'),
};

const routeData = {
  points: Array.from({ length: 15 }, (_, i) => ({ e: i * 15, n: i * 4 })),
};

function decomposeAll(mesh) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const instances = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    matrix.decompose(position, quaternion, scale);
    instances.push({ position: position.clone(), scale: scale.clone() });
  }
  return instances;
}

function nearestDistanceToRoute(position) {
  const curve = buildRouteCurve(routeData, terrain);
  const densePoints = curve.getSpacedPoints(1000);
  return densePoints.reduce(
    (min, point) => Math.min(min, Math.hypot(position.x - point.x, position.z - point.z)),
    Infinity,
  );
}

describe('buildGrassMatrices', () => {
  it('places at least one clump along the route corridor', () => {
    const matrices = buildGrassMatrices(routeData, terrain);
    expect(matrices.length).toBeGreaterThan(0);
  });

  it('grounds every clump at terrain.getHeightAt(x, z)', () => {
    const matrices = buildGrassMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      expect(position.y).toBeCloseTo(terrain.getHeightAt(position.x, position.z));
    }
  });

  it('only places clumps on grass/heather landcover', () => {
    const matrices = buildGrassMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const landcoverClass = terrain.getLandcoverAt(position.x, position.z);
      expect(GRASS_LANDCOVER_CLASSES).toContain(landcoverClass);
    }
  });

  it('excludes clumps entirely when nothing is grass/heather', () => {
    const allTrack = { ...terrain, getLandcoverAt: () => 'track' };
    const matrices = buildGrassMatrices(routeData, allTrack);
    expect(matrices).toHaveLength(0);
  });

  it('keeps every clump within the lateral offset bounds of the route', () => {
    const matrices = buildGrassMatrices(routeData, terrain);
    for (const matrix of matrices) {
      const position = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      const distance = nearestDistanceToRoute(position);
      expect(distance).toBeGreaterThanOrEqual(LATERAL_MIN - 0.5);
      expect(distance).toBeLessThanOrEqual(LATERAL_MAX + 0.5);
    }
  });

  it('is deterministic across calls with the same inputs', () => {
    const first = buildGrassMatrices(routeData, terrain);
    const second = buildGrassMatrices(routeData, terrain);
    expect(second).toHaveLength(first.length);
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));
  });

  it('accepts an injected random generator for isolated determinism checks', () => {
    const first = buildGrassMatrices(routeData, terrain, createRandom(7));
    const second = buildGrassMatrices(routeData, terrain, createRandom(7));
    expect(second).toHaveLength(first.length);
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));

    const third = buildGrassMatrices(routeData, terrain, createRandom(8));
    const anyDifferent = third.length !== first.length
      || third.some((matrix, i) => !matrix.equals(first[i]));
    expect(anyDifferent).toBe(true);
  });
});

describe('buildGrassClumpGeometry', () => {
  it('builds a cross-quad clump: two unsubdivided planes, 4 triangles total', () => {
    const geometry = buildGrassClumpGeometry();
    // Each PlaneGeometry(w, h) has 4 vertices / 2 triangles; two merged planes -> 8/4.
    expect(geometry.attributes.position.count).toBe(8);
    expect(geometry.index.count).toBe(12); // 4 triangles * 3 indices
  });

  it('spans from y=0 (base) to y=height (tip)', () => {
    const geometry = buildGrassClumpGeometry(CLUMP_WIDTH, CLUMP_HEIGHT);
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

  it('bakes a vertex-colour gradient that is darker at the base than at the tip', () => {
    const geometry = buildGrassClumpGeometry();
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
    // Every base vertex should read darker than every tip vertex.
    for (const base of baseLuminances) {
      for (const tip of tipLuminances) {
        expect(base).toBeLessThan(tip);
      }
    }
  });

  it('respects custom width/height', () => {
    const geometry = buildGrassClumpGeometry(2, 3);
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
