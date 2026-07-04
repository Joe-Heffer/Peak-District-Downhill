import { describe, expect, it } from 'vitest';
import { detectTreeApexes, estimateCanopyRadius, DEFAULT_MIN_SEPARATION } from './treeDetection.js';

function gridFromValues(values, cellSize = 1) {
  const cols = values.length;
  const rows = values[0].length;
  return {
    cols,
    rows,
    cellSize,
    get: (i, j) => values[i][j],
  };
}

describe('detectTreeApexes', () => {
  it('ignores cells below the minimum canopy height', () => {
    const grid = gridFromValues([
      [0, 1, 0],
      [1, 1.5, 1],
      [0, 1, 0],
    ]);

    expect(detectTreeApexes(grid, { minCanopyHeight: 2 })).toEqual([]);
  });

  it('treats null/undefined cells as no-data, not canopy', () => {
    const grid = gridFromValues([
      [null, null, null],
      [null, 5, undefined],
      [null, null, null],
    ]);

    const apexes = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 1 });
    expect(apexes).toHaveLength(1);
    expect(apexes[0]).toMatchObject({ e: 1, n: 1, height: 5 });
  });

  it('picks a single apex for one isolated tall cell', () => {
    // gridFromValues indexes as values[i][j] (i = e/column, j = n/row), so this 3x5
    // array places its lone tall cell at i=1, j=2.
    const grid = gridFromValues([
      [0, 0, 0, 0, 0],
      [0, 0, 3, 0, 0],
      [0, 0, 0, 0, 0],
    ]);

    const apexes = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 3 });
    expect(apexes).toHaveLength(1);
    expect(apexes[0]).toMatchObject({ e: 1, n: 2, height: 3 });
  });

  it('suppresses a shorter candidate that falls within minSeparation of a taller one', () => {
    const grid = gridFromValues([
      [0, 0, 0, 0, 0],
      [5, 4, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);

    const apexes = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 3 });
    expect(apexes).toHaveLength(1);
    expect(apexes[0]).toMatchObject({ e: 1, n: 0, height: 5 });
  });

  it('keeps two tall cells that are farther apart than minSeparation', () => {
    const grid = gridFromValues(
      Array.from({ length: 10 }, (_, i) => Array.from({ length: 3 }, (_, j) => (i === 1 || i === 8) && j === 1 ? 6 : 0)),
    );

    const apexes = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 3 });
    expect(apexes).toHaveLength(2);
    const positions = apexes.map(({ e, n }) => ({ e, n })).sort((a, b) => a.e - b.e);
    expect(positions).toEqual([
      { e: 1, n: 1 },
      { e: 8, n: 1 },
    ]);
  });

  it('is deterministic and order-independent given the same grid', () => {
    const grid = gridFromValues([
      [0, 0, 0, 0],
      [0, 4, 0, 6],
      [0, 0, 0, 0],
    ]);

    const first = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 1 });
    const second = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 1 });
    expect(second).toEqual(first);
  });

  it('attaches a radius estimate derived from height, clamped to half of minSeparation', () => {
    const grid = gridFromValues([[0, 0, 0], [0, 20, 0], [0, 0, 0]]);

    const [apex] = detectTreeApexes(grid, { minCanopyHeight: 2, minSeparation: 4 });
    expect(apex.radius).toBe(2); // clamped to minSeparation / 2
  });
});

describe('estimateCanopyRadius', () => {
  it('scales with height but never drops below 1m', () => {
    expect(estimateCanopyRadius(2)).toBe(1);
    expect(estimateCanopyRadius(0)).toBe(1);
  });

  it('never exceeds half of minSeparation', () => {
    expect(estimateCanopyRadius(100, { minSeparation: DEFAULT_MIN_SEPARATION })).toBe(DEFAULT_MIN_SEPARATION / 2);
  });
});
