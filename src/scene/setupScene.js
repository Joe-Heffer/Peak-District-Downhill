import * as THREE from 'three';

export function setupScene() {
  const container = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  // Cut Gate's real terrain spans kilometres, not the old 200x200 flat toy plane, so
  // fog/far-plane distances are pushed out well beyond the old flat-plane tuning.
  scene.fog = new THREE.Fog(0x87ceeb, 100, 4000);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    6000,
  );
  camera.position.set(0, 4, -8);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a5d3a, 1.2);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
