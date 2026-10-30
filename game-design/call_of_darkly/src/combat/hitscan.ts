import type { Vec3Like } from '../core/types';
import { Layer, type CollisionWorld, type Ray, type RayHit } from '../physics/types';
import { rayVCapsule, raySphere } from './math';
import type { HitTarget } from './targets';

/** Bullets stop at solid world/props; barriers (invisible walls, fog) don't stop them. */
export const BULLET_MASK = Layer.World | Layer.Prop;

export interface BulletHit {
  kind: 'none' | 'world' | 'target';
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  target: HitTarget | null;
  region: 'head' | 'body';
  /** World hit on a moving collider (door/prop): fx skips decals. */
  dynamic?: boolean;
}

export function newBulletHit(): BulletHit {
  return { kind: 'none', distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, target: null, region: 'body' };
}

const sphereC = { x: 0, y: 0, z: 0 };

/** Nearest target hit along a ray (head sphere beats body on ties). Returns t or -1. */
export function rayTarget(o: Vec3Like, d: Vec3Like, t: HitTarget, maxT: number, outRegion: { r: 'head' | 'body' }): number {
  const p = t.transform.position;
  const s = t.hit;
  sphereC.x = p.x;
  sphereC.y = p.y + s.headY;
  sphereC.z = p.z;
  const th = raySphere(o, d, sphereC, s.headRadius, maxT);
  const tb = rayVCapsule(o, d, p.x, p.y + s.bodyRadius, p.z, p.y + Math.max(s.bodyRadius, s.bodyHeight - s.bodyRadius), s.bodyRadius, maxT);
  if (th >= 0 && (tb < 0 || th <= tb + 0.02)) {
    outRegion.r = 'head';
    return th;
  }
  if (tb >= 0) {
    outRegion.r = 'body';
    return tb;
  }
  return -1;
}

const ray: Ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, maxDist: 1 };
const worldHit: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, distance: 0, collider: null };
const regionTmp: { r: 'head' | 'body' } = { r: 'body' };

function tryTarget(t: HitTarget, o: Vec3Like, d: Vec3Like, best: number, out: BulletHit): number {
  if (!t.alive) return best;
  const th = rayTarget(o, d, t, best, regionTmp);
  if (th >= 0 && th <= best) {
    out.kind = 'target';
    out.target = t;
    out.region = regionTmp.r;
    out.distance = th;
    return th;
  }
  return best;
}

/**
 * Cast one bullet: world via the grid raycast, targets via analytic hit volumes; nearest wins.
 * Allocation-free when `targets` is an array (a Set iterator allocates): results written into `out`, module-scope scratch only.
 */
export function castBullet(world: CollisionWorld, targets: ReadonlyArray<HitTarget> | Iterable<HitTarget>, o: Vec3Like, d: Vec3Like, maxDist: number, out: BulletHit): BulletHit {
  ray.origin = o;
  ray.dir = d;
  ray.maxDist = maxDist;
  // SpatialGrid.raycast accepts an `out` param (CollisionWorld's interface omits it); extra arg is harmless elsewhere.
  const wh = (world as { raycast(r: Ray, m?: number, out?: RayHit): RayHit | null }).raycast(ray, BULLET_MASK, worldHit);
  let best = wh ? wh.distance : maxDist;
  out.kind = wh ? 'world' : 'none';
  out.target = null;
  out.distance = best;
  if (wh) {
    const c = wh.collider;
    out.dynamic = !!c && ((c.layer & Layer.Prop) !== 0 || (c.tag?.startsWith('door:') ?? false));
    out.normal.x = wh.normal.x;
    out.normal.y = wh.normal.y;
    out.normal.z = wh.normal.z;
  }
  if (Array.isArray(targets)) {
    const arr = targets as ReadonlyArray<HitTarget>;
    for (let i = 0; i < arr.length; i++) best = tryTarget(arr[i]!, o, d, best, out);
  } else {
    for (const t of targets) best = tryTarget(t, o, d, best, out);
  }
  out.point.x = o.x + d.x * out.distance;
  out.point.y = o.y + d.y * out.distance;
  out.point.z = o.z + d.z * out.distance;
  return out;
}
