import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Camera roams up to ~4.7km from the origin as the bike follows the route, so the sky
// mesh is re-centred on the camera every frame (see onBeforeRender below) rather than
// scaled to the terrain extent — this scale only needs to clear the near/far clip planes.
const SKY_SCALE = 8000;
const SUN_DISTANCE = 500;

// Static-per-session presets (chosen once at load, no continuous day/night cycle) tuned
// for "warm low sun, cooler midday" per issue #19, with hemisphere ground colour anchored
// to the terrain's mossy placeholder tone (#4a5d3a) so ground and sky light agree.
export const SKY_PRESETS = {
  dawn: {
    sunElevation: 4, sunAzimuth: 110,
    turbidity: 6, rayleigh: 2.2, mieCoefficient: 0.006, mieDirectionalG: 0.85,
    cloudCoverage: 0.3, cloudDensity: 0.35,
    sunColor: 0xffb37a, sunIntensity: 1.4,
    hemiSkyColor: 0xb0c4de, hemiGroundColor: 0x4a5d3a, hemiIntensity: 0.6,
    fogColor: 0xdcc7b0, fogNear: 60, fogFar: 2600,
    toneMappingExposure: 0.9,
  },
  goldenHour: {
    sunElevation: 8, sunAzimuth: 240,
    turbidity: 4, rayleigh: 1.8, mieCoefficient: 0.004, mieDirectionalG: 0.8,
    cloudCoverage: 0.25, cloudDensity: 0.3,
    sunColor: 0xffa552, sunIntensity: 1.6,
    hemiSkyColor: 0xffd9a0, hemiGroundColor: 0x4a5d3a, hemiIntensity: 0.7,
    fogColor: 0xf2b880, fogNear: 120, fogFar: 4200,
    toneMappingExposure: 1.0,
  },
  // THREE.Sky is a clear-atmosphere shader — high turbidity/mieDirectionalG and low
  // rayleigh wash it toward flat milky grey-white to fake overcast British-hills weather,
  // combined with heavy built-in cloud coverage/density and tight fog to sell the mood.
  overcastMidday: {
    sunElevation: 45, sunAzimuth: 180,
    turbidity: 20, rayleigh: 1.0, mieCoefficient: 0.02, mieDirectionalG: 0.95,
    cloudCoverage: 0.85, cloudDensity: 0.9,
    sunColor: 0xcdd6dc, sunIntensity: 0.55,
    hemiSkyColor: 0xc9d2d8, hemiGroundColor: 0x4a5d3a, hemiIntensity: 1.1,
    fogColor: 0xb7bfc2, fogNear: 40, fogFar: 2000,
    toneMappingExposure: 0.85,
  },
  dusk: {
    sunElevation: 1.5, sunAzimuth: 300,
    turbidity: 5, rayleigh: 2.5, mieCoefficient: 0.008, mieDirectionalG: 0.85,
    cloudCoverage: 0.4, cloudDensity: 0.4,
    sunColor: 0xff7a5c, sunIntensity: 1.6,
    hemiSkyColor: 0x5b6d8c, hemiGroundColor: 0x435735, hemiIntensity: 1.0,
    fogColor: 0x9aa0c0, fogNear: 70, fogFar: 3000,
    toneMappingExposure: 1.1,
  },
  // sunElevation is pushed well below the horizon purely so the Sky shader's atmosphere
  // stays dark (the shader brightens sharply once its "sun" is above the horizon,
  // regardless of turbidity/rayleigh) — moonElevation/moonAzimuth is the separate,
  // actual light source direction: applySky points dirLight (relabelled as moonlight)
  // and the visible moon disc at that position instead of at sunElevation/sunAzimuth.
  // isNight also gates the star field below and the bike headlight (see #79).
  night: {
    isNight: true,
    sunElevation: -15, sunAzimuth: 250,
    moonElevation: 55, moonAzimuth: 200,
    turbidity: 2, rayleigh: 0.3, mieCoefficient: 0.003, mieDirectionalG: 0.8,
    cloudCoverage: 0.15, cloudDensity: 0.2,
    sunColor: 0x9fb8e8, sunIntensity: 0.6,
    hemiSkyColor: 0x263757, hemiGroundColor: 0x232a1a, hemiIntensity: 0.55,
    fogColor: 0x0a0e1c, fogNear: 25, fogFar: 700,
    toneMappingExposure: 1.3,
  },
};

const MOON_DISTANCE = 4000; // inside SKY_SCALE so it renders in front of the sky dome
const MOON_RADIUS = 180;
const STAR_COUNT = 2500;
const STAR_FIELD_RADIUS = 5000;

// `?sky=dusk` etc. overrides the random pick — handy for manually eyeballing one preset.
function pickPresetName() {
  const override = new URLSearchParams(window.location.search).get('sky');
  if (override && SKY_PRESETS[override]) return override;

  const names = Object.keys(SKY_PRESETS);
  return names[Math.floor(Math.random() * names.length)];
}

function getSunDirection(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

// Both the moon and star field re-centre on the camera every frame via onBeforeRender,
// the same trick the sky dome above uses, so they stay "infinitely far" as the camera
// roams kilometres of terrain rather than needing a hook in main.js's tick loop.
function createMoon(preset) {
  const direction = getSunDirection(preset.moonElevation, preset.moonAzimuth);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_RADIUS, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xf5f3e7, fog: false }),
  );
  moon.onBeforeRender = (renderer, scene, camera) => {
    moon.position.copy(camera.position).addScaledVector(direction, MOON_DISTANCE);
  };
  return moon;
}

function createStars() {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    // acos(2u - 1) distributes polar angle evenly over the sphere's surface area,
    // avoiding the pole-clustering a naive random phi/theta pair would produce.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = STAR_FIELD_RADIUS * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = STAR_FIELD_RADIUS * Math.cos(phi);
    positions[i * 3 + 2] = STAR_FIELD_RADIUS * Math.sin(phi) * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: true, fog: false }),
  );
  stars.onBeforeRender = (renderer, scene, camera) => {
    stars.position.copy(camera.position);
  };
  return stars;
}

// Builds the sky dome and points the scene's existing sun/hemisphere lights, fog and
// renderer tone mapping at one randomly (or ?sky=-) chosen preset.
export function applySky({ scene, camera, renderer, dirLight, hemiLight }) {
  const preset = SKY_PRESETS[pickPresetName()];
  const skyDirection = getSunDirection(preset.sunElevation, preset.sunAzimuth);
  // At night the dirLight/moon disc are driven by moonElevation/moonAzimuth instead of
  // the Sky shader's (deliberately sub-horizon) sunElevation/sunAzimuth — see the `night`
  // preset comment above.
  const lightDirection = preset.isNight
    ? getSunDirection(preset.moonElevation, preset.moonAzimuth)
    : skyDirection;

  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = preset.turbidity;
  uniforms.rayleigh.value = preset.rayleigh;
  uniforms.mieCoefficient.value = preset.mieCoefficient;
  uniforms.mieDirectionalG.value = preset.mieDirectionalG;
  uniforms.cloudCoverage.value = preset.cloudCoverage;
  uniforms.cloudDensity.value = preset.cloudDensity;
  uniforms.sunPosition.value.copy(skyDirection);

  const clock = new THREE.Clock();
  sky.onBeforeRender = () => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
    uniforms.time.value = clock.getElapsedTime();
  };
  scene.add(sky);

  dirLight.position.copy(lightDirection).multiplyScalar(SUN_DISTANCE);
  dirLight.color.set(preset.sunColor);
  dirLight.intensity = preset.sunIntensity;

  hemiLight.color.set(preset.hemiSkyColor);
  hemiLight.groundColor.set(preset.hemiGroundColor);
  hemiLight.intensity = preset.hemiIntensity;

  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.toneMappingExposure;

  if (preset.isNight) {
    scene.add(createMoon(preset));
    scene.add(createStars());
  }

  return { isNight: Boolean(preset.isNight) };
}
