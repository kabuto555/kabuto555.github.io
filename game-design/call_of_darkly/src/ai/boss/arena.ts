// Taurus arena frame (§10 beat 9): bridge-local ↔ world transform + the layout constants shared by
// the level geometry (world/areas/taurus.ts) and the boss runtime (fog wall, plunge, far barrier).
// Pure: no three.js, no DOM.
import type { Vec3Like } from '../../core/types';

/** Bridge layout, local meters. Bridge runs along local +z from the origin; deck top at local y = 0. */
export const ARENA = {
  /** Deck half width (8 m bridge). */
  halfWidth: 4,
  length: 60,
  /** Fog wall plane (local z) and height. */
  fogZ: 0,
  fogHeight: 6.4,
  /** Far-end pylon barrier (local z, depth). Opens on victory. */
  farZ: 57.5,
  /** Boss home + facing (local yaw 0 = facing -z, toward the fog wall). */
  bossHome: { x: 0, y: 0, z: 44 },
  bossYaw: 0,
  /** Watchtower plunge ledge tip (8 m above the deck, beside/over the bridge). */
  ledge: { x: 0, y: 8, z: 14 },
  /** Where the fog wall drops the player (just inside). */
  entry: { x: 0, y: 0, z: 1.6 },
  /** Parapet opening to the watchtower stairs (+x side), local z range. Narrower than the boss. */
  stairGap: [0.6, 2.4] as const,
  /** Stair/tower block footprint (+x side), local. */
  tower: { x0: 4.5, x1: 7.75, z0: 0.3, z1: 15.8 },
} as const;

export interface ArenaPlacement {
  pos: readonly [number, number, number];
  /** Radians; snapped to quarter turns (the level DSL is axis-aligned boxes). */
  yaw: number;
}

/** Local ↔ world for one placed arena. Rotation follows three.js Object3D.rotation.y. */
export class ArenaFrame {
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  /** Quarter turns 0..3. */
  readonly q: number;
  readonly yaw: number;
  private readonly c: number;
  private readonly s: number;

  constructor(p: ArenaPlacement) {
    this.ox = p.pos[0];
    this.oy = p.pos[1];
    this.oz = p.pos[2];
    this.q = (((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4) as number;
    this.yaw = (this.q * Math.PI) / 2;
    // exact for quarter turns (no 6e-17 drift in the AABBs)
    this.c = [1, 0, -1, 0][this.q]!;
    this.s = [0, 1, 0, -1][this.q]!;
  }

  toWorld(lx: number, ly: number, lz: number, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
    out.x = this.ox + lx * this.c + lz * this.s;
    out.y = this.oy + ly;
    out.z = this.oz - lx * this.s + lz * this.c;
    return out;
  }

  toLocal(wx: number, wy: number, wz: number, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
    const dx = wx - this.ox;
    const dz = wz - this.oz;
    out.x = dx * this.c - dz * this.s;
    out.y = wy - this.oy;
    out.z = dx * this.s + dz * this.c;
    return out;
  }

  /** Local direction (dx, dz) → world. */
  dirToWorld(dx: number, dz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    out.x = dx * this.c + dz * this.s;
    out.z = -dx * this.s + dz * this.c;
    return out;
  }

  /** Local entity yaw (0 = facing local -z) → world yaw. */
  yawToWorld(localYaw: number): number {
    return localYaw + this.yaw;
  }

  /** Swap footprint sizes on odd quarter turns. */
  sizeToWorld(w: number, d: number): [w: number, d: number] {
    return this.q % 2 === 1 ? [d, w] : [w, d];
  }

  /** Inside the fight zone (past the fog wall, on the deck or in the watchtower). */
  inArena(wx: number, wy: number, wz: number): boolean {
    const l = this.toLocal(wx, wy, wz, _l);
    if (l.y < -6 || l.y > 14) return false;
    const onDeck = l.z > ARENA.fogZ && l.z < ARENA.length + 1 && Math.abs(l.x) <= ARENA.halfWidth + 0.6;
    const t = ARENA.tower;
    const inTower = l.x >= t.x0 - 0.6 && l.x <= t.x1 && l.z >= t.z0 && l.z <= t.z1;
    return onDeck || inTower;
  }
}

const _l = { x: 0, y: 0, z: 0 };

// ------------------------------------------------------------------ registry

let current: ArenaPlacement | null = null;

/** Called by `buildTaurusArena` while the level is recorded; the boss system picks it up lazily. */
export function setTaurusArena(p: ArenaPlacement | null): void {
  current = p ? { pos: [p.pos[0], p.pos[1], p.pos[2]], yaw: p.yaw } : null;
}

export function getTaurusArena(): ArenaPlacement | null {
  return current;
}
