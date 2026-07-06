import fs from 'fs';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BikeController } from './BikeController.js';
import { setupWorld } from '../physics/setupWorld.js';
import { createHeightLookup } from '../terrain/HeightmapTerrain.js';
import { routePointToWorld } from '../routes/RouteOverlay.js';

// Mirrors BikeController.js's own physics constants (issue #66's RaycastVehicle rework)
// so these tests can compute expected values without importing module-private consts.
const SPAWN_CLEARANCE = 0.15 + 0.15 + 0.33; // CHASSIS_HALF_EXTENTS.y + SUSPENSION_REST_LENGTH + WHEEL_RADIUS
const TURN_RATE = 2.2;
const GRIP_MU = 0.8;
const BRAKE_MU = 0.5;
const GRAVITY_MAG = 9.82;
const TURN_RATE_MIN_SPEED = 0.5;
const WHEELBASE = 0.9;
const MAX_STEER_ANGLE = 0.6;
const JUMP_LAUNCH_VELOCITY = 7;
const STUCK_UNGROUNDED_TIME = 0.5;
const BIKE_MASS = 85;
const BASELINE_ACCEL = 3.2;
const BOOST_ACCEL = 5.5;
const MAX_SPEED = 25;
const EBIKE_BASELINE_ACCEL = 4.8;
const EBIKE_BOOST_ACCEL = 8.0;
const EBIKE_MAX_SPEED = 35;
const REVERSE_STEER_SPEED_THRESHOLD = 0.5;
const WHEEL_FRONT = 0;
const WHEEL_REAR = 1;

let terrain;
let scene;
let world;
let camera;

beforeEach(() => {
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('no model in test'));

  terrain = { getHeightAt: () => 0 };
  scene = new THREE.Scene();
  // Real gravity (unlike the old velocity-hack model, which never relied on cannon-es
  // integration): tests that actually step the world need it for propulsion/slope/roll
  // behaviour to emerge from real physics.
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  camera = new THREE.PerspectiveCamera();
});

function createBike(spawnPoint = { x: 0, z: 0 }) {
  return new BikeController(scene, world, camera, terrain, spawnPoint);
}

// An infinite tilted plane satisfying y = slope * z (matching a `getHeightAt: (x, z) =>
// slope * z` terrain stub), for tests that need the vehicle's wheels to find real ground
// via actual raycasts rather than the old height-lookup epsilon check.
function createGroundBody(testWorld, { slope = 0 } = {}) {
  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  const normal = new THREE.Vector3(0, 1, -slope).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  groundBody.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  testWorld.addBody(groundBody);
  return groundBody;
}

function expectedSteerAngle(speed, steerSignal) {
  const turnCap =
    speed < TURN_RATE_MIN_SPEED ? TURN_RATE : Math.min(TURN_RATE, (GRIP_MU * GRAVITY_MAG) / speed);
  const speedForSteer = Math.max(speed, TURN_RATE_MIN_SPEED);
  const magnitude = Math.min(Math.atan((turnCap * WHEELBASE) / speedForSteer), MAX_STEER_ANGLE);
  return magnitude * steerSignal;
}

describe('BikeController.isGrounded', () => {
  it('is true once settled on real ground and false when lifted far above it', () => {
    createGroundBody(world);
    const bike = createBike();
    const dt = 1 / 60;

    for (let i = 0; i < 30; i += 1) world.step(dt);
    expect(bike.isGrounded()).toBe(true);

    bike.body.position.y = 100;
    world.step(dt);
    expect(bike.isGrounded()).toBe(false);
  });
});

describe('BikeController grounding on the real Cut Gate terrain (issue #148 regression)', () => {
  it('gets at least one real wheel into contact within a couple of seconds of spawning at the real route start', () => {
    // Regression test for issue #148: the bike was permanently stuck at spawn because
    // no wheel's raycast ever found the real, non-placeholder Cut Gate heightfield at
    // the route's actual first point — a locally steep/"twisted" terrain cell that a
    // synthetic stub terrain (used by every other test in this file) can't reproduce.
    const terrainData = JSON.parse(
      fs.readFileSync(new URL('../../public/data/terrain/cutgate.json', import.meta.url)),
    );
    const routeData = JSON.parse(
      fs.readFileSync(new URL('../../public/data/routes/cutgate.json', import.meta.url)),
    );
    const realTerrain = { getHeightAt: createHeightLookup(terrainData) };
    const { world: realWorld, bikeMaterial } = setupWorld(terrainData);
    const spawnPoint = routePointToWorld(routeData.points[0]);

    const bike = new BikeController(scene, realWorld, camera, realTerrain, spawnPoint, bikeMaterial);
    const dt = 1 / 60;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };

    let groundedWithinBudget = false;
    for (let i = 0; i < 150 && !groundedWithinBudget; i += 1) {
      bike.applyInput(dt, input);
      realWorld.step(dt);
      if (bike.vehicle.wheelInfos.some((wheel) => wheel.isInContact)) {
        groundedWithinBudget = true;
      }
    }

    expect(groundedWithinBudget).toBe(true);
  });

  it('stays upright with no input at the real route start (bike-falls-over-at-spawn regression)', () => {
    // Regression test: the route's real first point sits on a steeply side-cambered
    // ("twisted") cell (~16 degrees of lateral slope) — spawning the chassis dead level
    // onto it (the old behaviour) created an immediate asymmetric suspension torque the
    // soft outrigger wheels can't catch from a dead stop, tipping the bike over before
    // the player can react. The chassis should now spawn flush with that slope instead.
    const terrainData = JSON.parse(
      fs.readFileSync(new URL('../../public/data/terrain/cutgate.json', import.meta.url)),
    );
    const routeData = JSON.parse(
      fs.readFileSync(new URL('../../public/data/routes/cutgate.json', import.meta.url)),
    );
    const realTerrain = { getHeightAt: createHeightLookup(terrainData) };
    const { world: realWorld, bikeMaterial } = setupWorld(terrainData);
    const spawnPoint = routePointToWorld(routeData.points[0]);

    const bike = new BikeController(scene, realWorld, camera, realTerrain, spawnPoint, bikeMaterial);
    const dt = 1 / 60;
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: false };

    for (let i = 0; i < 180; i += 1) {
      bike.applyInput(dt, input);
      realWorld.step(dt);
    }
    bike.syncAfterStep(dt);

    const up = bike.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    // Tightened from 0.5 now that applyUprightCorrection() actively counteracts this real
    // ~16-degree camber rather than merely not fighting it (real measured value ~0.96).
    expect(up.y).toBeGreaterThan(0.85); // still mostly upright, not tipped onto its side
  });
});

describe('BikeController.applyInput steering (issue #66: steering angle replaces yaw increment)', () => {
  it('steers the front wheel toward +/-MAX_STEER_ANGLE at rest (grip cap saturates at low speed)', () => {
    const bike = createBike();
    const dt = 0.1;

    bike.applyInput(dt, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, 1));

    bike.applyInput(dt, { steerLeft: false, steerRight: true, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, -1));
  });

  it('caps steering angle by lateral grip at speed, well below the at-rest angle', () => {
    const bike = createBike();
    bike.speed = 20;

    bike.applyInput(0.1, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(20, 1));
    expect(Math.abs(bike.vehicle.wheelInfos[WHEEL_FRONT].steering)).toBeLessThan(
      expectedSteerAngle(0, 1),
    );
  });

  it('steers proportionally from a continuous steerAmount, matching digital steering at +/-1', () => {
    const fullLeft = createBike();
    fullLeft.applyInput(0.1, { steerLeft: false, steerRight: false, jump: false, brake: false, steerAmount: 1 });
    expect(fullLeft.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, 1));

    const fullRight = createBike();
    fullRight.applyInput(0.1, { steerLeft: false, steerRight: false, jump: false, brake: false, steerAmount: -1 });
    expect(fullRight.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, -1));

    const halfLeft = createBike();
    halfLeft.applyInput(0.1, { steerLeft: false, steerRight: false, jump: false, brake: false, steerAmount: 0.5 });
    expect(halfLeft.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, 0.5));
  });

  it('caps steerAmount-driven turning by the same lateral grip limit as digital steering', () => {
    const bike = createBike();
    bike.speed = 20;

    bike.applyInput(0.1, { steerLeft: false, steerRight: false, jump: false, brake: false, steerAmount: 1 });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(20, 1));
  });

  it('combines digital and analog steering additively, clamped rather than doubled', () => {
    const reinforcing = createBike();
    reinforcing.applyInput(0.1, {
      steerLeft: true,
      steerRight: false,
      jump: false,
      brake: false,
      steerAmount: 1,
    });
    expect(reinforcing.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, 1));

    const opposing = createBike();
    opposing.applyInput(0.1, {
      steerLeft: true,
      steerRight: false,
      jump: false,
      brake: false,
      steerAmount: -1,
    });
    expect(opposing.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(0);
  });
});

describe('BikeController.applyInput reverse steering (issue: "unable to turn uphill")', () => {
  it('mirrors the commanded steering angle while genuinely rolling backward', () => {
    const bike = createBike();
    bike.forwardSpeed = -(REVERSE_STEER_SPEED_THRESHOLD + 1);

    bike.applyInput(0.1, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(-expectedSteerAngle(0, 1));
  });

  it('does not mirror steering for a small backward drift inside the threshold', () => {
    const bike = createBike();
    bike.forwardSpeed = -(REVERSE_STEER_SPEED_THRESHOLD - 0.1);

    bike.applyInput(0.1, { steerLeft: true, steerRight: false, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBeCloseTo(expectedSteerAngle(0, 1));
  });
});

describe('BikeController.applyInput propulsion/braking (issue #66: real wheel forces)', () => {
  // Propulsion moved off the rear wheel's engineForce onto a direct chassis-CoM force
  // (see applyInput's comment in BikeController.js: driving BASELINE_ACCEL/BOOST_ACCEL's
  // real magnitudes through the wheel's friction model reliably wheelied the chassis into
  // a backward flip on real climbs) — WHEEL_REAR.engineForce is always exactly 0 now, and
  // these tests instead check the resulting chassis force along its forward vector.
  function forwardVec(bike) {
    return bike.body.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
  }

  it('zeroes the rear wheel engineForce, now that propulsion is a direct chassis force', () => {
    const bike = createBike();
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true });
    expect(bike.vehicle.wheelInfos[WHEEL_REAR].engineForce).toBe(0);
  });

  it('applies boost acceleration (superseding baseline) to the chassis while boosting with stamina available', () => {
    const bike = createBike();
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true });
    const forward = forwardVec(bike);
    expect(bike.body.force.x).toBeCloseTo(forward.x * BOOST_ACCEL * BIKE_MASS);
    expect(bike.body.force.z).toBeCloseTo(forward.z * BOOST_ACCEL * BIKE_MASS);
  });

  it('applies only baseline acceleration (zero extra boost) to the chassis while boosting with empty stamina', () => {
    const bike = createBike();
    bike.stamina = 0;
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true });
    const forward = forwardVec(bike);
    expect(bike.body.force.x).toBeCloseTo(forward.x * BASELINE_ACCEL * BIKE_MASS);
    expect(bike.body.force.z).toBeCloseTo(forward.z * BASELINE_ACCEL * BIKE_MASS);
  });

  it('applies only baseline acceleration to the chassis when not boosting', () => {
    const bike = createBike();
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: false });
    const forward = forwardVec(bike);
    expect(bike.body.force.x).toBeCloseTo(forward.x * BASELINE_ACCEL * BIKE_MASS);
    expect(bike.body.force.z).toBeCloseTo(forward.z * BASELINE_ACCEL * BIKE_MASS);
  });

  it('applies brake force to both real wheels while braking, and zero once released', () => {
    const bike = createBike();
    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: true });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].brake).toBeCloseTo(BRAKE_MU * BIKE_MASS * GRAVITY_MAG);
    expect(bike.vehicle.wheelInfos[WHEEL_REAR].brake).toBeCloseTo(BRAKE_MU * BIKE_MASS * GRAVITY_MAG);

    bike.applyInput(1 / 60, { steerLeft: false, steerRight: false, jump: false, brake: false });
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].brake).toBe(0);
    expect(bike.vehicle.wheelInfos[WHEEL_REAR].brake).toBe(0);
  });

  it('applies a jump impulse and returns true only when grounded, and always resets inputState.jump', () => {
    createGroundBody(world);
    const bike = createBike();
    const dt = 1 / 60;
    for (let i = 0; i < 30; i += 1) world.step(dt); // settle onto the ground
    expect(bike.isGrounded()).toBe(true);

    const velocityYBeforeJump = bike.body.velocity.y;
    const groundedInput = { steerLeft: false, steerRight: false, jump: true, brake: false };
    const jumped = bike.applyInput(dt, groundedInput);
    expect(jumped).toBe(true);
    expect(groundedInput.jump).toBe(false);
    expect(bike.body.velocity.y).toBeCloseTo(velocityYBeforeJump + JUMP_LAUNCH_VELOCITY);

    bike.body.position.y = 100; // airborne
    world.step(dt);
    expect(bike.isGrounded()).toBe(false);
    const airborneInput = { steerLeft: false, steerRight: false, jump: true, brake: false };
    const jumpedWhileAirborne = bike.applyInput(dt, airborneInput);
    expect(jumpedWhileAirborne).toBe(false);
    expect(airborneInput.jump).toBe(false);
  });

  it('jumps straight up without inducing spin far from the world origin (issue #199)', () => {
    // Real courses place the chassis hundreds/thousands of metres from (0, 0, 0) — a
    // regression test spawning at the default (0, 0) wouldn't have caught issue #199,
    // where the jump impulse's lever arm was accidentally the chassis's absolute world
    // position (cannon-es's applyImpulse treats its point argument as already relative
    // to the center of mass) rather than zero.
    createGroundBody(world);
    const bike = createBike({ x: 500, z: -1200 });
    const dt = 1 / 60;
    for (let i = 0; i < 30; i += 1) world.step(dt); // settle onto the ground
    expect(bike.isGrounded()).toBe(true);

    const groundedInput = { steerLeft: false, steerRight: false, jump: true, brake: false };
    bike.applyInput(dt, groundedInput);

    expect(bike.body.angularVelocity.length()).toBeCloseTo(0);
    expect(bike.body.velocity.y).toBeCloseTo(JUMP_LAUNCH_VELOCITY, 1);
  });

  it('keeps moving under boost input after sitting idle long enough that a sleep-prone body would freeze', () => {
    // Mirrors setupWorld.js's real config: with world.allowSleep on and the default 1s
    // sleepTimeLimit, a body resting below the speed threshold would fall fully asleep
    // and then ignore force writes until something calls wakeUp() — this is why the
    // chassis is still constructed with allowSleep: false (see BikeController.js).
    createGroundBody(world);
    const bike = createBike();
    const dt = 1 / 60;

    for (let i = 0; i < 90; i += 1) world.step(dt); // idle for 1.5s, past the default 1s limit

    const boostInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };
    for (let i = 0; i < 240; i += 1) {
      bike.applyInput(dt, boostInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    expect(bike.body.sleepState).not.toBe(CANNON.Body.SLEEPING);
    // A magnitude check (not a directional position sign) — this game's forward
    // direction happens to be the chassis's own local -Z (see MESH_YAW_OFFSET in
    // BikeController.js), so a genuinely moving bike doesn't necessarily have a
    // positive world z.
    expect(bike.speed).toBeGreaterThan(1);
  });
});

describe('BikeController longitudinal dynamics on real sloped ground (issue #66: gravity replaces the slope-sampling hack)', () => {
  it('accelerates from gravity on a descending slope', () => {
    // This game's forward direction is the chassis's own local -Z (see MESH_YAW_OFFSET
    // in BikeController.js), so a positive slope coefficient here is a descending grade
    // along the direction of travel.
    const slope = 0.1; // 10% descending grade along the direction of travel
    createGroundBody(world, { slope });
    terrain = { getHeightAt: (x, z) => slope * z };
    const bike = createBike();
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const dt = 1 / 60;

    for (let i = 0; i < 60; i += 1) {
      bike.applyInput(dt, input);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    const speedAfterSettling = bike.speed;

    for (let i = 0; i < 120; i += 1) {
      bike.applyInput(dt, input);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    expect(bike.speed).toBeGreaterThan(speedAfterSettling);
  });

  it('sustains a steady baseline cruising speed on flat ground with no input at all (issue #139: no more crawl-to-a-stop)', () => {
    createGroundBody(world);
    const bike = createBike();
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const dt = 1 / 60;

    for (let i = 0; i < 300; i += 1) { // 5s — clearly under way, though not yet at equilibrium
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    const speedAt5s = bike.speed;
    expect(speedAt5s).toBeGreaterThan(2); // clearly not crawled to a stop

    // The higher BASELINE_ACCEL/ROLLING_RESISTANCE_COEFF pairing (see their comments in
    // BikeController.js) settles to a higher equilibrium (~7 m/s) than the old baseline,
    // but over a longer time constant (~15-20s, not ~5s) — so the convergence check below
    // needs a longer run and a looser tolerance than just re-checking 1s later.
    for (let i = 0; i < 900; i += 1) { // 15 further seconds — well past the 5s mark
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    const speedAt20s = bike.speed;
    expect(speedAt20s).toBeGreaterThan(speedAt5s); // still climbing toward equilibrium, not decaying

    for (let i = 0; i < 120; i += 1) { // 2 further seconds
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    expect(bike.speed).toBeCloseTo(speedAt20s, 0); // settled near equilibrium by 20s
  });

  it('decelerates on flat ground toward the baseline cruise once boost stops (not to a stop, since baseline is still present)', () => {
    createGroundBody(world);
    const bike = createBike();
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const boostInput = { ...input, boost: true };
    const dt = 1 / 60;

    // Build up real speed via boosting (rather than seeding body.velocity directly) so
    // wheel rotation state matches chassis speed — an artificial velocity jump creates a
    // large, unrepresentative wheel-slip transient that swamps the effect under test.
    // Long enough (6s) that speed clears the baseline-alone equilibrium (~7 m/s, see
    // BASELINE_ACCEL's comment) — otherwise releasing boost would still show baseline
    // accelerating the bike further rather than decelerating it.
    for (let i = 0; i < 360; i += 1) {
      bike.applyInput(dt, boostInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    const speedAfterBuildup = bike.speed;

    for (let i = 0; i < 60; i += 1) {
      bike.applyInput(dt, input);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    expect(bike.speed).toBeLessThan(speedAfterBuildup);
  });

  it('brakes to a lower speed than coasting over the same duration', () => {
    function runFor(steps, brake) {
      createGroundBody(world);
      const bike = createBike();
      const dt = 1 / 60;
      const boostInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };
      // Build up real speed via boosting rather than seeding body.velocity directly —
      // see the drag-alone test above for why that avoids a wheel-slip transient.
      for (let i = 0; i < 120; i += 1) {
        bike.applyInput(dt, boostInput);
        world.step(dt);
      }
      bike.syncAfterStep(dt);

      for (let i = 0; i < steps; i += 1) {
        bike.applyInput(dt, { steerLeft: false, steerRight: false, jump: false, brake });
        world.step(dt);
      }
      bike.syncAfterStep(dt);
      return bike.speed;
    }

    const coastingSpeed = runFor(30, false);
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.allowSleep = true;
    const brakingSpeed = runFor(30, true);

    expect(brakingSpeed).toBeLessThan(coastingSpeed);
  });

  it("climbs a real Cut-Gate-grade slope on baseline power alone (issue: can't go uphill)", () => {
    // Negative slope coefficient = climbing (see the descending-slope comment above) —
    // this matches Cut Gate's real ~19% grade climbs.
    const slope = -0.19;
    createGroundBody(world, { slope });
    terrain = { getHeightAt: (x, z) => slope * z };
    const bike = createBike();
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const dt = 1 / 60;

    for (let i = 0; i < 60; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);
    const speedAfter1s = bike.speed;

    for (let i = 0; i < 300; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    expect(bike.speed).toBeGreaterThan(speedAfter1s); // still gaining speed, not stalled
    expect(bike.forwardSpeed).toBeGreaterThan(1); // genuinely climbing, not crawling/rolling back
  });

  it('does not roll backward on a steeper-than-Cut-Gate climb, even if it stalls', () => {
    const slope = -0.30; // steeper than any real route grade — a "genuine struggle" case
    createGroundBody(world, { slope });
    terrain = { getHeightAt: (x, z) => slope * z };
    const bike = createBike();
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };
    const dt = 1 / 60;

    for (let i = 0; i < 300; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    expect(bike.forwardSpeed).toBeGreaterThan(-0.1); // essentially holding position, not rolling back
  });
});

describe('BikeController roll stability (issue #66: outrigger wheels resist tipping during normal riding)', () => {
  it('stays roughly upright while steering hard and boosting on flat ground', () => {
    createGroundBody(world);
    const bike = createBike();
    const input = { steerLeft: true, steerRight: false, jump: false, brake: false, boost: true };
    const dt = 1 / 60;

    for (let i = 0; i < 180; i += 1) {
      bike.applyInput(dt, input);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    const up = bike.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    // Tightened from 0.5 now that applyUprightCorrection() actively resists tipping under
    // hard steering + boost (real measured value ~0.99).
    expect(up.y).toBeGreaterThan(0.9); // still mostly upright, not tipped onto its side
  });

  it('recovers from a moderate bump-induced roll back toward upright with no input', () => {
    createGroundBody(world);
    const bike = createBike();
    const dt = 1 / 60;
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };

    for (let i = 0; i < 30; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }

    // A one-time roll impulse (a routine bump/off-camber landing, not a genuine crash) —
    // settles to a moderate tilt well under UPRIGHT_CORRECTION_MAX_TILT (~57 degrees).
    bike.body.angularVelocity.z += 3;

    for (let i = 0; i < 120; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    const up = bike.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    expect(up.y).toBeGreaterThan(0.9); // recovered back toward upright
  });

  it('does not pull a tilt past UPRIGHT_CORRECTION_MAX_TILT back upright (genuine crashes still happen)', () => {
    createGroundBody(world);
    const bike = createBike();
    const dt = 1 / 60;

    // ~80 degrees — past the ~57-degree correction cutoff, so this should read as a real
    // crash the assist doesn't paper over.
    const tilt = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 0, 1), (80 * Math.PI) / 180);
    bike.body.quaternion.set(tilt.x, tilt.y, tilt.z, tilt.w);
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };

    for (let i = 0; i < 60; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
    }
    bike.syncAfterStep(dt);

    const up = bike.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    expect(up.y).toBeLessThan(0.5); // not corrected back upright — a real crash sticks
  });
});

describe('BikeController stamina', () => {
  it('starts full', () => {
    const bike = createBike();
    expect(bike.stamina).toBe(1);
  });

  it('drains while boosting and regenerates while coasting', () => {
    const bike = createBike();
    const boostInput = {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: false,
      boost: true,
    };

    bike.applyInput(1, boostInput);
    expect(bike.stamina).toBeLessThan(1);

    const staminaAfterBoosting = bike.stamina;
    bike.applyInput(1, { ...boostInput, boost: false });
    expect(bike.stamina).toBeGreaterThan(staminaAfterBoosting);
  });

  it('does not drain below 0 while boost is held', () => {
    const bike = createBike();
    bike.stamina = 0;

    bike.applyInput(1, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true });
    expect(bike.stamina).toBe(0);
  });

  it('adds a clear chassis-force delta over baseline while boosting with stamina, and none with stamina empty', () => {
    const boostInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };

    const fullStaminaBike = createBike();
    fullStaminaBike.applyInput(1, boostInput);

    const emptyStaminaBike = createBike();
    emptyStaminaBike.stamina = 0;
    emptyStaminaBike.applyInput(1, boostInput);

    // Propulsion is a direct chassis force now (see the propulsion/braking describe block
    // above), so compare force magnitude rather than the always-0 rear wheel engineForce.
    const boostedForce = fullStaminaBike.body.force.length();
    const baselineOnlyForce = emptyStaminaBike.body.force.length();
    expect(baselineOnlyForce).toBeCloseTo(BASELINE_ACCEL * BIKE_MASS);
    expect(boostedForce).toBeCloseTo(BOOST_ACCEL * BIKE_MASS);
    expect(boostedForce).toBeGreaterThan(baselineOnlyForce);
  });

  it('keeps stamina pinned at 0 while holding boost, and only regenerates once released', () => {
    const boostInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };
    const bike = createBike();
    bike.stamina = 0;

    bike.applyInput(1, boostInput);
    expect(bike.stamina).toBe(0);

    bike.applyInput(1, { ...boostInput, boost: false });
    expect(bike.stamina).toBeGreaterThan(0);
  });

  it('drains over the new, longer burst duration rather than the old ~6s one', () => {
    const bike = createBike();
    const boostInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };

    bike.applyInput(6, boostInput); // old ~6s full-drain duration
    expect(bike.stamina).toBeGreaterThan(0); // must not be empty yet under the new tuning

    bike.applyInput(9, boostInput); // total 15s, matching STAMINA_DRAIN_RATE = 1/15
    expect(bike.stamina).toBe(0);
  });

  it('does not regenerate above MAX_STAMINA', () => {
    const bike = createBike();
    bike.applyInput(10, { steerLeft: false, steerRight: false, jump: false, brake: false, boost: false });
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
      boost: false,
    });

    const restingBike = createBike();
    restingBike.stamina = 0;
    restingBike.speed = 10;
    restingBike.applyInput(1, {
      steerLeft: false,
      steerRight: false,
      jump: false,
      brake: true,
      boost: false,
    });

    expect(restingBike.stamina).toBeGreaterThan(coastingBike.stamina);
  });
});

describe('BikeController.syncAfterStep', () => {
  it('flags a hard landing when transitioning from airborne to grounded while falling fast', () => {
    const bike = createBike();
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -10; // faster than HARD_LANDING_VELOCITY (-8)
    bike.vehicle.wheelInfos[WHEEL_FRONT].isInContact = true;
    bike.vehicle.wheelInfos[WHEEL_REAR].isInContact = true;

    bike.syncAfterStep();
    expect(bike.hardLanding).toBe(true);
  });

  it('does not flag a hard landing on a gentle landing', () => {
    const bike = createBike();
    bike.wasGrounded = false;
    bike.previousVerticalVelocity = -2;
    bike.vehicle.wheelInfos[WHEEL_FRONT].isInContact = true;
    bike.vehicle.wheelInfos[WHEEL_REAR].isInContact = true;

    bike.syncAfterStep();
    expect(bike.hardLanding).toBe(false);
  });

  it('copies body position onto the mesh, with a 180-degree yaw offset applied to its quaternion (issue #66: the chassis physically travels toward its own local -Z)', () => {
    const bike = createBike();
    bike.body.position.set(1, 2, 3);
    bike.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0.5);

    bike.syncAfterStep();

    expect(bike.mesh.position.x).toBeCloseTo(1);
    expect(bike.mesh.position.y).toBeCloseTo(2);
    expect(bike.mesh.position.z).toBeCloseTo(3);

    const expectedQuaternion = new THREE.Quaternion(
      bike.body.quaternion.x,
      bike.body.quaternion.y,
      bike.body.quaternion.z,
      bike.body.quaternion.w,
    ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    expect(bike.mesh.quaternion.y).toBeCloseTo(expectedQuaternion.y);
    expect(bike.mesh.quaternion.w).toBeCloseTo(expectedQuaternion.w);
  });
});

describe('BikeController stuck-contact recovery (issue #148)', () => {
  it('re-grounds the chassis via the terrain height lookup after being ungrounded and slow for too long', () => {
    const bike = createBike({ x: 5, z: -5 });
    bike.body.position.set(5, 50, -5); // high above ground, no wheel ever in contact
    bike.body.velocity.set(0, 0, 0); // stays below STUCK_MAX_SPEED the whole time
    const dt = 1 / 60;
    const stepsPastThreshold = Math.ceil(STUCK_UNGROUNDED_TIME / dt) + 1;

    for (let i = 0; i < stepsPastThreshold; i += 1) bike.syncAfterStep(dt);

    expect(bike.body.position.y).toBeCloseTo(SPAWN_CLEARANCE); // terrain.getHeightAt stub returns 0
    expect(bike.stuckTimer).toBe(0);
  });

  it('does not recover while genuinely moving fast, even if ungrounded for the same duration', () => {
    const bike = createBike({ x: 5, z: -5 });
    bike.body.position.set(5, 50, -5);
    bike.body.velocity.set(0, -5, 0); // a real fall, well above STUCK_MAX_SPEED
    const dt = 1 / 60;

    for (let i = 0; i < 40; i += 1) bike.syncAfterStep(dt);

    expect(bike.body.position.y).toBeCloseTo(50); // untouched — no false-positive recovery
  });
});

describe('BikeController rider pose (issue #126)', () => {
  it('adds a rider rig as a child of mesh, and it survives a successful model load', async () => {
    const bike = createBike();
    expect(bike.riderRoot).toBeInstanceOf(THREE.Group);
    expect(bike.mesh.children).toContain(bike.riderRoot);

    GLTFLoader.prototype.loadAsync.mockResolvedValue({ scene: new THREE.Group() });
    await bike.loadModel();
    expect(bike.mesh.children).toContain(bike.riderRoot);
  });

  it('defaults to a neutral pose', () => {
    const bike = createBike();
    expect(bike.riderPoseFactor).toBe(0);
    expect(bike.riderPivot.rotation.x).toBe(0);
    expect(bike.riderPivot.position.x).toBe(0);
    expect(bike.riderPivot.position.y).toBe(0);
    expect(bike.riderPivot.position.z).toBe(0);
  });

  it('boosting on a climbing slope pulls the pose toward attack relative to slope alone (issue #139: boost is a sprint, not a climbing cadence)', () => {
    const withoutBoost = createBike();
    withoutBoost.slopeSin = -0.2; // climbing
    withoutBoost.speed = 2;
    for (let i = 0; i < 120; i += 1) withoutBoost.updateRiderPose(1 / 60);

    const withBoost = createBike();
    withBoost.slopeSin = -0.2;
    withBoost.boostActive = true;
    withBoost.speed = 2;
    for (let i = 0; i < 120; i += 1) withBoost.updateRiderPose(1 / 60);

    expect(withBoost.riderPoseFactor).toBeGreaterThan(withoutBoost.riderPoseFactor);
  });

  it('blends toward a low, set-back attack pose on a steep descent at speed', () => {
    const bike = createBike();
    bike.slopeSin = 0.3; // descending
    bike.speed = 12;

    for (let i = 0; i < 120; i += 1) {
      bike.updateRiderPose(1 / 60);
    }

    expect(bike.riderPoseFactor).toBeGreaterThan(0);
    expect(bike.riderPivot.rotation.x).toBeLessThan(0);
    expect(bike.riderPivot.position.y).toBeLessThan(0);
    expect(bike.riderPivot.position.z).toBeLessThan(0);
  });

  it('stays neutral on flat ground at rest', () => {
    const bike = createBike();

    for (let i = 0; i < 10; i += 1) {
      bike.updateRiderPose(1 / 60);
    }

    expect(bike.riderPoseFactor).toBeCloseTo(0);
    expect(bike.riderPivot.rotation.x).toBeCloseTo(0);
  });

  it('blends gradually toward the target rather than snapping', () => {
    const bike = createBike();
    bike.slopeSin = 0.3;
    bike.speed = 12;

    bike.updateRiderPose(1 / 60);
    const factorAfterOneStep = bike.riderPoseFactor;
    expect(factorAfterOneStep).toBeGreaterThan(0);
    expect(factorAfterOneStep).toBeLessThan(0.3); // well short of the converged value

    bike.updateRiderPose(1 / 60);
    expect(bike.riderPoseFactor).toBeGreaterThan(factorAfterOneStep);
  });

  it('braking alone nudges the pose toward attack/braced even at rest', () => {
    const bike = createBike();
    bike.brakeActive = true;

    for (let i = 0; i < 120; i += 1) {
      bike.updateRiderPose(1 / 60);
    }

    expect(bike.riderPoseFactor).toBeGreaterThan(0);
  });

  it('boosting alone nudges the pose toward attack, mirroring high speed alone', () => {
    const bike = createBike();
    bike.boostActive = true;

    for (let i = 0; i < 120; i += 1) {
      bike.updateRiderPose(1 / 60);
    }

    expect(bike.riderPoseFactor).toBeGreaterThan(0);
  });

  it('high speed alone (no boost/brake) nudges the pose toward attack', () => {
    const bike = createBike();
    bike.speed = 15;

    for (let i = 0; i < 120; i += 1) {
      bike.updateRiderPose(1 / 60);
    }

    expect(bike.riderPoseFactor).toBeGreaterThan(0);
  });

  it('snaps in an extra crouch on a hard landing and decays it once the landing clears', () => {
    const bike = createBike();
    bike.hardLanding = true;
    bike.updateRiderPose(1 / 60);
    expect(bike.riderLandingAbsorb).toBe(1);

    bike.hardLanding = false;
    let previousAbsorb = bike.riderLandingAbsorb;
    for (let i = 0; i < 10; i += 1) {
      bike.updateRiderPose(1 / 60);
      expect(bike.riderLandingAbsorb).toBeLessThanOrEqual(previousAbsorb);
      previousAbsorb = bike.riderLandingAbsorb;
    }
    expect(bike.riderLandingAbsorb).toBeGreaterThanOrEqual(0);
  });

  it('calling syncAfterStep with no dt argument does not throw and leaves the pose finite', () => {
    const bike = createBike();
    expect(() => bike.syncAfterStep()).not.toThrow();
    expect(Number.isFinite(bike.riderPoseFactor)).toBe(true);
  });

  it('real chassis pitch on a climbing slope feeds a negative slopeSin into the pose (issue #66: physical pitch replaces the sampling hack)', () => {
    const slope = -0.19; // ~19% ascending grade along the direction of travel
    createGroundBody(world, { slope });
    terrain = { getHeightAt: (x, z) => slope * z };
    const bike = createBike();
    const input = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: true };
    const dt = 1 / 60;

    for (let i = 0; i < 120; i += 1) {
      bike.applyInput(dt, input);
      world.step(dt);
      bike.syncAfterStep(dt);
    }

    expect(bike.slopeSin).toBeLessThan(0); // climbing
    expect(bike.riderPoseFactor).toBeLessThan(0);
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
    bike.body.angularVelocity.set(1, 2, 3);
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
    expect(bike.body.angularVelocity.length()).toBeCloseTo(0);
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

  it('zeroes stale engine force/brake/steering so a reset does not leave throttle applied', () => {
    const bike = createBike();
    bike.vehicle.applyEngineForce(500, WHEEL_REAR);
    bike.vehicle.setBrake(200, WHEEL_FRONT);
    bike.vehicle.setSteeringValue(0.4, WHEEL_FRONT);

    bike.respawn();

    expect(bike.vehicle.wheelInfos[WHEEL_REAR].engineForce).toBe(0);
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].brake).toBe(0);
    expect(bike.vehicle.wheelInfos[WHEEL_FRONT].steering).toBe(0);
  });
});

describe('BikeController spawn yaw (facing down the track)', () => {
  it('faces the spawnPoint.yaw heading at construction, and falls back to 0 when omitted', () => {
    const facingBike = new BikeController(scene, world, camera, terrain, { x: 0, z: 0, yaw: 1.2 });
    expect(facingBike.yaw).toBeCloseTo(1.2);

    const defaultBike = createBike();
    expect(defaultBike.yaw).toBe(0);
  });

  it('restores the original spawnPoint.yaw (not 0) after respawn()', () => {
    const bike = new BikeController(scene, world, camera, terrain, { x: 0, z: 0, yaw: 0.8 });

    bike.yaw = -2;
    bike.respawn();

    expect(bike.yaw).toBeCloseTo(0.8);
  });

  it('settles physically facing the requested spawnPoint.yaw heading, not 180 degrees opposite (regression: setBodyQuaternionFromTerrain sets the chassis local +Z, but yaw is read from local -Z)', () => {
    createGroundBody(world);
    const requestedYaw = 0.8;
    const bike = new BikeController(scene, world, camera, terrain, { x: 0, z: 0, yaw: requestedYaw });
    const dt = 1 / 60;
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false };

    for (let i = 0; i < 3; i += 1) {
      bike.applyInput(dt, noInput);
      world.step(dt);
      bike.syncAfterStep(dt);
    }

    expect(bike.yaw).toBeCloseTo(requestedYaw, 0);
  });
});

describe('BikeController.teleport (issue #81)', () => {
  it('moves the bike and zeroes velocity/grounding state, leaving yaw/speed/stamina untouched', () => {
    const constantHeightTerrain = { getHeightAt: () => 5 };
    const bike = new BikeController(scene, world, camera, constantHeightTerrain, { x: 0, z: 0 });

    bike.body.velocity.set(3, -2, 5);
    bike.body.angularVelocity.set(1, 2, 3);
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
    expect(bike.body.angularVelocity.length()).toBeCloseTo(0);
    expect(bike.wasGrounded).toBe(true);
    expect(bike.previousVerticalVelocity).toBe(0);
    expect(bike.hardLanding).toBe(false);
    expect(bike.yaw).toBe(0.7);
    expect(bike.speed).toBe(8);
    expect(bike.stamina).toBe(0.4);
  });
});

describe('BikeController bike presets (issue #110: e-bike mode)', () => {
  it('defaults to the default preset when no presetName is given', () => {
    const bike = createBike();
    expect(bike.baselineAccel).toBe(BASELINE_ACCEL);
    expect(bike.boostAccel).toBe(BOOST_ACCEL);
    expect(bike.maxSpeed).toBe(MAX_SPEED);
  });

  it('falls back to the default preset for an unrecognized presetName', () => {
    const bike = new BikeController(
      scene,
      world,
      camera,
      terrain,
      { x: 0, z: 0 },
      undefined,
      false,
      'bogus',
    );
    expect(bike.baselineAccel).toBe(BASELINE_ACCEL);
    expect(bike.boostAccel).toBe(BOOST_ACCEL);
    expect(bike.maxSpeed).toBe(MAX_SPEED);
  });

  it('applies a stronger baseline and boost chassis force under the ebike preset than default', () => {
    const defaultBike = createBike();
    const ebike = new BikeController(
      scene,
      world,
      camera,
      terrain,
      { x: 0, z: 0 },
      undefined,
      false,
      'ebike',
    );
    const noInput = { steerLeft: false, steerRight: false, jump: false, brake: false, boost: false };
    const boostInput = { ...noInput, boost: true };

    // Propulsion is a direct chassis force now (see the propulsion/braking describe block
    // above), so compare force magnitude rather than the always-0 rear wheel engineForce.
    // body.applyForce accumulates rather than overwrites, so body.force is reset between
    // measurements here — applyInput() itself is called fresh each time in real gameplay
    // (once per step, immediately followed by world.step(), which clears accumulated force).
    defaultBike.applyInput(1 / 60, noInput);
    ebike.applyInput(1 / 60, noInput);
    expect(ebike.body.force.length()).toBeCloseTo(EBIKE_BASELINE_ACCEL * BIKE_MASS);
    expect(ebike.body.force.length()).toBeGreaterThan(defaultBike.body.force.length());

    defaultBike.body.force.set(0, 0, 0);
    ebike.body.force.set(0, 0, 0);
    defaultBike.applyInput(1 / 60, boostInput);
    ebike.applyInput(1 / 60, boostInput);
    expect(ebike.body.force.length()).toBeCloseTo(EBIKE_BOOST_ACCEL * BIKE_MASS);
    expect(ebike.body.force.length()).toBeGreaterThan(defaultBike.body.force.length());
  });

  it("clamps speed at the ebike preset's own higher maxSpeed rather than the default MAX_SPEED", () => {
    const ebike = new BikeController(
      scene,
      world,
      camera,
      terrain,
      { x: 0, z: 0 },
      undefined,
      false,
      'ebike',
    );
    ebike.body.velocity.set(0, 0, 30); // above default MAX_SPEED (25), below EBIKE_MAX_SPEED (35)

    ebike.syncAfterStep(1 / 60);

    expect(ebike.speed).toBeCloseTo(30);
    expect(ebike.maxSpeed).toBe(EBIKE_MAX_SPEED);
  });
});
