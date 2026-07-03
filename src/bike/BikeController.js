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
const HEADLIGHT_COLOR = 0xfff2cc;
const HEADLIGHT_INTENSITY = 40;
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

  const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 8), frameMaterial);
  rider.position.set(0, 0.45, -0.1);
  group.add(rider);

  return group;
}

export class BikeController {
  constructor(scene, world, camera, terrain, spawnPoint, bikeMaterial, isNight = false) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;
    this.speed = 0;
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;

    this.mesh = new THREE.Group();
    this.mesh.add(createPlaceholderBikeModel());
    scene.add(this.mesh);

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
      // clear() above also removed the headlight (a direct child of this.mesh) — re-add it.
      if (this.headlight) this.mesh.add(this.headlight, this.headlight.target);
    } catch {
      // No real model at MODEL_URL yet — keep the procedural placeholder.
    }
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
    if (inputState.steerLeft) this.yaw += turnCap * dt;
    if (inputState.steerRight) this.yaw -= turnCap * dt;

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

    const gravityAccel = GRAVITY_MAG * sinSlope;
    const rollingResistAccel = ROLLING_RESISTANCE_COEFF * GRAVITY_MAG * cosSlope;
    const dragAccel = (0.5 * AIR_DENSITY * DRAG_CDA * this.speed * this.speed) / BIKE_MASS;
    const brakeAccel = inputState.brake ? BRAKE_MU * GRAVITY_MAG * cosSlope : 0;
    const netAccel = gravityAccel - rollingResistAccel - dragAccel - brakeAccel;
    this.speed = clamp(this.speed + netAccel * dt, 0, MAX_SPEED);

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

  syncAfterStep() {
    // Hard-landing heuristic: was airborne last frame, is grounded now, and was
    // falling fast just before this step's collision response resolved it.
    const nowGrounded = this.isGrounded();
    this.hardLanding =
      !this.wasGrounded && nowGrounded && this.previousVerticalVelocity < HARD_LANDING_VELOCITY;
    this.wasGrounded = nowGrounded;
    this.previousVerticalVelocity = this.body.velocity.y;

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    this.updateCamera();
  }

  updateCamera() {
    const offset = CAMERA_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const targetPosition = this.mesh.position.clone().add(offset);
    this.camera.position.lerp(targetPosition, CAMERA_LERP);
    this.camera.lookAt(this.mesh.position);
  }
}
