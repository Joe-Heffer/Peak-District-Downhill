import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp } from '../terrain/HeightmapTerrain.js';

const TURN_RATE = 2.2;
const HARD_LANDING_VELOCITY = -8;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, -6);
const CAMERA_LERP = 0.1;

// Physics (issue #66): a CANNON.RaycastVehicle chassis + wheels, replacing the old
// velocity-hack CANNON.Sphere. A literal 2-wheel (front+rear, in-line) vehicle has no
// lateral wheel separation, so nothing in cannon-es's suspension model resists roll —
// the chassis would be a free rigid body in roll, tipping from any asymmetric bump or
// off-camber landing. Two extra invisible "outrigger" wheels, mounted wide but at the
// chassis's longitudinal center (so they add roll stability without adding unwanted
// pitch resistance), give the vehicle a real 4-corner stance — the same track-width-
// gives-roll-stiffness principle every 4-wheeled RaycastVehicle demo relies on — while
// only the front/rear wheels drive perceived behaviour (steering/engine force/brake/
// grounded state). There are no wheel meshes bound to physics wheel transforms in this
// game (the visible mesh follows the chassis body only, see syncAfterStep), so the
// outriggers are 100% invisible physics geometry. Suspension is bounded
// (maxSuspensionTravel/maxSuspensionForce), so a hard enough landing or off-camber hit
// can still exceed what the outriggers arrest and tip the chassis over for real —
// deliberately no artificial roll cap or auto-recovery.
const CHASSIS_HALF_EXTENTS = new CANNON.Vec3(0.3, 0.15, 0.55);
const WHEEL_RADIUS = 0.33;
// Chassis-local Z positions of the steering/engine wheels. NOTE: these are on the
// physics chassis's own -Z side — see MESH_YAW_OFFSET below for why "front" ends up at
// negative Z in chassis-local space while still rendering/steering/driving toward the
// mesh's visual nose.
const WHEEL_FRONT_Z = -0.45;
const WHEEL_REAR_Z = 0.45;
const OUTRIGGER_X = 0.55;
const WHEEL_CONNECTION_Y = -CHASSIS_HALF_EXTENTS.y; // bottom face of the chassis box
const SUSPENSION_REST_LENGTH = 0.15; // ~real MTB rear-shock travel
// Chassis ride height at rest: half the chassis height, plus the suspension resting
// length, plus the wheel radius — keeps the spawn/respawn/teleport height consistent
// with where the vehicle's suspension will actually settle instead of guessing.
const SPAWN_CLEARANCE = CHASSIS_HALF_EXTENTS.y + SUSPENSION_REST_LENGTH + WHEEL_RADIUS;
const WHEELBASE = Math.abs(WHEEL_FRONT_Z - WHEEL_REAR_Z);
const MAX_STEER_ANGLE = 0.6; // rad (~34 deg) — physical headset-angle ceiling

const WHEEL_FRONT = 0;
const WHEEL_REAR = 1;
const WHEEL_OUTRIGGER_LEFT = 2;
const WHEEL_OUTRIGGER_RIGHT = 3;
const REAL_WHEELS = [WHEEL_FRONT, WHEEL_REAR];

// cannon-es's RaycastVehicle derives each wheel's rolling-friction "forward" direction
// as worldGroundNormal.cross(chassis-transformed directions[indexRightAxis]) — i.e. from
// indexRightAxis/indexUpAxis alone (verified empirically; a wheel's own directionLocal/
// axleLocal turn out not to matter). With indexUpAxis=1 (+Y, the only sane choice given
// gravity/ground normal) and indexRightAxis restricted to the library's fixed positive
// {X,Y,Z} basis, that cross product can only ever land on +/-Z or +/-X — +Z (this game's
// forward=(sin(yaw),0,cos(yaw)) convention) is mathematically unreachable, so the chassis
// always physically accelerates toward its own local -Z under positive engineForce.
// Rather than fight the library (or renumber axis indices game-wide), the chassis is left
// to propel itself toward local -Z natively (hence WHEEL_FRONT_Z/WHEEL_REAR_Z above being
// negative/positive respectively), and the *visible* mesh is given a constant 180-degree
// yaw offset relative to the chassis so it renders nose-first toward the actual direction
// of travel — see syncAfterStep. yaw/slopeSin are likewise derived from the mesh's
// effective forward (chassis local -Z), not the chassis's own local +Z.
const MESH_YAW_OFFSET = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// A perfectly vertical (0,-1,0) wheel raycast direction hits a real, confirmed edge case
// in cannon-es's heightfield ray intersection (degenerate math for axis-aligned rays)
// that silently reports no contact for a meaningful fraction of query points against
// Cut Gate's real, non-square terrain grid — reproduced directly against both a minimal
// heightfield and the real dataset. A slight tilt away from exactly vertical avoids it
// (empirically cut the miss rate from ~19% to ~3% on top of the setupWorld.js dimension-
// padding fix for the same underlying library limitation) without perceptibly changing
// suspension behaviour.
const WHEEL_DIRECTION_LOCAL = new CANNON.Vec3(0.001, -1, 0.001).unit();

// Starting points from an empirical tuning spike (a throwaway Node script driving the
// vehicle for several seconds and inspecting settle height / drift / wheel contact —
// see the plan notes for issue #66), not derived physical constants. A first-principles
// guess (~18) turned out far too soft: cannon-es's suspensionForce = stiffness *
// compression * chassisMass, and holding this ~85kg chassis up within maxSuspensionTravel
// needs stiffness well north of that. frictionSlip reuses GRIP_MU directly, so cornering
// and drive/brake traction now share one friction-circle model.
const REAL_WHEEL_OPTIONS = {
  radius: WHEEL_RADIUS,
  directionLocal: WHEEL_DIRECTION_LOCAL,
  axleLocal: new CANNON.Vec3(1, 0, 0),
  suspensionRestLength: SUSPENSION_REST_LENGTH,
  maxSuspensionTravel: 0.15,
  suspensionStiffness: 60,
  dampingCompression: 12,
  dampingRelaxation: 7,
  maxSuspensionForce: 6000,
  rollInfluence: 0.01,
};
// Outriggers: a lightly-loaded extra suspension corner (like real trainer wheels
// resting with light preload), not a free-floating stabilizer — cannon-es's suspension
// spring is linear, so there's no clean way to build a true dead-zone/hover behaviour
// without extra per-frame code. Kept notably softer than the real wheels — the tuning
// spike found that outrigger stiffness comparable to the real wheels actively fights
// them for pitch balance (the real wheels alone should carry that), while a soft
// preload still stops the vehicle rolling over sideways. Near-zero frictionSlip keeps
// them from adding unaccounted drive/brake drag or fighting the real wheels' slip model.
const OUTRIGGER_WHEEL_OPTIONS = {
  radius: WHEEL_RADIUS,
  directionLocal: WHEEL_DIRECTION_LOCAL,
  axleLocal: new CANNON.Vec3(1, 0, 0),
  suspensionRestLength: SUSPENSION_REST_LENGTH,
  maxSuspensionTravel: 0.1,
  suspensionStiffness: 12,
  dampingCompression: 3,
  dampingRelaxation: 2,
  maxSuspensionForce: 3000,
  frictionSlip: 0.05,
  rollInfluence: 0.01,
};

// Headlight (see issue #79): mounted near the front/handlebar of the bike, aimed along
// local +z (the forward axis — see createPlaceholderBikeModel's comment and
// syncAfterStep's forward vector below), only built when spawned into the night preset.
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

// Real-world-scale longitudinal dynamics. Slope-induced acceleration now comes for free
// from real gravity acting on wheels in raycast ground contact (no more forward-terrain-
// sampling hack) — what's left as explicit forces is what CANNON.WheelInfo doesn't model:
// aerodynamic drag and rolling resistance. See CLAUDE.md/plan notes for the sourcing of
// these figures.
const BIKE_MASS = 85; // kg — ~15kg trail/enduro bike + ~70kg rider
const GRAVITY_MAG = 9.82; // m/s^2 — matches world gravity in setupWorld.js
const ROLLING_RESISTANCE_COEFF = 0.025; // Crr — knobby MTB tyres on dirt/gravel
const AIR_DENSITY = 1.225; // kg/m^3 — standard sea-level air density
const DRAG_CDA = 0.6; // m^2 — crouched downhill riding position
// Tyre traction ceiling, shared by cornering and drive/brake force via each real wheel's
// WheelInfo.frictionSlip — a friction-circle model the old separate GRIP_MU/BRAKE_MU
// scalars couldn't represent (skidding under hard braking mid-corner is now possible).
const GRIP_MU = 0.8; // reuses setupWorld.js's ground/bike contact friction
const BRAKE_MU = 0.5; // brake-force-magnitude scalar, below GRIP_MU (loose dirt, no lockup)
const TURN_RATE_MIN_SPEED = 0.5; // m/s — below this, fall back to the flat TURN_RATE
const MAX_SPEED = 25; // m/s (~90 km/h) — defensive clamp for artifact-steep terrain cells
const JUMP_LAUNCH_VELOCITY = 7; // m/s — same launch speed the old JUMP_IMPULSE/mass gave

// Baseline propulsion + boost (issue #139): this is a downhill game, so momentum should
// mostly come from gravity/terrain, not a held button. The old "hold to pedal or crawl
// to a stop" model is replaced by (a) a small always-on baseline push (below) that keeps
// flat ground rolling at a lazy cruise with zero input, and (b) a deliberate,
// stamina-gated boost burst (BOOST_ACCEL) you spend on demand — mainly useful right
// before a jump, since JUMP_LAUNCH_VELOCITY is a fixed vertical impulse and carrying more
// horizontal speed at takeoff is the only way to stretch the jump arc. Stamina itself is
// unchanged from issue #61: a unitless 0..1 fraction, drain/regen tuned by feel.
const MAX_STAMINA = 1;
const STAMINA_DRAIN_RATE = 1 / 15; // per second — full tank drains in ~15s of continuous boosting
const STAMINA_REGEN_RATE = 1 / 10; // per second while coasting — full regen in ~10s
const STAMINA_REGEN_RATE_RESTING = 1 / 5; // per second while braking/near-stationary — faster
const STAMINA_REST_SPEED_THRESHOLD = 1; // m/s — below this counts as "resting" for regen

// m/s^2 — always-on forward push while boost isn't active, no input required. Only the
// rear wheel is driven (see applyEngineForce(..., WHEEL_REAR) below), and a raycast-
// vehicle's driven wheel needs a real load on it before it can transmit force as forward
// motion rather than wheel-spin/chatter — empirically (not just the simple
// rollingResistance-vs-drag balance you'd compute by hand), anything much below this
// stalls out near 0 instead of building speed. At 2.0 it settles to a lazy ~4.5-5 m/s
// (~16-18 km/h) cruise on flat ground, comfortably short of MAX_SPEED and of boosted
// speeds — gravity should still be doing the interesting work on descents, not this. It
// also labors visibly on any real climb (well under half its flat-ground speed already
// on a 10% grade), so hills stay mostly gravity's (downhill) or BOOST_ACCEL's (uphill,
// while stamina lasts) job.
const BASELINE_ACCEL = 2.0;

// m/s^2 — deliberate acceleration while holding boost with stamina left, *replacing*
// baseline rather than adding to it (was PEDAL_BURST_ACCEL pre-#139, value and
// wheel-force behaviour otherwise unchanged — still comfortably clears Cut Gate's real
// ~19%-grade climbs, theoretical stall ~28-29% grade, and is the same magnitude the
// existing roll-stability/hill-climb tuning already relies on; stacking it on top of
// BASELINE_ACCEL instead measurably destabilizes hard cornering, since that combined
// force is more than this chassis/suspension tuning was ever built for). At 0 stamina,
// holding boost falls back to BASELINE_ACCEL alone — there is no more weaker fallback
// rate. The old PEDAL_STEADY_ACCEL "granny gear" is removed per #139: boost is meant to
// feel scarce and worth spending deliberately (e.g. right before a jump), not something
// to lean on indefinitely.
const BOOST_ACCEL = 3.0;

// Rider pose (issue #126): blends a seated "climbing" pose and a low "attack
// position" descending pose via a single -1..+1 pose factor (see
// updateRiderPose()), driven by slope/speed/boost/brake rather than a fixed
// static mesh.
const RIDER_POSE_BLEND_RATE = 4; // 1/s exponential approach — ~63% there after 0.25s
const RIDER_SLOPE_DEADZONE = 0.05; // sinSlope magnitude (~5% grade) below which
// slope alone doesn't move the pose
const RIDER_SLOPE_FULL_EFFECT = 0.35; // sinSlope magnitude (~35% grade) for full effect
const RIDER_ATTACK_SPEED_THRESHOLD = 4; // m/s — fast coasting alone nudges toward attack
const RIDER_ATTACK_SPEED_RANGE = 6; // m/s — range over which that ramps to full weight
// pull toward the low, tucked attack pose while boosting (was RIDER_PEDAL_SEATED_WEIGHT
// pre-#139, which pulled the *other* way toward climb/seated). Flipped because boosting
// is no longer a climbing cadence — it's a deliberate sprint burst aimed at carrying more
// speed into a jump, so it reads better as the rider hunkering down into the same low/
// aero stance that high speed alone already nudges toward (see RIDER_ATTACK_SPEED_
// THRESHOLD/RANGE above), reinforcing it rather than fighting it.
const RIDER_BOOST_ATTACK_WEIGHT = 0.4;
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
// (the body's forward axis, see syncAfterStep's forward vector) so no extra mesh
// rotation is needed beyond copying the physics body's quaternion.
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
    this.boostActive = false;
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
      shape: new CANNON.Box(CHASSIS_HALF_EXTENTS),
      position: new CANNON.Vec3(spawnPoint.x, spawnY, spawnPoint.z),
      // Both raised well above a token value by the tuning spike above: the 4-wheel
      // suspension model has a small persistent asymmetry between sequentially-solved
      // wheel impulses each step (a known characteristic of raycast-vehicle solvers,
      // not specific to this tuning) that otherwise reads as gentle unwanted creep/
      // wobble at rest — damping this aggressively keeps the vehicle settled and
      // controllable without needing a hand-rolled velocity-zeroing hack.
      linearDamping: 0.3,
      angularDamping: 0.8,
      material: bikeMaterial,
      // applyInput() unconditionally rewrites engine force/steering/brake every frame
      // from its own input model — it never relies on cannon-es's inertia to settle.
      // Without this, resting at low speed for >1s (default sleepTimeLimit) puts the
      // body to sleep, and Body.integrate() then ignores force writes on a sleeping
      // body until something calls wakeUp(), so boosting from a stop would silently
      // do nothing even though speed/stamina still updated.
      allowSleep: false,
    });
    // Rotation is fully free (issue #66): roll/pitch/yaw all emerge from wheel contact
    // forces instead of being hand-set, so the bike can genuinely tip over — see the
    // physics constants comment above for why the outrigger wheels exist and why no
    // roll-correction torque is added here.
    this.body.angularFactor.set(1, 1, 1);

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.body,
      // Matches this game's existing forward = (sin(yaw), 0, cos(yaw)) / "mesh built
      // along local Z" convention (createPlaceholderBikeModel) — NOT cannon-es's own
      // defaults (indexForwardAxis defaults to 0/X), so these must be passed explicitly.
      indexRightAxis: 0,
      indexForwardAxis: 2,
      indexUpAxis: 1,
    });
    this.vehicle.addWheel({
      ...REAL_WHEEL_OPTIONS,
      frictionSlip: GRIP_MU,
      chassisConnectionPointLocal: new CANNON.Vec3(0, WHEEL_CONNECTION_Y, WHEEL_FRONT_Z),
    }); // WHEEL_FRONT
    this.vehicle.addWheel({
      ...REAL_WHEEL_OPTIONS,
      frictionSlip: GRIP_MU,
      chassisConnectionPointLocal: new CANNON.Vec3(0, WHEEL_CONNECTION_Y, WHEEL_REAR_Z),
    }); // WHEEL_REAR
    this.vehicle.addWheel({
      ...OUTRIGGER_WHEEL_OPTIONS,
      chassisConnectionPointLocal: new CANNON.Vec3(-OUTRIGGER_X, WHEEL_CONNECTION_Y, 0),
    }); // WHEEL_OUTRIGGER_LEFT
    this.vehicle.addWheel({
      ...OUTRIGGER_WHEEL_OPTIONS,
      chassisConnectionPointLocal: new CANNON.Vec3(OUTRIGGER_X, WHEEL_CONNECTION_Y, 0),
    }); // WHEEL_OUTRIGGER_RIGHT
    // addToWorld() adds the chassis body itself and registers the preStep listener that
    // updates wheel raycasts/suspension/friction each world.step() — don't also call
    // world.addBody(this.body).
    this.vehicle.addToWorld(world);
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

  // Zeroes engine force/brake/steering on the real wheels — used by respawn()/
  // teleport() so a reset doesn't leave stale throttle/steering input applied to a
  // freshly repositioned chassis.
  resetVehicleControls() {
    for (const wheelIndex of REAL_WHEELS) {
      this.vehicle.applyEngineForce(0, wheelIndex);
      this.vehicle.setBrake(0, wheelIndex);
    }
    this.vehicle.setSteeringValue(0, WHEEL_FRONT);
  }

  // Player-facing (issue #66) and admin command (see src/devtools/DevTools.js): resets
  // the bike back to the exact state the constructor set it up in, for a "start the run
  // over" action — including recovering from a full tip-over crash, since this game
  // deliberately has no automatic upright-recovery.
  respawn() {
    const spawnY = this.terrain.getHeightAt(this.spawnPoint.x, this.spawnPoint.z) + SPAWN_CLEARANCE;
    this.body.position.set(this.spawnPoint.x, spawnY, this.spawnPoint.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), 0);
    this.resetVehicleControls();
    this.yaw = 0;
    this.speed = 0;
    this.stamina = MAX_STAMINA;
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;
    this.slopeSin = 0;
    this.boostActive = false;
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
    this.body.angularVelocity.set(0, 0, 0);
    this.resetVehicleControls();
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;
    this.slopeSin = 0;
    this.boostActive = false;
    this.brakeActive = false;
    this.riderPoseFactor = 0;
    this.riderLandingAbsorb = 0;
  }

  // Real wheels only — outriggers are stabilizer-only and don't count as "on the
  // ground" for jump/tire-roll-audio purposes.
  isGrounded() {
    return REAL_WHEELS.some((wheelIndex) => this.vehicle.wheelInfos[wheelIndex].isInContact);
  }

  applyInput(dt, inputState) {
    // Sharper turns are only possible at low speed — the cap below derives the same
    // way a real bike's cornering does: lateral (centripetal) acceleration v*omega
    // can't exceed the available tyre grip (mu*g), so the faster you're going the
    // less you can yank the bars before you'd wash out. Converted from a yaw-rate cap
    // into a steering angle via a small bicycle-model relationship
    // (yawRate ~= (speed/wheelbase) * tan(steerAngle)) so it's in the units
    // RaycastVehicle actually wants, while preserving "sharper turns only at low speed".
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
    const speedForSteer = Math.max(this.speed, TURN_RATE_MIN_SPEED);
    const steerAngleMagnitude = clamp(Math.atan((turnCap * WHEELBASE) / speedForSteer), 0, MAX_STEER_ANGLE);
    this.vehicle.setSteeringValue(steerAngleMagnitude * steerSignal, WHEEL_FRONT);

    this.boostActive = Boolean(inputState.boost);
    this.brakeActive = Boolean(inputState.brake);

    // Propulsion/braking as real forces at the wheels rather than a scalar speed update
    // — slope-induced acceleration now comes for free from gravity + wheel ground
    // contact, so there's no forward-terrain-sampling hack here any more.
    // Boost replaces baseline (rather than stacking on top of it) while held with
    // stamina left (issue #139) — at 0 stamina, holding boost falls back to baseline
    // alone, not a weaker fallback rate.
    const engineAccel = inputState.boost && this.stamina > 0 ? BOOST_ACCEL : BASELINE_ACCEL;
    this.vehicle.applyEngineForce(engineAccel * BIKE_MASS, WHEEL_REAR);

    const brakeForce = inputState.brake ? BRAKE_MU * BIKE_MASS * GRAVITY_MAG : 0;
    for (const wheelIndex of REAL_WHEELS) {
      this.vehicle.setBrake(brakeForce, wheelIndex);
    }

    // Aerodynamic drag and rolling resistance aren't part of CANNON.WheelInfo's
    // friction/suspension model, so they stay explicit forces applied to the chassis.
    const horizontalSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (horizontalSpeed > 1e-3) {
      const dragForceMag = 0.5 * AIR_DENSITY * DRAG_CDA * horizontalSpeed * horizontalSpeed;
      const rollingResistForceMag = ROLLING_RESISTANCE_COEFF * BIKE_MASS * GRAVITY_MAG;
      const oppositionForceMag = dragForceMag + rollingResistForceMag;
      this.body.applyForce(
        new CANNON.Vec3(
          -(this.body.velocity.x / horizontalSpeed) * oppositionForceMag,
          0,
          -(this.body.velocity.z / horizontalSpeed) * oppositionForceMag,
        ),
      );
    }

    // Keyed on the raw input (not whether stamina was actually available to spend) so
    // holding boost at 0 stamina keeps it pinned at 0 instead of immediately regenerating.
    // Note this reads `this.speed` from the *previous* step (speed is now re-derived in
    // syncAfterStep, one frame after the forces above are integrated) rather than a
    // just-updated value — a one-frame-stale read that's immaterial at a ~1/60s dt.
    if (inputState.boost) {
      this.stamina = clamp(this.stamina - STAMINA_DRAIN_RATE * dt, 0, MAX_STAMINA);
    } else {
      const regenRate =
        inputState.brake || this.speed < STAMINA_REST_SPEED_THRESHOLD
          ? STAMINA_REGEN_RATE_RESTING
          : STAMINA_REGEN_RATE;
      this.stamina = clamp(this.stamina + regenRate * dt, 0, MAX_STAMINA);
    }

    let jumped = false;
    if (inputState.jump && this.isGrounded()) {
      // Applied at the chassis's own center of mass (this.body.position) so the impulse
      // can't induce an unwanted spin now that rotation is free.
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
    // Defensive ceiling for artifact-steep terrain cells, applied to the real chassis
    // velocity rather than a scalar (see MAX_SPEED's original comment).
    const rawHorizontalSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (rawHorizontalSpeed > MAX_SPEED) {
      const scale = MAX_SPEED / rawHorizontalSpeed;
      this.body.velocity.x *= scale;
      this.body.velocity.z *= scale;
    }

    // yaw/speed/slopeSin are re-derived from the real chassis state (emergent from
    // physics) rather than hand-set, now that steering/propulsion drive the vehicle
    // through real forces instead of overwriting velocity/orientation directly. Uses
    // local -Z (see MESH_YAW_OFFSET above) — the chassis's actual direction of travel,
    // not its own local +Z.
    const forward = this.body.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
    this.yaw = Math.atan2(forward.x, forward.z);
    this.speed = Math.min(rawHorizontalSpeed, MAX_SPEED);
    // Descending means moving downhill along `forward`, i.e. forward pointing downward
    // (negative y) — hence the negation to match the />0 descending, <0 climbing/
    // contract updateRiderPose() (and its tests) rely on.
    this.slopeSin = clamp(-forward.y, -1, 1);

    // Hard-landing heuristic: was airborne last frame, is grounded now, and was
    // falling fast just before this step's collision response resolved it.
    const nowGrounded = this.isGrounded();
    this.hardLanding =
      !this.wasGrounded && nowGrounded && this.previousVerticalVelocity < HARD_LANDING_VELOCITY;
    this.wasGrounded = nowGrounded;
    this.previousVerticalVelocity = this.body.velocity.y;

    this.updateRiderPose(dt);

    this.mesh.position.copy(this.body.position);
    // See MESH_YAW_OFFSET above: the chassis physically travels toward its own local -Z,
    // so the visible mesh gets an extra 180-degree yaw on top to render nose-first
    // toward the actual direction of travel.
    this.mesh.quaternion.copy(this.body.quaternion);
    this.mesh.quaternion.multiply(MESH_YAW_OFFSET);

    this.updateCamera();
  }

  // Rider pose (issue #126): blends a single -1..+1 pose factor (climb/seated ..
  // neutral .. descend/attack) from slope/speed/boost/brake state stashed by
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
    const boostFactor = this.boostActive ? RIDER_BOOST_ATTACK_WEIGHT : 0;
    const brakeFactor = this.brakeActive ? RIDER_BRAKE_ATTACK_WEIGHT : 0;

    const targetPoseFactor = clamp(slopeFactor + speedFactor + boostFactor + brakeFactor, -1, 1);

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
