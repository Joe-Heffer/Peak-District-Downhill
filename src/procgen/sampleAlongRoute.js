import * as THREE from 'three';

// Samples a route curve at even arc-length spacing, returning each sample's (x, z)
// position plus a unit lateral vector perpendicular to the direction of travel at that
// point — the shared building block every corridor-scatter pipeline (grass, rocks,
// future scattered content) starts from instead of hand-rolling curve/tangent math.
export function sampleAlongRoute(curve, spacing) {
  const sampleCount = Math.max(2, Math.floor(curve.getLength() / spacing));
  const spacedPoints = curve.getSpacedPoints(sampleCount);

  return spacedPoints.map((point, i) => {
    const t = THREE.MathUtils.clamp(i / (spacedPoints.length - 1), 0, 1);
    const tangent = curve.getTangentAt(t);
    const length = Math.hypot(tangent.x, tangent.z) || 1;

    return {
      x: point.x,
      z: point.z,
      lateralX: -tangent.z / length,
      lateralZ: tangent.x / length,
    };
  });
}
