import * as THREE from 'three';
import { setupScene } from './scene/setupScene.js';
import { setupWorld } from './physics/setupWorld.js';
import { BikeController } from './bike/BikeController.js';
import { createInputController } from './input/InputController.js';
import { loadTerrainData } from './terrain/loadTerrainData.js';
import { createTerrain } from './terrain/HeightmapTerrain.js';
import { loadRouteData, buildRouteOverlay } from './routes/RouteOverlay.js';
import { AudioManager } from './audio/AudioManager.js';

const TIRE_ROLL_VOLUME = 0.4;

// Autoplay policies suspend the AudioContext until a user gesture — resume it on the
// first keypress/tap rather than gating gameplay on it.
function resumeAudioOnGesture() {
  const context = THREE.AudioContext.getContext();
  if (context.state === 'suspended') context.resume();
}

function renderCredits(terrainData, routeData) {
  const el = document.getElementById('credits');
  if (!el) return;

  if (terrainData.placeholder || routeData.placeholder) {
    el.textContent =
      'Placeholder terrain/route data (not real survey data) — run `npm run terrain:build` for the real Cut Gate dataset.';
    return;
  }

  el.textContent = 'Terrain: Environment Agency LIDAR (OGL) · Route: OpenStreetMap contributors (ODbL)';
}

async function init() {
  const [terrainData, routeData] = await Promise.all([loadTerrainData(), loadRouteData()]);
  renderCredits(terrainData, routeData);

  const terrain = createTerrain(terrainData);

  const { scene, camera, renderer } = setupScene();
  scene.add(terrain.mesh);
  scene.add(buildRouteOverlay(routeData, terrain));

  const { world } = setupWorld(terrainData);
  const spawnPoint = { x: routeData.points[0].e, z: -routeData.points[0].n };
  const bike = new BikeController(scene, world, camera, terrain, spawnPoint);
  const inputState = createInputController();

  window.addEventListener('keydown', resumeAudioOnGesture, { once: true });
  window.addEventListener('pointerdown', resumeAudioOnGesture, { once: true });

  const audioManager = new AudioManager(camera);
  await audioManager.init(import.meta.env.BASE_URL);
  audioManager.playLoop('music', 0.25);
  audioManager.playLoop('wind', 0.3);
  const tireRollAudio = audioManager.playLoop('tireRoll', 0);

  const clock = new THREE.Clock();

  function tick() {
    const dt = clock.getDelta();

    const jumped = bike.applyInput(dt, inputState);
    world.step(1 / 60, dt, 10);
    bike.syncAfterStep();

    if (jumped) audioManager.playOnce('jump', 0.6);
    if (bike.hardLanding) audioManager.playOnce('crash', 0.8);
    tireRollAudio?.setVolume(bike.isGrounded() ? TIRE_ROLL_VOLUME : 0);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

init();
