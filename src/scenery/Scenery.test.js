import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildScenery, LATERAL_MIN, LATERAL_MAX } from './Scenery.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const terrain = { getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005 };
const routeData = {
  points: [
    { e: 10, n: 5 },
    { e: 20, n: 15 },
    { e: 30, n: 25 },
    { e: 45, n: 40 },
    { e: 60, n: 50 },
  ],
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

// Distance from the route curve, sampled densely, to sanity-check the lateral offset
// bound independently of buildScenery's internal sample spacing.
function nearestDistanceToRoute(position) {
  const routePoints = routeData.points.map((point) => {
    const { x, z } = routePointToWorld(point);
    return new THREE.Vector3(x, terrain.getHeightAt(x, z), z);
  });
  const curve = new THREE.CatmullRomCurve3(routePoints);
  const densePoints = curve.getSpacedPoints(1000);
  return densePoints.reduce(
    (min, point) => Math.min(min, Math.hypot(position.x - point.x, position.z - point.z)),
    Infinity,
  );
}

describe('buildScenery', () => {
  it('returns a group with a tree InstancedMesh and a rock InstancedMesh', () => {
    const group = buildScenery(routeData, terrain);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(2);
    expect(group.children[0]).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.children[1]).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.children[0].count).toBeGreaterThan(0);
    expect(group.children[1].count).toBeGreaterThan(0);
  });

  it('grounds every instance at terrain.getHeightAt(x, z)', () => {
    const group = buildScenery(routeData, terrain);

    for (const mesh of group.children) {
      for (const { position } of decomposeAll(mesh)) {
        expect(position.y).toBeCloseTo(terrain.getHeightAt(position.x, position.z));
      }
    }
  });

  it('keeps every instance within the lateral offset bounds of the route', () => {
    const group = buildScenery(routeData, terrain);

    for (const mesh of group.children) {
      for (const { position } of decomposeAll(mesh)) {
        const distance = nearestDistanceToRoute(position);
        expect(distance).toBeGreaterThanOrEqual(LATERAL_MIN - 0.5);
        expect(distance).toBeLessThanOrEqual(LATERAL_MAX + 0.5);
      }
    }
  });

  it('is deterministic across calls with the same inputs', () => {
    const first = buildScenery(routeData, terrain);
    const second = buildScenery(routeData, terrain);

    expect(second.children[0].count).toBe(first.children[0].count);
    expect(second.children[1].count).toBe(first.children[1].count);

    const matrixA = new THREE.Matrix4();
    const matrixB = new THREE.Matrix4();
    for (let c = 0; c < first.children.length; c += 1) {
      for (let i = 0; i < first.children[c].count; i += 1) {
        first.children[c].getMatrixAt(i, matrixA);
        second.children[c].getMatrixAt(i, matrixB);
        expect(matrixA.equals(matrixB)).toBe(true);
      }
    }
  });
});
