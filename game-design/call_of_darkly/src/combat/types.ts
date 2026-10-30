import type { DamageEvent, Entity, EntityId } from '../core/entity';
import type { ItemId } from '../data/types';

// Entity + damage model live in core/entity.ts (shared by events); re-exported here for convenience.
export { DamageType } from '../core/entity';
export type { DamageEvent, Entity, EntityId, Health, Poise, Transform } from '../core/entity';

/** Runtime state of one owned gun (defs are in data/weapons). */
export interface GunState {
  id: ItemId;
  /** Rounds in mag. */
  mag: number;
  /** Seconds until next shot allowed. */
  cooldown: number;
  reloading: boolean;
  /** 0..1 reload progress; reload cancel (swap/sprint/dodge) keeps rounds only if past insert point. */
  reloadT: number;
}

/** Result of applying a DamageEvent to a target after absorb/block. */
export interface DamageResult {
  dealt: number;
  blocked: boolean;
  /** Poise broken → flinch (player: ADS knocked out, reload interrupted) / stagger (enemy). */
  poiseBroken: boolean;
  killed: boolean;
}

/** Anything that can receive damage: entity + its resolver (absorb, block, i-frames). */
export interface Damageable extends Entity {
  applyDamage(e: DamageEvent): DamageResult;
}

/** Registry used by hitscan/melee/explosions to find targets by id. */
export interface EntityRegistry {
  get(id: EntityId): Damageable | undefined;
  all(): Iterable<Damageable>;
}
