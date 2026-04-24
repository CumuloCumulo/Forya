// MarchingTetrahedra - Extract triangle mesh from a 3D density field
// Ported from VolumePixelWorld.cs PolygoniseCube + PolygoniseTetra
// Each voxel cube is split into 6 tetrahedra, each producing 0-2 triangles
// on the iso-surface (density=0 boundary).

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

// Tetrahedron vertex offsets within a cube (6 tetrahedra per cube)
// Each tetrahedron is defined by 4 cube-corner indices
// Cube corners:
//   0=(0,0,0) 1=(1,0,0) 2=(1,1,0) 3=(0,1,0)
//   4=(0,0,1) 5=(1,0,1) 6=(1,1,1) 7=(0,1,1)
const TETRA_CORNERS: number[][] = [
  [0, 1, 3, 7],
  [0, 1, 7, 4],
  [1, 5, 7, 4],
  [1, 2, 3, 7],
  [1, 2, 7, 6],
  [1, 5, 7, 6],
];

// Corner position offsets in cube space (x, y, z)
const CORNER_OFFSETS: [number, number, number][] = [
  [0, 0, 0], // 0
  [1, 0, 0], // 1
  [1, 1, 0], // 2
  [0, 1, 0], // 3
  [0, 0, 1], // 4
  [1, 0, 1], // 5
  [1, 1, 1], // 6
  [0, 1, 1], // 7
];

export class MarchingTetrahedra {
  private isoLevel: number;

  constructor(isoLevel: number = 0) {
    this.isoLevel = isoLevel;
  }

  /**
   * Extract a triangle mesh from a 3D density field.
   *
   * @param densityField - Flat array indexed as [x + sizeX * (y + sizeY * z)]
   * @param sizeX, sizeY, sizeZ - Grid dimensions (vertex counts)
   * @param originX, originY, originZ - World position of grid origin (corner 0,0,0)
   * @param stepX, stepY, stepZ - World-space spacing between grid points
   * @returns MeshData with positions and indices for Three.js BufferGeometry
   */
  polygonize(
    densityField: Float32Array,
    sizeX: number, sizeY: number, sizeZ: number,
    originX: number, originY: number, originZ: number,
    stepX: number, stepY: number, stepZ: number
  ): MeshData {
    const positions: number[] = [];
    const indices: number[] = [];
    const vertexMap = new Map<string, number>();

    // Iterate over all cubes (one fewer than grid size in each dimension)
    for (let iz = 0; iz < sizeZ - 1; iz++) {
      for (let iy = 0; iy < sizeY - 1; iy++) {
        for (let ix = 0; ix < sizeX - 1; ix++) {
          this.polygoniseCube(
            densityField, sizeX, sizeY, sizeZ,
            ix, iy, iz,
            originX, originY, originZ,
            stepX, stepY, stepZ,
            positions, indices, vertexMap
          );
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
    };
  }

  private getDensity(
    field: Float32Array,
    sizeX: number, sizeY: number,
    ix: number, iy: number, iz: number
  ): number {
    return field[ix + sizeX * (iy + sizeY * iz)];
  }

  private polygoniseCube(
    field: Float32Array,
    sizeX: number, sizeY: number, sizeZ: number,
    ix: number, iy: number, iz: number,
    originX: number, originY: number, originZ: number,
    stepX: number, stepY: number, stepZ: number,
    positions: number[], indices: number[], vertexMap: Map<string, number>
  ): void {
    // Get density at all 8 cube corners
    const d = new Float64Array(8);
    for (let c = 0; c < 8; c++) {
      const cx = ix + CORNER_OFFSETS[c][0];
      const cy = iy + CORNER_OFFSETS[c][1];
      const cz = iz + CORNER_OFFSETS[c][2];
      d[c] = this.getDensity(field, sizeX, sizeY, cx, cy, cz);
    }

    // Process each of the 6 tetrahedra
    for (let t = 0; t < 6; t++) {
      this.polygoniseTetra(
        d, TETRA_CORNERS[t],
        ix, iy, iz,
        originX, originY, originZ,
        stepX, stepY, stepZ,
        positions, indices, vertexMap
      );
    }
  }

  private polygoniseTetra(
    densities: Float64Array,
    corners: number[],
    ix: number, iy: number, iz: number,
    originX: number, originY: number, originZ: number,
    stepX: number, stepY: number, stepZ: number,
    positions: number[], indices: number[], vertexMap: Map<string, number>
  ): void {
    const c0 = corners[0], c1 = corners[1], c2 = corners[2], c3 = corners[3];
    const d0 = densities[c0] - this.isoLevel;
    const d1 = densities[c1] - this.isoLevel;
    const d2 = densities[c2] - this.isoLevel;
    const d3 = densities[c3] - this.isoLevel;

    // Classify each corner as inside (positive) or outside (negative)
    const inside0 = d0 > 0;
    const inside1 = d1 > 0;
    const inside2 = d2 > 0;
    const inside3 = d3 > 0;

    // Count corners inside
    let insideCount = 0;
    if (inside0) insideCount++;
    if (inside1) insideCount++;
    if (inside2) insideCount++;
    if (inside3) insideCount++;

    // All inside or all outside: no triangles
    if (insideCount === 0 || insideCount === 4) return;

    // Interpolation helper
    const interp = (
      fromCorner: number, toCorner: number,
      fromD: number, toD: number
    ): [number, number, number] => {
      const denom = fromD - toD;
      const t = Math.abs(denom) < 1e-10 ? 0.5 : fromD / denom;

      const wx = originX + (ix + CORNER_OFFSETS[fromCorner][0] + t * (CORNER_OFFSETS[toCorner][0] - CORNER_OFFSETS[fromCorner][0])) * stepX;
      const wy = originY + (iy + CORNER_OFFSETS[fromCorner][1] + t * (CORNER_OFFSETS[toCorner][1] - CORNER_OFFSETS[fromCorner][1])) * stepY;
      const wz = originZ + (iz + CORNER_OFFSETS[fromCorner][2] + t * (CORNER_OFFSETS[toCorner][2] - CORNER_OFFSETS[fromCorner][2])) * stepZ;
      return [wx, wy, wz];
    };

    // Get or create a vertex, returning its index
    const getVertex = (x: number, y: number, z: number): number => {
      // Quantize for deduplication (round to avoid float precision issues)
      const qx = Math.round(x * 10000);
      const qy = Math.round(y * 10000);
      const qz = Math.round(z * 10000);
      const key = `${qx},${qy},${qz}`;
      const existing = vertexMap.get(key);
      if (existing !== undefined) return existing;

      const idx = positions.length / 3;
      positions.push(x, y, z);
      vertexMap.set(key, idx);
      return idx;
    };

    // 3 corners inside, 1 outside → 1 triangle
    if (insideCount === 3) {
      let v0: [number, number, number], v1: [number, number, number], v2: [number, number, number];

      if (!inside0) {
        v0 = interp(c0, c1, d0, d1);
        v1 = interp(c0, c2, d0, d2);
        v2 = interp(c0, c3, d0, d3);
        // Flip winding for correct normal direction
        indices.push(getVertex(...v0), getVertex(...v2), getVertex(...v1));
      } else if (!inside1) {
        v0 = interp(c1, c0, d1, d0);
        v1 = interp(c1, c2, d1, d2);
        v2 = interp(c1, c3, d1, d3);
        indices.push(getVertex(...v0), getVertex(...v1), getVertex(...v2));
      } else if (!inside2) {
        v0 = interp(c2, c0, d2, d0);
        v1 = interp(c2, c1, d2, d1);
        v2 = interp(c2, c3, d2, d3);
        indices.push(getVertex(...v0), getVertex(...v2), getVertex(...v1));
      } else {
        v0 = interp(c3, c0, d3, d0);
        v1 = interp(c3, c1, d3, d1);
        v2 = interp(c3, c2, d3, d2);
        indices.push(getVertex(...v0), getVertex(...v1), getVertex(...v2));
      }
      return;
    }

    // 2 corners inside, 2 outside → 2 triangles (quad)
    if (insideCount === 2) {
      const quads: [number, number, number][] = [];

      // Find the 4 edges that cross the isosurface and interpolate
      const edges: [number, number, boolean][] = [
        [c0, c1, inside0 !== inside1],
        [c0, c2, inside0 !== inside2],
        [c0, c3, inside0 !== inside3],
        [c1, c2, inside1 !== inside2],
        [c1, c3, inside1 !== inside3],
        [c2, c3, inside2 !== inside3],
      ];

      for (const [from, to, crosses] of edges) {
        if (crosses) {
          quads.push(interp(from, to, densities[from] - this.isoLevel, densities[to] - this.isoLevel));
        }
      }

      if (quads.length >= 4) {
        const i0 = getVertex(...quads[0]);
        const i1 = getVertex(...quads[1]);
        const i2 = getVertex(...quads[2]);
        const i3 = getVertex(...quads[3]);

        // Two triangles forming the quad, with correct winding
        // Determine winding based on which corners are inside
        if (inside0 === inside1) {
          indices.push(i0, i2, i1, i1, i2, i3);
        } else if (inside0 === inside2) {
          indices.push(i0, i1, i2, i1, i3, i2);
        } else {
          indices.push(i0, i1, i3, i0, i3, i2);
        }
      }
      return;
    }

    // 1 corner inside, 3 outside → 1 triangle
    if (insideCount === 1) {
      let v0: [number, number, number], v1: [number, number, number], v2: [number, number, number];

      if (inside0) {
        v0 = interp(c0, c1, d0, d1);
        v1 = interp(c0, c2, d0, d2);
        v2 = interp(c0, c3, d0, d3);
        indices.push(getVertex(...v0), getVertex(...v1), getVertex(...v2));
      } else if (inside1) {
        v0 = interp(c1, c0, d1, d0);
        v1 = interp(c1, c2, d1, d2);
        v2 = interp(c1, c3, d1, d3);
        indices.push(getVertex(...v0), getVertex(...v2), getVertex(...v1));
      } else if (inside2) {
        v0 = interp(c2, c0, d2, d0);
        v1 = interp(c2, c1, d2, d1);
        v2 = interp(c2, c3, d2, d3);
        indices.push(getVertex(...v0), getVertex(...v2), getVertex(...v1));
      } else {
        v0 = interp(c3, c0, d3, d0);
        v1 = interp(c3, c1, d3, d1);
        v2 = interp(c3, c2, d3, d2);
        indices.push(getVertex(...v0), getVertex(...v1), getVertex(...v2));
      }
    }
  }
}
