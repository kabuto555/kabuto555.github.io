import type { DamageEvent } from '../core/entity';
import type { Vec3Like } from '../core/types';
import type { Damageable } from './types';

/** Hit volumes relative to the target's feet (`transform.position`). Meters. */
export interface HitShape {
  bodyRadius: number;
  /** Top of the body capsule above the feet. */
  bodyHeight: number;
  headRadius: number;
  /** Head sphere center height above the feet. */
  headY: number;
}

export const HUMANOID_SHAPE: HitShape = { bodyRadius: 0.3, bodyHeight: 1.45, headRadius: 0.17, headY: 1.62 };

/**
 * A Damageable that hitscan/melee can hit. Enemies (M3) and dummies implement it and register with
 * `CombatSystem.addTarget`. `applyDamage` is called by combat; the `damage` event is emitted AFTER
 * it as a notification (targets must NOT also apply it from the event).
 */
export interface HitTarget extends Damageable {
  readonly hit: HitShape;
  /** Dead/disabled targets are skipped by rays and swings. */
  readonly alive: boolean;
  /** Optional frontal guard: true if a hit travelling along `dir` is blocked (shielded enemies/dummies). */
  guards?(dir: Vec3Like, e: DamageEvent): boolean;
}
