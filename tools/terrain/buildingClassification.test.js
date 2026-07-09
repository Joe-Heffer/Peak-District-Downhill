import { describe, expect, it } from 'vitest';
import { estimateBuildingHeight, isBuildingWay, ensureCcw, DEFAULT_BUILDING_HEIGHT } from './buildingClassification.js';

describe('estimateBuildingHeight', () => {
  it('uses the height tag when present', () => {
    expect(estimateBuildingHeight({ height: '8.5' })).toBe(8.5);
  });

  it('strips a trailing unit suffix from the height tag', () => {
    expect(estimateBuildingHeight({ height: '12 m' })).toBe(12);
  });

  it('falls back to building:height when height is absent', () => {
    expect(estimateBuildingHeight({ 'building:height': '4' })).toBe(4);
  });

  it('derives height from building:levels when no height tag exists', () => {
    expect(estimateBuildingHeight({ 'building:levels': '2' })).toBe(6);
  });

  it('prefers an explicit height tag over building:levels', () => {
    expect(estimateBuildingHeight({ height: '20', 'building:levels': '2' })).toBe(20);
  });

  it('falls back to the flat default with no relevant tags', () => {
    expect(estimateBuildingHeight({})).toBe(DEFAULT_BUILDING_HEIGHT);
    expect(estimateBuildingHeight()).toBe(DEFAULT_BUILDING_HEIGHT);
  });

  it('ignores a zero or negative height/levels tag', () => {
    expect(estimateBuildingHeight({ height: '0', 'building:levels': '-1' })).toBe(DEFAULT_BUILDING_HEIGHT);
  });
});

describe('isBuildingWay', () => {
  it('is true for any truthy building tag', () => {
    expect(isBuildingWay({ building: 'yes' })).toBe(true);
    expect(isBuildingWay({ building: 'house' })).toBe(true);
  });

  it('is false when building is absent or explicitly "no"', () => {
    expect(isBuildingWay({})).toBe(false);
    expect(isBuildingWay({ building: 'no' })).toBe(false);
  });
});

describe('ensureCcw', () => {
  it('leaves an already counter-clockwise ring unchanged', () => {
    const ccw = [
      { e: 0, n: 0 },
      { e: 10, n: 0 },
      { e: 10, n: 10 },
      { e: 0, n: 10 },
      { e: 0, n: 0 },
    ];
    expect(ensureCcw(ccw)).toEqual(ccw);
  });

  it('reverses a clockwise ring', () => {
    const cw = [
      { e: 0, n: 0 },
      { e: 0, n: 10 },
      { e: 10, n: 10 },
      { e: 10, n: 0 },
      { e: 0, n: 0 },
    ];
    const result = ensureCcw(cw);
    expect(result).toEqual([...cw].reverse());
  });
});
