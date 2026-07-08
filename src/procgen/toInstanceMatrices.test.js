import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { toInstanceMatrices } from './toInstanceMatrices.js';
import { createRandom } from './createRandom.js';

function decompose(matrix) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

const points = [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }];

describe('toInstanceMatrices', () => {
  it('places each instance at its point position', () => {
    const matrices = toInstanceMatrices(points, createRandom(1));
    matrices.forEach((matrix, i) => {
      const { position } = decompose(matrix);
      expect(position.x).toBeCloseTo(points[i].x);
      expect(position.y).toBeCloseTo(points[i].y);
      expect(position.z).toBeCloseTo(points[i].z);
    });
  });

  it('defaults to scale 1 with no scaleFn', () => {
    const matrices = toInstanceMatrices(points, createRandom(1));
    for (const matrix of matrices) {
      const { scale } = decompose(matrix);
      expect(scale.x).toBeCloseTo(1);
      expect(scale.y).toBeCloseTo(1);
      expect(scale.z).toBeCloseTo(1);
    }
  });

  it('applies a numeric scaleFn as uniform scale', () => {
    const matrices = toInstanceMatrices(points, createRandom(1), { scaleFn: () => 2.5 });
    for (const matrix of matrices) {
      const { scale } = decompose(matrix);
      expect(scale.x).toBeCloseTo(2.5);
      expect(scale.y).toBeCloseTo(2.5);
      expect(scale.z).toBeCloseTo(2.5);
    }
  });

  it('applies a per-axis scaleFn object', () => {
    const matrices = toInstanceMatrices([points[0]], createRandom(1), {
      scaleFn: () => ({ x: 1, y: 2, z: 3 }),
    });
    const { scale } = decompose(matrices[0]);
    expect(scale.x).toBeCloseTo(1);
    expect(scale.y).toBeCloseTo(2);
    expect(scale.z).toBeCloseTo(3);
  });

  it('passes the point and the random function into scaleFn', () => {
    const seen = [];
    const random = createRandom(1);
    toInstanceMatrices(points, random, {
      scaleFn: (point, rnd) => {
        seen.push([point, typeof rnd]);
        return 1;
      },
    });
    expect(seen).toEqual([[points[0], 'function'], [points[1], 'function']]);
  });

  it('yaws randomly by default and stays level (fixed yaw = 0) when randomizeYaw is false', () => {
    const random = createRandom(1);
    const yawed = toInstanceMatrices(points, random, {});
    const anyYaw = yawed.some((matrix) => {
      const { quaternion } = decompose(matrix);
      return Math.abs(quaternion.y) > 1e-6;
    });
    expect(anyYaw).toBe(true);

    const level = toInstanceMatrices(points, createRandom(1), { randomizeYaw: false });
    for (const matrix of level) {
      const { quaternion } = decompose(matrix);
      expect(quaternion.equals(new THREE.Quaternion())).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = toInstanceMatrices(points, createRandom(3), { scaleFn: (p, r) => 1 + r() });
    const second = toInstanceMatrices(points, createRandom(3), { scaleFn: (p, r) => 1 + r() });
    first.forEach((matrix, i) => expect(matrix.equals(second[i])).toBe(true));
  });
});
