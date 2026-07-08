// Keeps only points whose actual landcover class (sampled at the candidate's own x/z,
// not the route centreline) is in `allowedClasses` — e.g. restricting grass placement
// to grass/heather cells, keeping it off track and out of dense wood.
export function filterByLandcover(points, terrain, allowedClasses) {
  if (!allowedClasses) return points;
  const allowed = new Set(allowedClasses);
  return points.filter((point) => allowed.has(terrain.getLandcoverAt(point.x, point.z)));
}
