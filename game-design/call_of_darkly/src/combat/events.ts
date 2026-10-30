import type { EntityId } from '../core/entity';
import type { Vec3Like } from '../core/types';

declare module '../core/events' {
  interface EventMap {
    /** A player attack landed on a target (hitmarker). Emitted after the target resolved the damage. */
    hit: { targetId: EntityId; pos: Vec3Like; headshot: boolean; dealt: number; blocked: boolean; killed: boolean; weaponId: string };
    /** A gun fired (audio/muzzle flash/UI). */
    gunFired: { weaponId: string; pos: Vec3Like; dir: Vec3Like };
    /** Fire pressed with an empty magazine (click). */
    gunDryFire: { weaponId: string };
    gunReload: { weaponId: string; phase: 'start' | 'done' | 'cancel'; empty: boolean };
    /** Left-hand melee swing started. */
    meleeSwing: { weaponId: string };
    /** Shield absorbed (part of) a hit on the player. */
    shieldBlock: { weaponId: string; absorbed: number; staminaCost: number; guardBroken: boolean };
    /** Player swapped gun slot (index 0/1). */
    weaponSwap: { hand: 'R' | 'L'; slot: number; weaponId: string | null };
    /** Ammo reserve changed (type, new reserve). */
    ammoChanged: { type: string; reserve: number };
  }
}

export {};
