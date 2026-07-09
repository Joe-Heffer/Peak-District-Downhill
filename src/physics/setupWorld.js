import * as CANNON from 'cannon-es';

// cannon-es's Ray._intersectHeightfield (issue #66's RaycastVehicle work is the first
// thing in this codebase to actually raycast against the terrain — the old bike model
// only ever compared position against terrain.getHeightAt(), never hit this) caps BOTH
// the i and j search bounds at `data.length - 1` (the *outer* array's length) instead of
// capping j at `data[0].length - 1` (the inner array's length). For a non-square grid
// like Cut Gate's real terrain (108 x 248), any raycast whose j-index would exceed the
// outer length silently finds nothing — confirmed empirically against both a minimal
// repro and the real dataset. Padding the shorter dimension so the grid is square before
// building the physics shape works around it; the extra rows are outside the real
// terrain's mapped route/collision area and never rendered (the visual mesh built by
// HeightmapTerrain.js's buildTerrainLOD uses the original, unpadded terrainData.heights —
// only this physics shape gets padded).
function padHeightsToSquare(heights) {
  if (heights.length >= heights[0].length) return heights;
  const padded = heights.slice();
  const lastRow = padded[padded.length - 1];
  while (padded.length < heights[0].length) padded.push(lastRow);
  return padded;
}

// A second, distinct cannon-es Heightfield bug (issue #148): Heightfield.getAabbAtIndex
// builds each cell's broad-phase AABB from only the two DIAGONAL corners
// (data[xi][yi] and data[xi+1][yi+1]), not the min/max across all four corners. For a
// "twisted" cell — where the two off-diagonal corners (data[xi+1][yi]/data[xi][yi+1])
// stray far from that diagonal pair, which real, non-flat LIDAR terrain has plenty of —
// the resulting AABB can entirely exclude the real surface height, so
// Ray._intersectHeightfield's aabb.overlapsRay(localRay) check silently rejects rays
// that should hit. A long ray's own bounding box is wide enough to overlap the (wrong)
// cell AABB anyway, masking the bug, but a RaycastVehicle wheel's short suspension ray
// (~0.5m) has no such margin — confirmed directly against Cut Gate's real terrain: the
// route's spawn cell has a ~6m diagonal split (corners 88.4/90.9/92.5/94.7), and every
// wheel's raycast missed there, leaving the bike permanently ungrounded from frame one.
// Overriding just this shape instance's method (not cannon-es's shared prototype) keeps
// the workaround scoped to this game's own heightfield.
function patchHeightfieldAabbBug(heightfieldShape) {
  heightfieldShape.getAabbAtIndex = function (xi, yi, { lowerBound, upperBound }) {
    const { data, elementSize } = this;
    const h00 = data[xi][yi];
    const h10 = data[xi + 1][yi];
    const h01 = data[xi][yi + 1];
    const h11 = data[xi + 1][yi + 1];
    lowerBound.set(xi * elementSize, yi * elementSize, Math.min(h00, h10, h01, h11));
    upperBound.set((xi + 1) * elementSize, (yi + 1) * elementSize, Math.max(h00, h10, h01, h11));
  };
}

// CANNON.Heightfield indexes its `data[i][j]` matrix with i -> shape-local x, j ->
// shape-local y, and the stored value -> shape-local z. Rotating -90 deg about X (the
// same rotation the old flat CANNON.Plane ground used) maps local (x, y, z) to world
// (x, z, -y). So local x (i * elementSize) -> world x, local y (j * elementSize) ->
// world z = -(j * elementSize), and local z (elevation) -> world y — exactly the
// (i * cellSize, heights[i][j], -j * cellSize) layout src/terrain/HeightmapTerrain.js
// builds (per-chunk-local, then offset back to that same world position by each chunk's
// THREE.LOD position — see buildTerrainLOD). Passing `terrainData.heights` straight into
// this single full-resolution heightfield with no transform keeps the physics body and
// the visual mesh's finest LOD level pixel-aligned; only the visual mesh decimates at
// distance, never the collider.
export function setupWorld(terrainData) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;

  const heightfieldShape = new CANNON.Heightfield(padHeightsToSquare(terrainData.heights), {
    elementSize: terrainData.cellSize,
  });
  patchHeightfieldAabbBug(heightfieldShape);
  const groundMaterial = new CANNON.Material('ground');
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(heightfieldShape);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(groundBody);

  // Tuned for grip rather than bounce: high friction so tyres hold the trail, near-zero
  // restitution so heightfield bumps don't launch the bike, and a stiffness bump (default
  // is 1e7) to keep contact resolution firm against the terrain.
  const bikeMaterial = new CANNON.Material('bike');
  world.addContactMaterial(
    new CANNON.ContactMaterial(groundMaterial, bikeMaterial, {
      friction: 0.8,
      restitution: 0.02,
      contactEquationStiffness: 1e8,
    })
  );

  return { world, groundBody, bikeMaterial };
}
