#!/usr/bin/env node
// Reads Environment Agency LIDAR Composite DTM tile(s) placed by hand in
// tools/terrain/raw/ (see tools/terrain/README.md for how to obtain them), resamples
// them onto a uniform square-celled grid covering BNG_BBOX, and writes the baked
// heightmap consumed at runtime by src/terrain/HeightmapTerrain.js.
//
// Supports Esri ASCII grid (.asc) natively and GeoTIFF (.tif/.tiff) via the `geotiff`
// package (dev-only dependency, never shipped to the browser bundle).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  BNG_BBOX,
  LOCAL_ORIGIN,
  TARGET_MAX_SAMPLES_PER_SIDE,
  RAW_DIR,
  TERRAIN_OUT,
  ATTRIBUTION,
} from './config.js';
import { loadTilesFromDir, sampleTiles } from './rasterTile.js';

async function main() {
  const rawDirPath = fileURLToPath(RAW_DIR);
  const tiles = await loadTilesFromDir(rawDirPath);
  if (tiles.length === 0) {
    throw new Error(
      `No .asc/.tif tiles found in ${rawDirPath}. Download the Environment Agency LIDAR ` +
        'Composite DTM tile(s) covering the Cut Gate bounding box first — see ' +
        'tools/terrain/README.md.',
    );
  }

  const bboxWidth = BNG_BBOX.maxE - BNG_BBOX.minE;
  const bboxHeight = BNG_BBOX.maxN - BNG_BBOX.minN;
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
      const easting = BNG_BBOX.minE + i * cellSize;
      const northing = BNG_BBOX.minN + j * cellSize;
      const elevation = sampleTiles(tiles, easting, northing);
      if (elevation === null) {
        throw new Error(
          `No elevation data covering (${easting}, ${northing}) — the downloaded tile(s) ` +
            "don't fully cover BNG_BBOX in tools/terrain/config.js.",
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
    origin: LOCAL_ORIGIN,
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

  mkdirSync(dirname(fileURLToPath(TERRAIN_OUT)), { recursive: true });
  writeFileSync(TERRAIN_OUT, JSON.stringify(terrainData));
  console.log(
    `Wrote ${fileURLToPath(TERRAIN_OUT)} (${cols}x${rows} @ ${cellSize}m, elevation ` +
      `${min.toFixed(1)}-${max.toFixed(1)}m).`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
