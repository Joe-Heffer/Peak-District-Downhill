import * as THREE from 'three';
import { setupScene } from './scene/setupScene.js';
import { setupWorld } from './physics/setupWorld.js';
import { BikeController } from './bike/BikeController.js';
import { createInputController } from './input/InputController.js';
import { createTiltController, isTiltSupported } from './input/TiltController.js';
import { loadTerrainData } from './terrain/loadTerrainData.js';
import { loadLandcoverData } from './terrain/loadLandcoverData.js';
import { loadTreesData } from './terrain/loadTreesData.js';
import { createTerrain } from './terrain/HeightmapTerrain.js';
import { createRockTrackMaterial } from './terrain/RockTrackTexture.js';
import { loadRouteData, buildRouteOverlay, routePointToWorld } from './routes/RouteOverlay.js';
import { loadPathsData, buildPathsOverlay } from './routes/PathsOverlay.js';
import { buildScenery } from './scenery/Scenery.js';
import { AudioManager } from './audio/AudioManager.js';
import { worldToGridRef } from './terrain/gridReference.js';
import { createMiniMap } from './ui/MiniMap.js';
import { createDevTools } from './devtools/DevTools.js';
import { buildFeedbackIssueUrl } from './feedback/FeedbackUrl.js';

const TIRE_ROLL_VOLUME = 0.4;
const MUSIC_VOLUME = 0.25;
const MUSIC_MUTED_KEY = 'musicMuted';
const LOCATION_AREA_NAME = 'Cut Gate, Peak District';
const LOCATION_UPDATE_INTERVAL = 0.25;

// Autoplay policies suspend the AudioContext until a user gesture — resume it on the
// first keypress/tap rather than gating gameplay on it.
function resumeAudioOnGesture() {
  const context = THREE.AudioContext.getContext();
  if (context.state === 'suspended') context.resume();
}

const BIKE_MODEL_CREDIT = 'Bike: "Bike" by Poly by Google (CC-BY 3.0) via Poly Pizza';

function renderCredits(terrainData, routeData, landcoverData, pathsData, treesData) {
  const el = document.getElementById('credits');
  if (!el) return;

  if (
    terrainData.placeholder ||
    routeData.placeholder ||
    landcoverData.placeholder ||
    pathsData.placeholder ||
    treesData.placeholder
  ) {
    el.textContent =
      `Placeholder terrain/route/landcover/paths/trees data (not real survey data) — run \`npm run terrain:build\` for the real Cut Gate dataset. ${BIKE_MODEL_CREDIT}`;
    return;
  }

  el.textContent =
    `Terrain: Environment Agency LIDAR (OGL) · Route, paths & landcover: OpenStreetMap contributors (ODbL) · Trees: Environment Agency LIDAR (OGL) · ${BIKE_MODEL_CREDIT}`;
}

// Placeholder terrain has no real grid origin to convert from, and placeholder route
// data has no real area behind its hardcoded name — hide the HUD line in either case,
// same spirit as renderCredits' placeholder branch. Not gated on landcoverData.placeholder
// since landcover doesn't affect the grid origin or the route/area name.
function updateLocation(el, terrainData, routeData, x, z) {
  if (!el) return;

  if (terrainData.placeholder || routeData.placeholder) {
    el.textContent = '';
    return;
  }

  el.textContent = `${LOCATION_AREA_NAME} · ${worldToGridRef(x, z, terrainData.origin)}`;
}

function setUpMuteButton(musicAudio) {
  const button = document.getElementById('mute-btn');
  if (!button || !musicAudio) return;

  let muted = localStorage.getItem(MUSIC_MUTED_KEY) === 'true';

  function applyMuteState() {
    musicAudio.setVolume(muted ? 0 : MUSIC_VOLUME);
    button.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  }

  button.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUSIC_MUTED_KEY, String(muted));
    applyMuteState();
  });

  applyMuteState();
}

function setUpFeedbackButton() {
  const button = document.getElementById('feedback-btn');
  if (!button) return;

  button.addEventListener('click', () => {
    window.open(buildFeedbackIssueUrl(), '_blank', 'noopener');
  });
}

// No localStorage persistence: iOS requires a fresh gesture-triggered
// requestPermission() call every page load anyway, and calibration is inherently a
// per-session concept (rest angle varies with how the phone is currently held), so
// every load starts digital-only — tapping the button grants permission and calibrates.
function setUpTiltButton(inputState) {
  const button = document.getElementById('tilt-btn');
  if (!button || !isTiltSupported()) return;

  const tiltController = createTiltController(inputState);
  button.hidden = false;

  function applyTiltState(enabled) {
    button.textContent = enabled ? '\u{1F4F2}' : '\u{1F4F1}';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Disable tilt steering' : 'Enable tilt steering');
  }

  button.addEventListener('click', async () => {
    if (tiltController.isEnabled()) {
      tiltController.disable();
      applyTiltState(false);
      return;
    }
    const granted = await tiltController.enable();
    applyTiltState(granted);
  });

  applyTiltState(false);
}

async function init() {
  const devTools = createDevTools();

  const [terrainData, routeData, landcoverData, pathsData, treesData] = await Promise.all([
    loadTerrainData(),
    loadRouteData(),
    loadLandcoverData(),
    loadPathsData(),
    loadTreesData(),
  ]);
  renderCredits(terrainData, routeData, landcoverData, pathsData, treesData);

  const spawnPoint = routePointToWorld(routeData.points[0]);
  const locationEl = document.getElementById('location');
  const staminaFillEl = document.getElementById('stamina-bar-fill');
  updateLocation(locationEl, terrainData, routeData, spawnPoint.x, spawnPoint.z);
  const miniMap = createMiniMap(terrainData, routeData);

  const { scene, camera, renderer, isNight } = setupScene();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const terrain = createTerrain(terrainData, landcoverData, maxAnisotropy);
  scene.add(terrain.mesh);
  const rockTrackMaterial = createRockTrackMaterial(maxAnisotropy);
  scene.add(buildPathsOverlay(pathsData, terrain, rockTrackMaterial));
  scene.add(buildRouteOverlay(routeData, terrain, rockTrackMaterial));
  scene.add(buildScenery(routeData, treesData, terrain));

  const { world, bikeMaterial } = setupWorld(terrainData);
  const bike = new BikeController(scene, world, camera, terrain, spawnPoint, bikeMaterial, isNight);
  devTools.attachGameState({ bike, world, scene, camera, terrain, terrainData, routeData });
  const inputState = createInputController();

  window.addEventListener('keydown', resumeAudioOnGesture, { once: true });
  window.addEventListener('pointerdown', resumeAudioOnGesture, { once: true });

  const audioManager = new AudioManager(camera);
  await audioManager.init(import.meta.env.BASE_URL);
  const musicAudio = audioManager.playLoop('music', MUSIC_VOLUME);
  audioManager.playLoop('wind', 0.3);
  const tireRollAudio = audioManager.playLoop('tireRoll', 0);
  setUpMuteButton(musicAudio);
  setUpFeedbackButton();
  setUpTiltButton(inputState);

  const clock = new THREE.Clock();
  let timeSinceLocationUpdate = 0;

  function tick() {
    try {
      const dt = clock.getDelta();

      const jumped = bike.applyInput(dt, inputState);
      world.step(1 / 60, dt, 10);
      bike.syncAfterStep(dt);

      if (jumped) audioManager.playOnce('jump', 0.6);
      if (bike.hardLanding) audioManager.playOnce('crash', 0.8);
      tireRollAudio?.setVolume(bike.isGrounded() ? TIRE_ROLL_VOLUME : 0);

      miniMap.update(bike.mesh.position.x, bike.mesh.position.z, bike.yaw);
      if (staminaFillEl) staminaFillEl.style.width = `${bike.stamina * 100}%`;

      timeSinceLocationUpdate += dt;
      if (timeSinceLocationUpdate >= LOCATION_UPDATE_INTERVAL) {
        timeSinceLocationUpdate = 0;
        updateLocation(locationEl, terrainData, routeData, bike.mesh.position.x, bike.mesh.position.z);
      }

      devTools.update(dt);

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    } catch (error) {
      devTools.reportCrash('tick', error, { fatal: true });
    }
  }

  tick();
}

init();
