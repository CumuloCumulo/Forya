// TerrainPipeline - Simplified wrapper around DensityField
// Replaces the old CellSystem + TerrainPopulators approach
import { DensityField } from './DensityField';
import { ColorCalculator } from './ColorCalculator';

export class TerrainPipeline {
  private densityField: DensityField;
  private colorCalc: ColorCalculator;

  constructor(private seed: number) {
    this.densityField = new DensityField(seed);
    this.colorCalc = new ColorCalculator(seed + 3000);
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

  getColorCalculator(): ColorCalculator {
    return this.colorCalc;
  }
}
