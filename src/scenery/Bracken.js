import * as THREE from 'three';
import { createRandom } from '../procgen/createRandom.js';
import { buildShrubMatrices, buildShrubClumpGeometry, buildShrubMaterial } from './Shrubs.js';

// Bracken clusters grow on 'grass' landcover — a sparse accent on top of the grass
// clumps that already cover most of the route, not a second full ground-cover layer.
// See docs/vegetation-rendering.md.
export const BRACKEN_LANDCOVER_CLASSES = ['grass'];

// Sparser still than heather — bracken is an occasional accent over grass's already
// dense ground cover, not a second continuous layer.
const SAMPLE_SPACING = 6;
export const LATERAL_MIN = 0.5;
export const LATERAL_MAX = 10;
const SIDES = [-1, 1];
const SKIP_PROBABILITY = 0.6;
// Rocks use 1337, trees 1338, grass 1339, heather 1340 (see Scenery.js/Grass.js/
// Heather.js) — bracken claims the next stream in the shared seed-numbering scheme.
const SEED = 1341;

export const CLUMP_WIDTH = 0.8;
export const CLUMP_HEIGHT = 1.1; // tallest of the three families — arching fronds
const PLANE_COUNT = 3;
const MAX_RENDER_DISTANCE = 70; // metres — same flat cutoff as grass/heather
// More flexible than heather's stiff woody stems, stiffer than grass's thin blades.
const WIND_SPEED = 1.3;
const WIND_STRENGTH = 0.08;

// Dark brown-green litter/stem base, brightened to an amber-orange tip (from Bracken
// Orange #C6702F) for in-game visibility, matching the brighten-for-legibility move
// grass's and heather's tip colours already make against their marketing swatches.
const BASE_COLOR = new THREE.Color(0x3a2f18);
const TIP_COLOR = new THREE.Color(0xe0863a);

// Pure placement math — no DOM/canvas — so it's unit-testable independently of the
// mesh assembly below (see Bracken.test.js).
export function buildBrackenMatrices(routeData, terrain, random = createRandom(SEED)) {
  return buildShrubMatrices(routeData, terrain, random, {
    sampleSpacing: SAMPLE_SPACING,
    lateralMin: LATERAL_MIN,
    lateralMax: LATERAL_MAX,
    sides: SIDES,
    skipProbability: SKIP_PROBABILITY,
    landcoverClasses: BRACKEN_LANDCOVER_CLASSES,
    scaleMin: 0.8,
    scaleMax: 1.3,
  });
}

export function buildBrackenClumpGeometry(width = CLUMP_WIDTH, height = CLUMP_HEIGHT) {
  return buildShrubClumpGeometry(width, height, PLANE_COUNT, BASE_COLOR, TIP_COLOR);
}

function buildBrackenMaterial(texture, windUniform) {
  return buildShrubMaterial(texture, windUniform, {
    windSpeed: WIND_SPEED,
    windStrength: WIND_STRENGTH,
    maxRenderDistance: MAX_RENDER_DISTANCE,
  });
}

// Wide fern-frond shapes — a central curved stem with small leaflets alternating
// along its length — only the alpha channel matters (alphaTest cutout); colour comes
// from the baked vertex-colour gradient. A jagged, pinnate silhouette distinct from
// both grass's tapered blades and heather's mounded blobs, generated at runtime the
// same "no external asset" way createGrassTexture()/createHeatherTexture() are.
function createBrackenTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const frondCount = 4;
  const leafletCount = 5;
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';

  for (let i = 0; i < frondCount; i += 1) {
    const baseX = size * (0.2 + (i / frondCount) * 0.6 + (Math.random() - 0.5) * 0.1);
    const tipX = baseX + (Math.random() - 0.5) * size * 0.3;
    const stemWidth = 6 + Math.random() * 4;

    ctx.lineWidth = stemWidth * 0.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
    ctx.beginPath();
    ctx.moveTo(baseX, size);
    ctx.quadraticCurveTo((baseX + tipX) / 2, size * 0.4, tipX, 0);
    ctx.stroke();

    for (let j = 1; j <= leafletCount; j += 1) {
      const t = j / (leafletCount + 1);
      const stemX = baseX + (tipX - baseX) * t;
      const stemY = size * (1 - t);
      const side = j % 2 === 0 ? 1 : -1;
      const leafletX = stemX + side * (stemWidth * 0.9);

      ctx.beginPath();
      ctx.ellipse(leafletX, stemY, size * 0.06, size * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Assembles the final InstancedMesh — the only DOM/canvas-touching piece of this
// module, so it isn't unit tested (buildBrackenMatrices/buildBrackenClumpGeometry
// above cover the pure logic); `windUniform` is the same shared { value } object
// Scenery.js threads through grass/heather too.
export function buildBracken(routeData, terrain, windUniform) {
  const matrices = buildBrackenMatrices(routeData, terrain);
  const geometry = buildBrackenClumpGeometry();
  const material = buildBrackenMaterial(createBrackenTexture(), windUniform);

  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
