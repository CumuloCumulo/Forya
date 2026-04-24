// Worley (Voronoi) Noise - implements INoiseModule
// Supports F1, F2, F2-F1, F2/F1 distance metrics
// Exposes getCellId for region selection
import type { INoiseModule } from './NoiseModule';

export enum WorleyMetric {
  F1 = 0,
  F2 = 1,
  F2_MINUS_F1 = 2,
  F2_DIV_F1 = 3,
}

// Simple hash-based PRNG seeded by cell coordinates
function hashCell(ix: number, iy: number, seed: number): number {
  let h = seed;
  h = ((h << 5) - h + ix) | 0;
  h = ((h << 5) - h + iy) | 0;
  h = ((h ^ (h >> 16)) * 0x45d9f3b) | 0;
  h = ((h ^ (h >> 16)) * 0x45d9f3b) | 0;
  h = (h ^ (h >> 16)) | 0;
  return h;
}

function hashFloat(ix: number, iy: number, seed: number, subIndex: number): number {
  let h = hashCell(ix, iy, seed);
  h = ((h << 5) - h + subIndex) | 0;
  h = ((h ^ (h >> 16)) * 0x45d9f3b) | 0;
  return ((h & 0x7fffffff) / 0x7fffffff);
}

export interface WorleyDetail {
  f1: number;
  f2: number;
  f1Point: { x: number; y: number };
  f2Point: { x: number; y: number };
  cellId: number;
}

export class WorleyNoise implements INoiseModule {
  private seed: number;
  private metric: WorleyMetric;
  private distanceType: 'euclidean' | 'manhattan' | 'chebyshev';

  constructor(
    seed: number = 0,
    metric: WorleyMetric = WorleyMetric.F1,
    distanceType: 'euclidean' | 'manhattan' | 'chebyshev' = 'euclidean'
  ) {
    this.seed = seed;
    this.metric = metric;
    this.distanceType = distanceType;
  }

  private distance(dx: number, dy: number): number {
    switch (this.distanceType) {
      case 'manhattan': return Math.abs(dx) + Math.abs(dy);
      case 'chebyshev': return Math.max(Math.abs(dx), Math.abs(dy));
      default: return Math.sqrt(dx * dx + dy * dy);
    }
  }

  /**
   * Get the cell ID (hashed from grid coordinates) for a point
   */
  getCellId(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    let minDist = Infinity;
    let closestId = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = ix + dx;
        const cy = iy + dy;
        // Feature point position within cell
        const fx = cx + hashFloat(cx, cy, this.seed, 0);
        const fy = cy + hashFloat(cx, cy, this.seed, 1);
        const d = this.distance(x - fx, y - fy);
        if (d < minDist) {
          minDist = d;
          closestId = hashCell(cx, cy, this.seed) & 0x7fffffff;
        }
      }
    }
    return closestId;
  }

  /**
   * Get the distance to the nearest cell edge (approximated as F2 - F1)
   */
  getEdgeDistance(x: number, y: number): number {
    const info = this.getWorleyDetail(x, y);
    return info.f2 - info.f1;
  }

  /**
   * Get full Worley detail: F1/F2 distances, feature point coords, and cellId
   */
  getWorleyDetail(x: number, y: number): WorleyDetail {
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    let f1 = Infinity;
    let f2 = Infinity;
    let cellId = 0;
    let f1Point = { x: 0, y: 0 };
    let f2Point = { x: 0, y: 0 };

    // 3x3 neighborhood search
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const fx = cx + hashFloat(cx, cy, this.seed, 0);
        const fy = cy + hashFloat(cx, cy, this.seed, 1);
        const d = this.distance(x - fx, y - fy);

        if (d < f1) {
          f2 = f1;
          f2Point = f1Point;
          f1 = d;
          f1Point = { x: fx, y: fy };
          cellId = hashCell(cx, cy, this.seed) & 0x7fffffff;
        } else if (d < f2) {
          f2 = d;
          f2Point = { x: fx, y: fy };
        }
      }
    }

    return { f1, f2, f1Point, f2Point, cellId };
  }

  get(x: number, y: number): number {
    const { f1, f2 } = this.getWorleyDetail(x, y);

    switch (this.metric) {
      case WorleyMetric.F1: return f1;
      case WorleyMetric.F2: return f2;
      case WorleyMetric.F2_MINUS_F1: return f2 - f1;
      case WorleyMetric.F2_DIV_F1: return f1 > 0.0001 ? f2 / f1 : 1.0;
      default: return f1;
    }
  }
}
