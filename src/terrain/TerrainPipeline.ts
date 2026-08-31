// TerrainPipeline - Simplified wrapper around DensityField
// Replaces the old CellSystem + TerrainPopulators approach
import { DensityField } from './DensityField';
import { SimplexNoise } from '../noise/SimplexNoise';

export class TerrainPipeline {
  private densityField: DensityField;
  private biomeNoise: SimplexNoise;
  private detailNoise: SimplexNoise;

  constructor(private seed: number) {
    this.densityField = new DensityField(seed);
    this.biomeNoise = new SimplexNoise(this.createRandom(seed + 3000));
    this.detailNoise = new SimplexNoise(this.createRandom(seed + 7000));
  }

  private createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  getDensityField(): DensityField {
    return this.densityField;
  }

  /**
   * Get the surface height at a world position.
   * This is the fast path used by WorldManager.getHeightAt() and physics.
   */
  getHeight(x: number, z: number): number {
    return this.densityField.surfaceHeight(x, z);
  }

  getForestDensity(x: number, z: number): number {
    const broad = this.biomeNoise.fbm2D(x * 0.0035, z * 0.0035, 4, 2.05, 0.52);
    const edge = this.detailNoise.noise2D(x * 0.011, z * 0.011);
    return Math.max(0, Math.min(1, (broad * 0.76 + edge * 0.24 + 0.36) / 0.88));
  }
}
