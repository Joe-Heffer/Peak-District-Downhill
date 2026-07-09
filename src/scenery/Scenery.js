import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';
import { sampleAlongRoute } from '../procgen/sampleAlongRoute.js';
import { jitterLateral } from '../procgen/jitterLateral.js';
import { filterByLandcover } from '../procgen/filterByLandcover.js';
import { groundPoints } from '../procgen/groundPoints.js';
import { toInstanceMatrices } from '../procgen/toInstanceMatrices.js';
import { buildGrass } from './Grass.js';
import { buildHeather } from './Heather.js';
import { buildBracken } from './Bracken.js';

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
// Rocks use SEED, trees SEED + 1, grass SEED + 2 (see Grass.js), edge rocks SEED + 3 —
// one shared scheme so every scattered content type gets its own reproducible random stream.
const SEED = 1337;

// A denser, chunkier rock band hugging the trail's rim (close lateral range, restricted
// to track/rock landcover) — visually frames the ridden route's own rocky relief (see
// RouteOverlay.js's ROUTE_STYLE.rockiness) rather than scattering loosely across the
// whole corridor like the LATERAL_MIN..LATERAL_MAX band above.
const EDGE_ROCK_SAMPLE_SPACING = 4; // metres — denser than the main rock band's 10m
export const EDGE_ROCK_LATERAL_MIN = 1.3; // metres from centreline — just outside the 2.2m-wide ribbon
export const EDGE_ROCK_LATERAL_MAX = 2.4;
const EDGE_ROCK_SKIP_PROBABILITY = 0.55;
const EDGE_ROCK_LANDCOVER = ['track', 'rock'];
const EDGE_ROCK_SEED = SEED + 3;

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

// A tighter, chunkier rock band right along the trail rim — frames the route ribbon's
// own rock relief instead of scattering loosely across the whole corridor like
// buildRockMatrices above. Same procgen pipeline, plus filterByLandcover so instances
// only land on the track itself or adjacent rock ground, not stray onto grass/heather.
function buildEdgeRockMatrices(routeData, terrain) {
  const random = createRandom(EDGE_ROCK_SEED);
  const curve = buildRouteCurve(routeData, terrain);
  const samples = sampleAlongRoute(curve, EDGE_ROCK_SAMPLE_SPACING);
  const candidates = jitterLateral(samples, random, {
    lateralMin: EDGE_ROCK_LATERAL_MIN,
    lateralMax: EDGE_ROCK_LATERAL_MAX,
    skipProbability: EDGE_ROCK_SKIP_PROBABILITY,
  });
  const filtered = filterByLandcover(candidates, terrain, EDGE_ROCK_LANDCOVER);
  const grounded = groundPoints(filtered, terrain);

  // Sized as chunky trailside stones, not boulders: IcosahedronGeometry(1,0) has a 1m
  // base radius, so 0.35-0.8 scale keeps these under ~1.6m across — well inside the
  // main rock band's larger 0.75-1.5 scale range — so the edge band frames the narrow
  // 2.2m-wide ribbon instead of swallowing it.
  return toInstanceMatrices(grounded, random, {
    scaleFn: (point, rnd) => 0.35 + rnd() * 0.45,
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
// setMatrixAt, not touched again per frame. Grass, heather, and bracken all animate,
// driven by one shared uTime uniform (see Grass.js/Heather.js/Bracken.js) updated
// once per frame via the returned group.update(dt) — stashing a lifecycle hook
// directly on the Object3D, the same pattern setupSky.js already uses for
// sky.onBeforeRender — so future scattered content sharing this wind system (tree
// canopy sway, #180) needs no new plumbing.
export function buildScenery(routeData, treesData, terrain) {
  const group = new THREE.Group();
  group.add(buildInstancedMesh(buildTreeGeometry(), TREE_COLOR, buildTreeMatrices(treesData, terrain)));
  group.add(buildInstancedMesh(buildRockGeometry(), ROCK_COLOR, buildRockMatrices(routeData, terrain)));
  group.add(buildInstancedMesh(buildRockGeometry(), ROCK_COLOR, buildEdgeRockMatrices(routeData, terrain)));

  const windUniform = { value: 0 };
  group.add(buildGrass(routeData, terrain, windUniform));
  group.add(buildHeather(routeData, terrain, windUniform));
  group.add(buildBracken(routeData, terrain, windUniform));
  group.update = (dt) => {
    windUniform.value += dt;
  };

  return group;
}
