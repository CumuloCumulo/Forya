import * as THREE from 'three';
import { calculateWaterSkimIntensity } from './gameplay/FlightFeedbackMath';

interface FlightFeedbackInput {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  terrainHeight: number;
  speedKmh: number;
  waterContact: boolean;
}

const WATER_LEVEL = -8;
const PARTICLE_COUNT = 72;

export class FlightFeedback {
  private readonly wakes: THREE.Mesh[] = [];
  private readonly wakeMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly particles: THREE.Points;
  private readonly particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleColors = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleLife = new Float32Array(PARTICLE_COUNT);
  private particleCursor = 0;
  private spawnAccumulator = 0;
  private randomState = 0x9e3779b9;

  constructor(scene: THREE.Scene) {
    const wakeGeometry = new THREE.BufferGeometry();
    wakeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.08, 0, 0, 0.08, 0, 0, -0.58, 0, -1, 0.58, 0, -1,
    ], 3));
    wakeGeometry.setIndex([0, 2, 1, 1, 2, 3]);

    for (let side = 0; side < 2; side++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xb8f7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const wake = new THREE.Mesh(wakeGeometry, material);
      wake.name = side === 0 ? 'water-skim-wake-left' : 'water-skim-wake-right';
      wake.visible = false;
      wake.renderOrder = 4;
      scene.add(wake);
      this.wakes.push(wake);
      this.wakeMaterials.push(material);
    }

    this.particlePositions.fill(-10000);
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(this.particlePositions, 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.BufferAttribute(this.particleColors, 3);
    colors.setUsage(THREE.DynamicDrawUsage);
    particleGeometry.setAttribute('position', positions);
    particleGeometry.setAttribute('color', colors);
    this.particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
      color: 0xffffff,
      vertexColors: true,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.particles.name = 'water-skim-spray';
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 5;
    scene.add(this.particles);
  }

  update(input: FlightFeedbackInput, deltaTime: number): number {
    const dt = Math.min(Math.max(deltaTime, 0), 0.1);
    const skimIntensity = calculateWaterSkimIntensity(
      input.position.y,
      input.terrainHeight,
      input.speedKmh,
      WATER_LEVEL,
    );

    this.updateWakes(input, skimIntensity);
    this.updateParticles(dt);
    if (input.waterContact) this.spawnAccumulator += 12;
    if (skimIntensity > 0.02 || input.waterContact) this.emitSpray(input, Math.max(skimIntensity, input.waterContact ? 1 : 0), dt);
    return skimIntensity;
  }

  private updateWakes(input: FlightFeedbackInput, intensity: number): void {
    const horizontalSpeed = Math.hypot(input.velocity.x, input.velocity.z);
    if (horizontalSpeed < 0.1 || intensity <= 0.01) {
      for (const wake of this.wakes) wake.visible = false;
      return;
    }
    const forwardX = input.velocity.x / horizontalSpeed;
    const forwardZ = input.velocity.z / horizontalSpeed;
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const yaw = Math.atan2(forwardX, forwardZ);
    const length = THREE.MathUtils.lerp(8, 27, intensity);
    for (let index = 0; index < this.wakes.length; index++) {
      const side = index === 0 ? -1 : 1;
      const wake = this.wakes[index];
      wake.visible = true;
      wake.position.set(
        input.position.x + rightX * side * 0.72,
        WATER_LEVEL + 0.12 + index * 0.012,
        input.position.z + rightZ * side * 0.72,
      );
      wake.rotation.y = yaw;
      wake.scale.set(THREE.MathUtils.lerp(0.7, 1.8, intensity), 1, length);
      this.wakeMaterials[index].opacity = intensity * 0.42;
    }
  }

  private emitSpray(input: FlightFeedbackInput, intensity: number, deltaTime: number): void {
    const horizontalSpeed = Math.max(0.1, Math.hypot(input.velocity.x, input.velocity.z));
    const forwardX = input.velocity.x / horizontalSpeed;
    const forwardZ = input.velocity.z / horizontalSpeed;
    const rightX = forwardZ;
    const rightZ = -forwardX;
    this.spawnAccumulator += deltaTime * THREE.MathUtils.lerp(8, 46, intensity);
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator--;
      const index = this.particleCursor++ % PARTICLE_COUNT;
      const offset = (this.random() - 0.5) * 2.8;
      const p = index * 3;
      this.particlePositions[p] = input.position.x + rightX * offset - forwardX * 0.8;
      this.particlePositions[p + 1] = WATER_LEVEL + 0.18;
      this.particlePositions[p + 2] = input.position.z + rightZ * offset - forwardZ * 0.8;
      const sideVelocity = (this.random() - 0.5) * 8;
      this.particleVelocities[p] = -forwardX * horizontalSpeed * 0.12 + rightX * sideVelocity;
      this.particleVelocities[p + 1] = 2.5 + this.random() * 4.5;
      this.particleVelocities[p + 2] = -forwardZ * horizontalSpeed * 0.12 + rightZ * sideVelocity;
      this.particleLife[index] = 0.45 + this.random() * 0.42;
    }
  }

  private updateParticles(deltaTime: number): void {
    for (let index = 0; index < PARTICLE_COUNT; index++) {
      if (this.particleLife[index] <= 0) continue;
      const p = index * 3;
      this.particleLife[index] = Math.max(0, this.particleLife[index] - deltaTime);
      this.particlePositions[p] += this.particleVelocities[p] * deltaTime;
      this.particlePositions[p + 1] += this.particleVelocities[p + 1] * deltaTime;
      this.particlePositions[p + 2] += this.particleVelocities[p + 2] * deltaTime;
      this.particleVelocities[p + 1] -= 7.5 * deltaTime;
      const fade = Math.min(1, this.particleLife[index] * 2.4);
      this.particleColors[p] = 0.52 * fade;
      this.particleColors[p + 1] = 0.88 * fade;
      this.particleColors[p + 2] = fade;
      if (this.particleLife[index] === 0) this.particlePositions[p + 1] = -10000;
    }
    (this.particles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
