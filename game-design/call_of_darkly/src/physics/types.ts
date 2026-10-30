import type { EntityId } from '../core/entity';
import type { Vec3Like } from '../core/types';

/** Axis-aligned box, world space, meters. Y-up. */
export interface AABB {
  min: Vec3Like;
  max: Vec3Like;
}

/** Collision layers (bit flags) for ray/overlap filtering. */
export const Layer = {
  World: 1 << 0, // static level geometry
  Barrier: 1 << 1, // invisible/blocked exits, fog walls
  Prop: 1 << 2, // chests, doors (dynamic but kinematic)
  Enemy: 1 << 3, // enemy hit-capsules (raycasts only; not in the static grid)
  Player: 1 << 4,
  Trigger: 1 << 5, // non-solid volumes (bonfire range, boss arena)
} as const;
export type LayerMask = number;

export interface Collider {
  id: number;
  aabb: AABB;
  layer: number;
  /** Solid colliders block the capsule; triggers only report overlaps. */
  solid: boolean;
  /** Back-reference (door id, entity id...) for gameplay lookups. */
  tag?: string;
  entityId?: EntityId;
}

export interface Ray {
  origin: Vec3Like;
  /** Unit direction. */
  dir: Vec3Like;
  maxDist: number;
}

export interface RayHit {
  point: Vec3Like;
  normal: Vec3Like;
  distance: number;
  collider: Collider | null;
  /** Set when an enemy/player hit-capsule was hit. */
  entityId?: EntityId;
  /** Hit-capsule region, for headshots. */
  region?: 'head' | 'body';
}

/** Static world (uniform spatial grid of AABBs) + queries. */
export interface CollisionWorld {
  add(c: Omit<Collider, 'id'>): Collider;
  remove(id: number): void;
  /** Nearest hit or null. */
  raycast(ray: Ray, mask?: LayerMask): RayHit | null;
  overlapAABB(box: AABB, mask?: LayerMask): Collider[];
  /**
   * Sweep `box` along `delta`; first solid hit (t in [0,1] fraction of delta) or null.
   * Added in M1 (optional for back-compat with other implementations).
   */
  sweepAABB?(box: AABB, delta: Vec3Like, mask?: LayerMask): SweepHit | null;
  /** All colliders (debug overlay). Added in M1, optional. */
  all?(): Iterable<Collider>;
}

export interface SweepHit {
  /** Fraction of delta travelled before contact, [0,1]. 0 = already touching/overlapping. */
  t: number;
  normal: Vec3Like;
  collider: Collider;
}

export interface MoveResult {
  grounded: boolean;
  /** True if a wall stopped horizontal motion this step. */
  hitWall: boolean;
  /** Ceiling hit (cancel upward velocity). */
  hitCeiling: boolean;
}

/** Kinematic capsule (feet at position.y). Collide-and-slide vs. the world, step-up small ledges. */
export interface CapsuleController {
  readonly position: Vec3Like;
  readonly velocity: Vec3Like;
  radius: number;
  height: number;
  /** Max auto step height (stairs), meters. */
  stepHeight: number;
  readonly grounded: boolean;
  /** Integrate velocity over dt (gravity applied by caller or controller — impl documents). */
  move(dt: number, world: CollisionWorld): MoveResult;
  teleport(p: Vec3Like): void;
}
