// Math utility functions

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mapLinear(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = (x - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}
