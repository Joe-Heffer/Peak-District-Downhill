import { describe, expect, it } from 'vitest';
import { createRandom } from './createRandom.js';

describe('createRandom', () => {
  it('produces values in [0, 1)', () => {
    const random = createRandom(1337);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const sequenceA = Array.from({ length: 20 }, () => a());
    const sequenceB = Array.from({ length: 20 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const sequenceA = Array.from({ length: 20 }, () => a());
    const sequenceB = Array.from({ length: 20 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('gives independent generators from separate createRandom calls with the same seed', () => {
    const random = createRandom(7);
    const first = [random(), random(), random()];
    const fresh = createRandom(7);
    const second = [fresh(), fresh(), fresh()];
    expect(first).toEqual(second);
  });
});
