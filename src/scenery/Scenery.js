import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const SAMPLE_SPACING = 10; // metres between candidate placement slots along the route
export const LATERAL_MIN = 5;
export const LATERAL_MAX = 15;
const SKIP_PROBABILITY = 0.45; // fraction of candidate slots left bare
const TREE_PROBABILITY = 0.4; // of the remaining slots, fraction that become trees vs rocks
const TREE_COLOR = 0x3d4d30; // matches HeightmapTerrain's CLASS_COLORS.wood
const ROCK_COLOR = 0x8f8a80; // matches HeightmapTerrain's CLASS_COLORS.rock
const TREE_HEIGHT = 3;
const SEED = 1337;

const UP = new THREE.Vector3(0, 1, 0);

// mulberry32 — small seeded PRNG so scenery placement is reproducible across runs/tests
// rather than reshuffling on every load.
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTreeGeometry() {
  const geometry = new THREE.ConeGeometry(1, TREE_HEIGHT, 7);
  geometry.translate(0, TREE_HEIGHT / 2, 0); // base at y=0 instead of centred on it
  return geometry;
}

function buildRockGeometry() {
  return new THREE.IcosahedronGeometry(1, 0);
}

function buildInstancedMesh(geometry, color, matrices) {
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// Purely decorative — scatters low-poly trees/rocks within LATERAL_MIN..LATERAL_MAX of the
// route corridor, grounded via terrain.getHeightAt so they sit flush with the same
// heightfield the bike physics uses. Static: transforms are set once via setMatrixAt, not
// touched again per frame.
export function buildScenery(routeData, terrain) {
  const random = createRandom(SEED);

  const routePoints = routeData.points.map((point) => {
    const { x, z } = routePointToWorld(point);
    return new THREE.Vector3(x, terrain.getHeightAt(x, z), z);
  });

  const curve = new THREE.CatmullRomCurve3(routePoints);
  const sampleCount = Math.max(2, Math.floor(curve.getLength() / SAMPLE_SPACING));
  const spacedPoints = curve.getSpacedPoints(sampleCount);

  const treeMatrices = [];
  const rockMatrices = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < spacedPoints.length; i += 1) {
    const t = THREE.MathUtils.clamp(i / (spacedPoints.length - 1), 0, 1);
    const tangent = curve.getTangentAt(t);
    const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    for (const side of [-1, 1]) {
      if (random() < SKIP_PROBABILITY) continue;

      const lateral = LATERAL_MIN + random() * (LATERAL_MAX - LATERAL_MIN);
      const x = spacedPoints[i].x + perpendicular.x * lateral * side;
      const z = spacedPoints[i].z + perpendicular.z * lateral * side;
      const y = terrain.getHeightAt(x, z);

      position.set(x, y, z);
      quaternion.setFromAxisAngle(UP, random() * Math.PI * 2);
      const instanceScale = 0.75 + random() * 0.75;
      scale.set(instanceScale, instanceScale, instanceScale);

      const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
      if (random() < TREE_PROBABILITY) treeMatrices.push(matrix);
      else rockMatrices.push(matrix);
    }
  }

  const group = new THREE.Group();
  group.add(buildInstancedMesh(buildTreeGeometry(), TREE_COLOR, treeMatrices));
  group.add(buildInstancedMesh(buildRockGeometry(), ROCK_COLOR, rockMatrices));
  return group;
}
