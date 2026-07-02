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
};

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

// Builds the sky dome and points the scene's existing sun/hemisphere lights, fog and
// renderer tone mapping at one randomly (or ?sky=-) chosen preset.
export function applySky({ scene, camera, renderer, dirLight, hemiLight }) {
  const preset = SKY_PRESETS[pickPresetName()];
  const sunDirection = getSunDirection(preset.sunElevation, preset.sunAzimuth);

  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = preset.turbidity;
  uniforms.rayleigh.value = preset.rayleigh;
  uniforms.mieCoefficient.value = preset.mieCoefficient;
  uniforms.mieDirectionalG.value = preset.mieDirectionalG;
  uniforms.cloudCoverage.value = preset.cloudCoverage;
  uniforms.cloudDensity.value = preset.cloudDensity;
  uniforms.sunPosition.value.copy(sunDirection);

  const clock = new THREE.Clock();
  sky.onBeforeRender = () => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
    uniforms.time.value = clock.getElapsedTime();
  };
  scene.add(sky);

  dirLight.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
  dirLight.color.set(preset.sunColor);
  dirLight.intensity = preset.sunIntensity;

  hemiLight.color.set(preset.hemiSkyColor);
  hemiLight.groundColor.set(preset.hemiGroundColor);
  hemiLight.intensity = preset.hemiIntensity;

  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.toneMappingExposure;
}
