// WorldManager - Manages chunk loading/unloading with density field terrain
import * as THREE from 'three';
import { TerrainChunk, TERRAIN_LOD_CONFIGS } from './TerrainChunk';
import { TerrainPipeline } from './TerrainPipeline';
import { FarTerrain } from './FarTerrain';
import { TerrainWorkerPool } from './TerrainWorkerPool';

interface PhysicsWorldInterface {
  addBody(body: unknown): void;
  removeBody(body: unknown): void;
}

export class WorldManager {
  private scene: THREE.Scene;
  private physicsWorld: PhysicsWorldInterface;
  private chunks: Map<string, TerrainChunk>;
  private pipeline: TerrainPipeline;
  private farTerrain: FarTerrain;
  private workerPool: TerrainWorkerPool;
  private seed: number;

  private chunkSize: number;
  private lod0Distance: number;
  private lod1Distance: number;
  private renderDistance: number;

  private currentChunk: { x: number | null; z: number | null };
  private desiredLods = new Map<string, number>();
  private inFlight = new Map<string, { lodLevel: number; requestId: number }>();
  private nextRequestId = 1;
  private maxInFlight = 8;

  private heightCache: Map<string, number>;
  private heightCacheGrid: number;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorldInterface, seed: number = 42) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.seed = seed;
    this.chunks = new Map();
    this.pipeline = new TerrainPipeline(seed);
    this.workerPool = new TerrainWorkerPool();
    this.farTerrain = new FarTerrain(scene, this.workerPool, seed);

    this.chunkSize = 60;
    this.lod0Distance = 3;
    this.lod1Distance = 5;
    this.renderDistance = 8;

    this.currentChunk = { x: null, z: null };

    this.heightCache = new Map();
    this.heightCacheGrid = 0.5;
  }

  getTerrainPipeline(): TerrainPipeline {
    return this.pipeline;
  }

  update(playerPos: { x: number; z: number }, deltaTime: number): void {
    this.heightCache.clear();
    this.farTerrain.update(playerPos);

    for (const chunk of this.chunks.values()) {
      if (chunk.updateClouds) {
        chunk.updateClouds(deltaTime);
      }
    }

    const chunkX = Math.floor((playerPos.x + this.chunkSize / 2) / this.chunkSize);
    const chunkZ = Math.floor((playerPos.z + this.chunkSize / 2) / this.chunkSize);

    const activeChunks = new Set<string>();
    const candidates: { cx: number; cz: number; lodLevel: number; dist: number }[] = [];
    const desiredLods = new Map<string, number>();

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
        desiredLods.set(key, lodLevel);

        const chunk = this.chunks.get(key);
        if (!chunk || chunk.lodLevel !== lodLevel) candidates.push({ cx, cz, lodLevel, dist });
      }
    }
    this.desiredLods = desiredLods;

    candidates.sort((a, b) => a.dist - b.dist);
    for (const item of candidates) {
      if (this.inFlight.size >= this.maxInFlight) break;
      const key = `${item.cx},${item.cz}`;
      if (this.inFlight.has(key)) continue;
      this.requestChunk(item.cx, item.cz, item.lodLevel, item.dist);
    }

    for (const [key, chunk] of this.chunks) {
      if (!activeChunks.has(key)) {
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    this.currentChunk = { x: chunkX, z: chunkZ };
  }

  private requestChunk(x: number, z: number, lodLevel: number, distance: number): void {
    const key = `${x},${z}`;
    const requestId = this.nextRequestId++;
    const config = TERRAIN_LOD_CONFIGS[lodLevel] || TERRAIN_LOD_CONFIGS[2];
    this.inFlight.set(key, { lodLevel, requestId });
    void this.workerPool.request({
      kind: 'chunk',
      seed: this.seed,
      worldX: x * this.chunkSize,
      worldZ: z * this.chunkSize,
      size: this.chunkSize,
      resolution: config.voxelRes,
      includePhysics: config.hasPhysics,
      skirtDepth: lodLevel === 0 ? 3.5 : lodLevel === 1 ? 7 : 12,
    }, distance <= 1 ? 1 : 0).then(data => {
      const pending = this.inFlight.get(key);
      if (!pending || pending.requestId !== requestId) return;
      this.inFlight.delete(key);
      if (this.desiredLods.get(key) !== lodLevel) return;

      const previous = this.chunks.get(key);
      const chunk = new TerrainChunk(
        this.scene as unknown as THREE.Scene,
        this.physicsWorld as unknown as { addBody: (body: unknown) => void; removeBody: (body: unknown) => void },
        x,
        z,
        this.chunkSize,
        lodLevel,
        this.pipeline,
        data,
      );
      this.chunks.set(key, chunk);
      previous?.dispose();
    }).catch(error => {
      const pending = this.inFlight.get(key);
      if (pending?.requestId === requestId) this.inFlight.delete(key);
      console.error(`Unable to build terrain chunk ${key}`, error);
    });
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
