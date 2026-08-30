import * as THREE from 'three';

interface HeightProvider { getHeightAt(x: number, z: number): number; }

export class RouteSystem {
  private checkpoints: THREE.Group[] = [];
  private current = 0;
  private elapsed = 0;
  private readonly ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd7ff45, emissive: 0x7fa51a, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.12 });
  private readonly inactiveMaterial = new THREE.MeshStandardMaterial({ color: 0x8cecff, emissive: 0x166078, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.38 });

  constructor(private scene: THREE.Scene, world: HeightProvider) {
    const route = [
      [0, 260, 82], [140, 590, 105], [-90, 960, 135], [-340, 1360, 92],
      [-120, 1780, 150], [270, 2230, 118], [540, 2720, 165], [110, 3280, 102],
    ];
    route.forEach(([x, z, clearance], index) => {
      const y = world.getHeightAt(x, z) + clearance;
      const gate = this.createGate(index);
      gate.position.set(x, y, z);
      const next = route[Math.min(index + 1, route.length - 1)];
      gate.rotation.y = Math.atan2(next[0] - x, next[1] - z);
      scene.add(gate);
      this.checkpoints.push(gate);
    });
    this.refreshMaterials();
  }

  private createGate(index: number): THREE.Group {
    const gate = new THREE.Group();
    gate.name = `checkpoint-${index + 1}`;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.62, 8, 56), this.inactiveMaterial);
    ring.castShadow = true;
    gate.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(12.2, 0.07, 5, 56), new THREE.MeshBasicMaterial({ color: 0xcff9ff, transparent: true, opacity: 0.55 }));
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

  update(playerPosition: THREE.Vector3, deltaTime: number): void {
    this.elapsed += deltaTime;
    this.checkpoints.forEach((gate, index) => {
      const ring = gate.userData.ring as THREE.Mesh;
      const active = index === this.current;
      const pulse = active ? 1 + Math.sin(this.elapsed * 4) * 0.035 : 1;
      ring.scale.setScalar(pulse);
      gate.rotation.z = active ? Math.sin(this.elapsed * 0.9) * 0.025 : 0;
    });
    const target = this.checkpoints[this.current];
    if (target && playerPosition.distanceTo(target.position) < 15) {
      this.current++;
      this.refreshMaterials();
    }
  }

  private refreshMaterials(): void {
    this.checkpoints.forEach((gate, index) => {
      const material = index === this.current ? this.ringMaterial : this.inactiveMaterial;
      gate.children.forEach(child => {
        if ((child as THREE.Mesh).isMesh && child !== gate.children[1]) (child as THREE.Mesh).material = material;
      });
      gate.visible = index >= this.current - 1 && index <= this.current + 2;
    });
  }

  getProgress(): number { return this.current; }
  getTotal(): number { return this.checkpoints.length; }
  setVisible(visible: boolean): void {
    if (visible) this.refreshMaterials();
    else this.checkpoints.forEach(gate => { gate.visible = false; });
  }
  getDistance(position: THREE.Vector3): number {
    return this.checkpoints[this.current]?.position.distanceTo(position) ?? Number.POSITIVE_INFINITY;
  }
}
