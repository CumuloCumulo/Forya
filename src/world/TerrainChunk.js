import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class TerrainChunk {
  constructor(group, physicsWorld, chunkX, chunkZ, size, lodLevel, noise) {
    this.group = group;
    this.physicsWorld = physicsWorld;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.lodLevel = lodLevel;
    this.noise = noise;
    
    // LOD 配置
    // LOD 0: 核心区域 (高面数 + 物理 + 全装饰)
    // LOD 1: 中远距离 (中面数 + 无物理 + 少量装饰)
    // LOD 2: 远景 (低面数 + 无物理 + 无装饰)
    const lodConfig = [
      { resolution: 30, hasPhysics: true, decorationDensity: 1.0 },
      { resolution: 15, hasPhysics: false, decorationDensity: 0.1 },
      { resolution: 6,  hasPhysics: false, decorationDensity: 0.0 }
    ];
    
    const config = lodConfig[lodLevel] || lodConfig[2];
    this.resolution = config.resolution;
    this.hasPhysics = config.hasPhysics;
    this.decorationDensity = config.decorationDensity;
    
    // 计算实际世界坐标偏移
    this.worldX = chunkX * size;
    this.worldZ = chunkZ * size;
    
    this.mesh = null;
    this.body = null;
    this.objects = []; 
    this.extraBodies = []; // 存储额外的物理体
    
    this.generate();
  }
  
  generate() {
    // 1. 创建几何体
    const verticesCount = this.resolution + 1;
    const geometry = new THREE.PlaneGeometry(this.size, this.size, this.resolution, this.resolution);
    geometry.rotateX(-Math.PI / 2); 
    
    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);
    
    // 仅在需要物理时才生成 heightData
    let heightData = null;
    if (this.hasPhysics) {
      heightData = [];
      for (let i = 0; i < verticesCount; i++) {
        heightData.push(new Float32Array(verticesCount));
      }
    }
    
    for (let i = 0, z = 0; z <= this.resolution; z++) {
      for (let x = 0; x <= this.resolution; x++, i++) {
        const localX = positions[i * 3];
        const localZ = positions[i * 3 + 2];
        
        const realX = this.worldX + localX;
        const realZ = this.worldZ + localZ;
        
        const h = this.calculateHeight(realX, realZ);
        
        positions[i * 3 + 1] = h;
        
        if (this.hasPhysics) {
          heightData[x][verticesCount - 1 - z] = h;
        }
        
        const color = this.calculateColor(h, realX, realZ);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }
    
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.8,
      metalness: 0.1,
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.worldX, 0, this.worldZ);
    
    // 只有近处的高细节区块才开启阴影，节省性能
    if (this.lodLevel === 0) {
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = true;
    } else {
      this.mesh.receiveShadow = false; // 远景不接收阴影
      this.mesh.castShadow = false;
    }
    
    this.group.add(this.mesh);
    
    // 2. 创建物理体 (仅 LOD 0)
    if (this.hasPhysics && heightData) {
      this.createPhysicsBody(heightData);
    }
    
    // 3. 装饰物 (根据密度)
    if (this.decorationDensity > 0) {
      this.decorateWithInstancing(verticesCount);
    }
  }
  
  decorateWithInstancing(verticesCount) {
    // 使用 InstancedMesh 优化大量重复物体的渲染
    // 大幅减少 Draw Calls，提高帧数
    
    const baseCount = Math.floor(this.size / 3);
    const count = Math.floor(baseCount * this.decorationDensity);
    
    // 塔楼 (仅在出生点且 LOD 0 时生成) - 塔楼数量少，保持原有方式
    if (this.chunkX === 0 && this.chunkZ === 0 && this.lodLevel === 0) {
      this.createTower(this.worldX, this.calculateHeight(this.worldX, this.worldZ), this.worldZ);
    }

    // 云朵 - 保持原有方式 (半透明排序问题，且数量不多)
    const cloudChance = this.lodLevel === 0 ? 0.3 : 0.1;
    if (Math.random() < cloudChance) { 
      const cloudCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < cloudCount; i++) {
        const cx = this.worldX + (Math.random() - 0.5) * this.size;
        const cz = this.worldZ + (Math.random() - 0.5) * this.size;
        const cy = 200 + Math.random() * 200; 
        this.createCloud(cx, cy, cz);
      }
    }
    
    // 收集变换矩阵数据
    const treesData = [];
    const rocksData = [];
    
    const dummy = new THREE.Object3D(); // 辅助计算矩阵
    
    for (let i = 0; i < count; i++) {
      const rX = (Math.random() - 0.5) * this.size;
      const rZ = (Math.random() - 0.5) * this.size;
      const worldX = this.worldX + rX;
      const worldZ = this.worldZ + rZ;
      
      const h = this.calculateHeight(worldX, worldZ);
      
      let slope = 0;
      if (this.lodLevel === 0) {
          const hNext = this.calculateHeight(worldX + 0.5, worldZ);
          slope = Math.abs(h - hNext);
      }
      
      if (h < -5) continue; 
      
      if (slope > 1.5 && this.lodLevel === 0) {
        // 石头
        if (Math.random() > 0.7) {
            const scale = 0.5 + Math.random() * 1.5;
            dummy.position.set(worldX, h + scale * 0.5, worldZ);
            dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            rocksData.push(dummy.matrix.clone());
        }
      } else if (h > 5 && h < 18) {
        // 树
        const pathNoise = this.noise.noise2D(worldX * 0.1, worldZ * 0.1);
        if (pathNoise <= 0.2) {
             const trunkH = 1 + Math.random();
             const leavesH = 2 + Math.random();
             
             // 存储树的位置信息，稍后构建两个 InstancedMesh (树干和树叶)
             treesData.push({
                 x: worldX,
                 y: h,
                 z: worldZ,
                 trunkH: trunkH,
                 leavesH: leavesH
             });
        }
      }
    }
    
    // 批量创建 InstancedMesh
    if (rocksData.length > 0) this.createInstancedRocks(rocksData);
    if (treesData.length > 0) this.createInstancedTrees(treesData);
  }
  
  createInstancedRocks(matrices) {
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x757575,
      flatShading: true,
      roughness: 0.9
    });
    
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    
    for (let i = 0; i < matrices.length; i++) {
        mesh.setMatrixAt(i, matrices[i]);
    }
    
    if (this.lodLevel === 0) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }
    
    this.group.add(mesh);
    this.objects.push(mesh);
  }
  
  createInstancedTrees(treesData) {
    // 树需要两个 InstancedMesh: 树干 和 树叶
    const radialSegments = this.lodLevel === 0 ? 5 : 4;
    const dummy = new THREE.Object3D();
    
    // 1. 树干
    // 为了统一 InstancedMesh，我们需要归一化几何体，通过 scale 调整高度
    // 但 Cylinder 的 origin 在中心，scale y 会导致两端延伸。
    // 简单的做法：几何体高度设为 1，y轴向上偏移 0.5，这样原点在底部。
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1, radialSegments);
    trunkGeo.translate(0, 0.5, 0); // 原点移到底部
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, flatShading: true });
    
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treesData.length);
    
    // 2. 树叶
    const leavesGeo = new THREE.ConeGeometry(1, 1, radialSegments); // 半径1，高度1
    leavesGeo.translate(0, 0.5, 0); // 原点移到底部
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, flatShading: true });
    
    const leavesMesh = new THREE.InstancedMesh(leavesGeo, leavesMat, treesData.length);
    
    for (let i = 0; i < treesData.length; i++) {
        const { x, y, z, trunkH, leavesH } = treesData[i];
        
        // 树干变换
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, trunkH, 1); // 高度缩放
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(i, dummy.matrix);
        
        // 树叶变换
        // 树叶在树干顶部: y + trunkH
        // 树叶还要随机缩放一点宽度
        const leavesW = 1 + Math.random();
        dummy.position.set(x, y + trunkH, z);
        dummy.scale.set(leavesW, leavesH, leavesW);
        dummy.updateMatrix();
        leavesMesh.setMatrixAt(i, dummy.matrix);
    }
    
    if (this.lodLevel === 0) {
        trunkMesh.castShadow = true;
        trunkMesh.receiveShadow = true;
        leavesMesh.castShadow = true;
        leavesMesh.receiveShadow = true;
    }
    
    this.group.add(trunkMesh);
    this.objects.push(trunkMesh);
    
    this.group.add(leavesMesh);
    this.objects.push(leavesMesh);
  }

  calculateHeight(x, z) {
    return getTerrainHeight(this.noise, x, z);
  }
  
  calculateColor(h, x, z) {
    const color = new THREE.Color();
    
    if (h < -10) {
      color.setHex(0x2c3e50); 
    } else if (h < 2) {
      color.setHex(0x5d4037); 
      const noise = this.noise.noise2D(x * 0.2, z * 0.2);
      if (noise > 0.3) color.setHex(0x4e342e);
    } else if (h < 40) { 
      const pathNoise = this.noise.noise2D(x * 0.1, z * 0.1);
      if (pathNoise > 0.25) { 
        color.setHex(0x795548); 
      } else {
        color.setHex(0x558b2f); 
      }
    } else if (h < 100) { 
      color.setHex(0x616161); 
      if (h > 80 && Math.random() > 0.5) {
        color.lerp(new THREE.Color(0xffffff), 0.3);
      }
    } else {
      color.setHex(0xffffff); 
      if (h < 120) {
        color.lerp(new THREE.Color(0x616161), 0.4);
      }
    }
    
    return color;
  }
  
  createPhysicsBody(heightData) {
    const elementSize = this.size / this.resolution;
    const shape = new CANNON.Heightfield(heightData, {
      elementSize: elementSize,
    });
    
    this.body = new CANNON.Body({
      mass: 0,
      shape: shape
    });
    
    const minX = this.worldX - this.size / 2;
    const minZ = this.worldZ - this.size / 2;
    
    // 修正物理体位置:
    // Heightfield 旋转 -90度后，Local Y 轴指向 World -Z 轴
    // 所以物理体需要向 +Z 方向偏移一个 size，才能覆盖 [minZ, minZ + size] 的范围
    this.body.position.set(minX, 0, minZ + this.size);
    this.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    
    this.physicsWorld.addBody(this.body);
  }
  
  
  createRock(x, y, z) {
    const scale = 0.5 + Math.random() * 1.5;
    const geometry = new THREE.DodecahedronGeometry(scale, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x757575,
      flatShading: true,
      roughness: 0.9
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y + scale * 0.5, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.objects.push(mesh);
  }
  
  createTree(x, y, z) {
    // LOD 优化：远处的树可以更简单，这里暂时保持一致
    const trunkH = 1 + Math.random();
    // 降低分段数优化性能
    const radialSegments = this.lodLevel === 0 ? 5 : 4;
    
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, trunkH, radialSegments);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, y + trunkH/2, z);
    
    if (this.lodLevel === 0) {
        trunk.castShadow = true;
        trunk.receiveShadow = true;
    }
    
    this.group.add(trunk);
    this.objects.push(trunk);
    
    const leavesH = 2 + Math.random();
    const leavesGeo = new THREE.ConeGeometry(1 + Math.random(), leavesH, radialSegments);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, flatShading: true });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.set(x, y + trunkH + leavesH/2 - 0.5, z);
    
    if (this.lodLevel === 0) {
        leaves.castShadow = true;
        leaves.receiveShadow = true;
    }
    
    // Remove old individual create methods if they are no longer used by decorateWithInstancing
    // createRock and createTree are replaced by instanced versions.
    // createTower and createCloud are still used.
  }

  createTower(x, y, z) {
    // 只有 LOD 0 会调用这个，所以保持原样，但需要处理 extraBodies
    const height = 80; 
    const width = 15;   
    
    const geometry = new THREE.BoxGeometry(width, height, width);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x5d4037, 
      roughness: 0.9,
      flatShading: true
    });
    const tower = new THREE.Mesh(geometry, material);
    tower.position.set(x, y + height / 2 - 10, z); 
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.group.add(tower);
    this.objects.push(tower);
    
    const platformW = 25; 
    const platformH = 2;
    const platGeo = new THREE.BoxGeometry(platformW, platformH, platformW);
    const platMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, flatShading: true });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(x, y + height - 10, z);
    platform.receiveShadow = true;
    this.group.add(platform);
    this.objects.push(platform);
    
    if (this.hasPhysics) {
        const shape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, width/2));
        const body = new CANNON.Body({
          mass: 0, 
          position: new CANNON.Vec3(x, y + height/2 - 10, z),
          shape: shape
        });
        this.physicsWorld.addBody(body);
        this.extraBodies.push(body);
        
        const platShape = new CANNON.Box(new CANNON.Vec3(platformW/2, platformH/2, platformW/2));
        const platBody = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(x, y + height - 10, z),
          shape: platShape
        });
        this.physicsWorld.addBody(platBody);
        this.extraBodies.push(platBody);
    }
  }

  createCloud(x, y, z) {
    const cloudGroup = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 5);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9
    });

    // 减少 LOD > 0 时的云朵面数
    const detail = this.lodLevel === 0 ? 0 : 0; // Dodecahedron 0 detail is already low poly

    for (let i = 0; i < puffs; i++) {
      const size = 8 + Math.random() * 12;
      const geo = new THREE.DodecahedronGeometry(size, detail);
      const mesh = new THREE.Mesh(geo, cloudMat);
      
      mesh.position.set(
        (Math.random() - 0.5) * 25,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 25
      );
      
      mesh.scale.setScalar(0.8 + Math.random() * 0.5);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      
      if (this.lodLevel === 0) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      
      cloudGroup.add(mesh);
    }
    
    cloudGroup.position.set(x, y, z);
    this.group.add(cloudGroup);
    this.objects.push(cloudGroup);
  }
  
  dispose() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    
    this.objects.forEach(obj => {
      this.group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      // Handle Groups (clouds)
      if (obj.isGroup) {
          obj.traverse(child => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) child.material.dispose();
          })
      }
    });
    this.objects = [];
    
    if (this.body) {
      this.physicsWorld.removeBody(this.body);
    }
    
    if (this.extraBodies) {
      this.extraBodies.forEach(b => this.physicsWorld.removeBody(b));
      this.extraBodies = [];
    }
  }
}

export function getTerrainHeight(noise, x, z) {
  const biomeScale = 0.0003;
  const biomeNoise = noise.fbm2D(x * biomeScale, z * biomeScale, 2, 2.0, 0.5);
  let biomeFactor = (biomeNoise + 1) * 0.5;
  biomeFactor = Math.pow(biomeFactor, 1.5);

  const plainScale = 0.002;
  const plainRaw = noise.fbm2D(x * plainScale, z * plainScale, 3, 2.0, 0.5);
  const plainHeight = plainRaw * 10 + 15; 

  const mtnScale = 0.004;
  let mtnNoise = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmp = 0;
  
  for(let i=0; i<5; i++) {
    let n = noise.noise2D(x * mtnScale * frequency, z * mtnScale * frequency);
    n = 1.0 - Math.abs(n);
    n = n * n;
    mtnNoise += n * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  mtnNoise /= maxAmp;
  
  const peakScale = 0.0005;
  const peakVal = noise.noise2D(x * peakScale + 500, z * peakScale + 500);
  let mtnHeightScale = 150; 
  
  if (peakVal > 0.65) {
     const boost = THREE.MathUtils.mapLinear(peakVal, 0.65, 1.0, 1.0, 2.5);
     mtnHeightScale *= boost;
  }
  
  const mountainHeight = 10 + mtnNoise * mtnHeightScale;
  const blend = THREE.MathUtils.smoothstep(biomeFactor, 0.3, 0.7);
  let h = THREE.MathUtils.lerp(plainHeight, mountainHeight, blend);
  
  h += noise.noise2D(x * 0.05, z * 0.05) * 1.0;

  const abyssThreshold = -10;
  if (h < abyssThreshold) {
     h = THREE.MathUtils.lerp(-50, h, 0.5); 
  }
  
  return h;
}
