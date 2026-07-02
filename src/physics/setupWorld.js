import * as CANNON from 'cannon-es';

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

  const heightfieldShape = new CANNON.Heightfield(terrainData.heights, {
    elementSize: terrainData.cellSize,
  });
  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(heightfieldShape);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(groundBody);

  return { world, groundBody };
}
