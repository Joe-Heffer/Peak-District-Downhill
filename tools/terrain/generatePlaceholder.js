#!/usr/bin/env node
// Generates a synthetic, clearly-labelled placeholder terrain + route so the game is
// runnable end to end during development without needing the real EA LIDAR / OSM data
// yet. NOT derived from any real survey. Run `npm run terrain:build` (after following
// tools/terrain/README.md) to replace these files with the real Cut Gate dataset.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { BNG_BBOX, LOCAL_ORIGIN, TARGET_MAX_SAMPLES_PER_SIDE, TERRAIN_OUT, ROUTE_OUT } from './config.js';

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

mkdirSync(dirname(fileURLToPath(TERRAIN_OUT)), { recursive: true });
mkdirSync(dirname(fileURLToPath(ROUTE_OUT)), { recursive: true });
writeFileSync(TERRAIN_OUT, JSON.stringify(terrainData));
writeFileSync(ROUTE_OUT, JSON.stringify(routeData));

console.log(`Wrote placeholder terrain (${cols}x${rows} @ ${cellSize}m) and route (${routePoints.length} points).`);
console.log('Reminder: this is synthetic placeholder data, not real Cut Gate topology.');
