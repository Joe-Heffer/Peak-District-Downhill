import * as THREE from 'three';
import { setupScene } from './scene/setupScene.js';
import { setupWorld } from './physics/setupWorld.js';
import { BikeController } from './bike/BikeController.js';
import { createInputController } from './input/InputController.js';
import { createTiltController, isTiltSupported } from './input/TiltController.js';
import { loadTerrainData } from './terrain/loadTerrainData.js';
import { loadLandcoverData } from './terrain/loadLandcoverData.js';
import { loadTreesData } from './terrain/loadTreesData.js';
import { loadBuildingsData } from './terrain/loadBuildingsData.js';
import { loadWaterData } from './terrain/loadWaterData.js';
import { createTerrain } from './terrain/HeightmapTerrain.js';
import { createRockTrackMaterial } from './terrain/RockTrackTexture.js';
import { loadRouteData, buildRouteOverlay, routePointToWorld, computeSpawnYaw } from './routes/RouteOverlay.js';
import { loadPathsData, buildPathsOverlay } from './routes/PathsOverlay.js';
import { buildScenery } from './scenery/Scenery.js';
import { buildBuildings } from './scenery/Buildings.js';
import { buildWater } from './scenery/Water.js';
import { buildGroundMist } from './scene/GroundMist.js';
import { buildTyreTrackTrail } from './effects/TyreTrackTrail.js';
import { AudioManager } from './audio/AudioManager.js';
import { worldToGridRef } from './terrain/gridReference.js';
import { createMiniMap } from './ui/MiniMap.js';
import { createScoreTracker } from './scoring/ScoreTracker.js';
import { createDevTools } from './devtools/DevTools.js';
import { buildFeedbackIssueUrl } from './feedback/FeedbackUrl.js';
import { COURSES } from './courses/courses.js';
import { createCourseSelect } from './courses/CourseSelect.js';

const TIRE_ROLL_VOLUME = 0.4;
const MUSIC_VOLUME = 0.25;
const MUSIC_MUTED_KEY = 'musicMuted';
const LOCATION_UPDATE_INTERVAL = 0.25;

// `?bike=ebike` overrides the default bike preset (issue #110) — the "simple toggle"
// the issue asks for until a real bike-selection menu (#59) exists. Mirrors
// setupSky.js's `?sky=` override pattern.
function pickBikePreset() {
  const override = new URLSearchParams(window.location.search).get('bike');
  return override === 'ebike' ? 'ebike' : 'default';
}

// Autoplay policies suspend the AudioContext until a user gesture — resume it on the
// first keypress/tap rather than gating gameplay on it.
function resumeAudioOnGesture() {
  const context = THREE.AudioContext.getContext();
  if (context.state === 'suspended') context.resume();
}

const BIKE_MODEL_CREDIT = 'Bike: "Bike" by Poly by Google (CC-BY 3.0) via Poly Pizza';

function renderCredits(courseName, terrainData, routeData, landcoverData, pathsData, treesData, buildingsData, waterData) {
  const el = document.getElementById('credits');
  if (!el) return;

  if (
    terrainData.placeholder ||
    routeData.placeholder ||
    landcoverData.placeholder ||
    pathsData.placeholder ||
    treesData.placeholder ||
    buildingsData.placeholder ||
    waterData.placeholder
  ) {
    el.textContent =
      `Placeholder terrain/route/landcover/paths/trees/buildings/water data (not real survey data) — run \`npm run terrain:build\` for the real ${courseName} dataset. ${BIKE_MODEL_CREDIT}`;
    return;
  }

  el.textContent =
    `Terrain: Environment Agency LIDAR (OGL) · Route, paths, buildings & landcover: OpenStreetMap contributors (ODbL) · Water: OpenStreetMap contributors (ODbL) · Trees: Environment Agency LIDAR (OGL) · ${BIKE_MODEL_CREDIT}`;
}

// Placeholder terrain has no real grid origin to convert from, and placeholder route
// data has no real area behind its hardcoded name — hide the HUD line in either case,
// same spirit as renderCredits' placeholder branch. Not gated on landcoverData.placeholder
// since landcover doesn't affect the grid origin or the route/area name.
function updateLocation(el, courseName, terrainData, routeData, x, z) {
  if (!el) return;

  if (terrainData.placeholder || routeData.placeholder) {
    el.textContent = '';
    return;
  }

  el.textContent = `${courseName}, Peak District · ${worldToGridRef(x, z, terrainData.origin)}`;
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

function spawnScorePopup(container, event) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = `score-popup score-popup--${event.amount < 0 ? 'penalty' : 'bonus'}`;
  el.textContent = event.label;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1000);
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

  const course = await createCourseSelect(COURSES).show();
  const courseDataUrl = (dir, suffix = '') =>
    `${import.meta.env.BASE_URL}data/${dir}/${course.id}${suffix}.json`;

  const [terrainData, routeData, landcoverData, pathsData, treesData, buildingsData, waterData] = await Promise.all([
    loadTerrainData(courseDataUrl('terrain')),
    loadRouteData(courseDataUrl('routes')),
    loadLandcoverData(courseDataUrl('terrain', '-landcover')),
    loadPathsData(courseDataUrl('routes', '-paths')),
    loadTreesData(courseDataUrl('terrain', '-trees')),
    loadBuildingsData(courseDataUrl('terrain', '-buildings')),
    loadWaterData(courseDataUrl('terrain', '-water')),
  ]);
  renderCredits(course.name, terrainData, routeData, landcoverData, pathsData, treesData, buildingsData, waterData);

  // yaw faces from the route's first point toward its second, so the bike spawns
  // already oriented down the track instead of at a fixed heading (see computeSpawnYaw).
  const spawnPoint = { ...routePointToWorld(routeData.points[0]), yaw: computeSpawnYaw(routeData) };
  const locationEl = document.getElementById('location');
  const staminaFillEl = document.getElementById('stamina-bar-fill');
  const boostBtnEl = document.getElementById('boost-btn');
  const scoreValueEl = document.getElementById('score-value');
  const comboValueEl = document.getElementById('combo-value');
  const scoreBestEl = document.getElementById('score-best');
  const scorePopupsEl = document.getElementById('score-popups');
  updateLocation(locationEl, course.name, terrainData, routeData, spawnPoint.x, spawnPoint.z);
  const miniMap = createMiniMap(terrainData, routeData);
  const scoreTracker = createScoreTracker();

  const { scene, camera, renderer, isNight, preset } = setupScene();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const terrain = createTerrain(terrainData, landcoverData, maxAnisotropy);
  scene.add(terrain.mesh);
  const pathsMaterial = createRockTrackMaterial(maxAnisotropy);
  // Flat-shaded so the route ribbon's rock relief (RouteOverlay.js's
  // ROUTE_STYLE.rockiness) reads as faceted chunks, matching the low-poly scattered
  // rocks elsewhere in the scene — a separate material instance from pathsMaterial so
  // this doesn't also facet the (flat, unperturbed) paths network.
  const routeMaterial = createRockTrackMaterial(maxAnisotropy, { flatShading: true });
  scene.add(buildPathsOverlay(pathsData, terrain, pathsMaterial));
  scene.add(buildRouteOverlay(routeData, terrain, routeMaterial));
  const scenery = buildScenery(routeData, treesData, terrain);
  scene.add(scenery);
  scene.add(buildBuildings(buildingsData, terrain));
  scene.add(buildWater(waterData, terrain));
  const groundMist = buildGroundMist(terrain, preset);
  scene.add(groundMist);
  const tyreTracks = buildTyreTrackTrail(terrain);
  scene.add(tyreTracks);

  const { world, bikeMaterial } = setupWorld(terrainData);
  const bike = new BikeController(
    scene,
    world,
    camera,
    terrain,
    spawnPoint,
    bikeMaterial,
    isNight,
    pickBikePreset(),
  );
  devTools.attachGameState({ bike, world, scene, camera, terrain, terrainData, routeData, scoreTracker });
  const inputState = createInputController(renderer.domElement);

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

      if (inputState.reset) {
        bike.respawn();
        tyreTracks.reset();
        inputState.reset = false;
      }

      const jumped = bike.applyInput(dt, inputState);
      world.step(1 / 60, dt, 10);
      bike.syncAfterStep(dt);
      tyreTracks.update(dt, bike);

      if (jumped) audioManager.playOnce('jump', 0.6);
      if (bike.hardLanding) audioManager.playOnce('crash', 0.8);
      tireRollAudio?.setVolume(bike.isGrounded() ? TIRE_ROLL_VOLUME : 0);

      scenery.update(dt);
      groundMist.update(camera, dt);
      miniMap.update(bike.mesh.position.x, bike.mesh.position.z, bike.yaw);
      if (staminaFillEl) {
        staminaFillEl.style.width = `${bike.stamina * 100}%`;
        staminaFillEl.classList.toggle('is-empty', bike.stamina <= 0);
      }
      if (boostBtnEl) boostBtnEl.classList.toggle('is-boosting', bike.boostActive);

      const landcoverClass = terrain.getLandcoverAt(bike.mesh.position.x, bike.mesh.position.z);
      const scoreEvents = scoreTracker.update(dt, bike, landcoverClass);
      if (scoreValueEl) scoreValueEl.textContent = Math.floor(scoreTracker.displayScore).toLocaleString();
      if (scoreBestEl) scoreBestEl.textContent = `BEST ${Math.floor(scoreTracker.bestScore).toLocaleString()}`;
      if (comboValueEl) {
        comboValueEl.textContent =
          scoreTracker.comboMultiplier > 1 ? `×${scoreTracker.comboMultiplier} COMBO` : '';
      }
      for (const event of scoreEvents) spawnScorePopup(scorePopupsEl, event);

      timeSinceLocationUpdate += dt;
      if (timeSinceLocationUpdate >= LOCATION_UPDATE_INTERVAL) {
        timeSinceLocationUpdate = 0;
        updateLocation(locationEl, course.name, terrainData, routeData, bike.mesh.position.x, bike.mesh.position.z);
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
