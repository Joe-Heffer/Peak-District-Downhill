#!/usr/bin/env node
// Reads Environment Agency LIDAR Composite DTM tile(s) placed by hand in
// tools/terrain/raw/ (see tools/terrain/README.md for how to obtain them), resamples
// them onto a uniform square-celled grid covering a location's BNG_BBOX, and writes the
// baked heightmap consumed at runtime by src/terrain/HeightmapTerrain.js.
//
// Supports Esri ASCII grid (.asc) natively and GeoTIFF (.tif/.tiff) via the `geotiff`
// package (dev-only dependency, never shipped to the browser bundle).
//
// Builds every configured location by default (see resolveLocationSlugs in config.js) —
// pass --location=<slug> to build just one.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  getLocation,
  localOriginOf,
  outputPathsFor,
  resolveLocationSlugs,
  TARGET_MAX_SAMPLES_PER_SIDE,
  RAW_DIR,
  ATTRIBUTION,
} from './config.js';
import { loadTilesFromDir, sampleTiles } from './rasterTile.js';

async function buildTerrainFor(location) {
  const bbox = location.bbox;
  const terrainOut = outputPathsFor(location.slug).terrain;

  const rawDirPath = fileURLToPath(RAW_DIR);
  const tiles = await loadTilesFromDir(rawDirPath);
  if (tiles.length === 0) {
    throw new Error(
      `No .asc/.tif tiles found in ${rawDirPath}. Download the Environment Agency LIDAR ` +
        `Composite DTM tile(s) covering the ${location.name} bounding box first — see ` +
        'tools/terrain/README.md.',
    );
  }

  const bboxWidth = bbox.maxE - bbox.minE;
  const bboxHeight = bbox.maxN - bbox.minN;
  const rawCellSize = Math.max(bboxWidth, bboxHeight) / TARGET_MAX_SAMPLES_PER_SIDE;
  const cellSize = Math.max(5, Math.round(rawCellSize / 5) * 5);
  const cols = Math.round(bboxWidth / cellSize) + 1;
  const rows = Math.round(bboxHeight / cellSize) + 1;

  const heights = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < cols; i += 1) {
    const column = new Array(rows);
    for (let j = 0; j < rows; j += 1) {
      const easting = bbox.minE + i * cellSize;
      const northing = bbox.minN + j * cellSize;
      const elevation = sampleTiles(tiles, easting, northing);
      if (elevation === null) {
        throw new Error(
          `No elevation data covering (${easting}, ${northing}) — the downloaded tile(s) ` +
            `don't fully cover ${location.name}'s bbox in tools/terrain/config.js.`,
        );
      }
      column[j] = elevation;
      min = Math.min(min, elevation);
      max = Math.max(max, elevation);
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
    crs: 'EPSG:27700',
    origin: localOriginOf(location),
    cellSize,
    cols,
    rows,
    baseElevation,
    minElevation: min,
    maxElevation: max,
    source: `Environment Agency LIDAR Composite DTM, resampled from source resolution to ${cellSize}m`,
    license: ATTRIBUTION.terrain,
    heights,
  };

  mkdirSync(dirname(fileURLToPath(terrainOut)), { recursive: true });
  writeFileSync(terrainOut, JSON.stringify(terrainData));
  console.log(
    `Wrote ${fileURLToPath(terrainOut)} (${cols}x${rows} @ ${cellSize}m, elevation ` +
      `${min.toFixed(1)}-${max.toFixed(1)}m).`,
  );
}

async function main() {
  for (const slug of resolveLocationSlugs()) {
    await buildTerrainFor(getLocation(slug));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
