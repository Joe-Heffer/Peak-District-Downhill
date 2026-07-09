import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWater } from './Water.js';

const terrain = { getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005 };

const lakeFootprint = [
  { e: 0, n: 0 },
  { e: 20, n: 0 },
  { e: 20, n: 20 },
  { e: 0, n: 20 },
  { e: 0, n: 0 },
];

describe('buildWater', () => {
  it('creates one flat plane mesh per water polygon', () => {
    const waterData = { polygons: [{ cls: 'reservoir', points: lakeFootprint }], lines: [] };
    const group = buildWater(waterData, terrain);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].name).toBe('water-reservoir');
  });

  it('positions a polygon plane at the average terrain height of its vertices', () => {
    const waterData = { polygons: [{ cls: 'lake', points: lakeFootprint }], lines: [] };
    const group = buildWater(waterData, terrain);
    const mesh = group.children[0];

    const expectedElevation =
      lakeFootprint.reduce((sum, { e, n }) => sum + terrain.getHeightAt(e, -n), 0) / lakeFootprint.length;
    expect(mesh.position.y).toBeCloseTo(expectedElevation);
  });

  it('lays a polygon flat in the world x/z plane matching its footprint bounds', () => {
    const waterData = { polygons: [{ cls: 'lake', points: lakeFootprint }], lines: [] };
    const group = buildWater(waterData, terrain);
    const mesh = group.children[0];

    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.max.y - box.min.y).toBeLessThan(1e-6); // flat
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(20);
    expect(box.min.z).toBeCloseTo(-20);
    expect(box.max.z).toBeCloseTo(0);
  });

  it('skips a degenerate polygon with fewer than 3 points', () => {
    const waterData = {
      polygons: [{ cls: 'lake', points: [{ e: 0, n: 0 }, { e: 5, n: 5 }] }],
      lines: [],
    };
    const group = buildWater(waterData, terrain);
    expect(group.children).toHaveLength(0);
  });

  it('creates one merged ribbon mesh per waterway class present in the data', () => {
    const waterData = {
      polygons: [],
      lines: [
        { cls: 'river', points: [{ e: 0, n: 0 }, { e: 10, n: 0 }] },
        { cls: 'stream', points: [{ e: 20, n: 0 }, { e: 25, n: 5 }] },
      ],
    };
    const group = buildWater(waterData, terrain);

    const names = group.children.map((mesh) => mesh.name).sort();
    expect(names).toEqual(['water-river', 'water-stream']);
    for (const mesh of group.children) {
      expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it('creates no ribbon mesh for a waterway class absent from the data', () => {
    const waterData = { polygons: [], lines: [{ cls: 'river', points: [{ e: 0, n: 0 }, { e: 10, n: 0 }] }] };
    const group = buildWater(waterData, terrain);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].name).toBe('water-river');
  });

  it('renders an empty group when the data has no polygons or lines', () => {
    const group = buildWater({ polygons: [], lines: [] }, terrain);
    expect(group.children).toHaveLength(0);
  });
});
