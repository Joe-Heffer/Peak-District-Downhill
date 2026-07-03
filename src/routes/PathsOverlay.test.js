import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRibbonArrays, buildPathsOverlay, PATH_STYLES } from './PathsOverlay.js';

const terrain = { getHeightAt: (x, z) => x - z };

describe('buildRibbonArrays', () => {
  it('produces two vertices per centerline point, offset by half the style width', () => {
    const points = [
      { e: 0, n: 0 },
      { e: 10, n: 0 },
    ];
    const arrays = { positions: [], colors: [], indices: [] };
    const style = { width: 2, color: 0xff0000, heightOffset: 0.1 };
    buildRibbonArrays(points, terrain, style, arrays);

    expect(arrays.positions).toHaveLength(4 * 3);

    // Straight path along +x (world x=e, world z=-n), so the perpendicular is +-z.
    const [x0, y0, z0, x1, y1, z1] = arrays.positions;
    expect(x0).toBeCloseTo(0);
    expect(z0).toBeCloseTo(1); // +halfWidth
    expect(x1).toBeCloseTo(0);
    expect(z1).toBeCloseTo(-1); // -halfWidth
    expect(y0).toBeCloseTo(terrain.getHeightAt(0, 0) + style.heightOffset);
    expect(y1).toBeCloseTo(terrain.getHeightAt(0, 0) + style.heightOffset);
  });

  it('does nothing for a degenerate single-point path', () => {
    const arrays = { positions: [], colors: [], indices: [] };
    buildRibbonArrays([{ e: 0, n: 0 }], terrain, PATH_STYLES.road, arrays);
    expect(arrays.positions).toHaveLength(0);
  });
});

describe('buildPathsOverlay', () => {
  it('creates one mesh per category present in the data', () => {
    const pathsData = {
      paths: [
        { category: 'footpath', points: [{ e: 0, n: 0 }, { e: 5, n: 5 }] },
        { category: 'road', points: [{ e: 20, n: 0 }, { e: 25, n: 5 }] },
      ],
    };
    const group = buildPathsOverlay(pathsData, terrain);

    expect(group).toBeInstanceOf(THREE.Group);
    const names = group.children.map((mesh) => mesh.name).sort();
    expect(names).toEqual(['paths-footpath', 'paths-road']);
    for (const mesh of group.children) {
      expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it('creates no mesh for a category absent from the data', () => {
    const pathsData = { paths: [{ category: 'road', points: [{ e: 0, n: 0 }, { e: 5, n: 5 }] }] };
    const group = buildPathsOverlay(pathsData, terrain);
    expect(group.children).toHaveLength(1);
    expect(group.children[0].name).toBe('paths-road');
  });
});
