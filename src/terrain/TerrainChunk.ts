// TerrainChunk - Density field + Marching Tetrahedra terrain generation
// Replaces PlaneGeometry + Y-displacement with smooth isosurface extraction
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TerrainPipeline } from './TerrainPipeline';
import { createTerrainMaterial } from './TerrainMaterial';
import type { TerrainMeshData } from './TerrainMeshBuilder';

interface LODConfig {
  voxelRes: number;    // Horizontal voxel resolution
  padBelow: number;    // Extra depth below min terrain
  padAbove: number;    // Extra height above max terrain
  hasPhysics: boolean;
  decorationDensity: number;
}

interface TreeInstanceData {
  x: number;
  y: number;
  z: number;
  trunkHeight: number;
  crownHeight: number;
  crownWidth: number;
  yaw: number;
  colorJitter: number;
}

interface RockInstanceData {
  matrix: THREE.Matrix4;
  color: THREE.Color;
}

export const TERRAIN_LOD_CONFIGS: LODConfig[] = [
  { voxelRes: 48, padBelow: 5, padAbove: 5, hasPhysics: true, decorationDensity: 1.0 },
  { voxelRes: 24, padBelow: 3, padAbove: 3, hasPhysics: false, decorationDensity: 0.16 },
  { voxelRes: 12, padBelow: 2, padAbove: 2, hasPhysics: false, decorationDensity: 0.0 }
];

export class TerrainChunk {
  private static cloudTexture: THREE.CanvasTexture | null = null;
  private group: THREE.Scene;
  private physicsWorld: { addBody: (body: CANNON.Body) => void; removeBody: (body: CANNON.Body) => void };
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  lodLevel: number;
  private pipeline: TerrainPipeline;

  private hasPhysics: boolean;
  private decorationDensity: number;

  worldX: number;
  worldZ: number;

  private mesh: THREE.Mesh | null = null;
  private body: CANNON.Body | null = null;
  private objects: THREE.Object3D[] = [];
  private extraBodies: CANNON.Body[] = [];
  private clouds: THREE.Group[] = [];
  private randomState: number;

  constructor(
    group: THREE.Scene,
    physicsWorld: { addBody: (body: CANNON.Body) => void; removeBody: (body: CANNON.Body) => void },
    chunkX: number,
    chunkZ: number,
    size: number,
    lodLevel: number,
    pipeline: TerrainPipeline,
    meshData: TerrainMeshData,
  ) {
    this.group = group;
    this.physicsWorld = physicsWorld;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.lodLevel = lodLevel;
    this.pipeline = pipeline;

    const config = TERRAIN_LOD_CONFIGS[lodLevel] || TERRAIN_LOD_CONFIGS[2];
    this.hasPhysics = config.hasPhysics;
    this.decorationDensity = config.decorationDensity;

    this.worldX = chunkX * size;
    this.worldZ = chunkZ * size;
    this.randomState = ((chunkX * 73856093) ^ (chunkZ * 19349663) ^ 0x9e3779b9) >>> 0;

    this.generate(meshData);
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private generate(meshData: TerrainMeshData): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geometry.computeBoundingSphere();

    const material = createTerrainMaterial();

    this.mesh = new THREE.Mesh(geometry, material);

    if (this.lodLevel === 0) {
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = true;
    }

    this.group.add(this.mesh);

    // Physics body (LOD 0 only)
    if (this.hasPhysics) {
      this.createPhysicsBody(meshData);
    }

    // Decorations
    if (this.decorationDensity > 0) {
      this.decorateWithInstancing();
    }
  }

  private createEmptyChunkPlaceholder(): void {
    // Create a small flat plane at water level as fallback
    const geometry = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] = -5; // Below water
    }

    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length / 3; i++) {
      colors[i * 3] = 0.17;
      colors[i * 3 + 1] = 0.24;
      colors[i * 3 + 2] = 0.31;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      roughness: 0.92,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.worldX, 0, this.worldZ);
    this.group.add(this.mesh);
  }

  private createPhysicsBody(meshData: TerrainMeshData): void {
    // Use Heightfield for physics - generated from DensityField.surfaceHeight
    // cannon-es Trimesh uses Int16Array indices (max 32767), too small for our meshes.
    // Heightfield provides a practical physics approximation with good performance.
    const physicsRes = meshData.physicsResolution ?? 30;
    const elementSize = this.size / physicsRes;
    const halfSize = this.size / 2;

    const heightData: number[][] = [];
    for (let ix = 0; ix <= physicsRes; ix++) {
      const row: number[] = [];
      for (let iz = 0; iz <= physicsRes; iz++) {
        const index = ix * (physicsRes + 1) + iz;
        const fallbackX = (this.worldX - halfSize) + ix * elementSize;
        const fallbackZ = (this.worldZ - halfSize) + iz * elementSize;
        row.push(meshData.physicsHeights?.[index] ?? this.pipeline.getHeight(fallbackX, fallbackZ));
      }
      heightData.push(row);
    }

    const shape = new CANNON.Heightfield(heightData, { elementSize });
    this.body = new CANNON.Body({ mass: 0, shape });

    const minX = this.worldX - halfSize;
    const minZ = this.worldZ - halfSize;
    this.body.position.set(minX, 0, minZ + this.size);
    this.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    this.physicsWorld.addBody(this.body);
  }

  private decorateWithInstancing(): void {
    const baseCount = Math.floor(this.size / 1.8);
    const count = Math.floor(baseCount * this.decorationDensity);
    const halfSize = this.size / 2;

    // Clouds
    const cloudChance = this.lodLevel === 0 ? 0.3 : 0.1;
    if (this.random() < cloudChance) {
      const cloudCount = 1 + Math.floor(this.random() * 2);
      for (let i = 0; i < cloudCount; i++) {
        const cx = this.worldX + (this.random() - 0.5) * this.size;
        const cz = this.worldZ + (this.random() - 0.5) * this.size;
        const cy = 200 + this.random() * 200;
        this.createCloud(cx, cy, cz);
      }
    }

    const treesData: TreeInstanceData[] = [];
    const rocksData: RockInstanceData[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const rX = (this.random() - 0.5) * this.size;
      const rZ = (this.random() - 0.5) * this.size;
      const worldX = this.worldX + rX;
      const worldZ = this.worldZ + rZ;

      const h = this.pipeline.getHeight(worldX, worldZ);

      // Compute slope
      let slope = 0;
      if (this.lodLevel === 0) {
        const hNext = this.pipeline.getHeight(worldX + 0.5, worldZ);
        slope = Math.abs(h - hNext);
      }

      if (h < -5) continue;

      if (slope > 1.5 && this.lodLevel === 0) {
        const rockDensity = this.pipeline.getRockDensity(worldX, worldZ);
        if (this.random() < 0.22 + rockDensity * 0.42) {
          const width = 0.8 + this.random() * 2.5;
          const height = 0.5 + this.random() * 1.8;
          const depth = 0.75 + this.random() * 2.2;
          dummy.position.set(worldX, h + height * 0.34, worldZ);
          dummy.rotation.set((this.random() - 0.5) * 0.38, this.random() * Math.PI, (this.random() - 0.5) * 0.32);
          dummy.scale.set(width, height, depth);
          dummy.updateMatrix();
          const shade = 0.32 + this.random() * 0.15;
          rocksData.push({ matrix: dummy.matrix.clone(), color: new THREE.Color(shade * 0.88, shade * 0.94, shade) });
        }
      } else if (h > 2 && h < 62) {
        // Trees in suitable areas
        const slopeForTrees = this.lodLevel === 0 ? slope : 0;
        if (slopeForTrees > 0.55) continue;

        const forestDensity = this.pipeline.getForestDensity(worldX, worldZ);
        if (this.random() < forestDensity * 0.82) {
          treesData.push({
            x: worldX,
            y: h,
            z: worldZ,
            trunkHeight: 1.15 + this.random() * 1.45,
            crownHeight: 3.8 + this.random() * 3.6,
            crownWidth: 1.25 + this.random() * 1.15,
            yaw: this.random() * Math.PI * 2,
            colorJitter: this.random() - 0.5,
          });
        }
      }
    }

    if (rocksData.length > 0) this.createInstancedRocks(rocksData);
    if (treesData.length > 0) this.createInstancedTrees(treesData);
  }

  private createInstancedRocks(rocks: RockInstanceData[]): void {
    const geometry = new THREE.IcosahedronGeometry(1, this.lodLevel === 0 ? 1 : 0);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const stratum = 1 + Math.sin(y * 8.5 + x * 2.1) * 0.055;
      positions.setXYZ(i, x * stratum, y * (0.92 + Math.cos(x * 5.2) * 0.035), z * stratum);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: false,
      roughness: 0.96,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, rocks.length);
    mesh.name = 'alpine-rock-outcrops';
    for (let i = 0; i < rocks.length; i++) {
      mesh.setMatrixAt(i, rocks[i].matrix);
      mesh.setColorAt(i, rocks[i].color);
    }
    mesh.instanceColor!.needsUpdate = true;

    if (this.lodLevel === 0) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    this.group.add(mesh);
    this.objects.push(mesh);
  }

  private createInstancedTrees(treesData: TreeInstanceData[]): void {
    const radialSegments = this.lodLevel === 0 ? 8 : 6;
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 1, radialSegments);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.94 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treesData.length);
    trunkMesh.name = 'conifer-trunks';

    const branchGeo = new THREE.ConeGeometry(1, 1, radialSegments, 2, false);
    branchGeo.translate(0, 0.5, 0);
    const lowerMesh = new THREE.InstancedMesh(branchGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), treesData.length);
    const middleMesh = new THREE.InstancedMesh(branchGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), treesData.length);
    const crownMesh = new THREE.InstancedMesh(branchGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 }), treesData.length);
    lowerMesh.name = 'conifer-lower-branches';
    middleMesh.name = 'conifer-middle-branches';
    crownMesh.name = 'conifer-crowns';

    const lowerBase = new THREE.Color(0x2b5541);
    const middleBase = new THREE.Color(0x376a50);
    const crownBase = new THREE.Color(0x4a7a5b);

    for (let i = 0; i < treesData.length; i++) {
      const { x, y, z, trunkHeight, crownHeight, crownWidth, yaw, colorJitter } = treesData[i];

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, trunkHeight + crownHeight * 0.76, 1);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + trunkHeight, z);
      dummy.scale.set(crownWidth, crownHeight * 0.55, crownWidth);
      dummy.updateMatrix();
      lowerMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + trunkHeight + crownHeight * 0.3, z);
      dummy.scale.set(crownWidth * 0.73, crownHeight * 0.49, crownWidth * 0.73);
      dummy.updateMatrix();
      middleMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + trunkHeight + crownHeight * 0.57, z);
      dummy.scale.set(crownWidth * 0.46, crownHeight * 0.44, crownWidth * 0.46);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);

      const lowerColor = lowerBase.clone().offsetHSL(colorJitter * 0.025, colorJitter * 0.04, colorJitter * 0.06);
      const middleColor = middleBase.clone().offsetHSL(colorJitter * 0.02, colorJitter * 0.04, colorJitter * 0.07);
      const crownColor = crownBase.clone().offsetHSL(colorJitter * 0.02, colorJitter * 0.03, colorJitter * 0.075);
      lowerMesh.setColorAt(i, lowerColor);
      middleMesh.setColorAt(i, middleColor);
      crownMesh.setColorAt(i, crownColor);
    }

    lowerMesh.instanceColor!.needsUpdate = true;
    middleMesh.instanceColor!.needsUpdate = true;
    crownMesh.instanceColor!.needsUpdate = true;

    if (this.lodLevel === 0) {
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      lowerMesh.castShadow = true;
      lowerMesh.receiveShadow = true;
      middleMesh.castShadow = true;
      middleMesh.receiveShadow = true;
      crownMesh.castShadow = true;
      crownMesh.receiveShadow = true;
    }

    this.group.add(trunkMesh, lowerMesh, middleMesh, crownMesh);
    this.objects.push(trunkMesh, lowerMesh, middleMesh, crownMesh);
  }

  private createTower(x: number, y: number, z: number): void {
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
      const baseW = 25, baseH = 10;
      const baseShape = new CANNON.Box(new CANNON.Vec3(baseW / 2, baseH / 2, baseW / 2));
      const baseBody = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(x, y + baseH / 2 - 10, z),
        shape: baseShape
      });
      this.physicsWorld.addBody(baseBody);
      this.extraBodies.push(baseBody);

      const upperH = 60;
      const upperShape = new CANNON.Box(new CANNON.Vec3(width / 2, upperH / 2, width / 2));
      const upperBody = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(x, y + baseH + upperH / 2 - 10, z),
        shape: upperShape
      });
      this.physicsWorld.addBody(upperBody);
      this.extraBodies.push(upperBody);

      const platShape = new CANNON.Box(new CANNON.Vec3(platformW / 2, platformH / 2, platformW / 2));
      const platBody = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(x, y + height - 10, z),
        shape: platShape
      });
      this.physicsWorld.addBody(platBody);
      this.extraBodies.push(platBody);
    }
  }

  private createCloud(x: number, y: number, z: number): void {
    const cloudGroup = new THREE.Group();
    cloudGroup.name = 'soft-atmospheric-cloud';
    const puffs = 3 + Math.floor(this.random() * 3);
    const cloudMat = new THREE.SpriteMaterial({
      map: TerrainChunk.getCloudTexture(),
      color: 0xe8f2f5,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      fog: true,
    });

    for (let i = 0; i < puffs; i++) {
      const width = 34 + this.random() * 38;
      const sprite = new THREE.Sprite(cloudMat.clone());
      sprite.name = `cloud-puff-${i + 1}`;
      sprite.position.set(
        (this.random() - 0.5) * 58,
        (this.random() - 0.5) * 15,
        (this.random() - 0.5) * 30,
      );
      sprite.scale.set(width, width * (0.42 + this.random() * 0.15), 1);
      sprite.material.rotation = (this.random() - 0.5) * 0.16;
      cloudGroup.add(sprite);
    }

    cloudGroup.position.set(x, y, z);
    cloudGroup.userData.baseX = x;
    cloudGroup.userData.baseZ = z;
    cloudGroup.userData.speed = 0.5 + this.random() * 1.5;
    cloudGroup.userData.phase = this.random() * Math.PI * 2;
    this.clouds.push(cloudGroup);
    this.group.add(cloudGroup);
    this.objects.push(cloudGroup);
  }

  private static getCloudTexture(): THREE.CanvasTexture {
    if (TerrainChunk.cloudTexture) return TerrainChunk.cloudTexture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 128, 128);
    const puffs = [
      [40, 70, 34], [65, 52, 42], [90, 70, 31], [66, 78, 43],
    ];
    for (const [cx, cy, radius] of puffs) {
      const gradient = context.createRadialGradient(cx, cy, 2, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,.95)');
      gradient.addColorStop(0.45, 'rgba(245,250,252,.72)');
      gradient.addColorStop(0.78, 'rgba(225,239,245,.24)');
      gradient.addColorStop(1, 'rgba(220,235,242,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    TerrainChunk.cloudTexture = texture;
    return texture;
  }

  updateClouds(deltaTime: number): void {
    for (const cloud of this.clouds) {
      const ud = cloud.userData;
      ud.phase += ud.speed * deltaTime;
      cloud.position.x = ud.baseX + Math.sin(ud.phase) * 15;
      cloud.position.z = ud.baseZ + Math.cos(ud.phase * 0.7) * 10;
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }

    this.objects.forEach(obj => {
      this.group.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        ((obj as THREE.Mesh).material as THREE.Material).dispose();
      }
      if ((obj as THREE.InstancedMesh).isInstancedMesh) {
        (obj as THREE.InstancedMesh).dispose();
      }
      if ((obj as THREE.Group).isGroup) {
        (obj as THREE.Group).traverse(child => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
          if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
        });
      }
    });
    this.objects = [];
    this.clouds = [];

    if (this.body) {
      this.physicsWorld.removeBody(this.body);
    }

    this.extraBodies.forEach(b => this.physicsWorld.removeBody(b));
    this.extraBodies = [];
  }
}
