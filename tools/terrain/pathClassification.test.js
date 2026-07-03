import { describe, expect, it } from 'vitest';
import { categorizeHighway, excludeKnownRouteWays, clipPolylineToBbox } from './pathClassification.js';

describe('categorizeHighway', () => {
  it.each([
    [{ highway: 'residential' }, 'road'],
    [{ highway: 'unclassified' }, 'road'],
    [{ highway: 'bridleway' }, 'bridleway'],
    [{ highway: 'track' }, 'bridleway'],
    [{ highway: 'track', access: 'private' }, null],
    [{ highway: 'path', horse: 'yes' }, 'bridleway'],
    [{ highway: 'path', horse: 'designated' }, 'bridleway'],
    [{ highway: 'footway' }, 'footpath'],
    [{ highway: 'steps' }, 'footpath'],
    [{ highway: 'path' }, 'footpath'],
    [{ highway: 'path', bicycle: 'designated' }, null],
    [{ highway: 'cycleway' }, null],
    [{ highway: 'motorway' }, null],
    [{}, null],
  ])('categorizes %o as %s', (tags, expected) => {
    expect(categorizeHighway(tags)).toBe(expected);
  });
});

describe('excludeKnownRouteWays', () => {
  it('drops only the ways matching an excluded id', () => {
    const ways = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(excludeKnownRouteWays(ways, [2])).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('is a no-op when nothing matches', () => {
    const ways = [{ id: 1 }, { id: 2 }];
    expect(excludeKnownRouteWays(ways, [999])).toEqual(ways);
  });
});

describe('clipPolylineToBbox', () => {
  const bbox = { minE: 0, maxE: 100, minN: 0, maxN: 100 };

  it('leaves a fully-inside polyline unchanged', () => {
    const points = [
      { e: 10, n: 10 },
      { e: 50, n: 50 },
      { e: 90, n: 90 },
    ];
    const runs = clipPolylineToBbox(points, bbox);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual(points);
  });

  it('clips a polyline that exits the bbox once', () => {
    const points = [
      { e: 50, n: 50 },
      { e: 150, n: 50 },
    ];
    const runs = clipPolylineToBbox(points, bbox);
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toEqual({ e: 50, n: 50 });
    expect(runs[0][1]).toEqual({ e: 100, n: 50 });
  });

  it('splits a polyline that crosses the boundary twice (in-out-in)', () => {
    const points = [
      { e: 50, n: 50 },
      { e: 150, n: 50 },
      { e: 150, n: 60 },
      { e: 50, n: 60 },
    ];
    const runs = clipPolylineToBbox(points, bbox);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([
      { e: 50, n: 50 },
      { e: 100, n: 50 },
    ]);
    expect(runs[1]).toEqual([
      { e: 100, n: 60 },
      { e: 50, n: 60 },
    ]);
  });

  it('returns nothing for a polyline fully outside the bbox', () => {
    const points = [
      { e: 200, n: 200 },
      { e: 300, n: 300 },
    ];
    expect(clipPolylineToBbox(points, bbox)).toEqual([]);
  });
});
