import type { Vec3Like } from '../core/types';
import type { AABB } from './types';

/** AABB helpers. Allocation-free where it matters (out params). */

export function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/** Box from DSL convention: (x, z) footprint center, y bottom, w/h/d sizes. */
export function aabbFromFootprint(x: number, y: number, z: number, w: number, h: number, d: number): AABB {
  return aabb(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
}

export function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z
  );
}

export function aabbContainsPoint(b: AABB, p: Vec3Like): boolean {
  return p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;
}

/** Result of a slab test. */
export interface SlabHit {
  /** Entry distance along the ray. */
  t: number;
  /** Entry face normal. */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Ray vs AABB (slab method). `inv*` are 1/dir components (±Infinity for 0).
 * Returns false if missed, if the hit is beyond maxT, or if the origin starts inside the box
 * (rays ignore colliders that contain their origin — see grid.raycast docs).
 */
export function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  invX: number,
  invY: number,
  invZ: number,
  b: AABB,
  maxT: number,
  out: SlabHit,
): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  // X
  if (invX === Infinity || invX === -Infinity) {
    if (ox <= b.min.x || ox >= b.max.x) return false;
  } else {
    let t1 = (b.min.x - ox) * invX;
    let t2 = (b.max.x - ox) * invX;
    let n = -1;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      ny = 0;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
  }
  // Y
  if (invY === Infinity || invY === -Infinity) {
    if (oy <= b.min.y || oy >= b.max.y) return false;
  } else {
    let t1 = (b.min.y - oy) * invY;
    let t2 = (b.max.y - oy) * invY;
    let n = -1;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = n;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
  }
  // Z
  if (invZ === Infinity || invZ === -Infinity) {
    if (oz <= b.min.z || oz >= b.max.z) return false;
  } else {
    let t1 = (b.min.z - oz) * invZ;
    let t2 = (b.max.z - oz) * invZ;
    let n = -1;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = 0;
      nz = n;
    }
    if (t2 < tmax) tmax = t2;
  }
  if (tmax < tmin || tmax <= 0) return false;
  if (tmin < 0) return false; // origin inside
  if (tmin > maxT) return false;
  out.t = tmin;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  return true;
}

/** Safe reciprocal for slab tests. */
export function inv(v: number): number {
  return v === 0 ? Infinity : 1 / v;
}
