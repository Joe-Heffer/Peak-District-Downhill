import * as CANNON from 'cannon-es';
import { describe, expect, it } from 'vitest';
import { setupWorld } from './setupWorld.js';

const terrainData = {
  cellSize: 5,
  heights: [
    [0, 1],
    [1, 2],
  ],
};

describe('setupWorld', () => {
  it('builds a heightfield shape from terrainData.heights/cellSize', () => {
    const { groundBody } = setupWorld(terrainData);
    const shape = groundBody.shapes[0];

    expect(shape).toBeInstanceOf(CANNON.Heightfield);
    expect(shape.elementSize).toBe(terrainData.cellSize);
    expect(shape.data).toEqual(terrainData.heights);
  });

  it('rotates the ground body -90 degrees about X to match the mesh axis convention', () => {
    const { groundBody } = setupWorld(terrainData);
    const expected = new CANNON.Quaternion();
    expected.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);

    expect(groundBody.quaternion.x).toBeCloseTo(expected.x);
    expect(groundBody.quaternion.y).toBeCloseTo(expected.y);
    expect(groundBody.quaternion.z).toBeCloseTo(expected.z);
    expect(groundBody.quaternion.w).toBeCloseTo(expected.w);
  });

  it('registers the ground body in the world', () => {
    const { world, groundBody } = setupWorld(terrainData);
    expect(world.bodies).toContain(groundBody);
  });
});

describe('setupWorld heightfield AABB fix (issue #148)', () => {
  it("builds each cell's AABB from the min/max of all four corners, not just the diagonal pair", () => {
    // A "twisted" cell: the diagonal corners (h00, h11) are both 0, but the
    // off-diagonal corners (h10, h01) are both 10 — cannon-es's own
    // Heightfield.getAabbAtIndex would report a bogus [0, 0] z-range here (see
    // setupWorld.js's patchHeightfieldAabbBug comment), silently excluding most of
    // the cell's real surface height from ray-vs-terrain broad-phase checks.
    const twistedTerrain = {
      cellSize: 5,
      heights: [
        [0, 10],
        [10, 0],
      ],
    };
    const { groundBody } = setupWorld(twistedTerrain);
    const shape = groundBody.shapes[0];

    const aabb = { lowerBound: new CANNON.Vec3(), upperBound: new CANNON.Vec3() };
    shape.getAabbAtIndex(0, 0, aabb);

    expect(aabb.lowerBound.z).toBe(0);
    expect(aabb.upperBound.z).toBe(10);
  });
});
