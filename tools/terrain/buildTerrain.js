#!/usr/bin/env node
// Reads Environment Agency LIDAR Composite DTM tile(s) placed by hand in
// tools/terrain/raw/ (see tools/terrain/README.md for how to obtain them), resamples
// them onto a uniform square-celled grid covering BNG_BBOX, and writes the baked
// heightmap consumed at runtime by src/terrain/HeightmapTerrain.js.
//
// Supports Esri ASCII grid (.asc) natively and GeoTIFF (.tif/.tiff) via the `geotiff`
// package (dev-only dependency, never shipped to the browser bundle).

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';
import {
  BNG_BBOX,
  LOCAL_ORIGIN,
  TARGET_MAX_SAMPLES_PER_SIDE,
  RAW_DIR,
  TERRAIN_OUT,
  ATTRIBUTION,
} from './config.js';

async function loadTile(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.asc') return loadAsciiGrid(filePath);
  if (ext === '.tif' || ext === '.tiff') return loadGeoTiff(filePath);
  return null;
}

function loadAsciiGrid(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  const header = {};
  let lineIndex = 0;
  while (lineIndex < lines.length && /^[a-zA-Z]/.test(lines[lineIndex].trim())) {
    const [key, value] = lines[lineIndex].trim().split(/\s+/);
    header[key.toLowerCase()] = Number(value);
    lineIndex += 1;
  }

  const ncols = header.ncols;
  const nrows = header.nrows;
  const cellsize = header.cellsize;
  const xllcorner = header.xllcorner ?? header.xllcenter;
  const yllcorner = header.yllcorner ?? header.yllcenter;
  const nodata = header.nodata_value ?? -9999;

  const values = new Float64Array(ncols * nrows);
  let cursor = 0;
  for (; lineIndex < lines.length && cursor < values.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    for (const token of line.split(/\s+/)) {
      values[cursor] = Number(token);
      cursor += 1;
    }
  }

  return {
    xllcorner,
    yllcorner,
    cellsize,
    ncols,
    nrows,
    nodata,
    get: (r, c) => values[r * ncols + c],
  };
}

async function loadGeoTiff(filePath) {
  const { fromFile } = await import('geotiff');
  const tiff = await fromFile(filePath);
  const image = await tiff.getImage();
  const [minX, minY, , maxY] = image.getBoundingBox();
  const ncols = image.getWidth();
  const nrows = image.getHeight();
  const cellsize = (maxY - minY) / nrows;
  const rasters = await image.readRasters();
  const values = rasters[0];
  const nodata = image.getGDALNoData() ?? -9999;

  return {
    xllcorner: minX,
    yllcorner: minY,
    cellsize,
    ncols,
    nrows,
    nodata,
    get: (r, c) => values[r * ncols + c],
  };
}

function sampleTile(tile, easting, northing) {
  const { xllcorner, yllcorner, cellsize, ncols, nrows, nodata, get } = tile;
  const maxEasting = xllcorner + (ncols - 1) * cellsize;
  const maxNorthing = yllcorner + (nrows - 1) * cellsize;
  if (easting < xllcorner || easting > maxEasting || northing < yllcorner || northing > maxNorthing) {
    return null;
  }

  const colF = (easting - xllcorner) / cellsize;
  const rowF = nrows - 1 - (northing - yllcorner) / cellsize; // row 0 = north edge of the tile

  const c0 = Math.floor(colF);
  const c1 = Math.min(c0 + 1, ncols - 1);
  const r0 = Math.floor(rowF);
  const r1 = Math.min(r0 + 1, nrows - 1);
  const tc = colF - c0;
  const tr = rowF - r0;

  const v00 = get(r0, c0);
  const v10 = get(r0, c1);
  const v01 = get(r1, c0);
  const v11 = get(r1, c1);
  if ([v00, v10, v01, v11].some((v) => v === nodata)) return null;

  const top = v00 + (v10 - v00) * tc;
  const bottom = v01 + (v11 - v01) * tc;
  return top + (bottom - top) * tr;
}

function sampleTiles(tiles, easting, northing) {
  for (const tile of tiles) {
    const value = sampleTile(tile, easting, northing);
    if (value !== null) return value;
  }
  return null;
}

async function main() {
  const rawDirPath = fileURLToPath(RAW_DIR);
  const files = readdirSync(rawDirPath).filter((name) => /\.(asc|tif|tiff)$/i.test(name));
  if (files.length === 0) {
    throw new Error(
      `No .asc/.tif tiles found in ${rawDirPath}. Download the Environment Agency LIDAR ` +
        'Composite DTM tile(s) covering the Cut Gate bounding box first — see ' +
        'tools/terrain/README.md.',
    );
  }

  const tiles = [];
  for (const file of files) {
    const tile = await loadTile(join(rawDirPath, file));
    if (tile) tiles.push(tile);
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
