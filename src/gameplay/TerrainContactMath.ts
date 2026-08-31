export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface TerrainContactResponse {
  velocity: Vector3Like;
  normal: Vector3Like;
  sliding: boolean;
}

export function calculateHeightfieldNormal(
  centerX: number,
  centerZ: number,
  getHeightAt: (x: number, z: number) => number,
  sampleRadius = 2.5,
): Vector3Like {
  const left = getHeightAt(centerX - sampleRadius, centerZ);
  const right = getHeightAt(centerX + sampleRadius, centerZ);
  const back = getHeightAt(centerX, centerZ - sampleRadius);
  const front = getHeightAt(centerX, centerZ + sampleRadius);
  const dx = (right - left) / (sampleRadius * 2);
  const dz = (front - back) / (sampleRadius * 2);
  const length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}

export function resolveSteepTerrainContact(
  velocity: Vector3Like,
  normal: Vector3Like,
  clearance: number,
): TerrainContactResponse {
  const inwardSpeed = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  const isSteep = normal.y < 0.82;
  if (clearance > 2.2 || !isSteep || inwardSpeed >= -0.35) {
    return { velocity: { ...velocity }, normal, sliding: false };
  }

  // Remove only the component driving the rider into the mountain. Preserve the
  // tangent component so a glancing hit becomes a scrape/slide, not a dead stop.
  const tangentX = velocity.x - normal.x * inwardSpeed;
  const tangentY = velocity.y - normal.y * inwardSpeed;
  const tangentZ = velocity.z - normal.z * inwardSpeed;
  const escapeSpeed = Math.min(11, Math.max(4.5, -inwardSpeed * 0.24));
  return {
    velocity: {
      x: tangentX * 0.94 + normal.x * escapeSpeed,
      y: tangentY * 0.94 + normal.y * escapeSpeed,
      z: tangentZ * 0.94 + normal.z * escapeSpeed,
    },
    normal,
    sliding: true,
  };
}
