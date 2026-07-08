import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRouteCurve } from '../procgen/routeCurve.js';
import { sampleAlongRoute } from '../procgen/sampleAlongRoute.js';
import { jitterLateral } from '../procgen/jitterLateral.js';
import { filterByLandcover } from '../procgen/filterByLandcover.js';
import { groundPoints } from '../procgen/groundPoints.js';
import { toInstanceMatrices } from '../procgen/toInstanceMatrices.js';

// Shared building blocks for the "taller shrub" family (Heather.js, Bracken.js) —
// same procgen pipeline shape and cross-plane clump/shader approach as Grass.js's
// clumps, generalised so the geometry/shader logic isn't duplicated per variant.
// Grass.js itself is untouched; it predates this helper and isn't retrofitted onto it.

// Generalises Grass.js's buildGrassMatrices body: sample along the route, jitter
// laterally, restrict to the caller's landcover classes, ground, then scale/orient
// into instance matrices.
export function buildShrubMatrices(routeData, terrain, random, {
  sampleSpacing,
  lateralMin,
  lateralMax,
  sides,
  skipProbability,
  landcoverClasses,
  scaleMin,
  scaleMax,
}) {
  const curve = buildRouteCurve(routeData, terrain);
  const samples = sampleAlongRoute(curve, sampleSpacing);
  const candidates = jitterLateral(samples, random, {
    lateralMin,
    lateralMax,
    sides,
    skipProbability,
  });
  const onLandcover = filterByLandcover(candidates, terrain, landcoverClasses);
  const grounded = groundPoints(onLandcover, terrain);

  return toInstanceMatrices(grounded, random, {
    scaleFn: (point, rnd) => scaleMin + rnd() * (scaleMax - scaleMin),
  });
}

// A clump of `planeCount` unsubdivided planes fanned evenly across 180° (not 360° —
// a DoubleSide flat quad rotated 180° looks identical to itself, which is exactly why
// Grass.js's 2 planes sit 90° apart rather than 180°). More planes than grass's 2 reads
// as a fuller, bushier silhouette from more viewing angles. Same base-pinned/tip-swinging
// vertex-colour gradient bake as buildGrassClumpGeometry, parameterised on the caller's
// own base/tip colours instead of module-level constants.
export function buildShrubClumpGeometry(width, height, planeCount, baseColor, tipColor) {
  const planes = [];
  for (let i = 0; i < planeCount; i += 1) {
    const plane = new THREE.PlaneGeometry(width, height);
    plane.translate(0, height / 2, 0);
    plane.rotateY((Math.PI / planeCount) * i);
    planes.push(plane);
  }

  const geometry = mergeGeometries(planes);

  const uv = geometry.attributes.uv;
  const colors = new Float32Array(uv.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < uv.count; i += 1) {
    color.copy(baseColor).lerp(tipColor, uv.getY(i));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return geometry;
}

// Byte-for-byte the same onBeforeCompile wind-sway + distance-cutoff injection as
// Grass.js's buildGrassMaterial, parameterised on wind speed/strength/render distance
// instead of module constants, so each shrub variant can be stiffer/slower than grass.
export function buildShrubMaterial(texture, windUniform, { windSpeed, windStrength, maxRenderDistance }) {
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
    shader.uniforms.uMaxDistance = { value: maxRenderDistance };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uMaxDistance;
        varying float vShrubDistance;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 shrubInstanceWorldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float windPhase = shrubInstanceWorldPos.x * 0.6 + shrubInstanceWorldPos.z * 0.9;
        #else
          vec4 shrubInstanceWorldPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float windPhase = 0.0;
        #endif
        float shrubSway = sin(uTime * ${windSpeed.toFixed(3)} + windPhase) * ${windStrength.toFixed(3)} * uv.y;
        transformed.x += shrubSway;
        transformed.z += shrubSway * 0.6;
        vShrubDistance = distance(shrubInstanceWorldPos.xyz, cameraPosition);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uMaxDistance;
        varying float vShrubDistance;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        if (vShrubDistance > uMaxDistance) discard;`,
      );
  };

  return material;
}
