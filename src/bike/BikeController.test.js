import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BikeController } from './BikeController.js';

const RADIUS = 0.5;
const SPAWN_CLEARANCE = RADIUS + 0.05;
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

  it('climbs a steep uphill grade while pedalling (regression: Cut Gate\'s real route has climbs up to ~19% grade)', () => {
    const steepUphillTerrain = { getHeightAt: (x, z) => 0.19 * z }; // ~19% ascending grade in +z
    const bike = createBike();
    bike.terrain = steepUphillTerrain;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };
    const dt = 1 / 60;

    let previousSpeed = bike.speed;
    for (let i = 0; i < 15; i += 1) {
      bike.applyInput(dt, input);
      expect(bike.speed).toBeGreaterThan(previousSpeed);
      previousSpeed = bike.speed;
    }
  });

  it('still stalls on an unrealistically extreme grade even while pedalling', () => {
    const extremeUphillTerrain = { getHeightAt: (x, z) => 0.4 * z }; // 40% ascending grade in +z
    const bike = createBike();
    bike.terrain = extremeUphillTerrain;
    bike.speed = 2;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };

    bike.applyInput(1 / 60, input);
    expect(bike.speed).toBeLessThan(2);
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

  it('keeps moving under pedal input after sitting idle long enough to fall asleep (regression)', () => {
    // Mirrors setupWorld.js's real config: with world.allowSleep on and the default
    // 1s sleepTimeLimit, a body resting below the speed threshold falls fully
    // asleep, and cannon-es then ignores velocity writes on it until something
    // calls wakeUp() — silently freezing the bike in place despite pedal input.
    const sleepyWorld = new CANNON.World();
    sleepyWorld.allowSleep = true;
    const bike = new BikeController(scene, sleepyWorld, camera, terrain, { x: 0, z: 0 });
    const dt = 1 / 60;

    for (let i = 0; i < 90; i += 1) {
      sleepyWorld.step(dt); // idle for 1.5s, well past the default 1s sleepTimeLimit
    }

    const pedalInput = {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: false,
      pedal: true,
    };
    for (let i = 0; i < 30; i += 1) {
      bike.applyInput(dt, pedalInput);
      sleepyWorld.step(dt);
    }

    expect(bike.body.sleepState).not.toBe(CANNON.Body.SLEEPING);
    expect(bike.body.position.z).toBeGreaterThan(0);
  });
});

describe('BikeController stamina', () => {
  it('starts full', () => {
    const bike = createBike();
    expect(bike.stamina).toBe(1);
  });

  it('accelerates on flat ground while pedalling with stamina available', () => {
    const bike = createBike();
    bike.speed = 3;
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true });
    expect(bike.speed).toBeGreaterThan(3);
  });

  it('drains while pedalling and regenerates while coasting', () => {
    const bike = createBike();
    const pedalInput = {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: false,
      pedal: true,
    };

    bike.applyInput(1, pedalInput);
    expect(bike.stamina).toBeLessThan(1);

    const staminaAfterPedalling = bike.stamina;
    bike.applyInput(1, { ...pedalInput, pedal: false });
    expect(bike.stamina).toBeGreaterThan(staminaAfterPedalling);
  });

  it('does not drain below 0 while pedal is held', () => {
    const bike = createBike();
    bike.stamina = 0;
    bike.speed = 3;

    bike.applyInput(1, { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true });
    expect(bike.stamina).toBe(0);
  });

  it('pedalling with empty stamina applies the weaker steady accel instead of zero propulsion', () => {
    const bike = createBike();
    bike.stamina = 0;
    bike.speed = 3;

    bike.applyInput(1, { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true });
    expect(bike.speed).toBeGreaterThan(3); // steady accel still beats rolling resistance/drag
  });

  it('applies less propulsion at 0 stamina (steady rate) than at full stamina (burst rate)', () => {
    const pedalInput = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };

    const burstBike = createBike();
    burstBike.speed = 3;
    burstBike.applyInput(1, pedalInput);

    const steadyBike = createBike();
    steadyBike.stamina = 0;
    steadyBike.speed = 3;
    steadyBike.applyInput(1, pedalInput);

    expect(steadyBike.speed).toBeGreaterThan(3);
    expect(steadyBike.speed).toBeLessThan(burstBike.speed);
  });

  it('keeps climbing a realistic steep grade at the steady rate once stamina is empty (low-gear regression)', () => {
    // Real bikes have low ("granny") gearing precisely so a rider can keep grinding up a
    // steep grade forever once winded, just slowly — pedalling should never fully stall
    // out on Cut Gate's real climbs (up to ~19% grade) just because stamina ran out.
    const steepUphillTerrain = { getHeightAt: (x, z) => 0.19 * z };
    const bike = createBike();
    bike.terrain = steepUphillTerrain;
    bike.stamina = 0;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };
    const dt = 1 / 60;

    let previousSpeed = bike.speed;
    for (let i = 0; i < 60; i += 1) {
      bike.applyInput(dt, input);
      expect(bike.speed).toBeGreaterThan(previousSpeed);
      expect(bike.stamina).toBe(0); // steady rate must not need any stamina to keep working
      previousSpeed = bike.speed;
    }
  });

  it('keeps stamina pinned at 0 while holding pedal at the steady rate, and only regenerates once released', () => {
    const pedalInput = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };
    const bike = createBike();
    bike.stamina = 0;

    bike.applyInput(1, pedalInput);
    expect(bike.stamina).toBe(0);

    bike.applyInput(1, { ...pedalInput, pedal: false });
    expect(bike.stamina).toBeGreaterThan(0);
  });

  it('drains over the new, longer burst duration rather than the old ~6s one', () => {
    const bike = createBike();
    const pedalInput = { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: true };

    bike.applyInput(6, pedalInput); // old ~6s full-drain duration
    expect(bike.stamina).toBeGreaterThan(0); // must not be empty yet under the new tuning

    bike.applyInput(9, pedalInput); // total 15s, matching STAMINA_DRAIN_RATE = 1/15
    expect(bike.stamina).toBe(0);
  });

  it('does not regenerate above MAX_STAMINA', () => {
    const bike = createBike();
    bike.applyInput(10, { steerLeft: false, steerRight: false, jump: false, brake: false, pedal: false });
    expect(bike.stamina).toBe(1);
  });

  it('regenerates faster while braking/near-stationary than while coasting at speed', () => {
    const coastingBike = createBike();
    coastingBike.stamina = 0;
    coastingBike.speed = 10; // above STAMINA_REST_SPEED_THRESHOLD
    coastingBike.applyInput(1, {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: false,
      pedal: false,
    });

    const restingBike = createBike();
    restingBike.stamina = 0;
    restingBike.speed = 10;
    restingBike.applyInput(1, {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: true,
      pedal: false,
    });

    expect(restingBike.stamina).toBeGreaterThan(coastingBike.stamina);
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

describe('BikeController headlight (issue #79)', () => {
  it('adds a headlight + target as children of mesh only when constructed at night', () => {
    const nightBike = new BikeController(scene, world, camera, terrain, { x: 0, z: 0 }, undefined, true);
    expect(nightBike.headlight).toBeInstanceOf(THREE.SpotLight);
    expect(nightBike.mesh.children).toContain(nightBike.headlight);
    expect(nightBike.mesh.children).toContain(nightBike.headlight.target);

    const dayBike = createBike();
    expect(dayBike.headlight).toBeUndefined();
  });

  it('survives a successful model load, which otherwise clears mesh children', async () => {
    GLTFLoader.prototype.loadAsync.mockResolvedValue({ scene: new THREE.Group() });

    const bike = new BikeController(scene, world, camera, terrain, { x: 0, z: 0 }, undefined, true);
    await bike.loadModel();

    expect(bike.mesh.children).toContain(bike.headlight);
    expect(bike.mesh.children).toContain(bike.headlight.target);
  });
});

describe('BikeController.respawn (issue #81)', () => {
  it('resets position, velocity, yaw, speed, and stamina back to spawn state', () => {
    const spawnPoint = { x: 12, z: -34 };
    const bike = createBike(spawnPoint);

    bike.body.position.set(100, 50, 100);
    bike.body.velocity.set(3, -2, 5);
    bike.yaw = 1.5;
    bike.speed = 10;
    bike.stamina = 0.2;
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -20;
    bike.hardLanding = true;

    bike.respawn();

    expect(bike.body.position.x).toBeCloseTo(spawnPoint.x);
    expect(bike.body.position.y).toBeCloseTo(SPAWN_CLEARANCE);
    expect(bike.body.position.z).toBeCloseTo(spawnPoint.z);
    expect(bike.body.velocity.x).toBeCloseTo(0);
    expect(bike.body.velocity.y).toBeCloseTo(0);
    expect(bike.body.velocity.z).toBeCloseTo(0);
    expect(bike.yaw).toBe(0);
    expect(bike.speed).toBe(0);
    expect(bike.stamina).toBe(1);
    expect(bike.wasGrounded).toBe(true);
    expect(bike.previousVerticalVelocity).toBe(0);
    expect(bike.hardLanding).toBe(false);
  });

  it('resamples spawn height from the current terrain rather than reusing a stale value', () => {
    const slopedTerrain = { getHeightAt: (x, z) => -0.1 * z };
    const bike = new BikeController(scene, world, camera, slopedTerrain, { x: 0, z: 20 });

    bike.body.position.set(0, 0, 0);
    bike.respawn();

    expect(bike.body.position.y).toBeCloseTo(slopedTerrain.getHeightAt(0, 20) + SPAWN_CLEARANCE);
    expect(bike.body.position.z).toBeCloseTo(20);
  });
});

describe('BikeController.teleport (issue #81)', () => {
  it('moves the bike and zeroes velocity/grounding state, leaving yaw/speed/stamina untouched', () => {
    const constantHeightTerrain = { getHeightAt: () => 5 };
    const bike = new BikeController(scene, world, camera, constantHeightTerrain, { x: 0, z: 0 });

    bike.body.velocity.set(3, -2, 5);
    bike.yaw = 0.7;
    bike.speed = 8;
    bike.stamina = 0.4;
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -20;
    bike.hardLanding = true;

    bike.teleport(40, -60);

    expect(bike.body.position.x).toBeCloseTo(40);
    expect(bike.body.position.y).toBeCloseTo(5 + SPAWN_CLEARANCE);
    expect(bike.body.position.z).toBeCloseTo(-60);
    expect(bike.body.velocity.x).toBeCloseTo(0);
    expect(bike.body.velocity.y).toBeCloseTo(0);
    expect(bike.body.velocity.z).toBeCloseTo(0);
    expect(bike.wasGrounded).toBe(true);
    expect(bike.previousVerticalVelocity).toBe(0);
    expect(bike.hardLanding).toBe(false);
    expect(bike.yaw).toBe(0.7);
    expect(bike.speed).toBe(8);
    expect(bike.stamina).toBe(0.4);
  });
});
