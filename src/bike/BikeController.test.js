import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BikeController } from './BikeController.js';

const RADIUS = 0.5;
const GROUNDED_EPSILON = 0.05;
const TURN_RATE = 2.2;
const GRIP_MU = 0.8;
const GRAVITY_MAG = 9.82;
const JUMP_LAUNCH_VELOCITY = 7;

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
  it('steers yaw left/right at TURN_RATE at rest, and orients velocity along heading once moving', () => {
    const bike = createBike();
    const dt = 0.1;

    bike.applyInput(dt, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(bike.yaw).toBeCloseTo(TURN_RATE * dt); // still at rest, so no grip-cap applies

    const yawAfterLeft = bike.yaw;
    bike.speed = 5; // seed a nonzero speed so velocity direction is well-defined below
    bike.applyInput(dt, { steerLeft: false, steerRight: true, jump: false, brake: false });
    expect(bike.yaw).toBeLessThan(yawAfterLeft);
    expect(bike.body.velocity.x).toBeCloseTo(Math.sin(bike.yaw) * bike.speed);
    expect(bike.body.velocity.z).toBeCloseTo(Math.cos(bike.yaw) * bike.speed);
  });

  it('caps turn rate by lateral grip at speed, but not when nearly at rest', () => {
    const bike = createBike();
    const dt = 0.1;

    bike.speed = 20;
    bike.applyInput(dt, { steerLeft: true, steerRight: false, jump: false, brake: false });
    const expectedCap = Math.min(TURN_RATE, (GRIP_MU * GRAVITY_MAG) / 20);
    expect(bike.yaw).toBeCloseTo(expectedCap * dt);
    expect(bike.yaw).toBeLessThan(TURN_RATE * dt);

    const atRestBike = createBike();
    atRestBike.applyInput(dt, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(atRestBike.yaw).toBeCloseTo(TURN_RATE * dt);
  });

  it('accelerates down a sloped stub terrain', () => {
    const slopedTerrain = { getHeightAt: (x, z) => -0.1 * z }; // 10% descending grade in +z
    const bike = createBike();
    bike.terrain = slopedTerrain;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const dt = 1 / 60;

    let previousSpeed = bike.speed;
    for (let i = 0; i < 15; i += 1) {
      bike.applyInput(dt, input);
      expect(bike.speed).toBeGreaterThan(previousSpeed);
      previousSpeed = bike.speed;
    }
  });

  it('decelerates on flat ground from rolling resistance and drag alone', () => {
    const bike = createBike();
    bike.speed = 8;
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false });
    expect(bike.speed).toBeLessThan(8);
  });

  it('brakes to a lower speed than coasting over the same step', () => {
    const coastingBike = createBike();
    coastingBike.speed = 8;
    coastingBike.applyInput(1 / 60, {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: false,
    });

    const brakingBike = createBike();
    brakingBike.speed = 8;
    brakingBike.applyInput(1 / 60, {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: true,
    });

    expect(brakingBike.speed).toBeLessThan(coastingBike.speed);
  });

  it('applies a jump impulse and returns true only when grounded, and always resets inputState.jump', () => {
    const bike = createBike();
    bike.body.position.y = RADIUS; // grounded

    const groundedInput = { steerLeft: false, steerRight: false, jump: true, brake: false };
    const jumped = bike.applyInput(0.016, groundedInput);
    expect(jumped).toBe(true);
    expect(groundedInput.jump).toBe(false);
    expect(bike.body.velocity.y).toBeCloseTo(JUMP_LAUNCH_VELOCITY);

    bike.body.position.y = RADIUS + 100; // airborne
    const airborneInput = { steerLeft: false, steerRight: false, jump: true, brake: false };
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
