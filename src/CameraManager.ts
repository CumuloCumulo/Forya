import * as THREE from 'three';

export class CameraManager {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;

  private distance: number = 12;
  private heightOffset: number = 4;

  private theta: number = Math.PI;
  private phi: number = Math.PI / 2.5;

  private minPhi: number = 0.1;
  private maxPhi: number = Math.PI / 2 - 0.1;
  private minDistance: number = 5;
  private maxDistance: number = 60;

  private sensitivity: number = 0.002;

  private currentRoll: number = 0;
  private targetRoll: number = 0;

  isLocked: boolean = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(90, aspect, 0.1, 2000);

    this.setupInputs();
  }

  private setupInputs(): void {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isLocked) {
        this.theta -= e.movementX * this.sensitivity;
        this.phi -= e.movementY * this.sensitivity;
        this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi));
      }
    });

    document.addEventListener('wheel', (e: WheelEvent) => {
      if (this.isLocked) {
        this.distance += e.deltaY * 0.01;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }

  update(playerPos: THREE.Vector3, deltaTime: number, turnFactor: number = 0): void {
    if (!playerPos) return;

    const target = new THREE.Vector3(playerPos.x, playerPos.y + this.heightOffset, playerPos.z);

    const x = this.distance * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.distance * Math.cos(this.phi);
    const z = this.distance * Math.sin(this.phi) * Math.cos(this.theta);

    const desiredPos = target.clone().add(new THREE.Vector3(x, y, z));

    const lerpFactor = 15 * deltaTime;
    this.camera.position.lerp(desiredPos, lerpFactor);

    const targetQuaternion = new THREE.Quaternion();
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.lookAt(this.camera.position, target, new THREE.Vector3(0, 1, 0));
    targetQuaternion.setFromRotationMatrix(rotationMatrix);

    const maxRoll = 0.3;
    this.targetRoll = -turnFactor * maxRoll;
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, 5 * deltaTime);

    const rollQuat = new THREE.Quaternion();
    rollQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentRoll);
    targetQuaternion.multiply(rollQuat);

    if (this.camera.quaternion.angleTo(targetQuaternion) > 1.0) {
      this.camera.quaternion.copy(targetQuaternion);
    } else {
      const rotLerpFactor = 15 * deltaTime;
      this.camera.quaternion.slerp(targetQuaternion, rotLerpFactor);
    }
  }

  getForwardVector(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    return forward;
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
