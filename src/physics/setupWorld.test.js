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
