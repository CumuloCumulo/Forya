import * as THREE from 'three';
import { createTerrainMaterial } from './TerrainMaterial';
import { TerrainWorkerPool } from './TerrainWorkerPool';

/**
 * Coarse horizon mesh surrounding the streamed collision chunks.
 * It remains underneath the detailed chunks and covers the center as well, so it also
 * masks temporary holes while collision chunks are still streaming in.
 */
export class FarTerrain {
  private readonly layers: FarTerrainLayer[];

  constructor(
    scene: THREE.Scene,
    private readonly workerPool: TerrainWorkerPool,
    private readonly seed: number,
  ) {
    this.layers = [
      new FarTerrainLayer(scene, workerPool, seed, {
        name: 'far-terrain-midfield',
        size: 3600,
        resolution: 180,
        snapDistance: 240,
        verticalOffset: -2.5,
        innerHoleSize: 0,
        renderOrder: -4,
      }),
      new FarTerrainLayer(scene, workerPool, seed, {
        name: 'far-terrain-horizon',
        size: 10000,
        resolution: 200,
        snapDistance: 600,
        verticalOffset: -8,
        innerHoleSize: 2400,
        renderOrder: -5,
      }),
    ];
  }

  update(focus: { x: number; z: number }): void {
    for (const layer of this.layers) layer.update(focus);
  }

  dispose(): void {
    for (const layer of this.layers) layer.dispose();
  }
}

interface FarTerrainLayerConfig {
  name: string;
  size: number;
  resolution: number;
  snapDistance: number;
  verticalOffset: number;
  innerHoleSize: number;
  renderOrder: number;
}

class FarTerrainLayer {
  private readonly mesh: THREE.Mesh;
  private desiredX = Number.NaN;
  private desiredZ = Number.NaN;
  private building = false;

  constructor(
    scene: THREE.Scene,
    private readonly workerPool: TerrainWorkerPool,
    private readonly seed: number,
    private readonly config: FarTerrainLayerConfig,
  ) {
    const material = createTerrainMaterial();
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.depthWrite = true;

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.name = config.name;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = config.renderOrder;
    scene.add(this.mesh);
  }

  update(focus: { x: number; z: number }): void {
    const nextX = Math.round(focus.x / this.config.snapDistance) * this.config.snapDistance;
    const nextZ = Math.round(focus.z / this.config.snapDistance) * this.config.snapDistance;
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
        size: this.config.size,
        resolution: this.config.resolution,
        verticalOffset: this.config.verticalOffset,
        innerHoleSize: this.config.innerHoleSize,
      }, 1);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.computeBoundingSphere();
      const previous = this.mesh.geometry;
      this.mesh.geometry = geometry;
      previous.dispose();
    } catch (error) {
      console.error(`Unable to build ${this.config.name}`, error);
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
