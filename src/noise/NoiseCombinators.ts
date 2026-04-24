// Noise combinators - composable noise operations
import type { INoiseModule } from './NoiseModule';

/** Add two noise modules */
export class AddModule implements INoiseModule {
  constructor(private a: INoiseModule, private b: INoiseModule) {}
  get(x: number, y: number): number {
    return this.a.get(x, y) + this.b.get(x, y);
  }
}

/** Multiply two noise modules */
export class MultiplyModule implements INoiseModule {
  constructor(private a: INoiseModule, private b: INoiseModule) {}
  get(x: number, y: number): number {
    return this.a.get(x, y) * this.b.get(x, y);
  }
}

/** Blend two modules with a fixed factor */
export class BlendModule implements INoiseModule {
  constructor(private a: INoiseModule, private b: INoiseModule, private factor: number) {}
  get(x: number, y: number): number {
    const va = this.a.get(x, y);
    const vb = this.b.get(x, y);
    return va + (vb - va) * this.factor;
  }
}

/** Clamp output to [min, max] */
export class ClampModule implements INoiseModule {
  constructor(private source: INoiseModule, private min: number, private max: number) {}
  get(x: number, y: number): number {
    return Math.max(this.min, Math.min(this.max, this.source.get(x, y)));
  }
}

/** Ridge noise: 1 - abs(signal), squared */
export class RidgeModule implements INoiseModule {
  constructor(private source: INoiseModule) {}
  get(x: number, y: number): number {
    const v = this.source.get(x, y);
    const r = 1.0 - Math.abs(v);
    return r * r;
  }
}

/** Billow noise: 1 - abs(signal), not squared */
export class BillowModule implements INoiseModule {
  constructor(private source: INoiseModule) {}
  get(x: number, y: number): number {
    return 1.0 - Math.abs(this.source.get(x, y));
  }
}

/** FBM: fractal brownian motion wrapping any INoiseModule */
export class FBMModule implements INoiseModule {
  constructor(
    private source: INoiseModule,
    private octaves: number = 6,
    private lacunarity: number = 2.0,
    private persistence: number = 0.5
  ) {}

  get(x: number, y: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < this.octaves; i++) {
      total += this.source.get(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    return total / maxValue;
  }
}

/** Terrace: quantize noise into stepped terraces */
export class TerraceModule implements INoiseModule {
  private levels: number[];

  constructor(private source: INoiseModule, numLevels: number = 6) {
    this.levels = [];
    for (let i = 0; i < numLevels; i++) {
      this.levels.push(i / (numLevels - 1));
    }
  }

  get(x: number, y: number): number {
    // Map source to [0,1] range
    let v = (this.source.get(x, y) + 1) * 0.5;
    v = Math.max(0, Math.min(1, v));

    // Find the two bracketing levels
    for (let i = 0; i < this.levels.length - 1; i++) {
      if (v <= this.levels[i + 1]) {
        const t = (v - this.levels[i]) / (this.levels[i + 1] - this.levels[i]);
        // Smoothstep between levels
        const st = t * t * (3 - 2 * t);
        return this.levels[i] + st * (this.levels[i + 1] - this.levels[i]);
      }
    }
    return this.levels[this.levels.length - 1];
  }
}

/** Steps: hard quantization into discrete steps */
export class StepsModule implements INoiseModule {
  constructor(private source: INoiseModule, private numSteps: number = 5) {}

  get(x: number, y: number): number {
    let v = (this.source.get(x, y) + 1) * 0.5;
    v = Math.max(0, Math.min(1, v));
    const step = Math.floor(v * this.numSteps) / this.numSteps;
    return step * 2 - 1; // back to [-1, 1]
  }
}

/** Curve: remap noise through a curve defined by control points */
export class CurveModule implements INoiseModule {
  private points: { x: number; y: number }[];

  constructor(private source: INoiseModule, points: { x: number; y: number }[]) {
    this.points = points.sort((a, b) => a.x - b.x);
  }

  get(x: number, y: number): number {
    const v = this.source.get(x, y);
    const pts = this.points;

    if (v <= pts[0].x) return pts[0].y;
    if (v >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

    for (let i = 0; i < pts.length - 1; i++) {
      if (v >= pts[i].x && v <= pts[i + 1].x) {
        const t = (v - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return v;
  }
}

/** Boost: scale and offset a noise module */
export class BoostModule implements INoiseModule {
  constructor(private source: INoiseModule, private scale: number, private offset: number = 0) {}
  get(x: number, y: number): number {
    return this.source.get(x, y) * this.scale + this.offset;
  }
}

/** MapRange: remap output from [inMin, inMax] to [outMin, outMax] */
export class MapRangeModule implements INoiseModule {
  constructor(
    private source: INoiseModule,
    private inMin: number, private inMax: number,
    private outMin: number, private outMax: number
  ) {}

  get(x: number, y: number): number {
    const v = this.source.get(x, y);
    const t = Math.max(0, Math.min(1, (v - this.inMin) / (this.inMax - this.inMin)));
    return this.outMin + t * (this.outMax - this.outMin);
  }
}

/** ScaleDomain: scale the input coordinates */
export class ScaleDomainModule implements INoiseModule {
  constructor(private source: INoiseModule, private scaleX: number, private scaleY: number) {}
  get(x: number, y: number): number {
    return this.source.get(x * this.scaleX, y * this.scaleY);
  }
}
