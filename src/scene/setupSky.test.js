// @vitest-environment jsdom
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { applySky, SKY_PRESETS } from './setupSky.js';

let scene;
let camera;
let renderer;
let dirLight;
let hemiLight;

beforeEach(() => {
  window.history.pushState(null, '', '/');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  renderer = {};
  dirLight = new THREE.DirectionalLight();
  hemiLight = new THREE.HemisphereLight();
});

describe('SKY_PRESETS.night', () => {
  it('is the only preset flagged isNight', () => {
    expect(SKY_PRESETS.night.isNight).toBe(true);

    for (const [name, preset] of Object.entries(SKY_PRESETS)) {
      if (name === 'night') continue;
      expect(preset.isNight).toBeFalsy();
    }
  });
});

describe('applySky', () => {
  it('returns isNight: true and adds a moon + star field for ?sky=night', () => {
    window.history.pushState(null, '', '?sky=night');

    const result = applySky({ scene, camera, renderer, dirLight, hemiLight });

    // One Mesh for the sky dome, one for the moon.
    expect(result).toEqual({ isNight: true });
    expect(scene.children.filter((child) => child instanceof THREE.Mesh)).toHaveLength(2);
    expect(scene.children.some((child) => child instanceof THREE.Points)).toBe(true);
  });

  it('returns isNight: false and adds no moon/stars for a day preset', () => {
    window.history.pushState(null, '', '?sky=dusk');

    const result = applySky({ scene, camera, renderer, dirLight, hemiLight });

    // Only the sky dome Mesh, no moon.
    expect(result).toEqual({ isNight: false });
    expect(scene.children.filter((child) => child instanceof THREE.Mesh)).toHaveLength(1);
    expect(scene.children.some((child) => child instanceof THREE.Points)).toBe(false);
  });
});
