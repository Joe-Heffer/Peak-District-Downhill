import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const RADIUS = 0.5;
const SPAWN_CLEARANCE = RADIUS + 0.05;
const FORWARD_SPEED = 6;
const TURN_RATE = 2.2;
const JUMP_IMPULSE = 35;
const GROUNDED_EPSILON = 0.05;
const CAMERA_OFFSET = new THREE.Vector3(0, 3, -6);
const CAMERA_LERP = 0.1;

export class BikeController {
  constructor(scene, world, camera, terrain, spawnPoint) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;

    const geometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xdd4422 });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);

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

    if (inputState.jump && this.isGrounded()) {
      this.body.applyImpulse(new CANNON.Vec3(0, JUMP_IMPULSE, 0), this.body.position);
    }
    inputState.jump = false;
  }

  syncAfterStep() {
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    this.mesh.rotateX(Math.PI / 2);

    this.updateCamera();
  }

  updateCamera() {
    const offset = CAMERA_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const targetPosition = this.mesh.position.clone().add(offset);
    this.camera.position.lerp(targetPosition, CAMERA_LERP);
    this.camera.lookAt(this.mesh.position);
  }
}
