import { describe, expect, it } from 'vitest';
import { PEAK_DISTRICT_BBOX, projectToOverview } from './courseGeometry.js';

describe('projectToOverview', () => {
  it('places a bbox centered on the overview at (50, 50)', () => {
    const { xPercent, yPercent } = projectToOverview(PEAK_DISTRICT_BBOX, PEAK_DISTRICT_BBOX);
    expect(xPercent).toBeCloseTo(50);
    expect(yPercent).toBeCloseTo(50);
  });

  it('places a bbox at the overview\'s south-west corner at (0, 100)', () => {
    const bbox = { minE: 380000, minN: 355000, maxE: 380000, maxN: 355000 };
    const { xPercent, yPercent } = projectToOverview(bbox, PEAK_DISTRICT_BBOX);
    expect(xPercent).toBeCloseTo(0);
    expect(yPercent).toBeCloseTo(100);
  });

  it('places a bbox at the overview\'s north-east corner at (100, 0)', () => {
    const bbox = { minE: 460000, minN: 410000, maxE: 460000, maxN: 410000 };
    const { xPercent, yPercent } = projectToOverview(bbox, PEAK_DISTRICT_BBOX);
    expect(xPercent).toBeCloseTo(100);
    expect(yPercent).toBeCloseTo(0);
  });

  it("lands Cut Gate's real bbox at a plausible interior position", () => {
    const cutgateBbox = { minE: 418200, minN: 395600, maxE: 419800, maxN: 399300 };
    const { xPercent, yPercent } = projectToOverview(cutgateBbox, PEAK_DISTRICT_BBOX);
    expect(xPercent).toBeGreaterThan(0);
    expect(xPercent).toBeLessThan(100);
    expect(yPercent).toBeGreaterThan(0);
    expect(yPercent).toBeLessThan(100);
  });
});
