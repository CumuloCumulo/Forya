// ColorCalculator - Height and normal-based terrain coloring
// No longer depends on CellData/CellSystem; uses world height + face normal for coloring

import * as THREE from 'three';
import { SimplexNoise } from '../noise/SimplexNoise';

export class ColorCalculator {
  private colorNoise: SimplexNoise;

  constructor(seed: number) {
    let state = (seed + 999) >>> 0;
    this.colorNoise = new SimplexNoise(() => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    });
  }

  /**
   * Calculate color based on height and face normal.
   * @param height - World Y position
   * @param normalX - Face normal X component
   * @param normalY - Face normal Y component (1 = flat, 0 = vertical cliff)
   * @param worldX - World X for noise variation
   * @param worldZ - World Z for noise variation
   */
  calculateColor(height: number, normalX: number, normalY: number, normalZ: number, worldX: number, worldZ: number): THREE.Color {
    const color = new THREE.Color();
    const nv = this.colorNoise.noise2D(worldX * 0.3, worldZ * 0.3) * 0.05;

    // Slope from normal Y component: 1 = flat, 0 = vertical
    const slope = 1.0 - Math.abs(normalY);

    // 1. Steep slopes → rock/cliff
    if (slope > 0.7) {
      color.setHex(0x5d6567);
      const rockVar = this.colorNoise.noise2D(worldX * 0.1, worldZ * 0.1) * 0.1;
      color.r = Math.max(0, Math.min(1, color.r + nv + rockVar));
      color.g = Math.max(0, Math.min(1, color.g + nv + rockVar * 0.8));
      color.b = Math.max(0, Math.min(1, color.b + nv + rockVar * 0.6));
      return color;
    }

    // 2. Deep water
    if (height < -15) {
      color.setHex(0x2c3e50);
      return color;
    }

    // 3. Shallow water
    if (height < -3) {
      color.setHex(0x3a5a7c);
      return color;
    }

    // 4. Beach zone
    if (height >= -3 && height <= 3 && slope < 0.3) {
      color.setHex(0xc2b280);
      color.r = Math.max(0, Math.min(1, color.r + nv));
      color.g = Math.max(0, Math.min(1, color.g + nv));
      color.b = Math.max(0, Math.min(1, color.b + nv));
      return color;
    }

    // 5. Height-based coloring with slope blending
    if (height > 100) {
      // Snow
      color.setHex(0xe8f1ef);
      if (height < 130) {
        color.lerp(new THREE.Color(0x89918f), 0.34);
      }
    } else if (height > 60) {
      // Rock / snow transition
      color.setHex(0x777e7c);
      const snowBlend = (height - 60) / 40;
      color.lerp(new THREE.Color(0xe8f1ef), snowBlend * 0.62);
    } else if (height > 30) {
      // Rock / sparse vegetation
      color.setHex(0x626a64);
      if (slope < 0.3) {
        color.lerp(new THREE.Color(0x486944), 0.28);
      }
    } else if (height > 5) {
      // Grassland
      const pathNoise = this.colorNoise.noise2D(worldX * 0.1, worldZ * 0.1);
      if (pathNoise > 0.25) {
        color.setHex(0x615643); // exposed alpine soil
      } else {
        color.setHex(0x3f693e); // alpine grass
      }
      // Blend toward rock on slopes
      if (slope > 0.3) {
        const rockBlend = (slope - 0.3) / 0.4;
        color.lerp(new THREE.Color(0x646b67), rockBlend);
      }
    } else {
      // Low areas near water - marsh/sand
      color.setHex(0x4e7041);
      color.lerp(new THREE.Color(0x9e936d), 0.25);
    }

    // Add noise variation
    color.r = Math.max(0, Math.min(1, color.r + nv));
    color.g = Math.max(0, Math.min(1, color.g + nv));
    color.b = Math.max(0, Math.min(1, color.b + nv));

    return color;
  }
}
