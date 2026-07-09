#!/usr/bin/env node
// Bakes a real, licensed aerial-photography ground texture for src/terrain/HeightmapTerrain.js
// out of a downloaded Environment Agency APGB/VAP GeoTIFF tile — see issue #51.
//
// HeightmapTerrain.js tiles a single square texture every TILE_SIZE=10m across the whole
// terrain mesh (RepeatWrapping), so this script doesn't drape a full orthophoto over the
// route — it crops one small, visually homogeneous sample area (TEXTURE_SAMPLE_AREA in
// config.js, picked by hand well away from paths/buildings/water, which are already
// rendered as their own overlays) and makes *that* seamlessly tileable, the same role
// createPlaceholderGroundTexture() plays in HeightmapTerrain.js until this has been run.
//
// Requires an aerial photography GeoTIFF tile already downloaded into
// tools/terrain/raw/aerial/ (see tools/terrain/README.md) — the EA survey portal is a
// manual browser download, same constraint as the DTM/DSM tiles buildTerrain.js/
// buildTrees.js already depend on.
//
// v1 scope limit: TEXTURE_SAMPLE_AREA must fall entirely within a single downloaded
// tile — no mosaicking across tile boundaries, same kind of documented limitation as
// fetchLandcover.js's multipolygon-relation skip.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import sharp from 'sharp';
import {
  RAW_AERIAL_DIR,
  TEXTURE_SAMPLE_AREA,
  GROUNDTEXTURE_OUT,
  GROUND_TEXTURE_IMAGE_OUT,
  ATTRIBUTION,
} from './config.js';
import { loadRgbTilesFromDir, pixelBoundsForBbox } from './rasterTile.js';

// Matches the committed placeholder ground.jpg's resolution and HeightmapTerrain.js's
// TILE_SIZE=10m tile — not imported directly since tools/terrain is a plain-Node
// pipeline kept independent of the Vite app (same reasoning as generatePlaceholder.js's
// PATH_STYLES comment).
const OUTPUT_SIZE_PX = 2048;
// Width of the feathered blend band at the seam left behind by the offset-quadrant
// tiling trick below, as a fraction of OUTPUT_SIZE_PX.
const BLEND_FRACTION = 0.08;

export function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function tileContainsBbox(tile, bbox) {
  const maxEasting = tile.xllcorner + tile.ncols * tile.cellsize;
  const maxNorthing = tile.yllcorner + tile.nrows * tile.cellsize;
  return (
    bbox.minE >= tile.xllcorner &&
    bbox.maxE <= maxEasting &&
    bbox.minN >= tile.yllcorner &&
    bbox.maxN <= maxNorthing
  );
}

// Interleaves the tile's three raster bands into an RGB pixel buffer for the given pixel
// rectangle — sharp's `raw` input format.
function extractRgbBuffer(tile, bounds) {
  const { bands, ncols } = tile;
  const { left, top, width, height } = bounds;
  const buffer = Buffer.alloc(width * height * 3);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    const row = top + y;
    for (let x = 0; x < width; x += 1) {
      const i = row * ncols + (left + x);
      buffer[o] = clampByte(bands[0][i]);
      buffer[o + 1] = clampByte(bands[1][i]);
      buffer[o + 2] = clampByte(bands[2][i]);
      o += 3;
    }
  }
  return buffer;
}

// Feathered alpha mask, maximal (opaque) along the centre cross at x=size/2, y=size/2
// and falling to zero over blendPx — used to blend a blurred copy of the offset image
// back over its own seam (see makeSeamlessTileable below).
export function buildSeamAlpha(size, blendPx) {
  const half = size / 2;
  const alpha = Buffer.alloc(size * size);
  for (let y = 0; y < size; y += 1) {
    const ay = Math.abs(y - half) < blendPx ? 255 * (1 - Math.abs(y - half) / blendPx) : 0;
    for (let x = 0; x < size; x += 1) {
      const ax = Math.abs(x - half) < blendPx ? 255 * (1 - Math.abs(x - half) / blendPx) : 0;
      alpha[y * size + x] = Math.round(Math.max(ax, ay));
    }
  }
  return alpha;
}

// Classic "Offset filter" trick for making a photo crop tileable: swap the image's four
// quadrants diagonally (equivalent to a cyclic wraparound shift by half width/height).
// The crop's real edges (which don't naturally match each other) end up stitched
// together at the *centre* of the result instead — an internal seam we can blur/feather
// away — while the new outer edges come from what were originally adjacent centre
// columns/rows of the source photo, so they already tile continuously with no visible
// seam of their own.
export async function makeSeamlessTileable(rgbBuffer, size) {
  const half = Math.floor(size / 2);
  const rest = size - half;
  const source = sharp(rgbBuffer, { raw: { width: size, height: size, channels: 3 } });

  const [topLeft, topRight, bottomLeft, bottomRight] = await Promise.all([
    source.clone().extract({ left: 0, top: 0, width: half, height: half }).raw().toBuffer(),
    source.clone().extract({ left: half, top: 0, width: rest, height: half }).raw().toBuffer(),
    source.clone().extract({ left: 0, top: half, width: half, height: rest }).raw().toBuffer(),
    source.clone().extract({ left: half, top: half, width: rest, height: rest }).raw().toBuffer(),
  ]);

  // sharp's `create` base gains an alpha channel as soon as it's composited onto, even
  // with a plain opaque background — removeAlpha() before reading it back as raw RGB is
  // required, or the byte stride below would be off by one channel and scramble every
  // pixel after the first.
  const offsetBuffer = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: bottomRight, raw: { width: rest, height: rest, channels: 3 }, left: 0, top: 0 },
      { input: bottomLeft, raw: { width: half, height: rest, channels: 3 }, left: rest, top: 0 },
      { input: topRight, raw: { width: rest, height: half, channels: 3 }, left: 0, top: rest },
      { input: topLeft, raw: { width: half, height: half, channels: 3 }, left: rest, top: rest },
    ])
    .removeAlpha()
    .raw()
    .toBuffer();

  const blendPx = Math.round(size * BLEND_FRACTION);
  const alpha = buildSeamAlpha(size, blendPx);
  const blurredRgba = await sharp(offsetBuffer, { raw: { width: size, height: size, channels: 3 } })
    .blur(Math.max(1, blendPx / 3))
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(offsetBuffer, { raw: { width: size, height: size, channels: 3 } })
    .composite([{ input: blurredRgba, blend: 'over' }])
    .jpeg({ quality: 90 });
}

async function main() {
  const aerialDirPath = fileURLToPath(RAW_AERIAL_DIR);
  const tiles = await loadRgbTilesFromDir(aerialDirPath);
  if (tiles.length === 0) {
    throw new Error(
      `No aerial photography tiles found in ${aerialDirPath} — download the Environment ` +
        'Agency APGB/VAP tile(s) covering the Cut Gate bounding box first, see tools/terrain/README.md.',
    );
  }

  const { centerE, centerN, sizeMetres } = TEXTURE_SAMPLE_AREA;
  const bbox = {
    minE: centerE - sizeMetres / 2,
    maxE: centerE + sizeMetres / 2,
    minN: centerN - sizeMetres / 2,
    maxN: centerN + sizeMetres / 2,
  };

  const tile = tiles.find((t) => tileContainsBbox(t, bbox));
  if (!tile) {
    throw new Error(
      'TEXTURE_SAMPLE_AREA in config.js does not fall entirely within any single downloaded ' +
        'aerial tile — pick a sample point closer to the middle of the downloaded tile(s), or ' +
        'download the tile that actually covers it.',
    );
  }

  const bounds = pixelBoundsForBbox(tile, bbox);
  if (bounds.width < 2 || bounds.height < 2) {
    throw new Error('TEXTURE_SAMPLE_AREA is too small relative to the tile resolution — increase sizeMetres.');
  }

  // Square up the crop (sharp's raw pixel path below assumes width === height) by
  // trimming to the shorter side rather than distorting the aspect ratio.
  const cropSize = Math.min(bounds.width, bounds.height);
  const squareBounds = { ...bounds, width: cropSize, height: cropSize };
  const rgbBuffer = extractRgbBuffer(tile, squareBounds);

  const seamless = await makeSeamlessTileable(rgbBuffer, cropSize);
  const resized = seamless.resize(OUTPUT_SIZE_PX, OUTPUT_SIZE_PX);

  mkdirSync(dirname(fileURLToPath(GROUND_TEXTURE_IMAGE_OUT)), { recursive: true });
  await resized.toFile(fileURLToPath(GROUND_TEXTURE_IMAGE_OUT));

  const groundTextureData = {
    placeholder: false,
    source:
      `Environment Agency APGB/VAP aerial photography, ${sizeMetres}m sample cropped near ` +
      `easting ${Math.round(centerE)}, northing ${Math.round(centerN)}, made seamlessly ` +
      `tileable and downsampled to ${OUTPUT_SIZE_PX}x${OUTPUT_SIZE_PX}px.`,
    license: ATTRIBUTION.groundTexture,
  };

  mkdirSync(dirname(fileURLToPath(GROUNDTEXTURE_OUT)), { recursive: true });
  writeFileSync(GROUNDTEXTURE_OUT, JSON.stringify(groundTextureData));

  console.log(`Wrote ${fileURLToPath(GROUND_TEXTURE_IMAGE_OUT)} (${OUTPUT_SIZE_PX}x${OUTPUT_SIZE_PX}).`);
  console.log(`Wrote ${fileURLToPath(GROUNDTEXTURE_OUT)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
