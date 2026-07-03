import * as THREE from 'three';
import { applyMaxAnisotropy } from './HeightmapTerrain.js';

const ROCK_TRACK_TEXTURE_URL = `${import.meta.env.BASE_URL}assets/textures/rock-track.jpg`;

const textureLoader = new THREE.TextureLoader();

// A mottled rocky/gravelly placeholder standing in for a real photo texture until one
// is dropped in at ROCK_TRACK_TEXTURE_URL — generated in-browser so it needs no asset
// file. Tuned warmer/greyer than createPlaceholderGroundTexture()'s green grass base,
// sitting between HeightmapTerrain.js's `rock` (0x8f8a80) and `track` (0x9c8a68)
// landcover tints so the ribbon reads as a continuation of that palette, not an insert.
function createPlaceholderRockTrackTexture(maxAnisotropy) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8f8270';
  ctx.fillRect(0, 0, size, size);

  // Coarse mottled stones — bigger, sparser blobs than the ground texture's fine
  // speckle, each with a light/dark edge for cheap pseudo-3D relief.
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 9;
    const shade = Math.floor(Math.random() * 50) - 20;
    ctx.fillStyle = `rgba(${140 + shade}, ${128 + shade}, ${110 + shade}, 0.55)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.7 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${60 + shade}, ${52 + shade}, ${42 + shade}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.7 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI);
    ctx.stroke();
  }

  // Finer gravel speckle on top.
  for (let i = 0; i < 3000; i += 1) {
    const shade = Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${90 + shade}, ${82 + shade}, ${68 + shade}, 0.4)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few worn dirt ruts.
  for (let i = 0; i < 3; i += 1) {
    const y = size * (0.3 + i * 0.2) + Math.random() * 20;
    ctx.strokeStyle = 'rgba(50, 42, 32, 0.25)';
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.33, y + Math.random() * 16 - 8, size * 0.66, y + Math.random() * 16 - 8, size, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  applyMaxAnisotropy(texture, maxAnisotropy);
  return texture;
}

// Swaps in a real rock/track texture if one exists at ROCK_TRACK_TEXTURE_URL —
// silently keeps the procedural placeholder material if not (dev/CI default), same
// pattern as HeightmapTerrain.js's loadRealGroundTexture.
function loadRealRockTrackTexture(material, maxAnisotropy) {
  textureLoader.load(
    ROCK_TRACK_TEXTURE_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      applyMaxAnisotropy(texture, maxAnisotropy);
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {}, // no real texture yet — keep the procedural placeholder
  );
}

// One shared material for every rideable-surface ribbon (route + road + bridleway +
// footpath) — cheaper than one texture per mesh and guarantees a consistent rocky
// look everywhere. Per-category tint still comes from each ribbon's own vertex colors
// (see PathsOverlay.js's PATH_STYLES / RouteOverlay.js's ROUTE_STYLE), multiplied
// against this shared texture.
export function createRockTrackMaterial(maxAnisotropy) {
  const material = new THREE.MeshStandardMaterial({
    map: createPlaceholderRockTrackTexture(maxAnisotropy),
    vertexColors: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  loadRealRockTrackTexture(material, maxAnisotropy);
  return material;
}
