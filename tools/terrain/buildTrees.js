#!/usr/bin/env node
// Derives real tree positions and heights from Environment Agency LIDAR by computing a
// canopy height model (nDSM = DSM - DTM) over BNG_BBOX and finding individual canopy
// apexes in it, then writes the baked tree data consumed at runtime by
// src/scenery/Scenery.js — see issue #50.
//
// Requires the DTM tile(s) already downloaded for buildTerrain.js (tools/terrain/raw/)
// plus a second, separately-downloaded LIDAR Composite DSM tile set covering the same
// area in tools/terrain/raw/dsm/ (see tools/terrain/README.md) — the EA survey portal
// publishes DTM and DSM as separate downloads.
//
// Sampled at a finer TREE_CELL_SIZE than the coarse terrain heights grid (cutgate.json),
// since individual tree crowns are only a few metres across and would be invisible at
// the terrain grid's resolution.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { BNG_BBOX, LOCAL_ORIGIN, RAW_DIR, RAW_DSM_DIR, TREES_OUT, ATTRIBUTION } from './config.js';
import { loadTilesFromDir, sampleTiles } from './rasterTile.js';
import { detectTreeApexes, DEFAULT_MIN_CANOPY_HEIGHT, DEFAULT_MIN_SEPARATION } from './treeDetection.js';

const TREE_CELL_SIZE = 2; // metres — fine enough to resolve individual tree crowns

async function main() {
  const dtmDirPath = fileURLToPath(RAW_DIR);
  const dtmTiles = await loadTilesFromDir(dtmDirPath);
  if (dtmTiles.length === 0) {
    throw new Error(
      `No DTM tiles found in ${dtmDirPath} — run buildTerrain.js's download step first ` +
        '(tools/terrain/README.md).',
    );
  }

  const dsmDirPath = fileURLToPath(RAW_DSM_DIR);
  const dsmTiles = await loadTilesFromDir(dsmDirPath);
  if (dsmTiles.length === 0) {
    throw new Error(
      `No DSM tiles found in ${dsmDirPath}. Download the Environment Agency LIDAR ` +
        'Composite DSM tile(s) covering the Cut Gate bounding box — see tools/terrain/README.md.',
    );
  }

  const bboxWidth = BNG_BBOX.maxE - BNG_BBOX.minE;
  const bboxHeight = BNG_BBOX.maxN - BNG_BBOX.minN;
  const cols = Math.round(bboxWidth / TREE_CELL_SIZE) + 1;
  const rows = Math.round(bboxHeight / TREE_CELL_SIZE) + 1;

  // LOCAL_ORIGIN is exactly (BNG_BBOX.minE, BNG_BBOX.minN) — see config.js — so this
  // grid's own local e/n (i * cellSize, j * cellSize) already lines up with the
  // easting/northing sampled here without any further offset, same as buildTerrain.js's
  // heights grid.
  const grid = {
    cols,
    rows,
    cellSize: TREE_CELL_SIZE,
    get(i, j) {
      const easting = BNG_BBOX.minE + i * TREE_CELL_SIZE;
      const northing = BNG_BBOX.minN + j * TREE_CELL_SIZE;
      const dtm = sampleTiles(dtmTiles, easting, northing);
      const dsm = sampleTiles(dsmTiles, easting, northing);
      if (dtm === null || dsm === null) return null;
      return dsm - dtm;
    },
  };

  const trees = detectTreeApexes(grid, {
    minCanopyHeight: DEFAULT_MIN_CANOPY_HEIGHT,
    minSeparation: DEFAULT_MIN_SEPARATION,
  }).map(({ e, n, height, radius }) => ({
    e,
    n,
    height: Math.round(height * 10) / 10,
    radius: Math.round(radius * 10) / 10,
  }));

  const treesData = {
    crs: 'EPSG:27700',
    origin: LOCAL_ORIGIN,
    source:
      `Environment Agency LIDAR Composite DSM minus Composite DTM (canopy height model), ` +
      `sampled at ${TREE_CELL_SIZE}m, local maxima above ${DEFAULT_MIN_CANOPY_HEIGHT}m ` +
      `apart by at least ${DEFAULT_MIN_SEPARATION}m.`,
    license: ATTRIBUTION.trees,
    trees,
  };

  mkdirSync(dirname(fileURLToPath(TREES_OUT)), { recursive: true });
  writeFileSync(TREES_OUT, JSON.stringify(treesData));
  console.log(`Wrote ${fileURLToPath(TREES_OUT)} (${trees.length} trees detected).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
