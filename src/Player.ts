import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface PhysicsWorldInterface {
  addPlayerBody(position: { x: number; y: number; z: number }, radius: number): CANNON.Body;
  addBody(body: CANNON.Body): void;
  removeBody(body: CANNON.Body): void;
  update(deltaTime: number): void;
}

interface WorldManagerInterface {
  getHeightAt(x: number, z: number): number;
}

export class Player {
  private scene: THREE.Scene;
  private physics: PhysicsWorldInterface;

  speed: number = 30;
  sprintSpeed: number = 80;
  private flySpeed: number = 15;
  private glideSpeed: number = 100;
  currentSpeed: number = this.speed;

  private radius: number = 0.6;

  isSprinting: boolean = false;
  isFlying: boolean = false;
  isMoving: boolean = false;
  private targetRotation: number = 0;

  private wingAngle: number = 0;
  private flapSpeed: number = 0;

  mesh: THREE.Group;
  private leftWing!: THREE.Group;
  private rightWing!: THREE.Group;
  body: CANNON.Body;
  private trails: THREE.Mesh[] = [];
  private trailTime: number = 0;

  constructor(scene: THREE.Scene, physics: PhysicsWorldInterface) {
    this.scene = scene;
    this.physics = physics;

    this.mesh = new THREE.Group();
    this.createMesh();

    this.body = physics.addPlayerBody({ x: 0, y: 10, z: 0 }, this.radius);
  }

  private createMesh(): void {
    const colors = {
      primary: 0x29b6f6,
      secondary: 0x0277bd,
      belly: 0xe1f5fe,
      beak: 0xffca28,
      crest: 0xffffff
    };

    // 1. Body
    const bodyGeo = new THREE.SphereGeometry(0.4, 12, 12);
    bodyGeo.scale(0.8, 0.9, 1.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colors.primary,
      roughness: 0.7,
      flatShading: true
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.5;
    bodyMesh.castShadow = true;
    this.mesh.add(bodyMesh);

    // Belly
    const bellyGeo = new THREE.SphereGeometry(0.36, 10, 10);
    bellyGeo.scale(0.8, 0.8, 1.3);
    const bellyMat = new THREE.MeshStandardMaterial({ color: colors.belly, flatShading: true });
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0, 0.45, 0.05);
    this.mesh.add(belly);

    // 2. Head
    const headGeo = new THREE.SphereGeometry(0.3, 10, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: colors.primary, flatShading: true });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.9, 0.4);
    head.castShadow = true;
    this.mesh.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x212121 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(0.18, 0.95, 0.6);
    this.mesh.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(-0.18, 0.95, 0.6);
    this.mesh.add(rightEye);

    // 3. Beak
    const beakGeo = new THREE.ConeGeometry(0.08, 0.3, 8);
    const beakMat = new THREE.MeshStandardMaterial({ color: colors.beak, flatShading: true });
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.9, 0.75);
    this.mesh.add(beak);

    // 4. Crest feathers
    const crestGeo = new THREE.ConeGeometry(0.06, 0.25, 4);
    crestGeo.rotateX(-0.5);
    const crestMat = new THREE.MeshStandardMaterial({ color: colors.crest, flatShading: true });

    const crest1 = new THREE.Mesh(crestGeo, crestMat);
    crest1.position.set(0, 1.15, 0.4);
    this.mesh.add(crest1);

    const crest2 = crest1.clone();
    crest2.scale.set(0.8, 0.8, 0.8);
    crest2.rotation.x = -0.3;
    crest2.position.set(0, 1.1, 0.25);
    this.mesh.add(crest2);

    // 5. Wings
    this.leftWing = new THREE.Group();
    this.rightWing = new THREE.Group();

    const wingGeo = new THREE.BufferGeometry();
    const t = 0.05;
    const wingVertices = new Float32Array([
      0, t, 0,    0.5, t, 0.3,   0, t, 0.5,
      0.5, t, 0.3,  0.9, t, 0.15,  0, t, 0.5,
      0.9, t, 0.15,  1.2, t, -0.1,  0, t, 0.5,
      1.2, t, -0.1,  1.3, t, -0.3,  0.5, t, 0.15,
      0, -t, 0,   0, -t, 0.5,   0.5, -t, 0.3,
      0.5, -t, 0.3,  0, -t, 0.5,  0.9, -t, 0.15,
      0.9, -t, 0.15,  0, -t, 0.5,  1.2, -t, -0.1,
      1.2, -t, -0.1,  0.5, -t, 0.15,  1.3, -t, -0.3,
    ]);
    const wingIndices = [
      0, 1, 2,   3, 4, 5,   6, 7, 8,   9, 10, 11,
      12, 13, 14,  15, 16, 17,  18, 19, 20,  21, 22, 23,
    ];
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
    wingGeo.setIndex(wingIndices);
    wingGeo.computeVertexNormals();

    const wingMat = new THREE.MeshStandardMaterial({
      color: colors.secondary,
      side: THREE.DoubleSide,
      flatShading: true
    });

    const lWingMesh = new THREE.Mesh(wingGeo, wingMat);
    const rWingMesh = new THREE.Mesh(wingGeo, wingMat);
    rWingMesh.scale.x = -1;

    this.leftWing.add(lWingMesh);
    this.rightWing.add(rWingMesh);

    this.leftWing.position.set(0.2, 0.6, 0.2);
    this.rightWing.position.set(-0.2, 0.6, 0.2);

    this.mesh.add(this.leftWing);
    this.mesh.add(this.rightWing);

    // 6. Tail feathers
    const tailGeo = new THREE.ConeGeometry(0.2, 0.6, 4);
    tailGeo.scale(1, 0.2, 1);
    const tailMat = new THREE.MeshStandardMaterial({ color: colors.secondary, flatShading: true });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, 0.5, -0.8);
    tail.rotation.x = -Math.PI / 2 + 0.3;
    this.mesh.add(tail);

    // 7. Spotlight
    const light = new THREE.SpotLight(0xffffff, 2, 25, 0.6, 0.5, 1);
    light.position.set(0, 0.8, 0.5);
    light.target.position.set(0, 0, 6);
    this.mesh.add(light);
    this.mesh.add(light.target);

    // 8. Flight trails
    this.trails = [];
    this.trailTime = 0;
    for (let i = 0; i < 4; i++) {
      const scale = 1.0 - i * 0.2;
      const opacity = 0.7 - i * 0.15;
      const trailGeo = new THREE.SphereGeometry(0.08 * scale, 6, 6);
      const trailMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: opacity
      });
      const trail = new THREE.Mesh(trailGeo, trailMat);
      trail.position.set(0, 0.4, -0.9 - i * 0.25);
      trail.visible = false;
      this.mesh.add(trail);
      this.trails.push(trail);
    }

    this.scene.add(this.mesh);
  }

  setSprinting(isSprinting: boolean): void {
    this.isSprinting = isSprinting;
    if (this.body.velocity.y >= 0) {
      this.currentSpeed = isSprinting ? this.sprintSpeed : this.speed;
    }
  }

  setFlying(isFlying: boolean): void {
    this.isFlying = isFlying;
    this.trails.forEach(t => t.visible = isFlying);
  }

  move(direction: THREE.Vector3, deltaTime: number): void {
    const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    this.isMoving = len > 0;

    let targetVx = 0;
    let targetVz = 0;

    if (this.isMoving) {
      const dx = direction.x / len;
      const dz = direction.z / len;
      targetVx = dx * this.currentSpeed;
      targetVz = dz * this.currentSpeed;
      this.targetRotation = Math.atan2(dx, dz);
    }

    const hLerp = 5 * deltaTime;
    this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, targetVx, hLerp);
    this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, targetVz, hLerp);

    if (this.isFlying) {
      const maxVerticalSpeed = 80;
      this.body.velocity.y += 80 * deltaTime;
      if (this.body.velocity.y > maxVerticalSpeed) {
        this.body.velocity.y = maxVerticalSpeed;
      }
    } else {
      if (this.body.velocity.y < 0) {
        if (this.isMoving) {
          const dropSpeed = Math.abs(this.body.velocity.y);
          const glideBoost = Math.min(dropSpeed * 0.8, 20);
          const targetGlideSpeed = (this.isSprinting ? this.sprintSpeed : this.speed) + glideBoost;
          this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetGlideSpeed, 1 * deltaTime);

          const liftFactor = Math.min(this.currentSpeed / this.sprintSpeed, 1.0);
          const terminalVelocity = THREE.MathUtils.lerp(-40, -5, liftFactor);

          if (this.body.velocity.y < terminalVelocity) {
            this.body.velocity.y = THREE.MathUtils.lerp(this.body.velocity.y, terminalVelocity, 3 * deltaTime);
          }
        } else {
          this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.speed, 2 * deltaTime);
        }
      } else {
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.isSprinting ? this.sprintSpeed : this.speed, 5 * deltaTime);
      }
    }

    let rotDiff = this.targetRotation - this.mesh.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.mesh.rotation.y += rotDiff * 8 * deltaTime;

    let targetPitch = 0;
    if (this.isMoving && (this.isSprinting || this.isFlying)) targetPitch = 0.5;
    if (!this.isFlying && this.body.velocity.y < -5 && this.isMoving) targetPitch = 0.8;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitch, 4 * deltaTime);

    let targetRoll = -rotDiff * 0.8;
    targetRoll = Math.max(-0.8, Math.min(0.8, targetRoll));
    if (!this.isMoving) targetRoll = 0;
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRoll, 4 * deltaTime);

    this.animateWings(deltaTime);
  }

  private animateWings(deltaTime: number): void {
    let targetFlapSpeed = 0;
    let flapAmplitude = 0.4;

    if (this.isFlying) {
      targetFlapSpeed = 18;
      flapAmplitude = 0.9;
    } else if (this.isMoving) {
      if (this.body.velocity.y < -2) {
        targetFlapSpeed = 0;
        flapAmplitude = 0;
        this.wingAngle = Math.PI / 2;
      } else {
        targetFlapSpeed = 8;
        flapAmplitude = 0.3;
      }
    } else {
      targetFlapSpeed = 2;
      flapAmplitude = 0.1;
    }

    if (flapAmplitude > 0) {
      this.flapSpeed = THREE.MathUtils.lerp(this.flapSpeed, targetFlapSpeed, 5 * deltaTime);
      this.wingAngle += this.flapSpeed * deltaTime;
      const angle = Math.sin(this.wingAngle) * flapAmplitude;
      this.leftWing.rotation.z = angle;
      this.rightWing.rotation.z = -angle;
    } else {
      this.leftWing.rotation.z = THREE.MathUtils.lerp(this.leftWing.rotation.z, 0, 5 * deltaTime);
      this.rightWing.rotation.z = THREE.MathUtils.lerp(this.rightWing.rotation.z, 0, 5 * deltaTime);
    }
  }

  update(): void {
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.position.y -= 0.4;
  }

  updateTrail(deltaTime: number): void {
    this.trailTime += deltaTime;
    for (let i = 0; i < this.trails.length; i++) {
      const trail = this.trails[i];
      if (!trail.visible) continue;
      trail.position.x = Math.sin(this.trailTime * 8 + i * 1.5) * 0.05;
      trail.position.y = 0.4 + Math.cos(this.trailTime * 6 + i * 1.2) * 0.03;
      const baseOpacity = 0.7 - i * 0.15;
      (trail.material as THREE.MeshBasicMaterial).opacity = baseOpacity * (0.7 + 0.3 * Math.sin(this.trailTime * 10 + i * 2));
    }
  }

  emergencyGroundCheck(worldManager: WorldManagerInterface): void {
    if (this.body.velocity.y < -30) {
      const terrainH = worldManager.getHeightAt(this.body.position.x, this.body.position.z);
      if (this.body.position.y < terrainH + 1) {
        this.body.position.y = terrainH + 1;
        this.body.velocity.y = 0;
      }
    }
  }

  getPosition(): THREE.Vector3 {
    return this.mesh.position;
  }

  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.mesh.position.set(x, y, z);
  }
}
