import { describe, expect, it } from 'vitest';
import { computeMapBounds, computeMapSize, worldToMapPoint } from './MiniMap.js';

describe('computeMapBounds', () => {
  it('spans [0, (cols-1)*cellSize] in x and [-(rows-1)*cellSize, 0] in z', () => {
    const bounds = computeMapBounds({ cols: 108, rows: 248, cellSize: 15 });
    expect(bounds).toEqual({ minX: 0, maxX: 107 * 15, minZ: -(247 * 15), maxZ: 0 });
  });
});

describe('computeMapSize', () => {
  it('fits a tall bounds box by height, scaling width down to match aspect', () => {
    const bounds = { minX: 0, maxX: 1605, minZ: -3705, maxZ: 0 };
    const size = computeMapSize(bounds, 110, 160);
    expect(size.height).toBe(160);
    expect(size.width).toBeCloseTo(160 * (1605 / 3705));
  });

  it('fits a wide bounds box by width, scaling height down to match aspect', () => {
    const bounds = { minX: 0, maxX: 3705, minZ: -1605, maxZ: 0 };
    const size = computeMapSize(bounds, 110, 160);
    expect(size.width).toBe(110);
    expect(size.height).toBeCloseTo(110 * (1605 / 3705));
  });
});

describe('worldToMapPoint', () => {
  const bounds = { minX: 0, maxX: 100, minZ: -200, maxZ: 0 };

  it('maps the bounds corners to the canvas corners with no axis flip', () => {
    expect(worldToMapPoint(0, 0, bounds, 50, 80)).toEqual({ x: 0, y: 80 });
    expect(worldToMapPoint(100, -200, bounds, 50, 80)).toEqual({ x: 50, y: 0 });
  });

  it('maps the bounds midpoint to the canvas midpoint', () => {
    expect(worldToMapPoint(50, -100, bounds, 50, 80)).toEqual({ x: 25, y: 40 });
  });
});
