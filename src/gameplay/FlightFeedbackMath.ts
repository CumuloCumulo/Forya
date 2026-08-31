function smoothstep(value: number, min: number, max: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

export function calculateSpeedRush(speedKmh: number): number {
  return smoothstep(speedKmh, 112, 205);
}

export function calculateWaterSkimIntensity(
  positionY: number,
  terrainHeight: number,
  speedKmh: number,
  waterLevel = -8,
): number {
  const waterClearance = positionY - waterLevel;
  if (terrainHeight >= waterLevel - 0.6 || waterClearance <= 0) return 0;
  const speedIntensity = smoothstep(speedKmh, 95, 210);
  const heightIntensity = 1 - smoothstep(waterClearance, 2, 11);
  return speedIntensity * heightIntensity;
}
