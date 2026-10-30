import type { Vec3Like } from '../core/types';
import type { KinematicCapsule } from '../physics/capsule';
import { SpatialGrid } from '../physics/grid';
import { Layer, type CollisionWorld, type RayHit } from '../physics/types';

const MASK = Layer.World | Layer.Prop;

export interface MantleProbeOptions {
  radius: number;
  reach: number;
  minHeight: number;
  maxHeight: number;
  inset: number;
  /** Min -dot(wallNormal, forward). */
  facing: number;
}

export interface MantleTarget {
  /** Ledge top height above the feet. */
  height: number;
  /** Final feet position on the ledge. */
  end: Vec3Like;
  /** Wall normal (horizontal, unit). */
  normal: Vec3Like;
}

// Scratch (single-threaded sim): probes allocate nothing per call.
const ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, maxDist: 0 };
const mkHit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, distance: 0, collider: null });
const wallHit = mkHit();
const downHit = mkHit();
const headHit = mkHit();
const supHit = mkHit();

function cast(world: CollisionWorld, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, out: RayHit): RayHit | null {
  ray.origin.x = ox;
  ray.origin.y = oy;
  ray.origin.z = oz;
  ray.dir.x = dx;
  ray.dir.y = dy;
  ray.dir.z = dz;
  ray.maxDist = maxDist;
  return world instanceof SpatialGrid ? world.raycast(ray, MASK, out) : world.raycast(ray, MASK);
}

/** Path samples (fractions of start→end, horizontal at the end height) the capsule must fit through. */
const PATH_SAMPLES = [0.25, 0.5, 0.75, 1];

/**
 * §3 mantle probes:
 *  1. chest ray (just under the min ledge height) forward hits a near-vertical wall we face;
 *  2. down ray from just above the max ledge height, past the wall face, finds a flat top in [min, max];
 *  3. head ray just above that top is clear (nothing stacked on the ledge);
 *  4. the capsule fits straight above the start, and at several points along the path across
 *     the ledge to the end position (a lintel/pillar between start and end rejects);
 *  5. the end position has support (flat top under the axis); if the preferred end (inset) is
 *     off the ledge it is shortened toward the wall, else rejected.
 * `fwdX/fwdZ` = unit look direction on the ground plane. Returns null if any probe fails.
 * Pass `out` to reuse the result object (then the return value is `out` or null).
 */
export function probeMantle(
  world: CollisionWorld,
  capsule: KinematicCapsule,
  feet: Vec3Like,
  fwdX: number,
  fwdZ: number,
  o: MantleProbeOptions,
  out?: MantleTarget,
): MantleTarget | null {
  const reach = o.radius + o.reach;
  // 1. chest ray
  const chestY = feet.y + Math.max(0.1, o.minHeight - 0.1);
  const wall = cast(world, feet.x, chestY, feet.z, fwdX, 0, fwdZ, reach, wallHit);
  if (!wall) return null;
  const n = wall.normal;
  if (Math.abs(n.y) > 0.3) return null;
  if (-(n.x * fwdX + n.z * fwdZ) < o.facing) return null;
  const wpx = wall.point.x;
  const wpz = wall.point.z;
  const nx = n.x;
  const nz = n.z;
  // 2. down ray, 0.25 m past the wall face (into the ledge)
  const topProbeY = feet.y + o.maxHeight + 0.05;
  const down = cast(world, wpx - nx * 0.25, topProbeY, wpz - nz * 0.25, 0, -1, 0, o.maxHeight + 0.05 - o.minHeight + 0.01, downHit);
  if (!down || down.normal.y < 0.7) return null;
  const top = down.point.y;
  const height = top - feet.y;
  if (height < o.minHeight - 1e-3 || height > o.maxHeight + 1e-3) return null;
  // 3. head ray just above the ledge top
  if (cast(world, feet.x, top + 0.4, feet.z, fwdX, 0, fwdZ, reach + 0.3, headHit)) return null;
  // 4a. capsule fits at the lift point
  const ey = top + 0.002;
  if (capsule.overlaps(world, feet.x, ey, feet.z)) return null;
  // 4b/5. pick the furthest end (inset → 0.25 m past the face) that has support and a clear path.
  const far = o.radius + o.inset;
  for (let k = 0; k < 3; k++) {
    const d = k === 0 ? far : k === 1 ? Math.max(0.25, (far + 0.25) / 2) : 0.25;
    if (k > 0 && d >= far - 1e-3) break;
    const ex = wpx - nx * d;
    const ez = wpz - nz * d;
    const sup = cast(world, ex, ey + 0.3, ez, 0, -1, 0, 0.6, supHit);
    if (!sup || sup.normal.y < 0.7 || Math.abs(sup.point.y - top) > 0.05) continue;
    let clear = true;
    for (let i = 0; i < PATH_SAMPLES.length; i++) {
      const f = PATH_SAMPLES[i]!;
      if (capsule.overlaps(world, feet.x + (ex - feet.x) * f, ey, feet.z + (ez - feet.z) * f)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const t = out ?? { height: 0, end: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } };
    t.height = height;
    t.end.x = ex;
    t.end.y = ey;
    t.end.z = ez;
    t.normal.x = nx;
    t.normal.y = 0;
    t.normal.z = nz;
    return t;
  }
  return null;
}
