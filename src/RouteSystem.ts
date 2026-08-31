import * as THREE from 'three';
import { EndlessRoutePlanner } from './gameplay/EndlessRoute';
import type { GameMode } from './gameplay/GameMode';

interface HeightProvider { getHeightAt(x: number, z: number): number; }
interface Checkpoint { sequence: number; gate: THREE.Group; }

export class RouteSystem {
  private readonly scene: THREE.Scene;
  private readonly world: HeightProvider;
  private checkpoints: Checkpoint[] = [];
  private passed = 0;
  private elapsed = 0;
  private mode: GameMode = 'free';
  private readonly planner = new EndlessRoutePlanner();
  private readonly ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd7ff45, emissive: 0x7fa51a, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.12 });
  private readonly inactiveMaterial = new THREE.MeshBasicMaterial({ color: 0x9cefff, transparent: true, opacity: 0.68, depthTest: false, depthWrite: false });
  private readonly innerMaterial = new THREE.MeshBasicMaterial({ color: 0xcff9ff, transparent: true, opacity: 0.55 });

  constructor(scene: THREE.Scene, world: HeightProvider) {
    this.scene = scene;
    this.world = world;
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    this.clear();
    this.passed = 0;
    this.elapsed = 0;
    this.planner.reset();
    if (mode === 'checkpoint') this.ensureAhead();
  }

  restart(): void {
    this.setMode(this.mode);
  }

  update(playerPosition: THREE.Vector3, deltaTime: number): boolean {
    if (this.mode !== 'checkpoint') return false;
    this.elapsed += deltaTime;
    this.checkpoints.forEach(({ gate }, index) => {
      const ring = gate.userData.ring as THREE.Mesh;
      const active = index === 0;
      const pulse = active ? 1 + Math.sin(this.elapsed * 4) * 0.035 : 1;
      ring.scale.setScalar(pulse);
      gate.rotation.z = active ? Math.sin(this.elapsed * 0.9) * 0.025 : 0;
    });

    const target = this.checkpoints[0];
    if (!target || playerPosition.distanceTo(target.gate.position) >= 15) return false;

    this.removeCheckpoint(target);
    this.checkpoints.shift();
    this.passed++;
    this.ensureAhead();
    this.refreshMaterials();
    return true;
  }

  private ensureAhead(): void {
    while (this.checkpoints.length < 5) {
      const point = this.planner.next((x, z) => this.world.getHeightAt(x, z));
      const gate = this.createGate(point.sequence);
      gate.position.set(point.x, point.y, point.z);
      gate.rotation.y = point.heading;
      this.scene.add(gate);
      this.checkpoints.push({ sequence: point.sequence, gate });
    }
    this.refreshMaterials();
  }

  private createGate(sequence: number): THREE.Group {
    const gate = new THREE.Group();
    gate.name = `checkpoint-${sequence}`;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.62, 8, 56), this.inactiveMaterial);
    ring.castShadow = true;
    gate.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(12.2, 0.07, 5, 56), this.innerMaterial);
    gate.add(inner);
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 8, 6), this.inactiveMaterial);
      marker.position.set(side * 15.1, -12.2, 0);
      marker.rotation.z = side * 0.13;
      gate.add(marker);
    }
    gate.userData.ring = ring;
    return gate;
  }

  private refreshMaterials(): void {
    this.checkpoints.forEach(({ gate }, index) => {
      const material = index === 0 ? this.ringMaterial : this.inactiveMaterial;
      gate.children.forEach(child => {
        if ((child as THREE.Mesh).isMesh && child !== gate.children[1]) (child as THREE.Mesh).material = material;
      });
      gate.visible = index <= 2;
      gate.renderOrder = index === 1 ? 20 : 0;
    });
  }

  private removeCheckpoint(checkpoint: Checkpoint): void {
    checkpoint.gate.removeFromParent();
    checkpoint.gate.traverse(object => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
    });
  }

  private clear(): void {
    for (const checkpoint of this.checkpoints) this.removeCheckpoint(checkpoint);
    this.checkpoints.length = 0;
  }

  getProgress(): number { return this.passed; }
  getNextSequence(): number { return this.checkpoints[0]?.sequence ?? this.passed + 1; }
  getTotal(): number | null { return this.mode === 'checkpoint' ? null : 0; }
  getDistance(position: THREE.Vector3): number {
    return this.checkpoints[0]?.gate.position.distanceTo(position) ?? Number.POSITIVE_INFINITY;
  }
}
