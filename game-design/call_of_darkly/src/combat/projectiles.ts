import * as THREE from 'three';
import type { ItemId } from '../data/types';
import { makeBoxGeometry, makePs1Material } from '../render';
import type { CollisionWorld } from '../physics/types';
import { castBullet, newBulletHit, type BulletHit } from './hitscan';
import type { HitTarget } from './targets';

export type ProjectileKind = 'frag' | 'molotov' | 'flash' | 'knife';

export const PROJECTILE_TUNING = {
  gravity: 16,
  /** Velocity kept along the bounce normal. */
  restitution: 0.3,
  /** Tangential velocity kept after a bounce. */
  friction: 0.45,
  /** Below this speed (m/s) after a floor bounce the projectile rests. */
  restSpeed: 1.8,
  /** Knife gravity (flies nearly flat). */
  knifeGravity: 2.5,
  killY: -60,
} as const;

/** One pooled projectile slot. All fields are mutated in place; nothing is allocated per tick. */
export interface Projectile {
  active: boolean;
  kind: ProjectileKind;
  itemId: ItemId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Seconds until detonation, or -1 for impact-only. */
  fuse: number;
  resting: boolean;
  /** Frag only: does the blast hurt the player? (false for the Martyrdom frag). */
  hurtPlayer: boolean;
  mesh: THREE.Mesh | null;
}

export interface ProjectileHooks {
  /** Fuse ran out. The pool deactivates the projectile afterwards. */
  onDetonate(p: Projectile): void;
  /** Molotov / knife hit something (world: `hit.kind === 'world'`; target: `hit.target`). Pool deactivates afterwards. */
  onImpact(p: Projectile, hit: BulletHit): void;
  /** Frag/flash bounced off the world at `speed` (m/s, pre-bounce). Optional. */
  onBounce?(p: Projectile, speed: number): void;
}

const EMPTY: readonly HitTarget[] = [];
const dirTmp = { x: 0, y: 0, z: 1 };
const posTmp = { x: 0, y: 0, z: 0 };

/** Which kinds collide with targets (others only bounce off the world). */
const HITS_TARGETS: Record<ProjectileKind, boolean> = { frag: false, molotov: true, flash: false, knife: true };

type Visuals = { geo: Record<ProjectileKind, THREE.BufferGeometry>; mat: Record<ProjectileKind, THREE.Material> };
let shared: Visuals | null = null;

function visuals(): Visuals {
  shared ??= {
    geo: {
      frag: makeBoxGeometry(0.1, 0.14, 0.1, { maxSegment: 0 }),
      molotov: makeBoxGeometry(0.09, 0.22, 0.09, { maxSegment: 0 }),
      flash: makeBoxGeometry(0.07, 0.17, 0.07, { maxSegment: 0 }),
      knife: makeBoxGeometry(0.025, 0.02, 0.28, { maxSegment: 0 }),
    },
    mat: {
      frag: makePs1Material({ color: 0x3f5a2e }),
      molotov: makePs1Material({ color: 0x7a5a2a, emissive: 0x401800 }),
      flash: makePs1Material({ color: 0x8a8d94 }),
      knife: makePs1Material({ color: 0xc4c8d0 }),
    },
  };
  return shared;
}

/**
 * Fixed-size pool of thrown objects: arc physics, ray-per-step collision against the grid (bounces)
 * and, for molotov/knife, against hit targets. Zero allocations per tick.
 */
export class ProjectilePool {
  readonly items: Projectile[] = [];
  /** Target list molotov/knife collide with (the combat `targets.arr`, which is stable). */
  targetsRef: ReadonlyArray<HitTarget>;
  private readonly hit = newBulletHit();
  private readonly group: THREE.Group | null;

  constructor(
    private readonly world: CollisionWorld,
    scene: THREE.Scene | null,
    size = 16,
    targets: ReadonlyArray<HitTarget> = EMPTY,
  ) {
    this.targetsRef = targets;
    this.group = scene ? new THREE.Group() : null;
    const v = scene ? visuals() : null;
    for (let i = 0; i < size; i++) {
      let mesh: THREE.Mesh | null = null;
      if (v && this.group) {
        mesh = new THREE.Mesh(v.geo.frag, v.mat.frag);
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.items.push({
        active: false, kind: 'frag', itemId: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        age: 0, fuse: -1, resting: false, hurtPlayer: true, mesh,
      });
    }
    if (scene && this.group) scene.add(this.group);
  }

  /** Claim a free slot (null when the pool is exhausted). */
  spawn(
    kind: ProjectileKind,
    itemId: ItemId,
    pos: { x: number; y: number; z: number },
    vel: { x: number; y: number; z: number },
    fuse: number,
    hurtPlayer = true,
  ): Projectile | null {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i]!;
      if (p.active) continue;
      p.active = true;
      p.kind = kind;
      p.itemId = itemId;
      p.x = pos.x;
      p.y = pos.y;
      p.z = pos.z;
      p.vx = vel.x;
      p.vy = vel.y;
      p.vz = vel.z;
      p.age = 0;
      p.fuse = fuse;
      p.resting = false;
      p.hurtPlayer = hurtPlayer;
      if (p.mesh) {
        const v = visuals();
        p.mesh.geometry = v.geo[kind];
        p.mesh.material = v.mat[kind];
        p.mesh.visible = true;
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.set(0, 0, 0);
      }
      return p;
    }
    return null;
  }

  activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i]!.active) n++;
    return n;
  }

  kill(p: Projectile): void {
    p.active = false;
    if (p.mesh) p.mesh.visible = false;
  }

  clear(): void {
    for (const p of this.items) this.kill(p);
  }

  update(dt: number, hooks: ProjectileHooks): void {
    const T = PROJECTILE_TUNING;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i]!;
      if (!p.active) continue;
      p.age += dt;
      if (p.fuse >= 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this.kill(p); // first: the detonation may spawn into this very slot
          hooks.onDetonate(p);
          continue;
        }
      }
      if (!p.resting) {
        p.vy -= (p.kind === 'knife' ? T.knifeGravity : T.gravity) * dt;
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        const len = speed * dt;
        if (len > 1e-6) {
          dirTmp.x = p.vx / speed;
          dirTmp.y = p.vy / speed;
          dirTmp.z = p.vz / speed;
          posTmp.x = p.x;
          posTmp.y = p.y;
          posTmp.z = p.z;
          const h = castBullet(this.world, HITS_TARGETS[p.kind] ? this.targetsRef : EMPTY, posTmp, dirTmp, len, this.hit);
          if (h.kind === 'none') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
          } else if (p.kind === 'frag' || p.kind === 'flash') {
            // bounce, keeping a small standoff from the surface
            p.x = h.point.x + h.normal.x * 0.05;
            p.y = h.point.y + h.normal.y * 0.05;
            p.z = h.point.z + h.normal.z * 0.05;
            hooks.onBounce?.(p, speed);
            const vn = p.vx * h.normal.x + p.vy * h.normal.y + p.vz * h.normal.z;
            if (vn < 0) {
              const tx = p.vx - vn * h.normal.x;
              const ty = p.vy - vn * h.normal.y;
              const tz = p.vz - vn * h.normal.z;
              p.vx = tx * T.friction - vn * T.restitution * h.normal.x;
              p.vy = ty * T.friction - vn * T.restitution * h.normal.y;
              p.vz = tz * T.friction - vn * T.restitution * h.normal.z;
            }
            if (h.normal.y > 0.7 && Math.hypot(p.vx, p.vy, p.vz) < T.restSpeed) {
              p.vx = p.vy = p.vz = 0;
              p.resting = true;
            }
          } else {
            // molotov / knife: impact ends the flight
            p.x = h.point.x;
            p.y = h.point.y;
            p.z = h.point.z;
            this.kill(p);
            hooks.onImpact(p, h);
            continue;
          }
        }
      }
      if (p.y < T.killY) {
        this.kill(p);
        continue;
      }
      if (p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
        if (p.kind === 'knife') p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        else if (!p.resting) {
          p.mesh.rotation.x += dt * 9;
          p.mesh.rotation.z += dt * 5;
        }
      }
    }
  }

  dispose(): void {
    this.group?.parent?.remove(this.group);
  }
}
