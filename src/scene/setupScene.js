import * as THREE from 'three';
import { applySky } from './setupSky.js';

export function setupScene() {
  const container = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

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
  applySky({ scene, camera, renderer, dirLight, hemiLight });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
