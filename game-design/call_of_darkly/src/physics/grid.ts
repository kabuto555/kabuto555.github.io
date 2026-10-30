import type { Vec3Like } from '../core/types';
import { aabbOverlaps, inv, rayAabb, type SlabHit } from './aabb';
import type { AABB, Collider, CollisionWorld, LayerMask, Ray, RayHit, SweepHit } from './types';

/** All layers. */
export const ALL_LAYERS: LayerMask = 0xffffffff;

interface Entry {
  c: Collider;
  /** Query stamp (dedupe colliders spanning several cells). */
  stamp: number;
  /** Cell keys this collider is in (for remove). */
  keys: number[];
}

const OFF = 1024; // cell index offset → keys stay positive; ±1024 cells
const SPAN = 2048;
const key = (ix: number, iy: number, iz: number) => ((ix + OFF) * SPAN + (iy + OFF)) * SPAN + (iz + OFF);
const inRange = (i: number) => i >= -OFF && i < OFF;
const clampCell = (i: number) => (i < -OFF ? -OFF : i >= OFF ? OFF - 1 : i);

/**
 * Uniform spatial hash grid of static AABB colliders (§2 Collision/Raycasts).
 * - `cellSize` meters (default 4). Unbounded (hashed), ±4 km at the default size.
 * - Raycast walks cells with 3D DDA (Amanatides–Woo) and stops as soon as the best hit is
 *   closer than the current cell's exit. Rays IGNORE colliders that contain their origin
 *   (so probes/guns starting inside geometry don't self-hit at t=0).
 * - Colliders with `solid: false` are returned by overlap/raycast only if their layer is in the mask;
 *   sweeps only consider solid colliders.
 */
export class SpatialGrid implements CollisionWorld {
  readonly cellSize: number;
  private readonly invCell: number;
  private cells = new Map<number, Entry[]>();
  private entries = new Map<number, Entry>();
  private nextId = 1;
  private stamp = 0;
  private readonly slab: SlabHit = { t: 0, nx: 0, ny: 0, nz: 0 };
  // sweepAABB scratch (no per-call allocation).
  private readonly swBounds: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  private readonly swEx: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  private readonly swCands: Collider[] = [];

  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
  }

  get size(): number {
    return this.entries.size;
  }

  add(c: Omit<Collider, 'id'>): Collider {
    const b = c.aabb;
    const x0 = this.cell(b.min.x);
    const y0 = this.cell(b.min.y);
    const z0 = this.cell(b.min.z);
    const x1 = this.cell(b.max.x);
    const y1 = this.cell(b.max.y);
    const z1 = this.cell(b.max.z);
    // Keys pack cell coords into ±OFF; anything outside would alias another cell silently.
    if (!(inRange(x0) && inRange(y0) && inRange(z0) && inRange(x1) && inRange(y1) && inRange(z1))) {
      throw new RangeError(
        `SpatialGrid.add: collider${c.tag ? ` "${c.tag}"` : ''} aabb (${b.min.x},${b.min.y},${b.min.z})..(${b.max.x},${b.max.y},${b.max.z}) ` +
          `is outside the grid's packable range (±${OFF * this.cellSize} m at cellSize ${this.cellSize}) or is not finite`,
      );
    }
    const col: Collider = { ...c, id: this.nextId++ };
    const e: Entry = { c: col, stamp: 0, keys: [] };
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const k = key(ix, iy, iz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(e);
          e.keys.push(k);
        }
    this.entries.set(col.id, e);
    return col;
  }

  remove(id: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    for (const k of e.keys) {
      const list = this.cells.get(k);
      if (!list) continue;
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.cells.delete(k);
    }
    this.entries.delete(id);
  }

  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  *all(): IterableIterator<Collider> {
    for (const e of this.entries.values()) yield e.c;
  }

  get(id: number): Collider | undefined {
    return this.entries.get(id)?.c;
  }

  overlapAABB(box: AABB, mask: LayerMask = ALL_LAYERS): Collider[] {
    const out: Collider[] = [];
    this.overlapInto(box, mask, out);
    return out;
  }

  /** Allocation-free variant: appends into `out` (not cleared). */
  overlapInto(box: AABB, mask: LayerMask, out: Collider[], solidOnly = false): Collider[] {
    const s = ++this.stamp;
    const x0 = clampCell(this.cell(box.min.x));
    const y0 = clampCell(this.cell(box.min.y));
    const z0 = clampCell(this.cell(box.min.z));
    const x1 = clampCell(this.cell(box.max.x));
    const y1 = clampCell(this.cell(box.max.y));
    const z1 = clampCell(this.cell(box.max.z));
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const list = this.cells.get(key(ix, iy, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const e = list[i]!;
            if (e.stamp === s) continue;
            e.stamp = s;
            const c = e.c;
            if ((c.layer & mask) === 0) continue;
            if (solidOnly && !c.solid) continue;
            if (aabbOverlaps(c.aabb, box)) out.push(c);
          }
        }
    return out;
  }

  /** Nearest hit; pass `out` to reuse a result object (returned on a hit, else null). */
  raycast(ray: Ray, mask: LayerMask = ALL_LAYERS, out?: RayHit): RayHit | null {
    const { origin: o, dir: d, maxDist } = ray;
    if (!(maxDist > 0)) return null;
    const s = ++this.stamp;
    const ix0 = inv(d.x);
    const iy0 = inv(d.y);
    const iz0 = inv(d.z);
    const cs = this.cellSize;

    let cx = this.cell(o.x);
    let cy = this.cell(o.y);
    let cz = this.cell(o.z);
    const stepX = d.x > 0 ? 1 : d.x < 0 ? -1 : 0;
    const stepY = d.y > 0 ? 1 : d.y < 0 ? -1 : 0;
    const stepZ = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
    // distance along ray to the next cell boundary on each axis, and per-cell delta
    let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? (cx + 1) * cs : cx * cs) - o.x) * ix0;
    let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? (cy + 1) * cs : cy * cs) - o.y) * iy0;
    let tMaxZ = stepZ === 0 ? Infinity : ((stepZ > 0 ? (cz + 1) * cs : cz * cs) - o.z) * iz0;
    const tDX = stepX === 0 ? Infinity : cs * Math.abs(ix0);
    const tDY = stepY === 0 ? Infinity : cs * Math.abs(iy0);
    const tDZ = stepZ === 0 ? Infinity : cs * Math.abs(iz0);

    let bestT = maxDist;
    let best: Collider | null = null;
    let bnx = 0;
    let bny = 0;
    let bnz = 0;
    const slab = this.slab;
    // Hard cap on visited cells (safety for pathological inputs).
    for (let iter = 0; iter < 4096; iter++) {
      if (!(inRange(cx) && inRange(cy) && inRange(cz))) break; // outside the packable range: nothing stored there
      const list = this.cells.get(key(cx, cy, cz));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i]!;
          if (e.stamp === s) continue;
          e.stamp = s;
          const c = e.c;
          if ((c.layer & mask) === 0) continue;
          if (rayAabb(o.x, o.y, o.z, ix0, iy0, iz0, c.aabb, bestT, slab) && slab.t <= bestT) {
            bestT = slab.t;
            best = c;
            bnx = slab.nx;
            bny = slab.ny;
            bnz = slab.nz;
          }
        }
      }
      const tExit = Math.min(tMaxX, tMaxY, tMaxZ);
      if (best && bestT <= tExit) break;
      if (tExit > maxDist) break;
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        cx += stepX;
        tMaxX += tDX;
      } else if (tMaxY <= tMaxZ) {
        cy += stepY;
        tMaxY += tDY;
      } else {
        cz += stepZ;
        tMaxZ += tDZ;
      }
    }
    if (!best) return null;
    if (out) {
      out.point.x = o.x + d.x * bestT;
      out.point.y = o.y + d.y * bestT;
      out.point.z = o.z + d.z * bestT;
      out.normal.x = bnx;
      out.normal.y = bny;
      out.normal.z = bnz;
      out.distance = bestT;
      out.collider = best;
      out.entityId = best.entityId;
      out.region = undefined;
      return out;
    }
    return {
      point: { x: o.x + d.x * bestT, y: o.y + d.y * bestT, z: o.z + d.z * bestT },
      normal: { x: bnx, y: bny, z: bnz },
      distance: bestT,
      collider: best,
      entityId: best.entityId,
    };
  }

  /**
   * Swept AABB: earliest contact of `box` moving by `delta` against solid colliders in `mask`.
   * Minkowski-expands each candidate by the box half-extents and ray-tests the center.
   * A box already overlapping a collider reports t = 0 with the axis of least penetration, unless
   * it is moving away from / parallel to that face (dot(delta, n) >= 0), which is ignored so a
   * box resting against geometry can slide off it.
   * Pass `out` to reuse a result object (no allocation; its `normal` must be an object);
   * the return value is `out` on a hit, null otherwise.
   */
  sweepAABB(box: AABB, delta: Vec3Like, mask: LayerMask = ALL_LAYERS, out?: SweepHit): SweepHit | null {
    const hx = (box.max.x - box.min.x) / 2;
    const hy = (box.max.y - box.min.y) / 2;
    const hz = (box.max.z - box.min.z) / 2;
    const cx = box.min.x + hx;
    const cy = box.min.y + hy;
    const cz = box.min.z + hz;
    const bounds = this.swBounds;
    bounds.min.x = Math.min(box.min.x, box.min.x + delta.x);
    bounds.min.y = Math.min(box.min.y, box.min.y + delta.y);
    bounds.min.z = Math.min(box.min.z, box.min.z + delta.z);
    bounds.max.x = Math.max(box.max.x, box.max.x + delta.x);
    bounds.max.y = Math.max(box.max.y, box.max.y + delta.y);
    bounds.max.z = Math.max(box.max.z, box.max.z + delta.z);
    const cands = this.swCands;
    cands.length = 0;
    this.overlapInto(bounds, mask, cands, true);
    const len = Math.hypot(delta.x, delta.y, delta.z);
    let bestT = Infinity;
    let bestC: Collider | null = null;
    let bnx = 0;
    let bny = 0;
    let bnz = 0;
    const ex = this.swEx;
    const slab = this.slab;
    const idx = inv(delta.x);
    const idy = inv(delta.y);
    const idz = inv(delta.z);
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i]!;
      const b = c.aabb;
      ex.min.x = b.min.x - hx;
      ex.min.y = b.min.y - hy;
      ex.min.z = b.min.z - hz;
      ex.max.x = b.max.x + hx;
      ex.max.y = b.max.y + hy;
      ex.max.z = b.max.z + hz;
      if (cx > ex.min.x && cx < ex.max.x && cy > ex.min.y && cy < ex.max.y && cz > ex.min.z && cz < ex.max.z) {
        // Already overlapping: least-penetration axis, t = 0.
        const px = Math.min(cx - ex.min.x, ex.max.x - cx);
        const py = Math.min(cy - ex.min.y, ex.max.y - cy);
        const pz = Math.min(cz - ex.min.z, ex.max.z - cz);
        let nx = 0;
        let ny = 0;
        let nz = 0;
        if (px <= py && px <= pz) nx = cx - ex.min.x < ex.max.x - cx ? -1 : 1;
        else if (py <= pz) ny = cy - ex.min.y < ex.max.y - cy ? -1 : 1;
        else nz = cz - ex.min.z < ex.max.z - cz ? -1 : 1;
        // Moving away from (or along) the face we'd be pushed out of: not a blocking hit.
        if (delta.x * nx + delta.y * ny + delta.z * nz >= 0) continue;
        if (bestT > 0) {
          bestT = 0;
          bestC = c;
          bnx = nx;
          bny = ny;
          bnz = nz;
        }
        continue;
      }
      if (len === 0) continue;
      if (rayAabb(cx, cy, cz, idx, idy, idz, ex, 1, slab) && slab.t < bestT) {
        bestT = slab.t;
        bestC = c;
        bnx = slab.nx;
        bny = slab.ny;
        bnz = slab.nz;
      }
    }
    cands.length = 0; // don't retain collider references
    if (!bestC) return null;
    const res = out ?? { t: 0, normal: { x: 0, y: 0, z: 0 }, collider: bestC };
    res.t = bestT;
    res.normal.x = bnx;
    res.normal.y = bny;
    res.normal.z = bnz;
    res.collider = bestC;
    return res;
  }

  private cell(v: number): number {
    return Math.floor(v * this.invCell);
  }
}

export function createCollisionWorld(cellSize = 4): SpatialGrid {
  return new SpatialGrid(cellSize);
}
