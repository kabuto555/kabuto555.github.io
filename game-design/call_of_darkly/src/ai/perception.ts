// World-facing perception: line-of-sight rays against the static collision grid (no allocation).
import type { Vec3Like } from '../core/types';
import { Layer, type CollisionWorld, type LayerMask, type Ray, type RayHit } from '../physics/types';

/** Sight is blocked by level geometry, barriers and props (not by other enemies). */
export const SIGHT_MASK: LayerMask = Layer.World | Layer.Barrier | Layer.Prop;

/** CollisionWorld whose raycast accepts a reusable result (SpatialGrid does; others ignore it). */
type RaycastWorld = CollisionWorld & { raycast(ray: Ray, mask?: LayerMask, out?: RayHit): RayHit | null };

export class LineOfSight {
  private readonly world: RaycastWorld;
  private readonly ray: Ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, maxDist: 0 };
  private readonly out: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, distance: 0, collider: null };
  /** Rays cast (perf counter). */
  rays = 0;

  constructor(world: CollisionWorld) {
    this.world = world as RaycastWorld;
  }

  /** True if nothing in `mask` blocks the segment a→b. */
  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number, mask: LayerMask = SIGHT_MASK): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    const r = this.ray;
    r.origin.x = ax;
    r.origin.y = ay;
    r.origin.z = az;
    r.dir.x = dx / len;
    r.dir.y = dy / len;
    r.dir.z = dz / len;
    r.maxDist = len - 0.05;
    this.rays++;
    return this.world.raycast(r, mask, this.out) === null;
  }

  /** Knee-height walk line between two ground points (feet positions). */
  walkable(a: Vec3Like, b: Vec3Like, h = 0.5): boolean {
    return this.clear(a.x, a.y + h, a.z, b.x, b.y + h, b.z);
  }
}
