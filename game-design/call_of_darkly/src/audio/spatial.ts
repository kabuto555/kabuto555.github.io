/** Manual spatialization (gain + stereo pan) relative to the camera. Pure math, no WebAudio. */
export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  /** Listener right vector (unit). */
  rx: number;
  ry: number;
  rz: number;
}

export interface SpatialOpts {
  /** Distance at which the sound is still full volume. */
  ref?: number;
  /** Beyond this distance the sound is silent. */
  max?: number;
  rolloff?: number;
}

export interface SpatialResult {
  gain: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  dist: number;
}

const NO_OPTS: SpatialOpts = {};

/** Pass `out` to reuse a result object (no allocation in per-tick loops). */
export function spatialParams(l: ListenerPose, px: number, py: number, pz: number, o: SpatialOpts = NO_OPTS, out?: SpatialResult): SpatialResult {
  const r = out ?? { gain: 0, pan: 0, dist: 0 };
  const ref = o.ref ?? 4;
  const max = o.max ?? 70;
  const rolloff = o.rolloff ?? 1;
  const dx = px - l.x;
  const dy = py - l.y;
  const dz = pz - l.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  r.dist = dist;
  if (dist >= max) {
    r.gain = 0;
    r.pan = 0;
    return r;
  }
  let gain = dist <= ref ? 1 : ref / (ref + rolloff * (dist - ref));
  // Smooth fade to zero over the last 25% so sounds do not pop out at `max`.
  const fadeStart = max * 0.75;
  if (dist > fadeStart) gain *= (max - dist) / (max - fadeStart);
  const side = dist > 1e-4 ? (dx * l.rx + dy * l.ry + dz * l.rz) / dist : 0;
  // Close sounds pan less (they are "on top of" the listener).
  r.pan = Math.max(-1, Math.min(1, side * 0.85 * Math.min(1, dist / 2)));
  r.gain = gain;
  return r;
}

/** Listener pose from a camera-like object's world matrix (column-major, three.js layout). */
export function poseFromMatrix(e: ArrayLike<number>, out: ListenerPose): ListenerPose {
  out.rx = e[0]!;
  out.ry = e[1]!;
  out.rz = e[2]!;
  out.x = e[12]!;
  out.y = e[13]!;
  out.z = e[14]!;
  return out;
}
