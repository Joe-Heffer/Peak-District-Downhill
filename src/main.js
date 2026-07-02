import * as THREE from 'three';
import { setupScene } from './scene/setupScene.js';
import { setupWorld } from './physics/setupWorld.js';
import { BikeController } from './bike/BikeController.js';
import { createInputController } from './input/InputController.js';

const { scene, camera, renderer } = setupScene();
const { world } = setupWorld();
const bike = new BikeController(scene, world, camera);
const inputState = createInputController();

const clock = new THREE.Clock();

function tick() {
  const dt = clock.getDelta();

  bike.applyInput(dt, inputState);
  world.step(1 / 60, dt, 10);
  bike.syncAfterStep();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
