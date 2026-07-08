import { describe, expect, it } from 'vitest';
import { sampleAlongRoute } from './sampleAlongRoute.js';
import { buildRouteCurve } from './routeCurve.js';

const terrain = { getHeightAt: () => 0 };
const routeData = {
  points: [
    { e: 0, n: 0 },
    { e: 100, n: 0 },
    { e: 200, n: 0 },
    { e: 300, n: 0 },
  ],
};

describe('sampleAlongRoute', () => {
  it('produces roughly one sample per spacing metres of curve length', () => {
    const curve = buildRouteCurve(routeData, terrain);
    const spacing = 10;
    const samples = sampleAlongRoute(curve, spacing);

    const expectedCount = Math.max(2, Math.floor(curve.getLength() / spacing));
    expect(samples).toHaveLength(expectedCount + 1);
  });

  it('gives every sample a unit-length lateral vector', () => {
    const curve = buildRouteCurve(routeData, terrain);
    const samples = sampleAlongRoute(curve, 15);

    for (const sample of samples) {
      const length = Math.hypot(sample.lateralX, sample.lateralZ);
      expect(length).toBeCloseTo(1);
    }
  });

  it('gives a lateral vector perpendicular to a straight route\'s direction of travel', () => {
    // Route runs due +x, so the lateral (perpendicular) vector should point along z.
    const curve = buildRouteCurve(routeData, terrain);
    const samples = sampleAlongRoute(curve, 20);

    for (const sample of samples) {
      expect(Math.abs(sample.lateralX)).toBeCloseTo(0);
      expect(Math.abs(sample.lateralZ)).toBeCloseTo(1);
    }
  });

  it('never returns fewer than 2 samples even for a very short route', () => {
    const shortRoute = { points: [{ e: 0, n: 0 }, { e: 1, n: 0 }] };
    const curve = buildRouteCurve(shortRoute, terrain);
    const samples = sampleAlongRoute(curve, 100);

    expect(samples.length).toBeGreaterThanOrEqual(2);
  });
});
