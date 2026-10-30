import type { Vec3Like } from './types';

/** Runtime entity id (unique per spawn). Distinct from data ids (ItemId, EnemyId). */
export type EntityId = number;

/** Damage / absorb channels (§5: phys + fire absorb; EOD explosive resist). */
export enum DamageType {
  Physical = 'physical',
  Fire = 'fire',
  Explosive = 'explosive',
}

export interface Transform {
  position: Vec3Like;
  /** Yaw in radians (Y-up, 0 = facing -Z, matching three.js cameras). */
  yaw: number;
}

export interface Health {
  hp: number;
  maxHp: number;
}

/**
 * Poise (§5): accumulated poise damage; when `current` would drop below 0 the target flinches
 * (player) / staggers (enemy), then resets to `max` after `regenDelay` seconds without hits.
 */
export interface Poise {
  current: number;
  max: number;
}

/** Minimal shape anything damageable exposes. Player and enemies both implement it. */
export interface Entity {
  readonly id: EntityId;
  readonly transform: Transform;
  readonly health: Health;
  readonly poise: Poise;
  /** True while invulnerable (dodge i-frames, cutscenes). Damage is ignored. */
  invulnerable?: boolean;
  /** Team: hostile damage only applies across teams. */
  team: 'player' | 'enemy' | 'neutral';
}

/** One resolved hit, before the target's absorb is applied. Emitted on the `damage` event. */
export interface DamageEvent {
  source: EntityId | null;
  target: EntityId;
  /** Raw damage before target absorb/block. */
  amount: number;
  type: DamageType;
  poiseDamage: number;
  hitPos: Vec3Like;
  /** Optional extras — combat fills what it knows. */
  headshot?: boolean;
  /** Weapon/item id that caused it (for UI, achievements, martyrdom exemptions). */
  weaponId?: string;
  /** Direction of the hit (unit), for knockback and block-facing checks. */
  dir?: Vec3Like;
}
