import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

// Converts grounded {x, y, z} points into per-instance transform matrices for an
// InstancedMesh — the terminal stage of every scatter pipeline. `randomizeYaw` and
// `scaleFn` let callers vary rotation/size behaviour (rocks: random yaw + random
// uniform scale; grass: random yaw + random uniform scale; future content: fixed yaw,
// data-driven scale, ...) without duplicating the matrix-composition boilerplate.
// `scaleFn(point, random)` may return a number (uniform scale) or a {x, y, z} object;
// omit it for scale 1.
export function toInstanceMatrices(points, random, { randomizeYaw = true, scaleFn } = {}) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  return points.map((point) => {
    position.set(point.x, point.y, point.z);
    quaternion.setFromAxisAngle(UP, randomizeYaw ? random() * Math.PI * 2 : 0);

    const s = scaleFn ? scaleFn(point, random) : 1;
    if (typeof s === 'number') scale.set(s, s, s);
    else scale.set(s.x, s.y, s.z);

    return new THREE.Matrix4().compose(position, quaternion, scale);
  });
}
