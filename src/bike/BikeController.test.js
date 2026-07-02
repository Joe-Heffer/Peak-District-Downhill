import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BikeController } from './BikeController.js';

const RADIUS = 0.5;
const GROUNDED_EPSILON = 0.05;
const FORWARD_SPEED = 6;
const TURN_RATE = 2.2;

let terrain;
let scene;
let world;
let camera;

beforeEach(() => {
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('no model in test'));

  terrain = { getHeightAt: () => 0 };
  scene = new THREE.Scene();
  world = new CANNON.World();
  camera = new THREE.PerspectiveCamera();
});

function createBike(spawnPoint = { x: 0, z: 0 }) {
  return new BikeController(scene, world, camera, terrain, spawnPoint);
}

describe('BikeController.isGrounded', () => {
  it('is true at/below groundY + RADIUS + GROUNDED_EPSILON and false above it', () => {
    const bike = createBike();

    bike.body.position.y = RADIUS + GROUNDED_EPSILON;
    expect(bike.isGrounded()).toBe(true);

    bike.body.position.y = RADIUS + GROUNDED_EPSILON + 0.5;
    expect(bike.isGrounded()).toBe(false);
  });
});

describe('BikeController.applyInput', () => {
  it('steers yaw left/right at TURN_RATE and updates velocity from the new heading', () => {
    const bike = createBike();
    const dt = 0.1;

    bike.applyInput(dt, { steerLeft: true, steerRight: false, jump: false });
    expect(bike.yaw).toBeCloseTo(TURN_RATE * dt);
    expect(bike.body.velocity.x).toBeCloseTo(Math.sin(bike.yaw) * FORWARD_SPEED);
    expect(bike.body.velocity.z).toBeCloseTo(Math.cos(bike.yaw) * FORWARD_SPEED);

    const yawAfterLeft = bike.yaw;
    bike.applyInput(dt, { steerLeft: false, steerRight: true, jump: false });
    expect(bike.yaw).toBeCloseTo(yawAfterLeft - TURN_RATE * dt);
  });

  it('applies a jump impulse and returns true only when grounded, and always resets inputState.jump', () => {
    const bike = createBike();
    bike.body.position.y = RADIUS; // grounded

    const groundedInput = { steerLeft: false, steerRight: false, jump: true };
    const jumped = bike.applyInput(0.016, groundedInput);
    expect(jumped).toBe(true);
    expect(groundedInput.jump).toBe(false);

    bike.body.position.y = RADIUS + 100; // airborne
    const airborneInput = { steerLeft: false, steerRight: false, jump: true };
    const jumpedWhileAirborne = bike.applyInput(0.016, airborneInput);
    expect(jumpedWhileAirborne).toBe(false);
    expect(airborneInput.jump).toBe(false);
  });
});

describe('BikeController.syncAfterStep', () => {
  it('flags a hard landing when transitioning from airborne to grounded while falling fast', () => {
    const bike = createBike();
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -10; // faster than HARD_LANDING_VELOCITY (-8)
    bike.body.position.y = RADIUS; // now grounded

    bike.syncAfterStep();
    expect(bike.hardLanding).toBe(true);
  });

  it('does not flag a hard landing on a gentle landing', () => {
    const bike = createBike();
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -2;
    bike.body.position.y = RADIUS;

    bike.syncAfterStep();
    expect(bike.hardLanding).toBe(false);
  });

  it('copies body position/quaternion onto the mesh', () => {
    const bike = createBike();
    bike.body.position.set(1, 2, 3);
    bike.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0.5);

    bike.syncAfterStep();

    expect(bike.mesh.position.x).toBeCloseTo(1);
    expect(bike.mesh.position.y).toBeCloseTo(2);
    expect(bike.mesh.position.z).toBeCloseTo(3);
    expect(bike.mesh.quaternion.y).toBeCloseTo(bike.body.quaternion.y);
  });
});
