import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';
import { sampleAlongRoute } from '../procgen/sampleAlongRoute.js';
import { jitterLateral } from '../procgen/jitterLateral.js';
import { groundPoints } from '../procgen/groundPoints.js';
import { toInstanceMatrices } from '../procgen/toInstanceMatrices.js';
import { buildGrass } from './Grass.js';

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
// Rocks use SEED, trees SEED + 1, grass SEED + 2 (see Grass.js) — one shared scheme so
// every scattered content type gets its own reproducible random stream.
const SEED = 1337;

const UP = new THREE.Vector3(0, 1, 0);

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
// the route corridor, grounded via terrain.getHeightAt — built through the shared
// procgen pipeline (src/procgen/) rather than bespoke scatter code, so future scattered
// content (mud patches, warning signs, ...) is a matter of composing the same stages.
function buildRockMatrices(routeData, terrain) {
  const random = createRandom(SEED);
  const curve = buildRouteCurve(routeData, terrain);
  const samples = sampleAlongRoute(curve, SAMPLE_SPACING);
  const candidates = jitterLateral(samples, random, {
    lateralMin: LATERAL_MIN,
    lateralMax: LATERAL_MAX,
    skipProbability: ROCK_SKIP_PROBABILITY,
  });
  const grounded = groundPoints(candidates, terrain);

  return toInstanceMatrices(grounded, random, {
    scaleFn: (point, rnd) => 0.75 + rnd() * 0.75,
  });
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

// Purely decorative. Trees and rocks are static: transforms are set once via
// setMatrixAt, not touched again per frame. Grass alone animates, driven by a single
// shared uTime uniform (see Grass.js) updated once per frame via the returned
// group.update(dt) — stashing a lifecycle hook directly on the Object3D, the same
// pattern setupSky.js already uses for sky.onBeforeRender — so future scattered
// content sharing this wind system (tree canopy sway, #180) needs no new plumbing.
export function buildScenery(routeData, treesData, terrain) {
  const group = new THREE.Group();
  group.add(buildInstancedMesh(buildTreeGeometry(), TREE_COLOR, buildTreeMatrices(treesData, terrain)));
  group.add(buildInstancedMesh(buildRockGeometry(), ROCK_COLOR, buildRockMatrices(routeData, terrain)));

  const windUniform = { value: 0 };
  group.add(buildGrass(routeData, terrain, windUniform));
  group.update = (dt) => {
    windUniform.value += dt;
  };

  return group;
}
