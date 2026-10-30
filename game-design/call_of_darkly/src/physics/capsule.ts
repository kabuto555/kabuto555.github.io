import type { Vec3Like } from '../core/types';
import { SpatialGrid } from './grid';
import { Layer, type AABB, type CapsuleController, type Collider, type CollisionWorld, type LayerMask, type MoveResult } from './types';

/** Solid layers the player capsule collides with. */
export const CAPSULE_MASK: LayerMask = Layer.World | Layer.Barrier | Layer.Prop;

/** One capsule-vs-AABB contact. */
export interface CapsuleContact {
  /** Penetration depth (>0 when touching). */
  depth: number;
  /** Push-out normal (unit). */
  nx: number;
  ny: number;
  nz: number;
  /** Horizontal distance from the capsule axis to the closest box point. */
  dh: number;
  /** Which part touched: 0 = side (segment), 1 = bottom sphere, 2 = top sphere, 3 = axis inside box. */
  kind: 0 | 1 | 2 | 3;
  /** Closest box point y (bottom-sphere contacts: the support height). */
  qy: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Vertical capsule (feet at feetY, total height h, radius r) vs AABB. Returns false if not
 * touching. Fills `out` with depth and a push-out normal. Deep cases (axis inside the box)
 * choose the cheapest axis push.
 */
export function capsuleAabbContact(px: number, feetY: number, pz: number, r: number, h: number, b: AABB, out: CapsuleContact): boolean {
  const a = feetY + r;
  const top = Math.max(a, feetY + h - r);
  const qx = clamp(px, b.min.x, b.max.x);
  const qz = clamp(pz, b.min.z, b.max.z);
  const dx = px - qx;
  const dz = pz - qz;
  const dh2 = dx * dx + dz * dz;
  let sy: number;
  let qy: number;
  let kind: 0 | 1 | 2;
  if (a > b.max.y) {
    sy = a;
    qy = b.max.y;
    kind = 1;
  } else if (top < b.min.y) {
    sy = top;
    qy = b.min.y;
    kind = 2;
  } else {
    sy = qy = clamp((a + top) / 2, Math.max(a, b.min.y), Math.min(top, b.max.y));
    kind = 0;
  }
  const dy = sy - qy;
  const d2 = dh2 + dy * dy;
  if (d2 >= r * r) return false;
  const dh = Math.sqrt(dh2);
  out.dh = dh;
  out.qy = qy;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    out.depth = r - d;
    out.nx = dx / d;
    out.ny = dy / d;
    out.nz = dz / d;
    out.kind = kind;
    return true;
  }
  // Axis inside the box: cheapest push out.
  const pxp = b.max.x - px + r;
  const pxn = px - b.min.x + r;
  const pzp = b.max.z - pz + r;
  const pzn = pz - b.min.z + r;
  const pyp = b.max.y - feetY;
  const pyn = feetY + h - b.min.y;
  let best = pyp;
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
  if (pxp < best) ((best = pxp), (out.nx = 1), (out.ny = 0), (out.nz = 0));
  if (pxn < best) ((best = pxn), (out.nx = -1), (out.ny = 0), (out.nz = 0));
  if (pzp < best) ((best = pzp), (out.nx = 0), (out.ny = 0), (out.nz = 1));
  if (pzn < best) ((best = pzn), (out.nx = 0), (out.ny = 0), (out.nz = -1));
  if (pyn < best) ((best = pyn), (out.nx = 0), (out.ny = -1), (out.nz = 0));
  out.depth = best;
  out.kind = 3;
  out.qy = b.max.y;
  return true;
}

export interface KinematicCapsuleOptions {
  radius?: number;
  height?: number;
  stepHeight?: number;
  /** Max walkable slope (deg). Contacts steeper than this are walls. */
  slopeLimitDeg?: number;
  /** Ground snap distance below the feet when walking off small drops / down stairs+ramps. */
  snapDistance?: number;
  mask?: LayerMask;
}

const SKIN = 0.001;
const MAX_ITER = 6;

/**
 * Kinematic capsule controller (feet at `position.y`).
 *
 * - **Gravity is applied by the caller** (player) to `velocity.y`; `move` integrates velocity.
 * - Motion is split into substeps of ≤ radius/2 (no tunnelling through 0.2 m floors at 40 m/s).
 * - Each substep: translate, optional **step-up**, then up to 6 iterations of deepest-first
 *   depenetration (**collide-and-slide**): push out along the contact normal and clip the
 *   velocity's into-surface component, so walls stop/slide.
 * - Walkable contacts (normal within `slopeLimit` of up) resolve **vertically**, so the capsule
 *   doesn't get shoved sideways off step/ledge edges (Unity-CC style rounded-edge support).
 * - **Step-up**: while grounded, a wall contact whose top is ≤ stepHeight above the feet lifts the
 *   capsule onto it if the raised capsule is clear. `lastStepUp` reports the lift for camera smoothing.
 * - **Ground snap**: grounded last move, no ground contact now, not moving up → snap down onto a
 *   surface within `snapDistance` (stairs/ramps down, small drops).
 * - Ramps: the world builder approximates them with stepped AABBs ≤0.1 m tall; the rounded
 *   bottom rides those as walkable contacts, so no sloped colliders are needed.
 */
export class KinematicCapsule implements CapsuleController {
  readonly position: Vec3Like = { x: 0, y: 0, z: 0 };
  readonly velocity: Vec3Like = { x: 0, y: 0, z: 0 };
  radius: number;
  height: number;
  stepHeight: number;
  snapDistance: number;
  mask: LayerMask;
  private cosSlope: number;
  private _grounded = false;
  /** Ground normal y of the last ground contact (1 = flat). */
  groundNormalY = 1;
  /** Vertical displacement from step-up / ground snap during the last move (camera smoothing). */
  lastStepUp = 0;
  /** Seconds left in which a fresh step-up counts as grounded (capsule axis not yet over the step). */
  private stepGrace = 0;

  private readonly cands: Collider[] = [];
  private readonly ovCands: Collider[] = [];
  private readonly contact: CapsuleContact = { depth: 0, nx: 0, ny: 0, nz: 0, dh: 0, kind: 0, qy: 0 };
  private readonly best: CapsuleContact = { depth: 0, nx: 0, ny: 0, nz: 0, dh: 0, kind: 0, qy: 0 };
  private readonly bounds: AABB = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  private readonly result: MoveResult = { grounded: false, hitWall: false, hitCeiling: false };
  private readonly snapRes: MoveResult = { grounded: false, hitWall: false, hitCeiling: false };

  constructor(opts: KinematicCapsuleOptions = {}) {
    this.radius = opts.radius ?? 0.35;
    this.height = opts.height ?? 1.8;
    this.stepHeight = opts.stepHeight ?? 0.35;
    this.snapDistance = opts.snapDistance ?? 0.4;
    this.mask = opts.mask ?? CAPSULE_MASK;
    this.cosSlope = Math.cos(((opts.slopeLimitDeg ?? 50) * Math.PI) / 180);
  }

  get grounded(): boolean {
    return this._grounded;
  }

  set slopeLimitDeg(deg: number) {
    this.cosSlope = Math.cos((deg * Math.PI) / 180);
  }

  teleport(p: Vec3Like): void {
    this.position.x = p.x;
    this.position.y = p.y;
    this.position.z = p.z;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this._grounded = false;
    this.lastStepUp = 0;
    this.stepGrace = 0;
  }

  /**
   * Move without velocity (scripted motion like mantle). Does NOT depenetrate and does not touch
   * the grounded flag: callers must validate the path themselves, and follow up with
   * `move(0, world)` to resolve overlaps and recompute grounded.
   */
  setPosition(p: Vec3Like): void {
    this.position.x = p.x;
    this.position.y = p.y;
    this.position.z = p.z;
  }

  /** Force the grounded flag (e.g. clear it when scripted motion starts; the next `move` decides it). */
  setGrounded(g: boolean): void {
    this._grounded = g;
    if (!g) {
      this.lastStepUp = 0;
      this.stepGrace = 0;
    }
  }

  /** True if the capsule at (x, feetY, z) overlaps any solid collider (by more than `tol`). */
  overlaps(world: CollisionWorld, x: number, feetY: number, z: number, tol = 0.002): boolean {
    const r = this.radius;
    const b = this.bounds;
    b.min.x = x - r;
    b.min.y = feetY;
    b.min.z = z - r;
    b.max.x = x + r;
    b.max.y = feetY + this.height;
    b.max.z = z + r;
    const cands = this.query(world, b, this.ovCands);
    for (const c of cands) if (capsuleAabbContact(x, feetY, z, r, this.height, c.aabb, this.contact) && this.contact.depth > tol) return true;
    return false;
  }

  move(dt: number, world: CollisionWorld): MoveResult {
    const p = this.position;
    const v = this.velocity;
    const r = this.radius;
    const h = this.height;
    const res = this.result;
    res.grounded = false;
    res.hitWall = false;
    res.hitCeiling = false;
    const wasGrounded = this._grounded;
    this.lastStepUp = 0;
    this.stepGrace = Math.max(0, this.stepGrace - dt);

    const dx = v.x * dt;
    const dy = v.y * dt;
    const dz = v.z * dt;
    // Candidate set for the whole move (one grid query).
    const m = r + this.stepHeight + this.snapDistance + 0.05;
    const b = this.bounds;
    b.min.x = Math.min(p.x, p.x + dx) - m;
    b.min.y = Math.min(p.y, p.y + dy) - this.snapDistance - 0.05;
    b.min.z = Math.min(p.z, p.z + dz) - m;
    b.max.x = Math.max(p.x, p.x + dx) + m;
    b.max.y = Math.max(p.y, p.y + dy) + h + this.stepHeight + 0.05;
    b.max.z = Math.max(p.z, p.z + dz) + m;
    const cands = this.query(world, b, this.cands);

    const dist = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    const sdt = dt / steps;
    let groundContact = false;
    for (let s = 0; s < steps; s++) {
      p.x += v.x * sdt;
      p.y += v.y * sdt;
      p.z += v.z * sdt;
      if (wasGrounded || groundContact) this.tryStepUp(cands, v.y);
      if (this.resolve(cands, res)) groundContact = true;
    }

    // Just stepped up: the axis is still short of the step's edge; hold "grounded" briefly
    // (no snap) so the next ticks carry us over it instead of dropping back down. Only while
    // there is actually support just below; otherwise (stepped off a thin curb) fall through
    // to ground snap so we come back down instead of floating.
    if (!groundContact && this.stepGrace > 0 && v.y <= 0 && this.graceSupport(cands)) {
      groundContact = true;
      v.y = 0;
    }

    // Ground snap: drop by snapDistance and depenetrate; keep it only if we landed on walkable ground.
    if (!groundContact && wasGrounded && v.y <= 0) {
      const sx = p.x;
      const sy = p.y;
      const sz = p.z;
      const svx = v.x;
      const svz = v.z;
      p.y -= this.snapDistance;
      const sres = this.snapRes;
      if (this.resolve(cands, sres) && p.y < sy + 0.01) {
        this.lastStepUp += p.y - sy;
        groundContact = true;
        v.y = 0;
      } else {
        p.x = sx;
        p.y = sy;
        p.z = sz;
        v.x = svx;
        v.z = svz;
      }
    }

    // Still touching ground (standing still: gravity tick may not penetrate enough to register).
    if (!groundContact && v.y <= 0) {
      const top = this.supportBelow(cands, p.x, p.y, p.z, 0.01);
      if (top !== null) groundContact = true;
    }

    this._grounded = groundContact;
    res.grounded = groundContact;
    return res;
  }

  /** Deepest-first depenetration + velocity clip. Returns true if a walkable contact was resolved. */
  private resolve(cands: Collider[], res: MoveResult): boolean {
    const p = this.position;
    const v = this.velocity;
    const r = this.radius;
    const h = this.height;
    let ground = false;
    for (let it = 0; it < MAX_ITER; it++) {
      const best = this.best;
      best.depth = 0;
      let found = false;
      for (let i = 0; i < cands.length; i++) {
        if (!capsuleAabbContact(p.x, p.y, p.z, r, h, cands[i]!.aabb, this.contact)) continue;
        if (this.contact.depth > best.depth) {
          Object.assign(best, this.contact);
          found = true;
        }
      }
      if (!found || best.depth < 1e-6) break;
      if (best.ny >= this.cosSlope) {
        // Walkable: resolve vertically so edges support rather than shove.
        ground = true;
        this.groundNormalY = best.ny;
        if (best.kind === 1) {
          const lift = best.qy + Math.sqrt(Math.max(0, r * r - best.dh * best.dh)) - (p.y + r);
          p.y += lift + SKIN;
        } else {
          p.y += best.depth + SKIN;
        }
        if (v.y < 0) v.y = 0;
      } else {
        let nx = best.nx;
        let ny = best.ny;
        let nz = best.nz;
        let depth = best.depth;
        const hl = Math.hypot(nx, nz);
        if (ny > -0.5 && hl > 0.2) {
          // Steep contact = vertical wall: push/clip horizontally only, so running into an
          // edge never converts speed into upward motion (no climbing steep edges).
          depth = Math.min(depth / hl, r);
          nx /= hl;
          nz /= hl;
          ny = 0;
        }
        p.x += nx * (depth + SKIN);
        p.y += ny * (depth + SKIN);
        p.z += nz * (depth + SKIN);
        const vn = v.x * nx + v.y * ny + v.z * nz;
        if (vn < 0) {
          v.x -= nx * vn;
          v.y -= ny * vn;
          v.z -= nz * vn;
        }
        if (best.ny < -0.5) {
          res.hitCeiling = true;
          if (v.y > 0) v.y = 0;
        } else res.hitWall = true;
      }
    }
    return ground;
  }

  /**
   * Support for the post-step-up grace: a top within 0.05 below the feet that the capsule is over
   * (axis inside its footprint) or still approaching (full-radius overlap and moving toward it).
   * A box we are already leaving (axis past its edge, moving away) gives no grace, so ground snap runs.
   */
  private graceSupport(cands: Collider[]): boolean {
    const { x, y, z } = this.position;
    const v = this.velocity;
    const r = this.radius;
    for (const c of cands) {
      const bb = c.aabb;
      if (bb.max.y > y + 0.02 || bb.max.y < y - 0.05) continue;
      if (x + r <= bb.min.x || x - r >= bb.max.x || z + r <= bb.min.z || z - r >= bb.max.z) continue;
      const qx = clamp(x, bb.min.x, bb.max.x) - x;
      const qz = clamp(z, bb.min.z, bb.max.z) - z;
      if (qx === 0 && qz === 0) return true; // axis over the support
      if (v.x * qx + v.z * qz > 0) return true; // approaching it
    }
    return false;
  }

  /** Highest support top under the capsule footprint (radius `fr`, default inner 60%) within `maxDrop` below feet, or null. */
  private supportBelow(cands: Collider[], x: number, feetY: number, z: number, maxDrop: number, fr = this.radius * 0.6): number | null {
    let best: number | null = null;
    for (const c of cands) {
      const bb = c.aabb;
      if (bb.max.y > feetY + 0.02 || bb.max.y < feetY - maxDrop) continue;
      if (x + fr <= bb.min.x || x - fr >= bb.max.x || z + fr <= bb.min.z || z - fr >= bb.max.z) continue;
      if (best === null || bb.max.y > best) best = bb.max.y;
    }
    return best;
  }

  private tryStepUp(cands: Collider[], vy: number): void {
    if (vy > 0.01) return;
    const p = this.position;
    const r = this.radius;
    const h = this.height;
    let lift = 0;
    for (const c of cands) {
      if (!capsuleAabbContact(p.x, p.y, p.z, r, h, c.aabb, this.contact)) continue;
      if (this.contact.ny >= this.cosSlope) continue; // walkable: normal resolution handles it
      const rise = c.aabb.max.y - p.y;
      if (rise > 0.02 && rise <= this.stepHeight && rise > lift) lift = rise;
    }
    if (lift <= 0) return;
    const ny = p.y + lift + SKIN;
    // Raised capsule must be clear.
    for (const c of cands) {
      if (capsuleAabbContact(p.x, ny, p.z, r, h, c.aabb, this.contact) && this.contact.depth > 0.002) {
        // Allow contacts that are themselves walkable support (we're standing on what we stepped onto).
        if (this.contact.ny >= this.cosSlope) continue;
        return;
      }
    }
    p.y = ny;
    this.lastStepUp += lift + SKIN;
    this.stepGrace = 0.15;
  }

  private query(world: CollisionWorld, b: AABB, out: Collider[]): Collider[] {
    out.length = 0;
    if (world instanceof SpatialGrid) return world.overlapInto(b, this.mask, out, true);
    for (const c of world.overlapAABB(b, this.mask)) if (c.solid) out.push(c);
    return out;
  }
}
