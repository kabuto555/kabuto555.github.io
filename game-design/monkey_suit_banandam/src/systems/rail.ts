// Rail path system — defines the on-rails track and camera follow logic

type Vector3 = InstanceType<typeof THREE.Vector3>;
type CatmullRomCurve3 = InstanceType<typeof THREE.CatmullRomCurve3>;

export interface Rail {
  curve: CatmullRomCurve3;
  /** Total world-space length estimate (for pacing) */
  length: number;
}

/** Generate a new rail for a given stage index. Each stage gets a randomly shaped curve. */
export function generateRail(stageIndex: number): Rail {
  // Stage length gets longer over time
  const baseLen = 80 + stageIndex * 20;
  const numPoints = 8 + Math.floor(Math.random() * 4); // 8–11 control points, random

  const points: Vector3[] = [];
  // Start at origin (or carry-over from last stage end)
  points.push(new THREE.Vector3(0, 0, 0));

  let x = 0, y = 0;
  for (let i = 1; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    // Progress forward (negative Z is "into screen" in our camera setup)
    const z = -t * baseLen;
    // Lateral sweeps — randomly varied spread
    const spread = 3 + Math.random() * 4;
    x += (Math.random() - 0.5) * spread;
    y += (Math.random() - 0.5) * spread * 0.5;
    // Clamp so rail doesn't go crazy
    x = Math.max(-12, Math.min(12, x));
    y = Math.max(-5, Math.min(5, y));
    points.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  return { curve, length: baseLen };
}

/** Get player world position along rail at normalized t [0..1] */
export function getRailPosition(rail: Rail, t: number): Vector3 {
  return rail.curve.getPointAt(Math.max(0, Math.min(1, t)));
}

/** Get the forward tangent direction at t */
export function getRailTangent(rail: Rail, t: number): Vector3 {
  return rail.curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize();
}

/** Get orthonormal basis at a point on the rail (forward, right, up) */
export function getRailBasis(rail: Rail, t: number): {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
} {
  const forward = getRailTangent(rail, t);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
}
