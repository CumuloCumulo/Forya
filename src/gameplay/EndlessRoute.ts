export interface RoutePoint {
  sequence: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

const MIN_SPACING = 300;
const SPACING_VARIATION = 120;
const MAX_HEADING_STEP = 0.18;
const TERRAIN_SIGHT_MARGIN = 18;
const SIGHT_SAMPLES = 18;

export class EndlessRoutePlanner {
  private randomState = 0x6d2b79f5;
  private sequence = 0;
  private x = 0;
  private z = 0;
  private y: number | null = null;
  private heading = 0;

  reset(): void {
    this.randomState = 0x6d2b79f5;
    this.sequence = 0;
    this.x = 0;
    this.z = 0;
    this.y = null;
    this.heading = 0;
  }

  next(getHeightAt: (x: number, z: number) => number): RoutePoint {
    const spacing = MIN_SPACING + this.random() * SPACING_VARIATION;
    this.heading += (this.random() - 0.5) * MAX_HEADING_STEP * 2;
    this.heading = Math.max(-1.08, Math.min(1.08, this.heading));
    const previousX = this.x;
    const previousZ = this.z;
    const previousY = this.y;
    this.x += Math.sin(this.heading) * spacing;
    this.z += Math.cos(this.heading) * spacing;
    this.sequence++;
    const clearance = 68 + this.random() * 38;
    let y = getHeightAt(this.x, this.z) + clearance;

    // Keep the complete segment from the previous gate above sampled terrain.
    // This turns next-gate visibility into a route invariant instead of relying
    // on a lucky terrain opening. The subdued x-ray material in RouteSystem is
    // retained as a visual fallback for props and unsampled fine relief.
    if (previousY !== null) {
      y = Math.max(y, previousY - 28);
      for (let index = 1; index < SIGHT_SAMPLES; index++) {
        const t = index / SIGHT_SAMPLES;
        const sampleX = previousX + (this.x - previousX) * t;
        const sampleZ = previousZ + (this.z - previousZ) * t;
        const requiredEndY = (getHeightAt(sampleX, sampleZ) + TERRAIN_SIGHT_MARGIN - previousY * (1 - t)) / t;
        y = Math.max(y, requiredEndY);
      }
    }
    this.y = y;
    return {
      sequence: this.sequence,
      x: this.x,
      y,
      z: this.z,
      heading: this.heading,
    };
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}

export function hasTerrainLineOfSight(
  from: RoutePoint,
  to: RoutePoint,
  getHeightAt: (x: number, z: number) => number,
  margin = TERRAIN_SIGHT_MARGIN,
): boolean {
  for (let index = 1; index < SIGHT_SAMPLES; index++) {
    const t = index / SIGHT_SAMPLES;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const sightY = from.y + (to.y - from.y) * t;
    if (sightY < getHeightAt(x, z) + margin - 0.001) return false;
  }
  return true;
}
