import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildScenery, LATERAL_MIN, LATERAL_MAX, TREE_UNIT_HEIGHT } from './Scenery.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

// Grass.js's buildGrass() generates a canvas texture, which needs a real DOM — not
// available under this project's default `node` Vitest environment (see
// vitest.config.js; same reason HeightmapTerrain.js's canvas-touching
// buildTerrainMesh has no test coverage). Placement/geometry logic (buildGrassMatrices,
// buildGrassClumpGeometry) is covered directly in Grass.test.js instead; here we only
// need a stand-in InstancedMesh so buildScenery's own grouping/wind-wiring is testable.
// vi.mock calls are hoisted above imports by vitest's transform, so this applies before
// Scenery.js (which imports buildGrass from Grass.js) is evaluated above.
vi.mock('./Grass.js', () => ({
  buildGrass: (routeData, terrain, windUniform) => {
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial(), 3);
    for (let i = 0; i < mesh.count; i += 1) mesh.setMatrixAt(i, new THREE.Matrix4());
    mesh.material.userData.windUniform = windUniform;
    return mesh;
  },
}));

const terrain = {
  getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005,
  getLandcoverAt: () => 'grass',
};
const routeData = {
  points: [
    { e: 10, n: 5 },
    { e: 20, n: 15 },
    { e: 30, n: 25 },
    { e: 45, n: 40 },
    { e: 60, n: 50 },
  ],
};
const treesData = {
  trees: [
    { e: 12, n: 8, height: 6, radius: 1.5 },
    { e: 33, n: 28, height: 9, radius: 2 },
    { e: 50, n: 45, height: 4, radius: 1 },
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

// Distance from the route curve, sampled densely, to sanity-check the rock scatter's
// lateral offset bound independently of buildScenery's internal sample spacing.
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
  it('returns a group with a tree, rock, and grass InstancedMesh', () => {
    const group = buildScenery(routeData, treesData, terrain);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(3);
    expect(group.children[0]).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.children[1]).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.children[2]).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.children[0].count).toBe(treesData.trees.length);
    expect(group.children[1].count).toBeGreaterThan(0);
    expect(group.children[2].count).toBeGreaterThan(0);
  });

  it('exposes update(dt) which advances the grass shader\'s shared wind uniform', () => {
    const group = buildScenery(routeData, treesData, terrain);
    const grassMesh = group.children[2];
    const windUniform = grassMesh.material.userData.windUniform;

    expect(typeof group.update).toBe('function');
    expect(windUniform.value).toBe(0);

    group.update(1 / 60);
    group.update(1 / 60);

    expect(windUniform.value).toBeCloseTo(2 / 60);
  });

  it('places one tree instance per treesData entry, grounded and sized from its data', () => {
    const group = buildScenery(routeData, treesData, terrain);
    const treeMesh = group.children[0];
    const instances = decomposeAll(treeMesh);

    expect(instances).toHaveLength(treesData.trees.length);
    instances.forEach((instance, index) => {
      const tree = treesData.trees[index];
      const { x, z } = routePointToWorld(tree);
      expect(instance.position.x).toBeCloseTo(x);
      expect(instance.position.z).toBeCloseTo(z);
      expect(instance.position.y).toBeCloseTo(terrain.getHeightAt(x, z));
      expect(instance.scale.y).toBeCloseTo(tree.height / TREE_UNIT_HEIGHT);
      expect(instance.scale.x).toBeCloseTo(tree.radius);
      expect(instance.scale.z).toBeCloseTo(tree.radius);
    });
  });

  it('grounds every rock instance at terrain.getHeightAt(x, z)', () => {
    const group = buildScenery(routeData, treesData, terrain);
    const rockMesh = group.children[1];

    for (const { position } of decomposeAll(rockMesh)) {
      expect(position.y).toBeCloseTo(terrain.getHeightAt(position.x, position.z));
    }
  });

  it('keeps every rock instance within the lateral offset bounds of the route', () => {
    const group = buildScenery(routeData, treesData, terrain);
    const rockMesh = group.children[1];

    for (const { position } of decomposeAll(rockMesh)) {
      const distance = nearestDistanceToRoute(position);
      expect(distance).toBeGreaterThanOrEqual(LATERAL_MIN - 0.5);
      expect(distance).toBeLessThanOrEqual(LATERAL_MAX + 0.5);
    }
  });

  it('is deterministic across calls with the same inputs', () => {
    const first = buildScenery(routeData, treesData, terrain);
    const second = buildScenery(routeData, treesData, terrain);

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

  it('renders no trees when treesData has none', () => {
    const group = buildScenery(routeData, { trees: [] }, terrain);
    expect(group.children[0].count).toBe(0);
  });
});
