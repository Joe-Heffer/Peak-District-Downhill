#!/usr/bin/env node
// Generates a synthetic, clearly-labelled placeholder terrain + route so the game is
// runnable end to end during development without needing the real EA LIDAR / OSM data
// yet. NOT derived from any real survey. Run `npm run terrain:build` (after following
// tools/terrain/README.md) to replace these files with the real Cut Gate dataset.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  BNG_BBOX,
  LOCAL_ORIGIN,
  TARGET_MAX_SAMPLES_PER_SIDE,
  TERRAIN_OUT,
  ROUTE_OUT,
  LANDCOVER_OUT,
  PATHS_OUT,
  TREES_OUT,
} from './config.js';
import { PATH_CATEGORIES, clipPolylineToBbox } from './pathClassification.js';
import { estimateCanopyRadius } from './treeDetection.js';

const LANDCOVER_CLASSES = ['grass', 'wood', 'rock', 'heather', 'track'];

const PLACEHOLDER_NOTICE =
  'PLACEHOLDER DATA — synthetic, not derived from any real survey. Run `npm run ' +
  'terrain:build` (see tools/terrain/README.md) to generate the real Cut Gate dataset.';

// Illustrative real-world reference points only — not used for anything but shaping the
// synthetic profile so it's roughly the right scale.
const TOP_ELEVATION = 539; // approx. Margery Hill summit, metres AOD
const BOTTOM_ELEVATION = 248; // approx. Upper Derwent valley floor, metres AOD

const bboxWidth = BNG_BBOX.maxE - BNG_BBOX.minE;
const bboxHeight = BNG_BBOX.maxN - BNG_BBOX.minN;
const rawCellSize = Math.max(bboxWidth, bboxHeight) / TARGET_MAX_SAMPLES_PER_SIDE;
const cellSize = Math.max(5, Math.round(rawCellSize / 5) * 5);
const cols = Math.round(bboxWidth / cellSize) + 1;
const rows = Math.round(bboxHeight / cellSize) + 1;

function syntheticElevation(i, j) {
  const t = j / (rows - 1); // 0 = south/bottom, 1 = north/top
  const along = BOTTOM_ELEVATION + t * (TOP_ELEVATION - BOTTOM_ELEVATION);
  const acrossFraction = i / (cols - 1) - 0.5;
  const valley = Math.abs(acrossFraction) * 40; // shallow valley cross-section
  const undulation = Math.sin(j * 0.15) * 6 + Math.sin(i * 0.4 + j * 0.05) * 3;
  return along + valley + undulation;
}

const heights = [];
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < cols; i += 1) {
  const column = new Array(rows);
  for (let j = 0; j < rows; j += 1) {
    const elevation = syntheticElevation(i, j);
    min = Math.min(min, elevation);
    max = Math.max(max, elevation);
    column[j] = elevation;
  }
  heights.push(column);
}

const baseElevation = Math.floor(min);
for (let i = 0; i < cols; i += 1) {
  for (let j = 0; j < rows; j += 1) {
    heights[i][j] -= baseElevation;
  }
}

const terrainData = {
  placeholder: true,
  crs: 'EPSG:27700',
  origin: LOCAL_ORIGIN,
  cellSize,
  cols,
  rows,
  baseElevation,
  minElevation: min,
  maxElevation: max,
  source: PLACEHOLDER_NOTICE,
  license: PLACEHOLDER_NOTICE,
  heights,
};

// A gently wandering line down the middle of the grid, from the high (north) end to the
// low (south) end — matches the real route's point-ordering convention (first point =
// top of descent).
const routeSamples = 40;
const routePoints = [];
for (let s = 0; s <= routeSamples; s += 1) {
  const j = rows - 1 - Math.round((s / routeSamples) * (rows - 1));
  const wanderFraction = 0.5 + 0.15 * Math.sin(s * 0.5);
  const i = wanderFraction * (cols - 1);
  routePoints.push({ e: i * cellSize, n: j * cellSize });
}

const routeData = {
  placeholder: true,
  crs: 'EPSG:27700',
  origin: LOCAL_ORIGIN,
  source: PLACEHOLDER_NOTICE,
  license: PLACEHOLDER_NOTICE,
  points: routePoints,
};

// Several synthetic branches per path category, forking off points spread along the
// placeholder route with a gentle deterministic wobble (sin-based, no Math.random(),
// same idiom as syntheticElevation()/the route's wanderFraction above) — enough to read
// as a real crisscrossing network for exercising src/routes/PathsOverlay.js's
// per-category rendering without needing network access. Widths mirror (but
// deliberately don't import — tools/terrain is a plain-Node pipeline kept independent
// of the Vite app) src/routes/PathsOverlay.js's PATH_STYLES widths, used here only to
// size each category's landcover track-buffer margin below.
const BRANCHES_PER_CATEGORY = 5;
const BRANCH_STEPS = 6;
const pathBranchLength = Math.min(bboxWidth, bboxHeight) * 0.15;
const CATEGORY_WIDTHS = { road: 3.5, bridleway: 1.8, footpath: 0.9 };

function routeDirectionAt(routeIndex) {
  const a = routePoints[Math.max(routeIndex - 1, 0)];
  const b = routePoints[Math.min(routeIndex + 1, routePoints.length - 1)];
  const len = Math.hypot(b.e - a.e, b.n - a.n) || 1;
  return { e: (b.e - a.e) / len, n: (b.n - a.n) / len };
}

// Forks off the route at `routeIndex`, heading away perpendicular to the route
// (`side`: +1/-1), with a lengthwise wobble so it doesn't read as a dead-straight spoke.
function branchFrom(routeIndex, side, length, steps, seed) {
  const origin = routePoints[routeIndex];
  const dir = routeDirectionAt(routeIndex);
  const perpE = -dir.n * side;
  const perpN = dir.e * side;

  const points = [origin];
  for (let s = 1; s <= steps; s += 1) {
    const t = (s / steps) * length;
    const wobble = Math.sin(seed + s * 0.9) * length * 0.12;
    points.push({ e: origin.e + perpE * t + dir.e * wobble, n: origin.n + perpN * t + dir.n * wobble });
  }
  return points;
}

const localBbox = { minE: 0, maxE: bboxWidth, minN: 0, maxN: bboxHeight };

const pathsData = {
  placeholder: true,
  crs: 'EPSG:27700',
  origin: LOCAL_ORIGIN,
  categories: PATH_CATEGORIES,
  source: PLACEHOLDER_NOTICE,
  license: PLACEHOLDER_NOTICE,
  paths: [],
};

// Interleave every category's branches along the route (rather than looping category
// then branch-index) so all 15 forks spread out to distinct points along the descent —
// looping the other way would put one branch of each category at the same 5 origins,
// stacking them into near-parallel clusters instead of a spread-out network.
const totalBranches = BRANCHES_PER_CATEGORY * PATH_CATEGORIES.length;
PATH_CATEGORIES.forEach((category, categoryIndex) => {
  for (let b = 0; b < BRANCHES_PER_CATEGORY; b += 1) {
    const globalIndex = categoryIndex * BRANCHES_PER_CATEGORY + b;
    const seed = globalIndex;
    const fraction = (globalIndex + 1) / (totalBranches + 1);
    const routeIndex = Math.round((0.05 + fraction * 0.9) * (routePoints.length - 1));
    const side = globalIndex % 2 === 0 ? 1 : -1;
    const length = pathBranchLength * (0.6 + 0.4 * Math.sin(seed * 1.3 + 1));
    const points = branchFrom(routeIndex, side, length, BRANCH_STEPS, seed);

    for (const segment of clipPolylineToBbox(points, localBbox)) {
      pathsData.paths.push({ category, wayId: null, points: segment });
    }
  }
});

// Synthetic landcover, deterministic (sin/cos-based, no Math.random()) like the
// elevation/route shaping above — a few fixed patches standing in for real OSM-derived
// classification so the landcover-tinted terrain feature is visible without network
// access. Priority when patches overlap: track > rock > wood > heather > grass, same as
// the real fetchLandcover.js.
const minSpan = Math.min(bboxWidth, bboxHeight);
const trackBuffer = cellSize / 2;

// Gritstone outcrop near the summit (high, north end).
const rockPatch = { e: bboxWidth * 0.3, n: bboxHeight * 0.78, radius: minSpan * 0.09 };
// Valley woodland blobs lower down the descent.
const woodPatches = [
  { e: bboxWidth * 0.6, n: bboxHeight * 0.45, radius: minSpan * 0.14 },
  { e: bboxWidth * 0.28, n: bboxHeight * 0.22, radius: minSpan * 0.12 },
];

function distanceToSegment(point, a, b) {
  const abE = b.e - a.e;
  const abN = b.n - a.n;
  const lenSq = abE * abE + abN * abN;
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((point.e - a.e) * abE + (point.n - a.n) * abN) / lenSq, 0), 1);
  const closestE = a.e + t * abE;
  const closestN = a.n + t * abN;
  return Math.hypot(point.e - closestE, point.n - closestN);
}

function distanceToPolyline(point, points) {
  let min = Infinity;
  for (let s = 0; s < points.length - 1; s += 1) {
    min = Math.min(min, distanceToSegment(point, points[s], points[s + 1]));
  }
  return min;
}

function distanceToRoute(point) {
  return distanceToPolyline(point, routePoints);
}

// Per-category buffer (half the ribbon width + a small margin, mirroring
// CATEGORY_WIDTHS above) so the terrain's tan `track` tint plausibly underlies each
// rendered path ribbon instead of leaving a visible grass/heather/wood seam at its
// edges — pathsData.paths is generated above, so it's already in scope here.
const PATH_TRACK_BUFFERS = Object.fromEntries(
  Object.entries(CATEGORY_WIDTHS).map(([category, width]) => [category, width / 2 + 2]),
);

function nearAnyPath(point) {
  return pathsData.paths.some(
    (path) => distanceToPolyline(point, path.points) <= PATH_TRACK_BUFFERS[path.category],
  );
}

function inEllipse(e, n, patch) {
  return Math.hypot(e - patch.e, n - patch.n) <= patch.radius;
}

// Broad mid-elevation moorland band with a wavy east-west edge, in the same undulating
// style as syntheticElevation() above.
function inHeatherBand(i, n) {
  const wobble = Math.sin(i * 0.15) * (bboxHeight * 0.03);
  const lower = bboxHeight * 0.32 + wobble;
  const upper = bboxHeight * 0.78 + wobble;
  return n >= lower && n <= upper;
}

function classifyPlaceholderCell(i, j) {
  const point = { e: i * cellSize, n: j * cellSize };
  if (distanceToRoute(point) <= trackBuffer) return 'track';
  if (nearAnyPath(point)) return 'track';
  if (inEllipse(point.e, point.n, rockPatch)) return 'rock';
  if (woodPatches.some((patch) => inEllipse(point.e, point.n, patch))) return 'wood';
  if (inHeatherBand(i, point.n)) return 'heather';
  return 'grass';
}

const landcoverHistogram = Object.fromEntries(LANDCOVER_CLASSES.map((c) => [c, 0]));
const landcover = [];
for (let i = 0; i < cols; i += 1) {
  const row = [];
  for (let j = 0; j < rows; j += 1) {
    const cls = classifyPlaceholderCell(i, j);
    landcoverHistogram[cls] += 1;
    row.push(LANDCOVER_CLASSES.indexOf(cls));
  }
  landcover.push(row);
}

const landcoverData = {
  placeholder: true,
  crs: 'EPSG:27700',
  origin: LOCAL_ORIGIN,
  cellSize,
  cols,
  rows,
  classes: LANDCOVER_CLASSES,
  landcover,
  source: PLACEHOLDER_NOTICE,
  license: PLACEHOLDER_NOTICE,
};

// Placeholder trees are scattered only inside the synthetic woodPatches above (matching
// the real nDSM-derived pipeline's "trees only where there's real canopy" property,
// rather than woodland-agnostic random scatter) on a jittered lattice, using the same
// deterministic sin/cos idiom as the rest of this script — no Math.random(). Canopy
// radius reuses estimateCanopyRadius from treeDetection.js so placeholder and real trees
// size the same way.
const TREE_LATTICE_SPACING = 10; // metres between candidate lattice points within a wood patch
const TREE_HEIGHT_MIN = 5;
const TREE_HEIGHT_MAX = 18;

const trees = [];
let treeSeed = 0;
for (const patch of woodPatches) {
  const steps = Math.round((patch.radius * 2) / TREE_LATTICE_SPACING);
  for (let a = 0; a <= steps; a += 1) {
    for (let b = 0; b <= steps; b += 1) {
      const e = patch.e - patch.radius + a * TREE_LATTICE_SPACING;
      const n = patch.n - patch.radius + b * TREE_LATTICE_SPACING;
      if (Math.hypot(e - patch.e, n - patch.n) > patch.radius) continue;

      treeSeed += 1;
      const jitterE = Math.sin(treeSeed * 12.9898) * (TREE_LATTICE_SPACING * 0.35);
      const jitterN = Math.cos(treeSeed * 78.233) * (TREE_LATTICE_SPACING * 0.35);
      const heightFraction = Math.sin(treeSeed * 4.71) * 0.5 + 0.5;
      const height = TREE_HEIGHT_MIN + heightFraction * (TREE_HEIGHT_MAX - TREE_HEIGHT_MIN);

      trees.push({
        e: e + jitterE,
        n: n + jitterN,
        height: Math.round(height * 10) / 10,
        radius: Math.round(estimateCanopyRadius(height) * 10) / 10,
      });
    }
  }
}

const treesData = {
  placeholder: true,
  crs: 'EPSG:27700',
  origin: LOCAL_ORIGIN,
  source: PLACEHOLDER_NOTICE,
  license: PLACEHOLDER_NOTICE,
  trees,
};

mkdirSync(dirname(fileURLToPath(TERRAIN_OUT)), { recursive: true });
mkdirSync(dirname(fileURLToPath(ROUTE_OUT)), { recursive: true });
mkdirSync(dirname(fileURLToPath(PATHS_OUT)), { recursive: true });
mkdirSync(dirname(fileURLToPath(TREES_OUT)), { recursive: true });
writeFileSync(TERRAIN_OUT, JSON.stringify(terrainData));
writeFileSync(ROUTE_OUT, JSON.stringify(routeData));
writeFileSync(LANDCOVER_OUT, JSON.stringify(landcoverData));
writeFileSync(PATHS_OUT, JSON.stringify(pathsData));
writeFileSync(TREES_OUT, JSON.stringify(treesData));

console.log(`Wrote placeholder terrain (${cols}x${rows} @ ${cellSize}m) and route (${routePoints.length} points).`);
console.log('Landcover class histogram:', landcoverHistogram);
console.log(`Wrote placeholder paths (${pathsData.paths.length} segments).`);
console.log(`Wrote placeholder trees (${trees.length} trees).`);
console.log('Reminder: this is synthetic placeholder data, not real Cut Gate topology.');
