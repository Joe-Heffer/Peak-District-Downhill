import * as THREE from 'three';
import { createRandom } from '../procgen/createRandom.js';
import { buildShrubMatrices, buildShrubClumpGeometry, buildShrubMaterial } from './Shrubs.js';

// Heather shrubs only grow on 'heather' landcover — a taller, sparser accent layer on
// top of the grass clumps that already grow there too (Grass.js's
// GRASS_LANDCOVER_CLASSES intentionally still includes 'heather': real moorland has
// grass/moss undergrowth between shrubs, so this layers rather than replaces it).
// See docs/vegetation-rendering.md.
export const HEATHER_LANDCOVER_CLASSES = ['heather'];

// Sparser than grass's 3m spacing and 0.4 skip probability — heather reads as an
// occasional shrub accent, not continuous ground cover.
const SAMPLE_SPACING = 4;
export const LATERAL_MIN = 0.5;
export const LATERAL_MAX = 10;
const SIDES = [-1, 1];
const SKIP_PROBABILITY = 0.7;
// Rocks use 1337, trees 1338, grass 1339 (see Scenery.js/Grass.js) — heather claims
// the next stream in the shared seed-numbering scheme.
const SEED = 1340;

export const CLUMP_WIDTH = 0.75;
export const CLUMP_HEIGHT = 0.9; // taller than wide, vs grass's wider-than-tall blade
const PLANE_COUNT = 3; // fuller silhouette than grass's 2-plane cross
const MAX_RENDER_DISTANCE = 70; // metres — same flat cutoff as grass
// Stiff woody shrub: slower and much smaller sway than grass's thin blades.
const WIND_SPEED = 1.1;
const WIND_STRENGTH = 0.05;

// Near the style guide's Heather Charcoal (#2A2433) at the base, brightened up to a
// bloom purple at the tip (from Heather Purple #3D2F56) for in-game visibility — the
// same "brighten past the marketing swatch for legibility" move grass's TIP_COLOR
// already makes against raw Moss Green.
const BASE_COLOR = new THREE.Color(0x2a2138);
const TIP_COLOR = new THREE.Color(0x9a6bc4);

// Pure placement math — no DOM/canvas — so it's unit-testable independently of the
// mesh assembly below (see Heather.test.js).
export function buildHeatherMatrices(routeData, terrain, random = createRandom(SEED)) {
  return buildShrubMatrices(routeData, terrain, random, {
    sampleSpacing: SAMPLE_SPACING,
    lateralMin: LATERAL_MIN,
    lateralMax: LATERAL_MAX,
    sides: SIDES,
    skipProbability: SKIP_PROBABILITY,
    landcoverClasses: HEATHER_LANDCOVER_CLASSES,
    scaleMin: 0.8,
    scaleMax: 1.3,
  });
}

export function buildHeatherClumpGeometry(width = CLUMP_WIDTH, height = CLUMP_HEIGHT) {
  return buildShrubClumpGeometry(width, height, PLANE_COUNT, BASE_COLOR, TIP_COLOR);
}

function buildHeatherMaterial(texture, windUniform) {
  return buildShrubMaterial(texture, windUniform, {
    windSpeed: WIND_SPEED,
    windStrength: WIND_STRENGTH,
    maxRenderDistance: MAX_RENDER_DISTANCE,
  });
}

// A mounded cluster of overlapping blobs with a few stem lines beneath — only the
// alpha channel matters (alphaTest cutout); colour comes from the baked vertex-colour
// gradient. A rounder, mounded silhouette than grass's tapered blades, generated at
// runtime the same "no external asset" way createGrassTexture() is.
function createHeatherTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const blobCount = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  for (let i = 0; i < blobCount; i += 1) {
    const cx = size * (0.2 + (i / blobCount) * 0.6 + (Math.random() - 0.5) * 0.15);
    const cy = size * (0.15 + Math.random() * 0.35);
    const radius = size * (0.12 + Math.random() * 0.08);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
    ctx.beginPath();
    ctx.moveTo(cx, size);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Assembles the final InstancedMesh — the only DOM/canvas-touching piece of this
// module, so it isn't unit tested (buildHeatherMatrices/buildHeatherClumpGeometry
// above cover the pure logic); `windUniform` is the same shared { value } object
// Scenery.js threads through grass/bracken too.
export function buildHeather(routeData, terrain, windUniform) {
  const matrices = buildHeatherMatrices(routeData, terrain);
  const geometry = buildHeatherClumpGeometry();
  const material = buildHeatherMaterial(createHeatherTexture(), windUniform);

  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
