import { describe, expect, it } from 'vitest';
import { valueNoise2D } from './ribbonNoise.js';

describe('valueNoise2D', () => {
  it('is deterministic for the same inputs', () => {
    expect(valueNoise2D(3.14, -2.71, 42)).toBe(valueNoise2D(3.14, -2.71, 42));
  });

  it('stays within [-1, 1] across a spread of inputs', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = valueNoise2D(i * 0.37, -i * 1.11, 7);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is coherent — nearby samples give nearby values, unlike raw hashing', () => {
    const base = valueNoise2D(5.2, 8.9, 11);
    const nearby = valueNoise2D(5.201, 8.9, 11);
    expect(Math.abs(nearby - base)).toBeLessThan(0.01);
  });

  it('varies smoothly rather than jumping between adjacent lattice cells', () => {
    const a = valueNoise2D(1.99, 4.0, 3);
    const b = valueNoise2D(2.01, 4.0, 3);
    expect(Math.abs(b - a)).toBeLessThan(0.1);
  });

  it('different seeds produce different fields at the same point', () => {
    expect(valueNoise2D(1.5, 2.5, 1)).not.toBe(valueNoise2D(1.5, 2.5, 2));
  });
});
