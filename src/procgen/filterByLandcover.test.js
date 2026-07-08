import { describe, expect, it } from 'vitest';
import { filterByLandcover } from './filterByLandcover.js';

const points = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 2, z: 0 },
  { x: 3, z: 0 },
];

// grass, track, grass, wood
const classesByX = ['grass', 'track', 'grass', 'wood'];
const terrain = { getLandcoverAt: (x) => classesByX[x] };

describe('filterByLandcover', () => {
  it('keeps only points whose class is in allowedClasses', () => {
    const kept = filterByLandcover(points, terrain, ['grass', 'heather']);
    expect(kept).toEqual([{ x: 0, z: 0 }, { x: 2, z: 0 }]);
  });

  it('returns all points unchanged when allowedClasses is falsy', () => {
    expect(filterByLandcover(points, terrain, null)).toEqual(points);
    expect(filterByLandcover(points, terrain, undefined)).toEqual(points);
  });

  it('returns an empty array when no class matches', () => {
    expect(filterByLandcover(points, terrain, ['rock'])).toEqual([]);
  });

  it('samples landcover at the candidate\'s own x/z, not some other point', () => {
    const spy = [];
    const spyTerrain = {
      getLandcoverAt: (x, z) => {
        spy.push([x, z]);
        return 'grass';
      },
    };
    filterByLandcover(points, spyTerrain, ['grass']);
    expect(spy).toEqual(points.map((p) => [p.x, p.z]));
  });
});
