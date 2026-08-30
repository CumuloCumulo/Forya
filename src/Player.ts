import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface PhysicsWorldInterface {
  addPlayerBody(position: { x: number; y: number; z: number }, radius: number): CANNON.Body;
}
interface WorldManagerInterface { getHeightAt(x: number, z: number): number; }

export class Player {
  readonly mesh = new THREE.Group();
  readonly body: CANNON.Body;
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private wingSuit!: THREE.Mesh;
  private wingSuitOpenPositions = new Float32Array();
  private wingSuitTuckedPositions = new Float32Array();
  private speedPose = 0;
  private targetRotation = 0;
  private turnAmount = 0;
  private boost = 1;
  private sprinting = false;
  private flaring = false;
  private moving = false;
  private speed = 27;
  private trailTime = 0;
  private contrails: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, physics: PhysicsWorldInterface) {
    this.mesh.name = 'wingsuit-rider';
    this.createRider();
    scene.add(this.mesh);
    this.body = physics.addPlayerBody({ x: 0, y: 10, z: 0 }, 0.72);
    this.body.linearDamping = 0.045;
  }

  private material(color: number, roughness = 0.62, metalness = 0.02): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private createRider(): void {
    const charcoal = this.material(0x101820, 0.5);
    const orange = this.material(0xe95b36, 0.46);
    const navy = this.material(0x173849, 0.62);
    const accent = this.material(0xe7ece7, 0.5);
    const signal = this.material(0xd7ff45, 0.4);
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x071b28, roughness: 0.08, metalness: 0.52, clearcoat: 1, clearcoatRoughness: 0.06 });

    // Prone torso: the long axis follows local +Z, the direction of flight.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.76, 7, 14), orange);
    torso.scale.set(0.94, 0.72, 1);
    torso.position.set(0, 0.14, 0.05);
    torso.rotation.x = Math.PI / 2;
    torso.castShadow = true;
    torso.name = 'rider-torso';
    this.mesh.add(torso);

    const shoulder = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.52, 5, 12), navy);
    shoulder.rotation.z = Math.PI / 2;
    shoulder.scale.set(1, 0.95, 0.72);
    shoulder.position.set(0, 0.18, 0.28);
    shoulder.castShadow = true;
    shoulder.name = 'rider-shoulder-bridge';
    this.mesh.add(shoulder);

    const hip = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.28, 5, 10), charcoal);
    hip.rotation.z = Math.PI / 2;
    hip.position.set(0, 0.06, -0.43);
    hip.name = 'rider-hip';
    this.mesh.add(hip);

    // The pack sits above the spine, not behind the rider along the flight axis.
    const backpack = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.48, 5, 12), charcoal);
    backpack.rotation.x = Math.PI / 2;
    backpack.scale.set(1.05, 0.55, 1);
    backpack.position.set(0, 0.39, -0.05);
    backpack.castShadow = true;
    backpack.name = 'rider-flight-pack';
    this.mesh.add(backpack);
    const packPanel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.42), signal);
    packPanel.position.set(0, 0.55, -0.04);
    packPanel.rotation.x = 0.04;
    packPanel.name = 'rider-pack-signal-panel';
    this.mesh.add(packPanel);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 24, 16), accent);
    helmet.scale.set(0.93, 0.94, 1.08);
    helmet.position.set(0, 0.34, 0.72);
    helmet.castShadow = true;
    helmet.name = 'rider-helmet';
    this.mesh.add(helmet);
    const helmetCap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), orange);
    helmetCap.position.copy(helmet.position);
    helmetCap.scale.copy(helmet.scale);
    helmetCap.rotation.x = -0.12;
    helmetCap.name = 'rider-helmet-shell';
    this.mesh.add(helmetCap);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.222, 20, 12, -1.03, 2.06, 0.48, 1.2), visor);
    face.position.set(0, 0.34, 0.79);
    face.rotation.x = -0.12;
    face.name = 'rider-visor';
    this.mesh.add(face);

    this.leftArm = this.createArm(-1, orange, charcoal);
    this.rightArm = this.createArm(1, orange, charcoal);
    this.leftLeg = this.createLeg(-1, navy, charcoal);
    this.rightLeg = this.createLeg(1, navy, charcoal);
    this.mesh.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);

    const wingGeometry = new THREE.BufferGeometry();
    this.wingSuitOpenPositions = new Float32Array([
      -0.18,0.2,0.34, -1.28,0.12,-0.02, -0.37,0.02,-0.56,
      -0.18,0.2,0.34, -0.37,0.02,-0.56, 0.37,0.02,-0.56,
       0.18,0.2,0.34,  0.37,0.02,-0.56,  1.28,0.12,-0.02,
      -0.34,0.03,-0.48, -0.21,-0.01,-1.42, 0.0,0.0,-0.72,
       0.34,0.03,-0.48,  0.0,0.0,-0.72, 0.21,-0.01,-1.42,
    ]);
    this.wingSuitTuckedPositions = new Float32Array([
      -0.18,0.2,0.34, -0.48,0.1,-0.72, -0.34,0.02,-0.58,
      -0.18,0.2,0.34, -0.34,0.02,-0.58, 0.34,0.02,-0.58,
       0.18,0.2,0.34,  0.34,0.02,-0.58,  0.48,0.1,-0.72,
      -0.3,0.03,-0.5, -0.12,-0.01,-1.42, 0.0,0.0,-0.78,
       0.3,0.03,-0.5,  0.0,0.0,-0.78, 0.12,-0.01,-1.42,
    ]);
    const wingPositions = new THREE.BufferAttribute(this.wingSuitOpenPositions.slice(), 3);
    wingPositions.setUsage(THREE.DynamicDrawUsage);
    wingGeometry.setAttribute('position', wingPositions);
    wingGeometry.computeVertexNormals();
    this.wingSuit = new THREE.Mesh(wingGeometry, new THREE.MeshStandardMaterial({ color: 0x1b7180, roughness: 0.78, side: THREE.DoubleSide }));
    this.wingSuit.castShadow = true;
    this.wingSuit.name = 'rider-wingsuit-membrane';
    this.mesh.add(this.wingSuit);

    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 1.32), accent);
    seam.position.set(0, 0.2, -0.06);
    seam.name = 'rider-center-seam';
    this.mesh.add(seam);

    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.62), signal);
      stripe.position.set(side * 0.18, 0.25, 0.03);
      stripe.name = side < 0 ? 'rider-left-signal-stripe' : 'rider-right-signal-stripe';
      this.mesh.add(stripe);
    }

    const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xb8f7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const x of [-0.22, 0.22]) {
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.12, 4.8, 7, 1, true), trailMaterial.clone());
      trail.rotation.x = Math.PI / 2;
      trail.position.set(x, 0.02, -3.7);
      trail.name = x < 0 ? 'rider-left-contrail' : 'rider-right-contrail';
      this.mesh.add(trail);
      this.contrails.push(trail);
    }

    this.mesh.userData.modelManifest = {
      subject: 'powered wingsuit athlete',
      signature: ['prone human silhouette', 'back-mounted flight pack', 'arm-to-hip membranes', 'split tail membrane', 'helmet and visor'],
      semanticParts: ['torso', 'helmet', 'visor', 'flight-pack', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'wingsuit-membrane', 'contrails'],
      forwardAxis: '+Z',
      generationMethod: 'procedural hierarchical scene graph',
    };
  }

  private createArm(side: number, suitMaterial: THREE.Material, gloveMaterial: THREE.Material): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'rider-left-arm' : 'rider-right-arm';
    pivot.position.set(side * 0.26, 0.2, 0.27);
    pivot.rotation.y = side * -0.12;

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.43, 5, 10), suitMaterial);
    upper.rotation.z = Math.PI / 2;
    upper.position.set(side * 0.3, 0, -0.01);
    upper.castShadow = true;
    pivot.add(upper);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 5, 10), suitMaterial);
    forearm.rotation.z = Math.PI / 2;
    forearm.position.set(side * 0.76, -0.025, -0.12);
    forearm.castShadow = true;
    pivot.add(forearm);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), gloveMaterial);
    glove.scale.set(1.3, 0.68, 0.85);
    glove.position.set(side * 1.03, -0.03, -0.18);
    pivot.add(glove);
    return pivot;
  }

  private createLeg(side: number, suitMaterial: THREE.Material, bootMaterial: THREE.Material): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'rider-left-leg' : 'rider-right-leg';
    pivot.position.set(side * 0.18, 0.03, -0.4);
    pivot.rotation.y = side * -0.08;

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 5, 10), suitMaterial);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(side * 0.025, 0, -0.31);
    thigh.castShadow = true;
    pivot.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.44, 5, 10), suitMaterial);
    shin.rotation.x = Math.PI / 2;
    shin.position.set(side * 0.055, -0.015, -0.78);
    shin.castShadow = true;
    pivot.add(shin);

    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.24, 5, 10), bootMaterial);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(0.9, 0.72, 1.15);
    boot.position.set(side * 0.07, -0.035, -1.15);
    pivot.add(boot);
    return pivot;
  }

  setSprinting(value: boolean): void { this.sprinting = value && this.boost > 0.02; }
  setFlying(value: boolean): void { this.flaring = value; }

  move(direction: THREE.Vector3, deltaTime: number): void {
    this.speedPose = THREE.MathUtils.damp(this.speedPose, this.sprinting ? 1 : 0, 5.6, deltaTime);
    const turnRate = this.sprinting ? 0.55 : THREE.MathUtils.lerp(3.4, 0.55, this.speedPose);
    const horizontalLength = Math.hypot(direction.x, direction.z);
    this.moving = horizontalLength > 0.01;
    if (this.moving) {
      direction.x /= horizontalLength;
      direction.z /= horizontalLength;
      const desiredRotation = Math.atan2(direction.x, direction.z);
      let inputDiff = desiredRotation - this.targetRotation;
      while (inputDiff > Math.PI) inputDiff -= Math.PI * 2;
      while (inputDiff < -Math.PI) inputDiff += Math.PI * 2;
      this.targetRotation += THREE.MathUtils.clamp(inputDiff, -turnRate * deltaTime, turnRate * deltaTime);
    }

    const descentEnergy = THREE.MathUtils.clamp(-this.body.velocity.y / 36, 0, 1);
    const targetSpeed = this.sprinting ? 76 : 36 + descentEnergy * 18;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 2.2, deltaTime);
    if (this.sprinting) this.boost = Math.max(0, this.boost - deltaTime * 0.11);
    else this.boost = Math.min(1, this.boost + deltaTime * 0.09);

    const forwardX = Math.sin(this.targetRotation);
    const forwardZ = Math.cos(this.targetRotation);
    this.body.velocity.x = THREE.MathUtils.damp(this.body.velocity.x, forwardX * this.speed, 3.1, deltaTime);
    this.body.velocity.z = THREE.MathUtils.damp(this.body.velocity.z, forwardZ * this.speed, 3.1, deltaTime);

    const climbing = this.flaring && !this.sprinting;
    if (this.sprinting) {
      // The streamlined boost pose trades lift for speed. Space remains held safely,
      // but cannot produce an implausible climb until boost is released.
      this.body.velocity.y = THREE.MathUtils.damp(this.body.velocity.y, -4.5, 3.8, deltaTime);
    } else if (climbing) {
      // Powered free flight: Space is deliberate climb, not merely a landing flare.
      // The impulse exceeds gravity so the player can choose and hold a positive climb rate.
      this.body.velocity.y = Math.min(38, this.body.velocity.y + 72 * deltaTime);
    } else if (this.body.velocity.y < -7) {
      // Aerodynamic lift counters most of gravity and settles near a shallow glide rate.
      this.body.velocity.y = Math.min(-7, this.body.velocity.y + 46 * deltaTime);
    }

    let rotationDiff = this.targetRotation - this.mesh.rotation.y;
    while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
    while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
    this.turnAmount = THREE.MathUtils.damp(this.turnAmount, THREE.MathUtils.clamp(rotationDiff * 2.4, -1, 1), 5, deltaTime);
    const visualTurnAuthority = THREE.MathUtils.lerp(1, 0.38, this.speedPose);
    this.mesh.rotation.y += rotationDiff * Math.min(1, deltaTime * 6.5 * visualTurnAuthority);
    this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, -this.turnAmount * 0.72, 5.2, deltaTime);
    const climbFactor = THREE.MathUtils.clamp(this.body.velocity.y / 38, 0, 1);
    const pitch = climbing ? THREE.MathUtils.lerp(-0.16, -0.42, climbFactor) : THREE.MathUtils.lerp(0.06, 0.4, descentEnergy);
    this.mesh.rotation.x = THREE.MathUtils.damp(this.mesh.rotation.x, pitch, 3.5, deltaTime);

    // Shift transitions from a stable wide-wing glide into a streamlined speed pose.
    // The arms sweep alongside the torso and the fabric collapses with them instead of
    // leaving a rigid triangular membrane behind.
    const flareRoll = climbing ? -0.2 : 0;
    this.leftArm.rotation.z = THREE.MathUtils.damp(this.leftArm.rotation.z, flareRoll, 5, deltaTime);
    this.rightArm.rotation.z = THREE.MathUtils.damp(this.rightArm.rotation.z, -flareRoll, 5, deltaTime);
    this.leftArm.rotation.y = THREE.MathUtils.damp(this.leftArm.rotation.y, THREE.MathUtils.lerp(0.12, -1.08, this.speedPose), 7, deltaTime);
    this.rightArm.rotation.y = THREE.MathUtils.damp(this.rightArm.rotation.y, THREE.MathUtils.lerp(-0.12, 1.08, this.speedPose), 7, deltaTime);
    const legSpread = THREE.MathUtils.lerp(0.13, 0.045, this.speedPose);
    this.leftLeg.rotation.z = THREE.MathUtils.damp(this.leftLeg.rotation.z, -legSpread - this.turnAmount * 0.08, 4, deltaTime);
    this.rightLeg.rotation.z = THREE.MathUtils.damp(this.rightLeg.rotation.z, legSpread - this.turnAmount * 0.08, 4, deltaTime);
    this.updateWingSuitPose();
  }

  private updateWingSuitPose(): void {
    const attribute = this.wingSuit.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    for (let i = 0; i < positions.length; i++) {
      positions[i] = THREE.MathUtils.lerp(this.wingSuitOpenPositions[i], this.wingSuitTuckedPositions[i], this.speedPose);
    }
    attribute.needsUpdate = true;
    this.wingSuit.geometry.computeVertexNormals();
  }

  update(): void {
    this.mesh.position.set(this.body.position.x, this.body.position.y - 0.15, this.body.position.z);
  }

  updateTrail(deltaTime: number): void {
    this.trailTime += deltaTime;
    const intensity = THREE.MathUtils.clamp((this.getSpeedKmh() - 120) / 100, 0, 0.7) * (0.8 + Math.sin(this.trailTime * 11) * 0.12);
    this.contrails.forEach((trail) => { (trail.material as THREE.MeshBasicMaterial).opacity = intensity; });
  }

  emergencyGroundCheck(world: WorldManagerInterface): void {
    const terrain = world.getHeightAt(this.body.position.x, this.body.position.z);
    if (this.body.position.y < terrain + 1.2) {
      this.body.position.y = terrain + 1.2;
      if (this.body.velocity.y < 0) this.body.velocity.y = Math.min(7, Math.abs(this.body.velocity.y) * 0.12);
    }
  }

  getPosition(): THREE.Vector3 { return this.mesh.position; }
  getVelocity(): THREE.Vector3 { return new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z); }
  getSpeedKmh(): number { return Math.hypot(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z) * 3.6; }
  getBoost(): number { return this.boost; }
  getTurnAmount(): number { return this.turnAmount; }
  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, -2, 25);
    this.mesh.position.set(x, y, z);
    this.targetRotation = 0;
    this.speedPose = 0;
    this.mesh.rotation.set(0, 0, 0);
  }
}
