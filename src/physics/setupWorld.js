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
// terrain's mapped route/collision area and never rendered (buildTerrainMesh in
// HeightmapTerrain.js uses the original, unpadded terrainData.heights).
function padHeightsToSquare(heights) {
  if (heights.length >= heights[0].length) return heights;
  const padded = heights.slice();
  const lastRow = padded[padded.length - 1];
  while (padded.length < heights[0].length) padded.push(lastRow);
  return padded;
}

// CANNON.Heightfield indexes its `data[i][j]` matrix with i -> shape-local x, j ->
// shape-local y, and the stored value -> shape-local z. Rotating -90 deg about X (the
// same rotation the old flat CANNON.Plane ground used) maps local (x, y, z) to world
// (x, z, -y). So local x (i * elementSize) -> world x, local y (j * elementSize) ->
// world z = -(j * elementSize), and local z (elevation) -> world y — exactly the
// (i * cellSize, heights[i][j], -j * cellSize) layout buildTerrainMesh uses in
// src/terrain/HeightmapTerrain.js. Passing `terrainData.heights` straight into the
// heightfield with no transform keeps the physics body and the visual mesh
// pixel-aligned.
export function setupWorld(terrainData) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;

  const heightfieldShape = new CANNON.Heightfield(padHeightsToSquare(terrainData.heights), {
    elementSize: terrainData.cellSize,
  });
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
