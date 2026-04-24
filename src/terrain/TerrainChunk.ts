// TerrainChunk - Density field + Marching Tetrahedra terrain generation
// Replaces PlaneGeometry + Y-displacement with smooth isosurface extraction
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TerrainPipeline } from './TerrainPipeline';
import { ColorCalculator } from './ColorCalculator';
import { MarchingTetrahedra } from './MarchingTetrahedra';

interface LODConfig {
  voxelRes: number;    // Horizontal voxel resolution
  padBelow: number;    // Extra depth below min terrain
  padAbove: number;    // Extra height above max terrain
  hasPhysics: boolean;
  decorationDensity: number;
}

const LOD_CONFIGS: LODConfig[] = [
  { voxelRes: 30, padBelow: 5, padAbove: 5, hasPhysics: true, decorationDensity: 1.0 },
  { voxelRes: 15, padBelow: 3, padAbove: 3, hasPhysics: false, decorationDensity: 0.1 },
  { voxelRes: 8, padBelow: 2, padAbove: 2, hasPhysics: false, decorationDensity: 0.0 }
];

export class TerrainChunk {
  private group: THREE.Scene;
  private physicsWorld: { addBody: (body: CANNON.Body) => void; removeBody: (body: CANNON.Body) => void };
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  lodLevel: number;
  private pipeline: TerrainPipeline;
  private colorCalc: ColorCalculator;
  private marcher: MarchingTetrahedra;

  private hasPhysics: boolean;
  private decorationDensity: number;

  worldX: number;
  worldZ: number;

  private mesh: THREE.Mesh | null = null;
  private body: CANNON.Body | null = null;
  private objects: THREE.Object3D[] = [];
  private extraBodies: CANNON.Body[] = [];
  private clouds: THREE.Group[] = [];

  constructor(
    group: THREE.Scene,
    physicsWorld: { addBody: (body: CANNON.Body) => void; removeBody: (body: CANNON.Body) => void },
    chunkX: number,
    chunkZ: number,
    size: number,
    lodLevel: number,
    pipeline: TerrainPipeline
  ) {
    this.group = group;
    this.physicsWorld = physicsWorld;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.lodLevel = lodLevel;
    this.pipeline = pipeline;
    this.colorCalc = pipeline.getColorCalculator();
    this.marcher = new MarchingTetrahedra(0);

    const config = LOD_CONFIGS[lodLevel] || LOD_CONFIGS[2];
    this.hasPhysics = config.hasPhysics;
    this.decorationDensity = config.decorationDensity;

    this.worldX = chunkX * size;
    this.worldZ = chunkZ * size;

    this.generate();
  }

  private generate(): void {
    const densityField = this.pipeline.getDensityField();
    const config = LOD_CONFIGS[this.lodLevel] || LOD_CONFIGS[2];
    const halfSize = this.size / 2;

    // Sample terrain heights at corners and center to determine Y range
    const samplePoints = [
      [this.worldX - halfSize, this.worldZ - halfSize],
      [this.worldX + halfSize, this.worldZ - halfSize],
      [this.worldX - halfSize, this.worldZ + halfSize],
      [this.worldX + halfSize, this.worldZ + halfSize],
      [this.worldX, this.worldZ],
      [this.worldX - halfSize * 0.5, this.worldZ - halfSize * 0.5],
      [this.worldX + halfSize * 0.5, this.worldZ - halfSize * 0.5],
      [this.worldX - halfSize * 0.5, this.worldZ + halfSize * 0.5],
      [this.worldX + halfSize * 0.5, this.worldZ + halfSize * 0.5],
    ];

    let minY = Infinity, maxY = -Infinity;
    for (const [sx, sz] of samplePoints) {
      const h = densityField.surfaceHeight(sx, sz);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }

    // Expand Y range with padding, cap to prevent massive grids
    const originY = minY - config.padBelow;
    const rawRange = (maxY - minY) + config.padBelow + config.padAbove;
    const maxRange = this.size * 1.5; // Cap Y range to 1.5x chunk size
    const yRange = Math.min(rawRange, maxRange);

    // Compute grid spacing
    const res = config.voxelRes;
    const stepX = this.size / res;
    const stepZ = this.size / res;
    // Choose Y resolution to keep voxels roughly cubic
    const sizeY = Math.max(4, Math.ceil(yRange / Math.min(stepX, stepZ)));
    const stepY = yRange / sizeY;

    // Build density grid
    const originX = this.worldX - halfSize;
    const originZ = this.worldZ - halfSize;

    const grid = densityField.buildDensityGrid(
      originX, originY, originZ,
      res + 1, sizeY + 1, res + 1,
      stepX, stepY, stepZ
    );

    // Extract mesh using Marching Tetrahedra
    const meshData = this.marcher.polygonize(
      grid,
      res + 1, sizeY + 1, res + 1,
      originX, originY, originZ,
      stepX, stepY, stepZ
    );

    if (meshData.indices.length === 0) {
      // No surface in this chunk - create a minimal placeholder
      this.createEmptyChunkPlaceholder();
      return;
    }

    // Build Three.js BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

    // Compute normals
    geometry.computeVertexNormals();

    // Compute vertex colors based on height and normal
    this.computeColors(geometry);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(geometry, material);

    if (this.lodLevel === 0) {
      this.mesh.receiveShadow = true;
      this.mesh.castShadow = true;
    }

    this.group.add(this.mesh);

    // Physics body (LOD 0 only)
    if (this.hasPhysics) {
      this.createPhysicsBody();
    }

    // Decorations
    if (this.decorationDensity > 0) {
      this.decorateWithInstancing();
    }
  }

  private computeColors(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    const vertexCount = positions.length / 3;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < vertexCount; i++) {
      const h = positions[i * 3 + 1];
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const wx = positions[i * 3];
      const wz = positions[i * 3 + 2];

      const color = this.colorCalc.calculateColor(h, nx, ny, nz, wx, wz);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
      flatShading: true,
      roughness: 0.8,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.worldX, 0, this.worldZ);
    this.group.add(this.mesh);
  }

  private createPhysicsBody(): void {
    // Use Heightfield for physics - generated from DensityField.surfaceHeight
    // cannon-es Trimesh uses Int16Array indices (max 32767), too small for our meshes.
    // Heightfield provides a practical physics approximation with good performance.
    const physicsRes = 30;
    const elementSize = this.size / physicsRes;
    const halfSize = this.size / 2;

    const heightData: number[][] = [];
    for (let ix = 0; ix <= physicsRes; ix++) {
      const row: number[] = [];
      for (let iz = 0; iz <= physicsRes; iz++) {
        const wx = (this.worldX - halfSize) + ix * elementSize;
        const wz = (this.worldZ - halfSize) + iz * elementSize;
        row.push(this.pipeline.getHeight(wx, wz));
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
    const baseCount = Math.floor(this.size / 3);
    const count = Math.floor(baseCount * this.decorationDensity);
    const halfSize = this.size / 2;

    // Tower at spawn
    if (this.chunkX === 0 && this.chunkZ === 0 && this.lodLevel === 0) {
      const h = this.pipeline.getHeight(this.worldX, this.worldZ);
      this.createTower(this.worldX, h, this.worldZ);
    }

    // Clouds
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

    const treesData: { x: number; y: number; z: number; trunkH: number; leavesH: number }[] = [];
    const rocksData: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const rX = (Math.random() - 0.5) * this.size;
      const rZ = (Math.random() - 0.5) * this.size;
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
        // Rocks on steep slopes
        if (Math.random() > 0.7) {
          const scale = 0.5 + Math.random() * 1.5;
          dummy.position.set(worldX, h + scale * 0.5, worldZ);
          dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          rocksData.push(dummy.matrix.clone());
        }
      } else if (h > 5 && h < 40) {
        // Trees in suitable areas
        const slopeForTrees = this.lodLevel === 0 ? slope : 0;
        if (slopeForTrees > 0.15 * 2) continue;

        const pathNoise = Math.sin(worldX * 12.9898 + worldZ * 78.233) * 43758.5453 % 1;
        if (pathNoise <= 0.2) {
          const trunkH = 1 + Math.random();
          const leavesH = 2 + Math.random();
          treesData.push({ x: worldX, y: h, z: worldZ, trunkH, leavesH });
        }
      }
    }

    if (rocksData.length > 0) this.createInstancedRocks(rocksData);
    if (treesData.length > 0) this.createInstancedTrees(treesData);
  }

  private createInstancedRocks(matrices: THREE.Matrix4[]): void {
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

  private createInstancedTrees(treesData: { x: number; y: number; z: number; trunkH: number; leavesH: number }[]): void {
    const radialSegments = this.lodLevel === 0 ? 5 : 4;
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1, radialSegments);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, flatShading: true });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treesData.length);

    const lowerLeavesGeo = new THREE.ConeGeometry(1, 1, radialSegments);
    lowerLeavesGeo.translate(0, 0.5, 0);
    const lowerLeavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, flatShading: true });
    const lowerLeavesMesh = new THREE.InstancedMesh(lowerLeavesGeo, lowerLeavesMat, treesData.length);

    const upperLeavesGeo = new THREE.ConeGeometry(0.7, 1.3, radialSegments);
    upperLeavesGeo.translate(0, 0.5, 0);
    const upperLeavesMat = new THREE.MeshStandardMaterial({ color: 0x388e3c, flatShading: true });
    const upperLeavesMesh = new THREE.InstancedMesh(upperLeavesGeo, upperLeavesMat, treesData.length);

    for (let i = 0; i < treesData.length; i++) {
      const { x, y, z, trunkH, leavesH } = treesData[i];

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, trunkH, 1);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      const leavesW = 1.2 + Math.random() * 0.6;
      const lowerH = leavesH * 0.6;
      dummy.position.set(x, y + trunkH, z);
      dummy.scale.set(leavesW, lowerH, leavesW);
      dummy.updateMatrix();
      lowerLeavesMesh.setMatrixAt(i, dummy.matrix);

      const upperH = leavesH * 0.8;
      dummy.position.set(x, y + trunkH + lowerH * 0.7, z);
      dummy.scale.set(leavesW * 0.65, upperH, leavesW * 0.65);
      dummy.updateMatrix();
      upperLeavesMesh.setMatrixAt(i, dummy.matrix);
    }

    if (this.lodLevel === 0) {
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      lowerLeavesMesh.castShadow = true;
      lowerLeavesMesh.receiveShadow = true;
      upperLeavesMesh.castShadow = true;
      upperLeavesMesh.receiveShadow = true;
    }

    this.group.add(trunkMesh);
    this.objects.push(trunkMesh);
    this.group.add(lowerLeavesMesh);
    this.objects.push(lowerLeavesMesh);
    this.group.add(upperLeavesMesh);
    this.objects.push(upperLeavesMesh);
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
    const puffs = 3 + Math.floor(Math.random() * 5);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9
    });

    for (let i = 0; i < puffs; i++) {
      const size = 8 + Math.random() * 12;
      const geo = new THREE.DodecahedronGeometry(size, 0);
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
    cloudGroup.userData.baseX = x;
    cloudGroup.userData.baseZ = z;
    cloudGroup.userData.speed = 0.5 + Math.random() * 1.5;
    cloudGroup.userData.phase = Math.random() * Math.PI * 2;
    this.clouds.push(cloudGroup);
    this.group.add(cloudGroup);
    this.objects.push(cloudGroup);
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
