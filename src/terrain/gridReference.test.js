import { describe, expect, it } from 'vitest';
import { eastingNorthingToGridRef, worldToGridRef } from './gridReference.js';

describe('eastingNorthingToGridRef', () => {
  it('matches the standard OS worked example at full (10-figure) precision', () => {
    expect(eastingNorthingToGridRef(651409, 313177, 10)).toBe('TG 51409 13177');
  });

  it('truncates to 6 digits (3+3 figures, 100m precision) by default', () => {
    expect(eastingNorthingToGridRef(651409, 313177)).toBe('TG 514 131');
  });

  it('produces the SK square for the Cut Gate area', () => {
    expect(eastingNorthingToGridRef(419177, 398716)).toBe('SK 191 987');
  });

  it('throws for coordinates outside the GB national grid', () => {
    expect(() => eastingNorthingToGridRef(-1, 100000)).toThrow();
    expect(() => eastingNorthingToGridRef(100000, 1300000)).toThrow();
  });
});

describe('worldToGridRef', () => {
  const origin = { easting: 418200, northing: 395600 };

  it('adds x to easting and subtracts z from northing before formatting', () => {
    expect(worldToGridRef(977, -3116, origin)).toBe(
      eastingNorthingToGridRef(418200 + 977, 395600 + 3116),
    );
  });

  it('reproduces the terrain origin itself at (0, 0)', () => {
    expect(worldToGridRef(0, 0, origin)).toBe(eastingNorthingToGridRef(418200, 395600));
  });
});
