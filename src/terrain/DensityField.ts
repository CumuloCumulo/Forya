// DensityField - Multi-octave Perlin noise terrain with amplitude modulation
// Ported from Unity VolumePixelWorld.cs surface height generation
// Density field: density(x,y,z) = surfaceHeight(x,z) - y
// density > 0 = solid, density < 0 = air, density = 0 = surface

import { PerlinNoise } from '../noise/PerlinNoise';

export interface DensityFieldParams {
  mountainHeight: number;
  mountainWidth: number;
  landHeight: number;
  landWidth: number;
  mode: 'cosine' | 'arctan';
}

const DEFAULT_PARAMS: DensityFieldParams = {
  mountainHeight: 400,
  mountainWidth: 0.002,
  landHeight: 600,
  landWidth: 0.0005,
  mode: 'cosine',
};

export class DensityField {
  private noise: PerlinNoise;
  private noiseLand: PerlinNoise;
  private params: DensityFieldParams;

  constructor(seed: number, params?: Partial<DensityFieldParams>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.noise = this.createSeededPerlin(seed);
    this.noiseLand = this.createSeededPerlin(seed + 1000);
  }

  private createSeededPerlin(seed: number): PerlinNoise {
    let s = seed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
    return new PerlinNoise(rng);
  }

  /**
   * Normalize noise from [-1,1] to [0,1] range.
   * Our PerlinNoise returns [-1,1] but Unity's Mathf.PerlinNoise returns [0,1].
   * All the VolumePixelWorld.cs formulas assume [0,1] input.
   */
  private n01(noise: PerlinNoise, x: number, y: number): number {
    return noise.noise2D(x, y) * 0.5 + 0.5;
  }

  /**
   * Compute surface height at world position (x, z).
   * Uses 5 octaves of mountain noise with amplitude modulation + 1 octave of land noise.
   * Ported from VolumePixelWorld.cs lines 222-232.
   */
  surfaceHeight(worldX: number, worldZ: number): number {
    const { mountainHeight, mountainWidth, landHeight, landWidth } = this.params;

    const nx = worldX * mountainWidth;
    const nz = worldZ * mountainWidth;

    // Modulator: controls where fine detail appears (more detail in rough terrain)
    // Uses normalized [0,1] noise
    const mountainNoise = this.n01(this.noise, nx * 0.5, nz * 0.5);
    const landNoiseVal = this.n01(this.noiseLand, worldX * landWidth, worldZ * landWidth);
    const modulator = Math.max(0, (mountainNoise - 0.5) + (landNoiseVal - 0.5) + 0.5);

    // 5 octaves of mountain noise with amplitude modulation
    // Each octave uses normalized [0,1] noise, then (noise - 0.5) gives [-0.5, 0.5]
    let y = 0;

    // Octave 1: broad terrain shape
    y += (this.n01(this.noise, nx, nz) - 0.5) * mountainHeight;

    // Octave 2: medium detail
    y += (this.n01(this.noise, nx * 1.7, nz * 1.7) - 0.5) * 0.7 * mountainHeight * modulator;

    // Octave 3: fine detail
    y += (this.n01(this.noise, nx * 4, nz * 4) - 0.5) * 0.4 * mountainHeight * modulator;

    // Octave 4: micro detail
    y += (this.n01(this.noise, nx * 16, nz * 16) - 0.5) * 0.2 * mountainHeight * modulator;

    // Octave 5: ultra-fine detail
    y += (this.n01(this.noise, nx * 180, nz * 180) - 0.5) * 0.02 * mountainHeight * modulator;

    // Land noise: large-scale continent shapes
    y += (this.n01(this.noiseLand, worldX * landWidth, worldZ * landWidth) - 0.5) * landHeight;

    // Post-processing
    if (this.params.mode === 'cosine') {
      // Cosine flattening: compresses valleys, keeps peaks
      if (y < 0) {
        y = -(1 - Math.cos(y * Math.PI / (mountainHeight * 0.8))) * mountainHeight * 0.8 / Math.PI;
      }
    } else {
      // Arctan sharpening: sharpens peaks
      y = Math.atan(y / (mountainHeight * 0.3)) * mountainHeight * 0.3;
    }

    return y;
  }

  /**
   * Get density at a world position.
   * Positive = solid (underground), negative = air (above ground), zero = surface.
   */
  getDensity(worldX: number, worldY: number, worldZ: number): number {
    return this.surfaceHeight(worldX, worldZ) - worldY;
  }

  /**
   * Build a 3D density field grid for a chunk.
   * Optimized: reuses surfaceHeight for each (x,z) column, only iterates Y for density diff.
   * Returns a flat Float32Array indexed as [x + sizeX * (y + sizeY * z)].
   */
  buildDensityGrid(
    originX: number, originY: number, originZ: number,
    sizeX: number, sizeY: number, sizeZ: number,
    stepX: number, stepY: number, stepZ: number
  ): Float32Array {
    const grid = new Float32Array(sizeX * sizeY * sizeZ);

    // Optimize: compute surfaceHeight once per (x,z) column
    for (let iz = 0; iz < sizeZ; iz++) {
      const wz = originZ + iz * stepZ;
      for (let ix = 0; ix < sizeX; ix++) {
        const wx = originX + ix * stepX;
        const surfH = this.surfaceHeight(wx, wz);

        // Fill density = surfH - wy for all Y values in this column
        for (let iy = 0; iy < sizeY; iy++) {
          const wy = originY + iy * stepY;
          grid[ix + sizeX * (iy + sizeY * iz)] = surfH - wy;
        }
      }
    }

    return grid;
  }
}
