import { DensityField } from './DensityField';

export interface TerrainMeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  physicsHeights?: Float32Array;
  physicsResolution?: number;
}

export interface ChunkMeshRequest {
  kind: 'chunk';
  seed: number;
  worldX: number;
  worldZ: number;
  size: number;
  resolution: number;
  includePhysics: boolean;
  skirtDepth: number;
}

export interface FarMeshRequest {
  kind: 'far';
  seed: number;
  centerX: number;
  centerZ: number;
  size: number;
  resolution: number;
  verticalOffset: number;
  innerHoleSize?: number;
}

export type TerrainMeshRequest = ChunkMeshRequest | FarMeshRequest;

const densityFields = new Map<number, DensityField>();

function getDensityField(seed: number): DensityField {
  let field = densityFields.get(seed);
  if (!field) {
    field = new DensityField(seed);
    densityFields.set(seed, field);
  }
  return field;
}

function buildSurface(
  field: DensityField,
  centerX: number,
  centerZ: number,
  size: number,
  resolution: number,
  verticalOffset = 0,
  innerHoleSize = 0,
): TerrainMeshData {
  const row = resolution + 1;
  const step = size / resolution;
  const half = size * 0.5;
  const positions = new Float32Array(row * row * 3);
  const normals = new Float32Array(row * row * 3);
  const innerHalf = innerHoleSize * 0.5;
  const fixedIndices = innerHalf > 0 ? null : new Uint32Array(resolution * resolution * 6);
  const sparseIndices: number[] = [];
  let indexCursor = 0;
  const normalSample = Math.min(2, Math.max(0.65, step * 0.12));
  let p = 0;

  for (let z = 0; z <= resolution; z++) {
    const worldZ = centerZ - half + z * step;
    for (let x = 0; x <= resolution; x++) {
      const worldX = centerX - half + x * step;
      const height = field.surfaceHeight(worldX, worldZ) + verticalOffset;
      positions[p] = worldX;
      positions[p + 1] = height;
      positions[p + 2] = worldZ;

      const left = field.surfaceHeight(worldX - normalSample, worldZ);
      const right = field.surfaceHeight(worldX + normalSample, worldZ);
      const back = field.surfaceHeight(worldX, worldZ - normalSample);
      const front = field.surfaceHeight(worldX, worldZ + normalSample);
      let nx = left - right;
      let ny = normalSample * 2;
      let nz = back - front;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      normals[p] = nx;
      normals[p + 1] = ny;
      normals[p + 2] = nz;
      p += 3;
    }
  }

  for (let z = 0; z < resolution; z++) {
    const cellZ = centerZ - half + (z + 0.5) * step;
    for (let x = 0; x < resolution; x++) {
      const cellX = centerX - half + (x + 0.5) * step;
      if (innerHalf > 0 && Math.abs(cellX - centerX) < innerHalf && Math.abs(cellZ - centerZ) < innerHalf) {
        continue;
      }
      const a = x + row * z;
      const b = a + 1;
      const c = x + row * (z + 1);
      const d = c + 1;
      if (fixedIndices) {
        fixedIndices[indexCursor++] = a;
        fixedIndices[indexCursor++] = c;
        fixedIndices[indexCursor++] = b;
        fixedIndices[indexCursor++] = b;
        fixedIndices[indexCursor++] = c;
        fixedIndices[indexCursor++] = d;
      } else {
        sparseIndices.push(a, c, b, b, c, d);
      }
    }
  }

  return { positions, normals, indices: fixedIndices || new Uint32Array(sparseIndices) };
}

function appendSkirts(data: TerrainMeshData, resolution: number, depth: number): TerrainMeshData {
  if (depth <= 0) return data;
  const row = resolution + 1;
  const baseVertexCount = data.positions.length / 3;
  const skirtVertexCount = row * 2 * 4;
  const positions = new Float32Array((baseVertexCount + skirtVertexCount) * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(data.indices.length + resolution * 6 * 4);
  positions.set(data.positions);
  normals.set(data.normals);
  indices.set(data.indices);
  let vertexCursor = baseVertexCount;
  let indexCursor = data.indices.length;

  const addEdge = (surfaceIndices: number[], outwardX: number, outwardZ: number, flip: boolean): void => {
    const edgeStart = vertexCursor;
    for (const sourceIndex of surfaceIndices) {
      const source = sourceIndex * 3;
      const top = vertexCursor++ * 3;
      const bottom = vertexCursor++ * 3;
      positions[top] = positions[bottom] = data.positions[source];
      positions[top + 1] = data.positions[source + 1];
      positions[bottom + 1] = data.positions[source + 1] - depth;
      positions[top + 2] = positions[bottom + 2] = data.positions[source + 2];
      normals[top] = normals[bottom] = outwardX;
      normals[top + 1] = normals[bottom + 1] = 0;
      normals[top + 2] = normals[bottom + 2] = outwardZ;
    }
    for (let i = 0; i < resolution; i++) {
      const topA = edgeStart + i * 2;
      const bottomA = topA + 1;
      const topB = topA + 2;
      const bottomB = topB + 1;
      if (flip) {
        indices[indexCursor++] = topA; indices[indexCursor++] = bottomA; indices[indexCursor++] = topB;
        indices[indexCursor++] = topB; indices[indexCursor++] = bottomA; indices[indexCursor++] = bottomB;
      } else {
        indices[indexCursor++] = topA; indices[indexCursor++] = topB; indices[indexCursor++] = bottomA;
        indices[indexCursor++] = topB; indices[indexCursor++] = bottomB; indices[indexCursor++] = bottomA;
      }
    }
  };

  const north = Array.from({ length: row }, (_, x) => x);
  const south = Array.from({ length: row }, (_, x) => x + row * resolution);
  const west = Array.from({ length: row }, (_, z) => row * z);
  const east = Array.from({ length: row }, (_, z) => resolution + row * z);
  addEdge(north, 0, -1, false);
  addEdge(south, 0, 1, true);
  addEdge(west, -1, 0, true);
  addEdge(east, 1, 0, false);
  return { ...data, positions, normals, indices };
}

export function buildTerrainMesh(request: TerrainMeshRequest): TerrainMeshData {
  const field = getDensityField(request.seed);
  if (request.kind === 'far') {
    return buildSurface(
      field,
      request.centerX,
      request.centerZ,
      request.size,
      request.resolution,
      request.verticalOffset,
      request.innerHoleSize,
    );
  }

  const data = appendSkirts(
    buildSurface(field, request.worldX, request.worldZ, request.size, request.resolution),
    request.resolution,
    request.skirtDepth,
  );
  if (!request.includePhysics) return data;

  const physicsResolution = 30;
  const row = physicsResolution + 1;
  const step = request.size / physicsResolution;
  const half = request.size * 0.5;
  const heights = new Float32Array(row * row);
  let cursor = 0;
  for (let ix = 0; ix <= physicsResolution; ix++) {
    const worldX = request.worldX - half + ix * step;
    for (let iz = 0; iz <= physicsResolution; iz++) {
      const worldZ = request.worldZ - half + iz * step;
      heights[cursor++] = field.surfaceHeight(worldX, worldZ);
    }
  }
  data.physicsHeights = heights;
  data.physicsResolution = physicsResolution;
  return data;
}
