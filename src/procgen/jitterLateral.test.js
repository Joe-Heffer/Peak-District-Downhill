import { describe, expect, it } from 'vitest';
import { jitterLateral } from './jitterLateral.js';
import { createRandom } from './createRandom.js';

// Widely separated so each candidate's nearest sample is unambiguous even after a
// lateralMax-sized offset.
const samples = [
  { x: 0, z: 0, lateralX: 1, lateralZ: 0 },
  { x: 1000, z: 0, lateralX: 1, lateralZ: 0 },
];

describe('jitterLateral', () => {
  it('places one candidate per side by default, offset within [lateralMin, lateralMax]', () => {
    const random = createRandom(1);
    const points = jitterLateral(samples, random, { lateralMin: 5, lateralMax: 15 });

    expect(points).toHaveLength(samples.length * 2);
    for (const point of points) {
      const sample = samples.reduce((closest, s) =>
        Math.abs(point.x - s.x) < Math.abs(point.x - closest.x) ? s : closest,
      );
      const offset = Math.abs(point.x - sample.x);
      expect(offset).toBeGreaterThanOrEqual(5);
      expect(offset).toBeLessThanOrEqual(15);
      expect(point.z).toBeCloseTo(0); // lateralZ is 0 for these samples
    }
  });

  it('honours repeated entries in `sides` for multiple candidates per side', () => {
    const random = createRandom(2);
    const points = jitterLateral(samples, random, {
      lateralMin: 1,
      lateralMax: 2,
      sides: [-1, -1, 1, 1],
    });

    expect(points).toHaveLength(samples.length * 4);
  });

  it('skips candidates whose skip draw falls under skipProbability', () => {
    // A fake random sequence: always "skip" (returns 0, always < skipProbability).
    const alwaysSkip = () => 0;
    const points = jitterLateral(samples, alwaysSkip, {
      lateralMin: 1,
      lateralMax: 2,
      skipProbability: 0.5,
    });
    expect(points).toHaveLength(0);
  });

  it('is deterministic for a given seed', () => {
    const first = jitterLateral(samples, createRandom(99), { lateralMin: 2, lateralMax: 8, skipProbability: 0.3 });
    const second = jitterLateral(samples, createRandom(99), { lateralMin: 2, lateralMax: 8, skipProbability: 0.3 });
    expect(second).toEqual(first);
  });

  it('offsets along the sample\'s lateral vector, not a fixed axis', () => {
    const perpendicularSamples = [{ x: 0, z: 0, lateralX: 0, lateralZ: 1 }];
    const random = createRandom(5);
    const points = jitterLateral(perpendicularSamples, random, {
      lateralMin: 4,
      lateralMax: 4,
      sides: [1],
    });
    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].z).toBeCloseTo(4);
  });
});
