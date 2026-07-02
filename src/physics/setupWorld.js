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
