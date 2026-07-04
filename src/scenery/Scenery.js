import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const SAMPLE_SPACING = 10; // metres between candidate rock placement slots along the route
export const LATERAL_MIN = 5;
export const LATERAL_MAX = 15;
// Rocks are the only thing left scattered randomly along the route now that tree
// placement comes from real LIDAR canopy data (see treesData below) — tuned to roughly
// match this random layer's previous combined tree+rock density (55% kept * 60% rock).
const ROCK_SKIP_PROBABILITY = 0.67;
const ROCK_COLOR = 0x8f8a80; // matches HeightmapTerrain's CLASS_COLORS.rock
const TREE_COLOR = 0x3d4d30; // matches HeightmapTerrain's CLASS_COLORS.wood
export const TREE_UNIT_HEIGHT = 3; // cone geometry's baked height; scaled per-instance below
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
  const geometry = new THREE.ConeGeometry(1, TREE_UNIT_HEIGHT, 7);
  geometry.translate(0, TREE_UNIT_HEIGHT / 2, 0); // base at y=0 instead of centred on it
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

// Rocks are still a purely decorative random scatter within LATERAL_MIN..LATERAL_MAX of
// the route corridor, grounded via terrain.getHeightAt.
function buildRockMatrices(routeData, terrain) {
  const random = createRandom(SEED);

  const routePoints = routeData.points.map((point) => {
    const { x, z } = routePointToWorld(point);
    return new THREE.Vector3(x, terrain.getHeightAt(x, z), z);
  });

  const curve = new THREE.CatmullRomCurve3(routePoints);
  const sampleCount = Math.max(2, Math.floor(curve.getLength() / SAMPLE_SPACING));
  const spacedPoints = curve.getSpacedPoints(sampleCount);

  const matrices = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < spacedPoints.length; i += 1) {
    const t = THREE.MathUtils.clamp(i / (spacedPoints.length - 1), 0, 1);
    const tangent = curve.getTangentAt(t);
    const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    for (const side of [-1, 1]) {
      if (random() < ROCK_SKIP_PROBABILITY) continue;

      const lateral = LATERAL_MIN + random() * (LATERAL_MAX - LATERAL_MIN);
      const x = spacedPoints[i].x + perpendicular.x * lateral * side;
      const z = spacedPoints[i].z + perpendicular.z * lateral * side;
      const y = terrain.getHeightAt(x, z);

      position.set(x, y, z);
      quaternion.setFromAxisAngle(UP, random() * Math.PI * 2);
      const instanceScale = 0.75 + random() * 0.75;
      scale.set(instanceScale, instanceScale, instanceScale);

      matrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
    }
  }

  return matrices;
}

// Trees are placed at real positions/heights derived from LIDAR canopy data (nDSM local
// maxima — see tools/terrain/buildTrees.js and issue #50), not randomly scattered, so
// woodland only appears where Cut Gate actually has real wooded sections. Grounded via
// terrain.getHeightAt like everything else; height/radius scale the shared cone geometry
// per instance so canopy size follows the baked data instead of random jitter.
function buildTreeMatrices(treesData, terrain) {
  const random = createRandom(SEED + 1);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  return treesData.trees.map((tree) => {
    const { x, z } = routePointToWorld(tree);
    const y = terrain.getHeightAt(x, z);

    position.set(x, y, z);
    quaternion.setFromAxisAngle(UP, random() * Math.PI * 2);
    scale.set(tree.radius, tree.height / TREE_UNIT_HEIGHT, tree.radius);

    return new THREE.Matrix4().compose(position, quaternion, scale);
  });
}

// Purely decorative. Static: transforms are set once via setMatrixAt, not touched again
// per frame.
export function buildScenery(routeData, treesData, terrain) {
  const group = new THREE.Group();
  group.add(buildInstancedMesh(buildTreeGeometry(), TREE_COLOR, buildTreeMatrices(treesData, terrain)));
  group.add(buildInstancedMesh(buildRockGeometry(), ROCK_COLOR, buildRockMatrices(routeData, terrain)));
  return group;
}
