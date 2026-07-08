import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRandom } from '../procgen/createRandom.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';
import { sampleAlongRoute } from '../procgen/sampleAlongRoute.js';
import { jitterLateral } from '../procgen/jitterLateral.js';
import { filterByLandcover } from '../procgen/filterByLandcover.js';
import { groundPoints } from '../procgen/groundPoints.js';
import { toInstanceMatrices } from '../procgen/toInstanceMatrices.js';

// Grass only grows on these landcover classes — kept off track and out from under
// dense wood canopy. See docs/vegetation-rendering.md.
export const GRASS_LANDCOVER_CLASSES = ['grass', 'heather'];
// Denser than the rock corridor sampling (10m) since grass needs to read as continuous
// ground cover, not a sparse scatter.
const SAMPLE_SPACING = 3;
export const LATERAL_MIN = 0.5;
export const LATERAL_MAX = 10;
// Two candidate clumps per side per sample, thinned by SKIP_PROBABILITY — keeps
// instance counts in the low thousands over a real multi-kilometre route rather than
// hundreds of thousands (see docs/vegetation-rendering.md's explicit budget).
const SIDES = [-1, -1, 1, 1];
const SKIP_PROBABILITY = 0.4;
// Rocks use SEED 1337, trees 1338 (see Scenery.js) — grass gets its own stream.
const SEED = 1339;

export const CLUMP_WIDTH = 0.6;
export const CLUMP_HEIGHT = 0.45;
const MAX_RENDER_DISTANCE = 70; // metres — flat cutoff per docs/vegetation-rendering.md
const WIND_SPEED = 1.6;
const WIND_STRENGTH = 0.15;

// Darker base -> lighter tip, anchored near the style guide's Moss Green (#5E7A3F) —
// a cheap fake-AO/backlight cheat baked straight into the geometry's vertex colours
// instead of relying on real lighting/shadows for shape.
const BASE_COLOR = new THREE.Color(0x33421f);
const TIP_COLOR = new THREE.Color(0x7fa050);

// Pure placement math — no DOM/canvas — so it's unit-testable independently of the
// mesh assembly below (see Grass.test.js).
export function buildGrassMatrices(routeData, terrain, random = createRandom(SEED)) {
  const curve = buildRouteCurve(routeData, terrain);
  const samples = sampleAlongRoute(curve, SAMPLE_SPACING);
  const candidates = jitterLateral(samples, random, {
    lateralMin: LATERAL_MIN,
    lateralMax: LATERAL_MAX,
    sides: SIDES,
    skipProbability: SKIP_PROBABILITY,
  });
  const onGrass = filterByLandcover(candidates, terrain, GRASS_LANDCOVER_CLASSES);
  const grounded = groundPoints(onGrass, terrain);

  return toInstanceMatrices(grounded, random, {
    scaleFn: (point, rnd) => 0.8 + rnd() * 0.6,
  });
}

// A cross-quad clump: two unsubdivided planes (2 triangles each, 4 total) crossed at
// right angles, cheap enough for low-thousands of instances in one draw call. Base
// pinned at y=0, tip at y=height, with a vertex-colour gradient baked from uv.y (0 at
// base, 1 at tip) — see BASE_COLOR/TIP_COLOR above.
export function buildGrassClumpGeometry(width = CLUMP_WIDTH, height = CLUMP_HEIGHT) {
  const planeA = new THREE.PlaneGeometry(width, height);
  planeA.translate(0, height / 2, 0);
  const planeB = planeA.clone();
  planeB.rotateY(Math.PI / 2);

  const geometry = mergeGeometries([planeA, planeB]);

  const uv = geometry.attributes.uv;
  const colors = new Float32Array(uv.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < uv.count; i += 1) {
    color.copy(BASE_COLOR).lerp(TIP_COLOR, uv.getY(i));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return geometry;
}

// A small cluster of tapered blade shapes in solid white on a transparent background —
// only the alpha channel matters (used for alphaTest cutout); shading comes entirely
// from the baked vertex-colour gradient, not texture colour. Generated at runtime, same
// "no external asset" pattern as HeightmapTerrain.js's createPlaceholderGroundTexture().
function createGrassTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const bladeCount = 6;
  for (let i = 0; i < bladeCount; i += 1) {
    const baseX = size * (0.15 + (i / bladeCount) * 0.7 + (Math.random() - 0.5) * 0.08);
    const tipX = baseX + (Math.random() - 0.5) * size * 0.25;
    const width = 3 + Math.random() * 3;

    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, size);
    ctx.quadraticCurveTo(baseX, size * 0.4, tipX, 0);
    ctx.quadraticCurveTo(baseX + width, size * 0.4, baseX + width / 2, size);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Injects wind sway (uv.y-weighted, phase-offset per instance so patches don't move in
// lockstep) and a flat max-render-distance cutoff into MeshStandardMaterial's own
// shader via onBeforeCompile — keeps the built-in lighting/fog/IBL integration (so
// grass reads consistently across every ?sky= preset) instead of hand-rolling a
// ShaderMaterial. Both injection points use chunk names that have been stable in
// three.js for a very long time (<common>, <begin_vertex>, <alphatest_fragment>).
function buildGrassMaterial(texture, windUniform) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    vertexColors: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  // onBeforeCompile only runs on an actual WebGL compile, which needs a real renderer —
  // stash the uniform here too so tests/other code can confirm the wind wiring without
  // spinning up a GPU context.
  material.userData.windUniform = windUniform;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.uniforms.uMaxDistance = { value: MAX_RENDER_DISTANCE };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uMaxDistance;
        varying float vGrassDistance;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 grassInstanceWorldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float windPhase = grassInstanceWorldPos.x * 0.6 + grassInstanceWorldPos.z * 0.9;
        #else
          vec4 grassInstanceWorldPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float windPhase = 0.0;
        #endif
        float grassSway = sin(uTime * ${WIND_SPEED.toFixed(3)} + windPhase) * ${WIND_STRENGTH.toFixed(3)} * uv.y;
        transformed.x += grassSway;
        transformed.z += grassSway * 0.6;
        vGrassDistance = distance(grassInstanceWorldPos.xyz, cameraPosition);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uMaxDistance;
        varying float vGrassDistance;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        if (vGrassDistance > uMaxDistance) discard;`,
      );
  };

  return material;
}

// Assembles the final InstancedMesh — the only DOM/canvas-touching piece of this
// module, so (like HeightmapTerrain.js's buildTerrainMesh) it isn't unit tested;
// buildGrassMatrices/buildGrassClumpGeometry above cover the pure logic. `windUniform`
// is a shared { value } object owned by Scenery.js so a future tree-canopy sway (#180)
// can reuse the same wind system without new plumbing.
export function buildGrass(routeData, terrain, windUniform) {
  const matrices = buildGrassMatrices(routeData, terrain);
  const geometry = buildGrassClumpGeometry();
  const material = buildGrassMaterial(createGrassTexture(), windUniform);

  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
