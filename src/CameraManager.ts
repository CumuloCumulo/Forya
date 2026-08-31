import * as THREE from 'three';

export class CameraManager {
  readonly canvas: HTMLCanvasElement;
  readonly camera: THREE.PerspectiveCamera;
  private theta = Math.PI;
  private phi = Math.PI / 2.34;
  private distance = 10.5;
  private currentTarget = new THREE.Vector3();
  private desiredPosition = new THREE.Vector3();
  private lookMatrix = new THREE.Matrix4();
  private targetQuaternion = new THREE.Quaternion();
  private rollQuaternion = new THREE.Quaternion();
  private worldUp = new THREE.Vector3(0, 1, 0);
  private rollAxis = new THREE.Vector3(0, 0, 1);
  private currentRoll = 0;
  private shakeTime = 0;
  private initialized = false;
  isLocked = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.canvas = renderer.domElement;
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.2, 4400);
    this.setupInputs();
  }

  reset(): void { this.initialized = false; }

  updateCinematic(focus: THREE.Vector3, elapsed: number): void {
    const angle = -0.72 + Math.sin(elapsed * 0.055) * 0.1;
    this.camera.position.set(
      focus.x + Math.sin(angle) * 155,
      focus.y + 78,
      focus.z + Math.cos(angle) * 155,
    );
    this.camera.lookAt(focus.x, focus.y + 14, focus.z);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  }

  private setupInputs(): void {
    document.addEventListener('mousemove', (event) => {
      if (!this.isLocked) return;
      this.theta -= event.movementX * 0.00155;
      this.phi = THREE.MathUtils.clamp(this.phi - event.movementY * 0.00125, 0.48, Math.PI / 2 - 0.04);
    });
    document.addEventListener('wheel', (event) => {
      if (this.isLocked) this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.007, 7, 18);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.isLocked = document.pointerLockElement === this.canvas; });
    this.canvas.addEventListener('click', () => { if (!this.isLocked) void this.canvas.requestPointerLock(); });
  }

  update(player: THREE.Vector3, velocity: THREE.Vector3, deltaTime: number, turn: number, terrainHeight: (x: number, z: number) => number): void {
    const speed = velocity.length();
    const speedFactor = THREE.MathUtils.clamp((speed - 25) / 45, 0, 1);
    const target = new THREE.Vector3(player.x, player.y + 1.35, player.z);
    this.currentTarget.lerp(target, 1 - Math.exp(-deltaTime * 8));

    const dynamicDistance = this.distance + speedFactor * 3.8;
    const x = dynamicDistance * Math.sin(this.phi) * Math.sin(this.theta);
    const y = dynamicDistance * Math.cos(this.phi) + 1.2;
    const z = dynamicDistance * Math.sin(this.phi) * Math.cos(this.theta);
    this.desiredPosition.set(target.x + x, target.y + y, target.z + z);
    const floor = terrainHeight(this.desiredPosition.x, this.desiredPosition.z) + 2.1;
    this.desiredPosition.y = Math.max(this.desiredPosition.y, floor);

    const firstUpdate = !this.initialized;
    if (firstUpdate) {
      this.currentTarget.copy(target);
      this.camera.position.copy(this.desiredPosition);
      this.initialized = true;
    }

    this.shakeTime += deltaTime * (7 + speedFactor * 15);
    if (speedFactor > 0.05) {
      const shake = speedFactor * 0.035;
      this.desiredPosition.x += Math.sin(this.shakeTime * 1.71) * shake;
      this.desiredPosition.y += Math.sin(this.shakeTime * 2.33) * shake;
    }
    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-deltaTime * 6.5));

    const lookAhead = velocity.clone().multiplyScalar(0.045 + speedFactor * 0.025);
    lookAhead.y *= 0.2;
    const lookTarget = this.currentTarget.clone().add(lookAhead);
    this.lookMatrix.lookAt(this.camera.position, lookTarget, this.worldUp);
    this.targetQuaternion.setFromRotationMatrix(this.lookMatrix);
    this.currentRoll = THREE.MathUtils.damp(this.currentRoll, -turn * 0.16, 5, deltaTime);
    this.rollQuaternion.setFromAxisAngle(this.rollAxis, this.currentRoll);
    this.targetQuaternion.multiply(this.rollQuaternion);
    if (firstUpdate) this.camera.quaternion.copy(this.targetQuaternion);
    else this.camera.quaternion.slerp(this.targetQuaternion, 1 - Math.exp(-deltaTime * 9));

    const targetFov = THREE.MathUtils.lerp(70, 84, speedFactor);
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 4, deltaTime);
      this.camera.updateProjectionMatrix();
    }
  }

  getForwardVector(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    return forward.normalize();
  }
  getRightVector(): THREE.Vector3 {
    const forward = this.getForwardVector();
    return new THREE.Vector3(-forward.z, 0, forward.x);
  }
  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
