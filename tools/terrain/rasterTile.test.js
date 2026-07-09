import { describe, expect, it } from 'vitest';
import { pixelBoundsForBbox } from './rasterTile.js';

// A 100x100px tile covering easting 1000-1100, northing 2000-2100 at 1m/px — row 0 is
// the tile's north edge (northing 2100), matching sampleTile's rowF convention.
const tile = { xllcorner: 1000, yllcorner: 2000, cellsize: 1, ncols: 100, nrows: 100 };

describe('pixelBoundsForBbox', () => {
  it('converts a centred bbox into the matching pixel rectangle', () => {
    const bbox = { minE: 1040, maxE: 1060, minN: 2040, maxN: 2060 };
    expect(pixelBoundsForBbox(tile, bbox)).toEqual({ left: 40, top: 40, width: 20, height: 20 });
  });

  it('clamps to the tile extent when the bbox overhangs an edge', () => {
    const bbox = { minE: -50, maxE: 1010, minN: 2090, maxN: 2200 };
    const bounds = pixelBoundsForBbox(tile, bbox);
    expect(bounds.left).toBe(0);
    expect(bounds.top).toBe(0);
    expect(bounds.width).toBeLessThanOrEqual(tile.ncols);
    expect(bounds.height).toBeLessThanOrEqual(tile.nrows);
  });

  it('returns a zero-size rectangle for a bbox entirely outside the tile', () => {
    const bbox = { minE: 5000, maxE: 5010, minN: 6000, maxN: 6010 };
    const bounds = pixelBoundsForBbox(tile, bbox);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });
});
