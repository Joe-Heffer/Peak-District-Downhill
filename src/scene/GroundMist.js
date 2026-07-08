import * as THREE from 'three';

// Three stacked discs forming a density gradient from ground-hugging to wispy top,
// rather than one hard-edged sheet — LAYER_FRACTIONS place each disc within
// preset.mistHeight, LAYER_WEIGHTS thin out opacity/drift going up.
const LAYER_FRACTIONS = [0.15, 0.5, 0.85];
const LAYER_WEIGHTS = [1, 0.6, 0.35];
const LAYER_DRIFT_SPEEDS = [0.015, -0.01, 0.008]; // rad/s, alternating direction per layer
const MIST_SEGMENTS = 32;

let sharedMistTexture = null;

// Issue #156's tuning gate: mistOpacity <= 0 (overcastMidday) means no ground mist for
// that preset, rather than every preset needing a special-cased "missing field" check.
export function shouldBuildMist(preset) {
  return preset.mistOpacity > 0;
}

export function computeLayerY(groundY, preset, layerFraction) {
  return groundY + preset.mistHeight * layerFraction;
}

export function computeLayerOpacity(preset, layerWeight) {
  return preset.mistOpacity * layerWeight;
}

// Soft radial falloff, white centre fading to fully transparent edge — a cheap
// "volumetric-ish" alpha mask with no external asset, same in-code-canvas pattern as
// HeightmapTerrain.js's createPlaceholderGroundTexture(). Shared across every mist
// layer/preset since only the material's opacity/color vary, not the mask shape.
function getMistTexture() {
  if (sharedMistTexture) return sharedMistTexture;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  sharedMistTexture = new THREE.CanvasTexture(canvas);
  return sharedMistTexture;
}

function buildMistLayer(preset, layerIndex) {
  const geometry = new THREE.CircleGeometry(preset.mistRadius, MIST_SEGMENTS).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: getMistTexture(),
    color: preset.mistColor,
    transparent: true,
    opacity: computeLayerOpacity(preset, LAYER_WEIGHTS[layerIndex]),
    // depthWrite off avoids z-fighting between the three overlapping transparent
    // layers; default depthTest stays on, which is what makes ridges poke through and
    // dips stay covered for free via ordinary depth-buffer occlusion (see issue #156).
    depthWrite: false,
    side: THREE.DoubleSide,
    // The mist itself IS extra fog — letting the scene's own distance THREE.Fog also
    // apply here would double-fade it; distance fog still swallows the whole group at
    // range regardless, since it's just more scene geometry.
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

// Height-based "ground mist" (issue #156): three camera-following, alpha-gradiented
// discs layered on top of the existing per-preset distance fog (setupSky.js), so
// low-lying dips along the route read as misty while ridgelines poke clear of it —
// real 3D geometry against terrain.getHeightAt gets that occlusion for free, no
// terrain-shader hook needed. Kept camera-relative (not pinned to a fixed world-space
// Y) so it stays in view as the camera roams the ~3.7km Cut Gate route, rather than
// being seen edge-on from a distant ridge.
export function buildGroundMist(terrain, preset) {
  const group = new THREE.Group();

  if (!shouldBuildMist(preset)) {
    group.update = () => {};
    return group;
  }

  const layers = LAYER_FRACTIONS.map((_, index) => buildMistLayer(preset, index));
  layers.forEach((layer) => group.add(layer));

  group.update = (camera, dt) => {
    const groundY = terrain.getHeightAt(camera.position.x, camera.position.z);
    layers.forEach((layer, index) => {
      layer.position.set(camera.position.x, computeLayerY(groundY, preset, LAYER_FRACTIONS[index]), camera.position.z);
      layer.rotation.y += LAYER_DRIFT_SPEEDS[index] * dt;
    });
  };

  return group;
}
