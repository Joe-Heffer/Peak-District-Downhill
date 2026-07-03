import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp } from '../terrain/HeightmapTerrain.js';

const RADIUS = 0.5;
const SPAWN_CLEARANCE = RADIUS + 0.05;
const TURN_RATE = 2.2;
const GROUNDED_EPSILON = 0.05;
const HARD_LANDING_VELOCITY = -8;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, -6);
const CAMERA_LERP = 0.1;

// Headlight (see issue #79): mounted near the front/handlebar of the bike, aimed along
// local +z (the forward axis — see createPlaceholderBikeModel's comment and
// applyInput's forward vector below), only built when spawned into the night preset.
// Intensity is in candela (three.js has used physically-based photometric light units
// since r155, mandatory since r165) and illuminance falls off as intensity/distance^2,
// so this needs to be in the hundreds-to-low-thousands to read as a visible beam against
// the `night` preset's ambient moonlight (dirLight ~0.6, hemiLight ~0.55 — see
// setupSky.js) rather than the flat pre-r155 non-physical scale.
const HEADLIGHT_COLOR = 0xfff2cc;
const HEADLIGHT_INTENSITY = 1200;
const HEADLIGHT_DISTANCE = 40;
const HEADLIGHT_ANGLE = 0.5;
const HEADLIGHT_PENUMBRA = 0.4;

// Real-world-scale longitudinal dynamics: forward speed is a scalar driven each frame
// by the slope sampled from the terrain (gravity along the grade), rolling resistance,
// aerodynamic drag, and braking — not a fixed constant. See CLAUDE.md/plan notes for
// the sourcing of these figures.
const BIKE_MASS = 85; // kg — ~15kg trail/enduro bike + ~70kg rider
const GRAVITY_MAG = 9.82; // m/s^2 — matches world gravity in setupWorld.js
const ROLLING_RESISTANCE_COEFF = 0.025; // Crr — knobby MTB tyres on dirt/gravel
const AIR_DENSITY = 1.225; // kg/m^3 — standard sea-level air density
const DRAG_CDA = 0.6; // m^2 — crouched downhill riding position
const GRIP_MU = 0.8; // reuses setupWorld.js's ground/bike contact friction
const BRAKE_MU = 0.5; // controlled-braking traction, below GRIP_MU (loose dirt, no lockup)
const SLOPE_SAMPLE_DISTANCE = 1.0; // m — forward look-ahead for slope sampling
const TURN_RATE_MIN_SPEED = 0.5; // m/s — below this, fall back to the flat TURN_RATE
const MAX_SPEED = 25; // m/s (~90 km/h) — defensive clamp for artifact-steep terrain cells
const JUMP_LAUNCH_VELOCITY = 7; // m/s — same launch speed the old JUMP_IMPULSE/mass gave

// Pedalling (issue #61): stamina is a unitless 0..1 fraction, not an absolute energy
// unit. Drain/regen rates are tuned by feel like the drag/rolling-resistance figures
// above, not derived from real rider physiology.
const MAX_STAMINA = 1;
const STAMINA_DRAIN_RATE = 1 / 15; // per second — full tank drains in ~15s of continuous pedalling
const STAMINA_REGEN_RATE = 1 / 10; // per second while coasting — full regen in ~10s
const STAMINA_REGEN_RATE_RESTING = 1 / 5; // per second while braking/near-stationary — faster
const STAMINA_REST_SPEED_THRESHOLD = 1; // m/s — below this counts as "resting" for regen
// m/s^2 — rider effort acceleration while pedalling with stamina left. Must comfortably
// clear GRAVITY_MAG * sinSlope + rolling resistance on real uphill grades, or pedalling
// does nothing on a climb no matter how long it's held. Cut Gate's real route (see
// public/data/routes/cutgate.json sampled against public/data/terrain/cutgate.json) has
// uphill segments up to ~19% grade; 3.0 clears that with margin (theoretical stall grade
// ~28-29%), whereas the previous 1.2 stalled out above ~10.7% grade — most of the route's
// climbs (issue: "pedal mode ... can't go uphill").
const PEDAL_BURST_ACCEL = 3.0;
// m/s^2 — weaker, stamina-free effort applied once the burst tank above is empty but the
// player keeps holding pedal, so pedalling never drops straight to zero propulsion (issue:
// stamina "should allow a quick burst but then... roll along or... pedal at a steady
// rate"). Modelled as a bike's low ("granny") gear: real low gearing sacrifices speed for
// torque so a rider can keep grinding up a steep grade indefinitely, just slowly, without
// needing to stand up and sprint. Stalls out around ~24.8% grade (vs. the burst rate's
// ~28-29%), comfortably above Cut Gate's real climbs of up to ~19% grade, so pedalling
// never actually stops working uphill once stamina runs low — it just gets a lot slower
// (issue: "real mountain bikes have quite low gearing so it's possible to get up rather
// steep inclines (if slowly)"). On flat ground it still clears rolling resistance +
// aero drag easily, settling to a lower equilibrium cruise than the burst rate.
const PEDAL_STEADY_ACCEL = 2.6;

// Rider pose (issue #126): blends a seated "climbing" pose and a low "attack
// position" descending pose via a single -1..+1 pose factor (see
// updateRiderPose()), driven by slope/speed/pedal/brake rather than a fixed
// static mesh.
const RIDER_POSE_BLEND_RATE = 4; // 1/s exponential approach — ~63% there after 0.25s
const RIDER_SLOPE_DEADZONE = 0.05; // sinSlope magnitude (~5% grade) below which
// slope alone doesn't move the pose
const RIDER_SLOPE_FULL_EFFECT = 0.35; // sinSlope magnitude (~35% grade) for full effect
const RIDER_ATTACK_SPEED_THRESHOLD = 4; // m/s — fast coasting alone nudges toward attack
const RIDER_ATTACK_SPEED_RANGE = 6; // m/s — range over which that ramps to full weight
const RIDER_PEDAL_SEATED_WEIGHT = 0.4; // pull toward climb/seated while pedalling
const RIDER_BRAKE_ATTACK_WEIGHT = 0.3; // pull toward attack/braced while braking
const RIDER_MAX_TORSO_PITCH_CLIMB = 0.35; // rad (~20°) forward lean, full climb pose
const RIDER_MAX_TORSO_PITCH_DESCEND = -0.55; // rad (~-31°) back lean, full attack pose
const RIDER_MAX_CROUCH_OFFSET = 0.14; // m — hip-pivot drop at full attack pose
const RIDER_MAX_SETBACK_OFFSET = 0.08; // m — rearward hip-pivot shift at full attack pose
const RIDER_LANDING_CROUCH_BOOST = 0.1; // m — extra momentary crouch on a hard landing
const RIDER_LANDING_RECOVERY_RATE = 6; // 1/s — decay rate of that boost back to 0

// Real model drop-in point: public/assets/models/bike.glb. If it's missing, loadModel()
// below fails quietly and the procedural placeholder stays. The model's native units are
// millimeters (e.g. its wheels are ~634mm across), hence the 0.001 scale down to meters.
const MODEL_URL = `${import.meta.env.BASE_URL}assets/models/bike.glb`;
const MODEL_SCALE = 0.001;
const MODEL_ROTATION_Y = 0;

const gltfLoader = new GLTFLoader();

// Two wheels + a frame, standing in for a real bike model. Built lying along local Z
// (the body's forward axis, see applyInput's yaw-0 forward vector) so no extra mesh
// rotation is needed beyond copying the physics body's yaw quaternion.
function createPlaceholderBikeModel() {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xdd4422 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const wheelGeometry = new THREE.TorusGeometry(0.32, 0.05, 8, 16);

  for (const z of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, -0.15, z);
    group.add(wheel);
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.95), frameMaterial);
  frame.position.set(0, 0.05, 0);
  group.add(frame);

  return group;
}

// Small procedural rider rig (issue #126): a hip anchor holding a posable pivot
// (torso + head), posed each step by updateRiderPose(). No skeleton/animation
// clips — bike.glb ships with zero rider geometry (confirmed: node list is
// Frame/Helm/Saddle/Wheel_a/Wheel_b/a/b/c/Pedal_a/Pedal_b/Pedal_c, no skin, no
// animations), so this rig is independent of both createPlaceholderBikeModel()
// and the loaded glb, and must be re-attached after loadModel()'s mesh.clear()
// — same pattern as the headlight re-add below.
function createRiderModel() {
  const material = new THREE.MeshStandardMaterial({ color: 0x2244cc });

  const root = new THREE.Group();
  root.position.set(0, 0.45, -0.1); // static anchor — matches the old fused capsule

  const pivot = new THREE.Group(); // updateRiderPose() rotates/translates this
  root.add(pivot);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.32, 4, 8), material);
  torso.position.set(0, 0.22, 0);
  pivot.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), material);
  head.position.set(0, 0.46, 0);
  pivot.add(head);

  return { root, pivot };
}

export class BikeController {
  constructor(scene, world, camera, terrain, spawnPoint, bikeMaterial, isNight = false) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;
    this.speed = 0;
    this.stamina = MAX_STAMINA;
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;

    this.spawnPoint = { x: spawnPoint.x, z: spawnPoint.z };

    this.mesh = new THREE.Group();
    this.mesh.add(createPlaceholderBikeModel());
    scene.add(this.mesh);

    const rider = createRiderModel();
    this.riderRoot = rider.root;
    this.riderPivot = rider.pivot;
    this.mesh.add(this.riderRoot);
    this.riderPoseFactor = 0; // -1 climb/seated .. 0 neutral .. +1 descend/attack
    this.riderLandingAbsorb = 0; // 0..1, decays after a hard landing
    this.slopeSin = 0; // mirrors applyInput's local sinSlope
    this.pedalActive = false;
    this.brakeActive = false;

    // Day/night is fixed for the whole session (no live day/night cycle), so this is
    // decided once here rather than exposed as a toggle.
    if (isNight) {
      this.headlight = new THREE.SpotLight(
        HEADLIGHT_COLOR,
        HEADLIGHT_INTENSITY,
        HEADLIGHT_DISTANCE,
        HEADLIGHT_ANGLE,
        HEADLIGHT_PENUMBRA,
      );
      this.headlight.position.set(0, 0.5, 0.5);
      this.headlight.target.position.set(0, 0, 5);
      this.mesh.add(this.headlight, this.headlight.target);
    }

    this.loadModel();

    const spawnY = terrain.getHeightAt(spawnPoint.x, spawnPoint.z) + SPAWN_CLEARANCE;
    this.body = new CANNON.Body({
      mass: BIKE_MASS,
      shape: new CANNON.Sphere(RADIUS),
      position: new CANNON.Vec3(spawnPoint.x, spawnY, spawnPoint.z),
      linearDamping: 0.05,
      material: bikeMaterial,
      // applyInput() unconditionally rewrites body.velocity every frame from its own
      // speed/yaw model — it never relies on cannon-es's inertia to settle. Without
      // this, resting at low speed for >1s (default sleepTimeLimit) puts the body to
      // sleep, and Body.integrate() then ignores velocity writes on a sleeping body
      // until something calls wakeUp(), so pedalling from a stop would silently do
      // nothing to the bike's position even though speed/stamina still updated.
      allowSleep: false,
    });
    // Heading is fully steering-controlled: applyInput() sets the body's orientation
    // explicitly from `this.yaw` every frame. Locking all rotation axes (rather than
    // just X/Z) stops ground-contact friction from also spinning the sphere collider
    // around Y like a top, which would otherwise visibly rotate the bike model away
    // from its steering heading.
    this.body.angularFactor.set(0, 0, 0);
    world.addBody(this.body);
  }

  async loadModel() {
    try {
      const gltf = await gltfLoader.loadAsync(MODEL_URL);
      this.mesh.clear();
      gltf.scene.scale.setScalar(MODEL_SCALE);
      gltf.scene.rotation.y = MODEL_ROTATION_Y;
      this.mesh.add(gltf.scene);
      // clear() above also removed the headlight and rider rig (direct children of
      // this.mesh) — re-add them.
      if (this.headlight) this.mesh.add(this.headlight, this.headlight.target);
      this.mesh.add(this.riderRoot);
    } catch {
      // No real model at MODEL_URL yet — keep the procedural placeholder.
    }
  }

  // Admin command (see src/devtools/DevTools.js): resets the bike back to the exact
  // state the constructor set it up in, for a "start the run over" dev/admin action.
  respawn() {
    const spawnY = this.terrain.getHeightAt(this.spawnPoint.x, this.spawnPoint.z) + SPAWN_CLEARANCE;
    this.body.position.set(this.spawnPoint.x, spawnY, this.spawnPoint.z);
    this.body.velocity.set(0, 0, 0);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0);
    this.yaw = 0;
    this.speed = 0;
    this.stamina = MAX_STAMINA;
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;
    this.slopeSin = 0;
    this.pedalActive = false;
    this.brakeActive = false;
    this.riderPoseFactor = 0;
    this.riderLandingAbsorb = 0;
  }

  // Admin command: moves the bike to an arbitrary world (x, z) without resetting
  // yaw/speed/stamina — a "go here", not a "restart", so mid-run progress is kept.
  teleport(x, z) {
    const y = this.terrain.getHeightAt(x, z) + SPAWN_CLEARANCE;
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;
    this.slopeSin = 0;
    this.pedalActive = false;
    this.brakeActive = false;
    this.riderPoseFactor = 0;
    this.riderLandingAbsorb = 0;
  }

  isGrounded() {
    const groundY = this.terrain.getHeightAt(this.body.position.x, this.body.position.z);
    return this.body.position.y <= groundY + RADIUS + GROUNDED_EPSILON;
  }

  applyInput(dt, inputState) {
    // Sharper turns are only possible at low speed — the cap below derives the same
    // way a real bike's cornering does: lateral (centripetal) acceleration v*omega
    // can't exceed the available tyre grip (mu*g), so the faster you're going the
    // less you can yank the bars before you'd wash out.
    const turnCap =
      this.speed < TURN_RATE_MIN_SPEED
        ? TURN_RATE
        : Math.min(TURN_RATE, (GRIP_MU * GRAVITY_MAG) / this.speed);
    // Digital (keyboard/touch-button) and analog (tilt) steering combine additively and
    // then get clamped to +/-1 — the cap represents real tyre grip, not how many input
    // sources are currently active.
    const digitalSteer = (inputState.steerLeft ? 1 : 0) - (inputState.steerRight ? 1 : 0);
    const analogSteer = clamp(typeof inputState.steerAmount === 'number' ? inputState.steerAmount : 0, -1, 1);
    const steerSignal = clamp(digitalSteer + analogSteer, -1, 1);
    this.yaw += turnCap * dt * steerSignal;

    const forward = new CANNON.Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const groundHere = this.terrain.getHeightAt(this.body.position.x, this.body.position.z);
    const groundAhead = this.terrain.getHeightAt(
      this.body.position.x + forward.x * SLOPE_SAMPLE_DISTANCE,
      this.body.position.z + forward.z * SLOPE_SAMPLE_DISTANCE,
    );
    const drop = groundHere - groundAhead; // positive when descending
    const slopeLength = Math.hypot(drop, SLOPE_SAMPLE_DISTANCE);
    const sinSlope = drop / slopeLength;
    const cosSlope = SLOPE_SAMPLE_DISTANCE / slopeLength;
    this.slopeSin = sinSlope; // >0 descending, <0 climbing — read by updateRiderPose()
    this.pedalActive = Boolean(inputState.pedal);
    this.brakeActive = Boolean(inputState.brake);

    const gravityAccel = GRAVITY_MAG * sinSlope;
    const rollingResistAccel = ROLLING_RESISTANCE_COEFF * GRAVITY_MAG * cosSlope;
    const dragAccel = (0.5 * AIR_DENSITY * DRAG_CDA * this.speed * this.speed) / BIKE_MASS;
    const brakeAccel = inputState.brake ? BRAKE_MU * GRAVITY_MAG * cosSlope : 0;
    const pedalAccel = inputState.pedal
      ? this.stamina > 0
        ? PEDAL_BURST_ACCEL
        : PEDAL_STEADY_ACCEL
      : 0;
    const netAccel = gravityAccel - rollingResistAccel - dragAccel - brakeAccel + pedalAccel;
    this.speed = clamp(this.speed + netAccel * dt, 0, MAX_SPEED);

    // Keyed on the raw input (not whether stamina was actually available to spend) so
    // holding pedal at 0 stamina keeps it pinned at 0 instead of immediately regenerating.
    if (inputState.pedal) {
      this.stamina = clamp(this.stamina - STAMINA_DRAIN_RATE * dt, 0, MAX_STAMINA);
    } else {
      const regenRate =
        inputState.brake || this.speed < STAMINA_REST_SPEED_THRESHOLD
          ? STAMINA_REGEN_RATE_RESTING
          : STAMINA_REGEN_RATE;
      this.stamina = clamp(this.stamina + regenRate * dt, 0, MAX_STAMINA);
    }

    this.body.velocity.x = forward.x * this.speed;
    this.body.velocity.z = forward.z * this.speed;
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);

    let jumped = false;
    if (inputState.jump && this.isGrounded()) {
      this.body.applyImpulse(
        new CANNON.Vec3(0, JUMP_LAUNCH_VELOCITY * BIKE_MASS, 0),
        this.body.position,
      );
      jumped = true;
    }
    inputState.jump = false;
    return jumped;
  }

  syncAfterStep(dt = 1 / 60) {
    // Hard-landing heuristic: was airborne last frame, is grounded now, and was
    // falling fast just before this step's collision response resolved it.
    const nowGrounded = this.isGrounded();
    this.hardLanding =
      !this.wasGrounded && nowGrounded && this.previousVerticalVelocity < HARD_LANDING_VELOCITY;
    this.wasGrounded = nowGrounded;
    this.previousVerticalVelocity = this.body.velocity.y;

    this.updateRiderPose(dt);

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    this.updateCamera();
  }

  // Rider pose (issue #126): blends a single -1..+1 pose factor (climb/seated ..
  // neutral .. descend/attack) from slope/speed/pedal/brake state stashed by
  // applyInput(), then maps it onto the rider pivot's torso pitch + crouch/setback.
  // Blended via exponential approach so weight shifts read as smooth, not a snap.
  // Hard-landing absorb bypasses that blend deliberately — a landing compression
  // is a reflex, not a gradual weight shift.
  updateRiderPose(dt) {
    const slopeMagnitude = Math.max(0, Math.abs(this.slopeSin) - RIDER_SLOPE_DEADZONE);
    const slopeRange = RIDER_SLOPE_FULL_EFFECT - RIDER_SLOPE_DEADZONE;
    const slopeFactor = clamp(slopeMagnitude / slopeRange, 0, 1) * Math.sign(this.slopeSin);

    const speedFactor = clamp(
      (this.speed - RIDER_ATTACK_SPEED_THRESHOLD) / RIDER_ATTACK_SPEED_RANGE,
      0,
      1,
    );
    const pedalFactor = this.pedalActive ? -RIDER_PEDAL_SEATED_WEIGHT : 0;
    const brakeFactor = this.brakeActive ? RIDER_BRAKE_ATTACK_WEIGHT : 0;

    const targetPoseFactor = clamp(slopeFactor + speedFactor + pedalFactor + brakeFactor, -1, 1);

    const blend = 1 - Math.exp(-RIDER_POSE_BLEND_RATE * dt);
    this.riderPoseFactor += (targetPoseFactor - this.riderPoseFactor) * blend;

    this.riderLandingAbsorb = this.hardLanding
      ? 1
      : Math.max(0, this.riderLandingAbsorb - RIDER_LANDING_RECOVERY_RATE * dt);

    const f = this.riderPoseFactor;
    const pitch = f < 0 ? -f * RIDER_MAX_TORSO_PITCH_CLIMB : f * RIDER_MAX_TORSO_PITCH_DESCEND;
    const attackAmount = Math.max(f, 0);
    const crouch =
      attackAmount * RIDER_MAX_CROUCH_OFFSET + this.riderLandingAbsorb * RIDER_LANDING_CROUCH_BOOST;
    const setback = attackAmount * RIDER_MAX_SETBACK_OFFSET;

    this.riderPivot.rotation.x = pitch;
    this.riderPivot.position.set(0, -crouch, -setback);
  }

  updateCamera() {
    const offset = CAMERA_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const targetPosition = this.mesh.position.clone().add(offset);
    this.camera.position.lerp(targetPosition, CAMERA_LERP);
    this.camera.lookAt(this.mesh.position);
  }
}
