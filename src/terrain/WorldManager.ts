// WorldManager - Manages chunk loading/unloading with density field terrain
import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk';
import { TerrainPipeline } from './TerrainPipeline';

interface PhysicsWorldInterface {
  addBody(body: unknown): void;
  removeBody(body: unknown): void;
}

export class WorldManager {
  private scene: THREE.Scene;
  private physicsWorld: PhysicsWorldInterface;
  private chunks: Map<string, TerrainChunk>;
  private pipeline: TerrainPipeline;

  private chunkSize: number;
  private lod0Distance: number;
  private lod1Distance: number;
  private renderDistance: number;

  private currentChunk: { x: number | null; z: number | null };
  private pendingChunks: { cx: number; cz: number; lodLevel: number; dist: number; replace?: string }[];
  private maxChunksPerFrame: number;

  private heightCache: Map<string, number>;
  private heightCacheGrid: number;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorldInterface, seed: number = 42) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.chunks = new Map();
    this.pipeline = new TerrainPipeline(seed);

    this.chunkSize = 60;
    this.lod0Distance = 3;
    this.lod1Distance = 5;
    this.renderDistance = 8;

    this.currentChunk = { x: null, z: null };

    this.pendingChunks = [];
    this.maxChunksPerFrame = 2;

    this.heightCache = new Map();
    this.heightCacheGrid = 0.5;
  }

  getTerrainPipeline(): TerrainPipeline {
    return this.pipeline;
  }

  update(playerPos: { x: number; z: number }, deltaTime: number): void {
    this.heightCache.clear();

    for (const chunk of this.chunks.values()) {
      if (chunk.updateClouds) {
        chunk.updateClouds(deltaTime);
      }
    }

    const chunkX = Math.floor((playerPos.x + this.chunkSize / 2) / this.chunkSize);
    const chunkZ = Math.floor((playerPos.z + this.chunkSize / 2) / this.chunkSize);

    const activeChunks = new Set<string>();
    const newPending: { cx: number; cz: number; lodLevel: number; dist: number; replace?: string }[] = [];

    for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
      for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
        const cx = chunkX + x;
        const cz = chunkZ + z;
        const key = `${cx},${cz}`;
        activeChunks.add(key);

        const dist = Math.max(Math.abs(x), Math.abs(z));

        let lodLevel = 2;
        if (dist <= this.lod0Distance) lodLevel = 0;
        else if (dist <= this.lod1Distance) lodLevel = 1;

        if (this.chunks.has(key)) {
          const chunk = this.chunks.get(key)!;
          if (chunk.lodLevel !== lodLevel) {
            const worldDist = Math.sqrt(x * x + z * z) * this.chunkSize;
            if (worldDist > 250) {
              newPending.push({ cx, cz, lodLevel, dist, replace: key });
            }
          }
        } else {
          newPending.push({ cx, cz, lodLevel, dist });
        }
      }
    }

    const pendingSet = new Set(this.pendingChunks.map(p => `${p.cx},${p.cz}`));
    const uniqueNew = newPending.filter(p => !pendingSet.has(`${p.cx},${p.cz}`));
    uniqueNew.sort((a, b) => a.dist - b.dist);
    this.pendingChunks = this.pendingChunks.concat(uniqueNew);

    let created = 0;
    while (this.pendingChunks.length > 0 && created < this.maxChunksPerFrame) {
      const item = this.pendingChunks.shift()!;
      const key = `${item.cx},${item.cz}`;
      const existing = this.chunks.get(key) || null;

      if (item.replace) {
        if (!existing || existing.lodLevel === item.lodLevel) continue;
        const oldChunk = existing;
        this.createChunk(item.cx, item.cz, item.lodLevel);
        oldChunk.dispose();
      } else {
        if (existing) continue;
        this.createChunk(item.cx, item.cz, item.lodLevel);
      }
      created++;
    }

    for (const [key, chunk] of this.chunks) {
      if (!activeChunks.has(key)) {
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    this.currentChunk = { x: chunkX, z: chunkZ };
  }

  private createChunk(x: number, z: number, lodLevel: number): void {
    const chunk = new TerrainChunk(
      this.scene as unknown as THREE.Scene,
      this.physicsWorld as unknown as { addBody: (body: unknown) => void; removeBody: (body: unknown) => void },
      x,
      z,
      this.chunkSize,
      lodLevel,
      this.pipeline
    );
    this.chunks.set(`${x},${z}`, chunk);
  }

  getCachedHeight(x: number, z: number): number {
    const gx = Math.round(x / this.heightCacheGrid);
    const gz = Math.round(z / this.heightCacheGrid);
    const key = `${gx},${gz}`;
    if (this.heightCache.has(key)) {
      return this.heightCache.get(key)!;
    }
    const h = this.pipeline.getHeight(x, z);
    this.heightCache.set(key, h);
    return h;
  }

  getHeightAt(x: number, z: number): number {
    return this.getCachedHeight(x, z);
  }
}
