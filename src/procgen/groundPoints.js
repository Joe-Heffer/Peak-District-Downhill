// Attaches each point's terrain height as `y`, via terrain.getHeightAt — the shared
// grounding step every scatter pipeline needs before converting to instance matrices.
export function groundPoints(points, terrain) {
  return points.map((point) => ({ ...point, y: terrain.getHeightAt(point.x, point.z) }));
}
