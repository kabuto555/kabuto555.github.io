// Pure AI logic (no three, no world): poise, attack phase timing, attack choice, aggro checks.
// Unit-tested in ai.test.ts.
import type { Poise } from '../core/entity';
import type { EnemyAttackDef } from '../data/types';

// ------------------------------------------------------------------ poise

/**
 * Apply poise damage. Poise breaks when `current` would drop BELOW 0 (core/entity Poise doc);
 * a break restores full poise (fresh bar after the stagger). Returns true on break.
 * max <= 0 means "no poise" (any poise damage > 0 breaks).
 */
export function applyPoiseDamage(p: Poise, dmg: number): boolean {
  if (dmg <= 0) return false;
  p.current -= dmg;
  if (p.current < 0) {
    p.current = p.max;
    return true;
  }
  return false;
}

/**
 * Regen: after `regenDelay` s without poise damage the bar resets to max. `sinceHit` is the
 * caller-owned timer; returns its new value.
 */
export function tickPoise(p: Poise, sinceHit: number, dt: number, regenDelay: number): number {
  const t = sinceHit + dt;
  if (t >= regenDelay && p.current < p.max) p.current = p.max;
  return t;
}

// ------------------------------------------------------------------ attack timing

export type AttackPhase = 'windup' | 'active' | 'recover' | 'done';
type Timing = Pick<EnemyAttackDef, 'windup' | 'active' | 'recover'>;

export function attackDuration(a: Timing): number {
  return a.windup + a.active + a.recover;
}

/** Phase of an attack `t` s after windup start. Boundaries belong to the later phase. */
export function attackPhase(a: Timing, t: number): AttackPhase {
  if (t < a.windup) return 'windup';
  if (t < a.windup + a.active) return 'active';
  if (t < a.windup + a.active + a.recover) return 'recover';
  return 'done';
}

/** 0..1 progress within the current phase (1 when done). */
export function attackPhaseProgress(a: Timing, t: number): number {
  if (t < a.windup) return a.windup > 0 ? t / a.windup : 1;
  t -= a.windup;
  if (t < a.active) return a.active > 0 ? t / a.active : 1;
  t -= a.active;
  if (t < a.recover) return a.recover > 0 ? t / a.recover : 1;
  return 1;
}

/**
 * Weighted pick among attacks whose `range` covers `dist` (and pass `allow`). `rnd` in [0,1).
 * Returns null if nothing is in range.
 */
export function pickAttack(
  attacks: readonly EnemyAttackDef[],
  dist: number,
  rnd: number,
  allow?: (a: EnemyAttackDef) => boolean,
): EnemyAttackDef | null {
  let total = 0;
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i]!;
    if (a.range >= dist && (!allow || allow(a))) total += a.weight ?? 1;
  }
  if (total <= 0) return null;
  let r = rnd * total;
  let last: EnemyAttackDef | null = null;
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i]!;
    if (!(a.range >= dist && (!allow || allow(a)))) continue;
    last = a;
    r -= a.weight ?? 1;
    if (r < 0) return a;
  }
  return last;
}

// ------------------------------------------------------------------ perception

export interface SightParams {
  /** Base sight radius (EnemyDef.aggroRadius) × the player's `aggroRadius` modifier. */
  radius: number;
  /** Full view cone (deg). Targets inside `proximity` are noticed regardless of facing. */
  fovDeg: number;
  proximity: number;
}

/**
 * Can an enemy at the origin facing (fx, fz) see a target at offset (dx, dz)? Distance/cone only;
 * the caller supplies the line-of-sight ray result.
 */
export function canSee(dx: number, dz: number, fx: number, fz: number, los: boolean, p: SightParams): boolean {
  if (!los) return false;
  const d2 = dx * dx + dz * dz;
  if (d2 > p.radius * p.radius) return false;
  if (d2 <= p.proximity * p.proximity) return true;
  const d = Math.sqrt(d2);
  const cos = (dx * fx + dz * fz) / d;
  return cos >= Math.cos((p.fovDeg * Math.PI) / 360);
}

/** Gunshot heard: within the hearing radius (no LOS needed). */
export function canHear(dx: number, dy: number, dz: number, radius: number): boolean {
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

// ------------------------------------------------------------------ steering helpers

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Yaw (0 = facing -Z) that faces direction (dx, dz). */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Rotate `yaw` toward `target` by at most `maxStep` radians. */
export function turnToward(yaw: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - yaw);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(yaw + Math.sign(d) * maxStep);
}
