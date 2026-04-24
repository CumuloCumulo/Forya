// Domain warping - organic distortion of noise coordinates
import type { INoiseModule } from './NoiseModule';

/**
 * Single domain warp: offset input coordinates using a noise module
 * new_x = x + strength * warpX.get(x, y)
 * new_y = y + strength * warpY.get(x, y)
 */
export class DomainWarp implements INoiseModule {
  constructor(
    private source: INoiseModule,
    private warpX: INoiseModule,
    private warpY: INoiseModule,
    private strength: number = 1.0
  ) {}

  get(x: number, y: number): number {
    const wx = x + this.strength * this.warpX.get(x, y);
    const wy = y + this.strength * this.warpY.get(x, y);
    return this.source.get(wx, wy);
  }
}

/**
 * Compound warp: two successive domain warps for organic shapes
 * First pass: small-scale Perlin-like distortion
 * Second pass: large-scale Simplex-like distortion
 */
export class CompoundWarp implements INoiseModule {
  private warp1: DomainWarp;
  private warp2: DomainWarp;

  constructor(
    source: INoiseModule,
    warpX1: INoiseModule, warpY1: INoiseModule, strength1: number,
    warpX2: INoiseModule, warpY2: INoiseModule, strength2: number
  ) {
    // First warp applied to source
    this.warp1 = new DomainWarp(source, warpX1, warpY1, strength1);
    // Second warp applied to result of first warp
    this.warp2 = new DomainWarp(this.warp1, warpX2, warpY2, strength2);
  }

  get(x: number, y: number): number {
    return this.warp2.get(x, y);
  }
}
