import { TerrainChunk, getTerrainHeight } from './TerrainChunk.js';
import { SimplexNoise } from '../utils/Noise.js';

export class WorldManager {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    
    this.chunks = new Map(); // key: "x,z", value: TerrainChunk
    this.noise = new SimplexNoise();
    
    this.chunkSize = 60;       
    // LOD 距离设置 (单位: 区块)
    this.lod0Distance = 2;  // 高细节半径 (有物理)
    this.lod1Distance = 5;  // 中等细节半径 (无物理)
    this.renderDistance = 8; // 最大渲染半径 (低细节) (8 * 60 = 480m)
    
    this.currentChunk = { x: null, z: null };
  }
  
  update(playerPos) {
    const chunkX = Math.floor((playerPos.x + this.chunkSize / 2) / this.chunkSize);
    const chunkZ = Math.floor((playerPos.z + this.chunkSize / 2) / this.chunkSize);
    
    // 1. 确定需要存在的区块
    const activeChunks = new Set();
    
    // 扩大循环范围以覆盖最大渲染距离
    for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
      for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
        const cx = chunkX + x;
        const cz = chunkZ + z;
        const key = `${cx},${cz}`;
        activeChunks.add(key);
        
        // 计算距离 (切比雪夫距离，方形层级)
        const dist = Math.max(Math.abs(x), Math.abs(z));
        
        // 决定 LOD 等级
        let lodLevel = 2;
        if (dist <= this.lod0Distance) lodLevel = 0;
        else if (dist <= this.lod1Distance) lodLevel = 1;
        
        // 检查是否需要创建或更新 LOD
        if (this.chunks.has(key)) {
          const chunk = this.chunks.get(key);
          if (chunk.lodLevel !== lodLevel) {
            // LOD 改变，销毁重建
            chunk.dispose();
            this.chunks.delete(key);
            this.createChunk(cx, cz, lodLevel);
          }
        } else {
          this.createChunk(cx, cz, lodLevel);
        }
      }
    }
    
    // 2. 移除过远的区块
    for (const [key, chunk] of this.chunks) {
      if (!activeChunks.has(key)) {
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
    
    this.currentChunk = { x: chunkX, z: chunkZ };
  }
  
  createChunk(x, z, lodLevel) {
    const chunk = new TerrainChunk(
      this.scene,
      this.physicsWorld,
      x,
      z,
      this.chunkSize,
      lodLevel,
      this.noise
    );
    this.chunks.set(`${x},${z}`, chunk);
  }
  
  getHeightAt(x, z) {
    return getTerrainHeight(this.noise, x, z);
  }
}
