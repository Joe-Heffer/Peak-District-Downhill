import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applySky } from './setupSky.js';

export function setupScene() {
  const container = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Image-based lighting: gives every MeshStandardMaterial (bike, terrain, scenery)
  // realistic ambient-specular reflections for free, instead of the flat/plasticky look
  // hemisphere+directional lighting alone produces. Generic interior room for now — a
  // follow-up will swap this for an outdoor HDRI to match the moorland sky (see #19).
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  pmremGenerator.dispose();

  // Cut Gate's real terrain spans kilometres, not the old 200x200 flat toy plane, and the
  // sky dome (see setupSky.js) needs headroom beyond its own scale, so the far plane is
  // pushed out well beyond the old flat-plane tuning.
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    10000,
  );
  camera.position.set(0, 4, -8);

  const hemiLight = new THREE.HemisphereLight();
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight();
  scene.add(dirLight);

  // Sets scene.background (via the Sky mesh), scene.fog, light colour/intensity/position
  // and renderer tone mapping from a randomly chosen time-of-day/weather preset.
  const { isNight } = applySky({ scene, camera, renderer, dirLight, hemiLight });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, isNight };
}
