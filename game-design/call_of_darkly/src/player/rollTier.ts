/**
 * §3 Dodge / §5 equip load → DS1 roll tiers. Pure, unit-testable.
 * Ratio = equip weight ÷ max load.
 *   < 25%      fast   (more distance + i-frames, +10% move speed)
 *   25–50%     normal
 *   50–100%    slow   (shorter, fewer i-frames, −10% move speed)
 *   > 100%     fat    (barely moves, sprint disabled)
 * Boundaries: exactly 0.25 and 0.5 are normal, exactly 1.0 is slow.
 */
export type RollTier = 'fast' | 'normal' | 'slow' | 'fat';

export interface RollParams {
  /** Total roll distance, m. */
  distance: number;
  /** Total roll duration incl. recovery, s. */
  duration: number;
  /** I-frame window [start, end), s from roll start. */
  iStart: number;
  iEnd: number;
  /** Fraction of `duration` spent moving; the rest is recovery (no movement, no actions). */
  moveFrac: number;
  /** Walk/sprint speed multiplier for this tier. */
  moveSpeedMul: number;
  canSprint: boolean;
}

/** normal = PLAN numbers (0.5 s, 3.5 m, i-frames 0.05–0.35). Others are tuned around it. */
export const ROLL_TIERS: Record<RollTier, RollParams> = {
  fast: { distance: 4.2, duration: 0.45, iStart: 0.04, iEnd: 0.37, moveFrac: 0.78, moveSpeedMul: 1.1, canSprint: true },
  normal: { distance: 3.5, duration: 0.5, iStart: 0.05, iEnd: 0.35, moveFrac: 0.76, moveSpeedMul: 1.0, canSprint: true },
  slow: { distance: 2.6, duration: 0.6, iStart: 0.08, iEnd: 0.3, moveFrac: 0.72, moveSpeedMul: 0.9, canSprint: true },
  fat: { distance: 1.2, duration: 0.8, iStart: 0.12, iEnd: 0.2, moveFrac: 0.6, moveSpeedMul: 0.9, canSprint: false },
};

/** Equip-load ratio. max ≤ 0 with any weight counts as overloaded. */
export function equipLoadRatio(weight: number, maxLoad: number): number {
  if (maxLoad <= 0) return weight > 0 ? Infinity : 0;
  return Math.max(0, weight) / maxLoad;
}

export function rollTierFromRatio(ratio: number): RollTier {
  if (ratio < 0.25) return 'fast';
  if (ratio <= 0.5) return 'normal';
  if (ratio <= 1) return 'slow';
  return 'fat';
}

/** True while `t` seconds into a roll is inside the tier's i-frame window. */
export function rollInvulnerable(p: RollParams, t: number): boolean {
  return t >= p.iStart && t < p.iEnd;
}

/**
 * Fraction (0..1) of roll distance covered at time t. Ease-out burst over the move phase
 * (quadratic: initial speed = 2× average), then flat during recovery.
 */
export function rollDistanceFrac(p: RollParams, t: number): number {
  const mt = p.duration * p.moveFrac;
  if (t <= 0) return 0;
  if (t >= mt) return 1;
  const u = t / mt;
  return 1 - (1 - u) * (1 - u);
}
