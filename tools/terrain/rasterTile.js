// Shared Environment Agency LIDAR raster tile loading + bilinear sampling, used by both
// buildTerrain.js (DTM) and buildTrees.js (DTM + DSM) — see tools/terrain/README.md for
// how the .asc/.tif tiles get there. Supports Esri ASCII grid (.asc) natively and
// GeoTIFF (.tif/.tiff) via the `geotiff` package (dev-only dependency, never shipped to
// the browser bundle).

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

export async function loadTile(filePath) {
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

// Shared GeoTIFF-open + georeferencing step for both the single-band (elevation) and
// multi-band (RGB aerial photography) readers below.
async function openGeoTiffImage(filePath) {
  const { fromFile } = await import('geotiff');
  const tiff = await fromFile(filePath);
  const image = await tiff.getImage();
  const [minX, minY, , maxY] = image.getBoundingBox();
  const ncols = image.getWidth();
  const nrows = image.getHeight();
  const cellsize = (maxY - minY) / nrows;
  const nodata = image.getGDALNoData() ?? -9999;
  return { image, xllcorner: minX, yllcorner: minY, cellsize, ncols, nrows, nodata };
}

async function loadGeoTiff(filePath) {
  const { image, xllcorner, yllcorner, cellsize, ncols, nrows, nodata } = await openGeoTiffImage(filePath);
  const rasters = await image.readRasters();
  const values = rasters[0];

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

// Multi-band reader for RGB(+) rasters like aerial photography GeoTIFFs — used by
// buildGroundTexture.js instead of loadTile/loadGeoTiff above, which only ever reads
// band 0 (fine for single-band elevation data, not for colour imagery). Returns the same
// georeferencing fields as loadGeoTiff/loadAsciiGrid so pixelBoundsForBbox below works
// against either, plus each band's raw samples and a getPixel(r, c) convenience
// accessor. Bands beyond the first three (if any, e.g. an alpha/infrared band) are
// ignored — ground photography is treated as RGB.
export async function loadRgbGeoTiff(filePath) {
  const { image, xllcorner, yllcorner, cellsize, ncols, nrows, nodata } = await openGeoTiffImage(filePath);
  const rasters = await image.readRasters();
  const bands = [rasters[0], rasters[1] ?? rasters[0], rasters[2] ?? rasters[0]];

  return {
    xllcorner,
    yllcorner,
    cellsize,
    ncols,
    nrows,
    nodata,
    bands,
    getPixel: (r, c) => {
      const i = r * ncols + c;
      return [bands[0][i], bands[1][i], bands[2][i]];
    },
  };
}

// Converts an easting/northing bbox into the pixel row/col rectangle covering it within
// `tile` (clamped to the tile's own extent) — e.g. for sharp's extract({left, top, width,
// height}) to crop a specific real-world area out of a loaded RGB tile. Row 0 is the
// north edge of the tile, matching sampleTile's rowF convention below.
export function pixelBoundsForBbox(tile, bbox) {
  const { xllcorner, yllcorner, cellsize, ncols, nrows } = tile;
  const colForEasting = (easting) => (easting - xllcorner) / cellsize;
  const rowForNorthing = (northing) => nrows - (northing - yllcorner) / cellsize;

  const left = Math.max(0, Math.floor(colForEasting(bbox.minE)));
  const right = Math.min(ncols, Math.ceil(colForEasting(bbox.maxE)));
  const top = Math.max(0, Math.floor(rowForNorthing(bbox.maxN)));
  const bottom = Math.min(nrows, Math.ceil(rowForNorthing(bbox.minN)));

  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function sampleTile(tile, easting, northing) {
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

export function sampleTiles(tiles, easting, northing) {
  for (const tile of tiles) {
    const value = sampleTile(tile, easting, northing);
    if (value !== null) return value;
  }
  return null;
}

// Loads every .asc/.tif/.tiff tile in a directory (non-recursive) — used for both the
// DTM tiles in RAW_DIR and the DSM tiles in RAW_DSM_DIR.
export async function loadTilesFromDir(dirPath) {
  const files = readdirSync(dirPath).filter((name) => /\.(asc|tif|tiff)$/i.test(name));
  const tiles = [];
  for (const file of files) {
    const tile = await loadTile(join(dirPath, file));
    if (tile) tiles.push(tile);
  }
  return tiles;
}

// RGB counterpart to loadTilesFromDir — aerial photography is only ever delivered as
// GeoTIFF (no .asc equivalent for colour imagery), used by buildGroundTexture.js against
// RAW_AERIAL_DIR.
export async function loadRgbTilesFromDir(dirPath) {
  const files = readdirSync(dirPath).filter((name) => /\.(tif|tiff)$/i.test(name));
  const tiles = [];
  for (const file of files) {
    tiles.push(await loadRgbGeoTiff(join(dirPath, file)));
  }
  return tiles;
}
