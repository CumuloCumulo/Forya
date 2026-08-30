import * as THREE from 'three';
import { createTerrainMaterial } from './TerrainMaterial';
import { TerrainWorkerPool } from './TerrainWorkerPool';

/**
 * Coarse horizon mesh surrounding the streamed collision chunks.
 * It remains underneath the detailed chunks and covers the center as well, so it also
 * masks temporary holes while collision chunks are still streaming in.
 */
export class FarTerrain {
  private readonly mesh: THREE.Mesh;
  private readonly size = 3200;
  private readonly resolution = 160;
  private readonly snapDistance = 240;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;
  private desiredX = Number.NaN;
  private desiredZ = Number.NaN;
  private building = false;

  constructor(
    scene: THREE.Scene,
    private readonly workerPool: TerrainWorkerPool,
    private readonly seed: number,
  ) {
    const material = createTerrainMaterial();
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.depthWrite = true;

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = 'far-terrain-horizon-ring';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -5;
    scene.add(this.mesh);
  }

  update(focus: { x: number; z: number }): void {
    const nextX = Math.round(focus.x / this.snapDistance) * this.snapDistance;
    const nextZ = Math.round(focus.z / this.snapDistance) * this.snapDistance;
    if (nextX === this.desiredX && nextZ === this.desiredZ) return;
    this.desiredX = nextX;
    this.desiredZ = nextZ;
    if (!this.building) void this.rebuild();
  }

  private async rebuild(): Promise<void> {
    this.building = true;
    const targetX = this.desiredX;
    const targetZ = this.desiredZ;
    try {
      const data = await this.workerPool.request({
        kind: 'far',
        seed: this.seed,
        centerX: targetX,
        centerZ: targetZ,
        size: this.size,
        resolution: this.resolution,
        verticalOffset: -2.5,
      }, 1);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.computeBoundingSphere();
      const previous = this.mesh.geometry;
      this.mesh.geometry = geometry;
      previous.dispose();
      this.centerX = targetX;
      this.centerZ = targetZ;
    } catch (error) {
      console.error('Unable to build far terrain', error);
    } finally {
      this.building = false;
      if (targetX !== this.desiredX || targetZ !== this.desiredZ) void this.rebuild();
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
