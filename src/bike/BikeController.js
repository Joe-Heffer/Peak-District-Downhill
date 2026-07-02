import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const RADIUS = 0.5;
const SPAWN_CLEARANCE = RADIUS + 0.05;
const FORWARD_SPEED = 6;
const TURN_RATE = 2.2;
const JUMP_IMPULSE = 35;
const GROUNDED_EPSILON = 0.05;
const HARD_LANDING_VELOCITY = -8;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, -6);
const CAMERA_LERP = 0.1;

// Real model drop-in point: public/assets/models/bike.glb. Until one exists, loadModel()
// below fails quietly and the procedural placeholder stays. Scale/rotation are unknown
// until a real model is chosen, so tweak these once one is added.
const MODEL_URL = `${import.meta.env.BASE_URL}assets/models/bike.glb`;
const MODEL_SCALE = 1;
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
  constructor(scene, world, camera, terrain, spawnPoint) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;
    this.wasGrounded = true;
    this.previousVerticalVelocity = 0;
    this.hardLanding = false;

    this.mesh = new THREE.Group();
    this.mesh.add(createPlaceholderBikeModel());
    scene.add(this.mesh);
    this.loadModel();

    const spawnY = terrain.getHeightAt(spawnPoint.x, spawnPoint.z) + SPAWN_CLEARANCE;
    this.body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Sphere(RADIUS),
      position: new CANNON.Vec3(spawnPoint.x, spawnY, spawnPoint.z),
      linearDamping: 0.05,
    });
    this.body.angularFactor.set(0, 1, 0);
    world.addBody(this.body);
  }

  async loadModel() {
    try {
      const gltf = await gltfLoader.loadAsync(MODEL_URL);
      this.mesh.clear();
      gltf.scene.scale.setScalar(MODEL_SCALE);
      gltf.scene.rotation.y = MODEL_ROTATION_Y;
      this.mesh.add(gltf.scene);
    } catch {
      // No real model at MODEL_URL yet — keep the procedural placeholder.
    }
  }

  isGrounded() {
    const groundY = this.terrain.getHeightAt(this.body.position.x, this.body.position.z);
    return this.body.position.y <= groundY + RADIUS + GROUNDED_EPSILON;
  }

  applyInput(dt, inputState) {
    if (inputState.steerLeft) this.yaw += TURN_RATE * dt;
    if (inputState.steerRight) this.yaw -= TURN_RATE * dt;

    const forward = new CANNON.Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.body.velocity.x = forward.x * FORWARD_SPEED;
    this.body.velocity.z = forward.z * FORWARD_SPEED;
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.yaw);

    let jumped = false;
    if (inputState.jump && this.isGrounded()) {
      this.body.applyImpulse(new CANNON.Vec3(0, JUMP_IMPULSE, 0), this.body.position);
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
