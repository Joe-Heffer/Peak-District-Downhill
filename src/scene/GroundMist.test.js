import { describe, expect, it } from 'vitest';
import { shouldBuildMist, computeLayerY, computeLayerOpacity } from './GroundMist.js';

describe('shouldBuildMist', () => {
  it('is false when mistOpacity is zero (e.g. overcastMidday)', () => {
    expect(shouldBuildMist({ mistOpacity: 0 })).toBe(false);
  });

  it('is true when mistOpacity is positive', () => {
    expect(shouldBuildMist({ mistOpacity: 0.4 })).toBe(true);
  });
});

describe('computeLayerY', () => {
  it('offsets the local ground height by the preset mist height and layer fraction', () => {
    expect(computeLayerY(100, { mistHeight: 10 }, 0.5)).toBe(105);
    expect(computeLayerY(200, { mistHeight: 16 }, 0.15)).toBeCloseTo(202.4);
  });
});

describe('computeLayerOpacity', () => {
  it('scales the preset opacity by the layer weight', () => {
    expect(computeLayerOpacity({ mistOpacity: 0.5 }, 0.6)).toBeCloseTo(0.3);
    expect(computeLayerOpacity({ mistOpacity: 0.55 }, 1)).toBeCloseTo(0.55);
  });
});
