import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBuildings } from './Buildings.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

const terrain = { getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005 };

const squareFootprint = [
  { e: 0, n: 0 },
  { e: 10, n: 0 },
  { e: 10, n: 10 },
  { e: 0, n: 10 },
  { e: 0, n: 0 },
];

describe('buildBuildings', () => {
  it('returns a group with one mesh per building', () => {
    const buildingsData = {
      buildings: [
        { points: squareFootprint, height: 5 },
        { points: squareFootprint.map(({ e, n }) => ({ e: e + 50, n: n + 50 })), height: 8 },
      ],
    };
    const group = buildBuildings(buildingsData, terrain);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(2);
    for (const mesh of group.children) {
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.name).toBe('building');
    }
  });

  it('extrudes the geometry to the building height, in world y', () => {
    const buildingsData = { buildings: [{ points: squareFootprint, height: 7.5 }] };
    const group = buildBuildings(buildingsData, terrain);
    const mesh = group.children[0];

    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.max.y - box.min.y).toBeCloseTo(7.5);
  });

  it('positions the building at the minimum terrain height under its footprint', () => {
    const buildingsData = { buildings: [{ points: squareFootprint, height: 5 }] };
    const group = buildBuildings(buildingsData, terrain);
    const mesh = group.children[0];

    const expectedBase = squareFootprint.reduce((min, point) => {
      const { x, z } = routePointToWorld(point);
      return Math.min(min, terrain.getHeightAt(x, z));
    }, Infinity);
    expect(mesh.position.y).toBeCloseTo(expectedBase);
  });

  it('spans the footprint in world x/z via routePointToWorld', () => {
    const buildingsData = { buildings: [{ points: squareFootprint, height: 5 }] };
    const group = buildBuildings(buildingsData, terrain);
    const mesh = group.children[0];

    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(10);
    // world z = -n, so n in [0,10] maps to z in [-10,0]
    expect(box.min.z).toBeCloseTo(-10);
    expect(box.max.z).toBeCloseTo(0);
  });

  it('skips a degenerate footprint with fewer than 3 points', () => {
    const buildingsData = {
      buildings: [
        { points: [{ e: 0, n: 0 }, { e: 5, n: 5 }], height: 5 },
        { points: squareFootprint, height: 5 },
      ],
    };
    const group = buildBuildings(buildingsData, terrain);
    expect(group.children).toHaveLength(1);
  });

  it('renders no buildings when the data has none', () => {
    const group = buildBuildings({ buildings: [] }, terrain);
    expect(group.children).toHaveLength(0);
  });
});
