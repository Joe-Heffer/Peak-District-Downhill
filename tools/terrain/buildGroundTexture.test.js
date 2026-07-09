import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildSeamAlpha, clampByte, makeSeamlessTileable, tileContainsBbox } from './buildGroundTexture.js';

describe('clampByte', () => {
  it('rounds and clamps into the 0-255 range', () => {
    expect(clampByte(-5)).toBe(0);
    expect(clampByte(260)).toBe(255);
    expect(clampByte(127.6)).toBe(128);
  });
});

describe('tileContainsBbox', () => {
  const tile = { xllcorner: 1000, yllcorner: 2000, cellsize: 1, ncols: 100, nrows: 100 };

  it('is true when the bbox falls entirely within the tile extent', () => {
    expect(tileContainsBbox(tile, { minE: 1010, maxE: 1020, minN: 2010, maxN: 2020 })).toBe(true);
  });

  it('is false when the bbox overhangs the tile extent', () => {
    expect(tileContainsBbox(tile, { minE: 950, maxE: 1020, minN: 2010, maxN: 2020 })).toBe(false);
  });
});

describe('buildSeamAlpha', () => {
  it('is opaque along the whole centre cross and fades to zero blendPx away from it', () => {
    const size = 40;
    const blendPx = 8;
    const alpha = buildSeamAlpha(size, blendPx);
    const half = size / 2;
    expect(alpha[half * size + half]).toBe(255); // centre point, on both seam lines
    expect(alpha[half * size + 0]).toBe(255); // still on the horizontal seam line (row `half`)
    expect(alpha[0 * size + 0]).toBe(0); // top-left corner, off both seam lines entirely
  });
});

describe('makeSeamlessTileable', () => {
  // A left-to-right ramp (0..size-1, repeated identically for every row) has a large,
  // realistic mismatch between its true left/right photo edges (0 vs size-1) but is
  // perfectly continuous through its own centre (value(half-1) and value(half) differ by
  // only 1) — exactly the "edges don't tile, centre is photographically continuous"
  // situation the offset-quadrant trick is designed to fix.
  it('moves the seam from the tile edges to the (now blended) centre', async () => {
    const size = 64;
    const rgb = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = Math.round((x / (size - 1)) * 255);
        const i = (y * size + x) * 3;
        rgb[i] = value;
        rgb[i + 1] = value;
        rgb[i + 2] = value;
      }
    }

    const pipeline = await makeSeamlessTileable(rgb, size);
    const { data, info } = await pipeline.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(size);
    expect(info.height).toBe(size);
    expect(info.channels).toBe(3);

    const midRow = Math.floor(size / 2);
    const leftEdge = data[(midRow * size + 0) * 3];
    const rightEdge = data[(midRow * size + (size - 1)) * 3];

    // Before the swap the true edges (value 0 vs 255) were maximally mismatched — after
    // it, they should be close together (they now come from adjacent source columns).
    expect(Math.abs(leftEdge - rightEdge)).toBeLessThan(40);
  });
});
