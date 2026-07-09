import { describe, expect, it } from 'vitest';
import { classifyWaterPolygon, classifyWaterway, WATERWAY_WIDTHS } from './waterClassification.js';

describe('classifyWaterPolygon', () => {
  it('classifies natural=water as lake', () => {
    expect(classifyWaterPolygon({ natural: 'water' })).toBe('lake');
  });

  it('classifies landuse=reservoir as reservoir', () => {
    expect(classifyWaterPolygon({ landuse: 'reservoir' })).toBe('reservoir');
  });

  it('prefers reservoir when both tags are present', () => {
    expect(classifyWaterPolygon({ natural: 'water', landuse: 'reservoir' })).toBe('reservoir');
  });

  it('returns null for unrelated tags', () => {
    expect(classifyWaterPolygon({ natural: 'wood' })).toBeNull();
    expect(classifyWaterPolygon({})).toBeNull();
  });
});

describe('classifyWaterway', () => {
  it('classifies waterway=river/stream', () => {
    expect(classifyWaterway({ waterway: 'river' })).toBe('river');
    expect(classifyWaterway({ waterway: 'stream' })).toBe('stream');
  });

  it('returns null for other waterway values or missing tag', () => {
    expect(classifyWaterway({ waterway: 'ditch' })).toBeNull();
    expect(classifyWaterway({})).toBeNull();
  });
});

describe('WATERWAY_WIDTHS', () => {
  it('gives rivers a wider ribbon than streams', () => {
    expect(WATERWAY_WIDTHS.river).toBeGreaterThan(WATERWAY_WIDTHS.stream);
  });
});
