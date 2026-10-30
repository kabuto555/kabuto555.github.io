import { DamageType, type DamageEvent } from '../core/entity';
import { MODIFIER_LIMITS, stats as globalStats } from './modifiers';
import type { ModifierKey, StatsReader } from './types';

const ABSORB_KEY: Record<DamageType, ModifierKey> = {
  [DamageType.Physical]: 'physAbsorb',
  [DamageType.Fire]: 'fireAbsorb',
  [DamageType.Explosive]: 'explosiveAbsorb',
};

/**
 * Fraction (0..cap) of `type` damage absorbed. Armor pieces (`armor:<id>`), set bonuses (`set:<id>`)
 * and accessories (`acc:<id>`) all feed the same modifier keys; sums are clamped by MODIFIER_LIMITS
 * (phys 0.7, fire/explosive 0.8). Clamped again here so a stub StatsReader can't exceed caps.
 */
export function absorbFraction(type: DamageType, mods: StatsReader = globalStats): number {
  const key = ABSORB_KEY[type];
  const lim = MODIFIER_LIMITS[key];
  const v = mods.get(key);
  return Math.min(lim?.max ?? 1, Math.max(lim?.min ?? 0, v));
}

/** Damage the player actually takes from `e` after armor absorb. Pure; does not touch `e`. */
export function applyAbsorb(e: DamageEvent, mods: StatsReader = globalStats): number {
  return e.amount * (1 - absorbFraction(e.type, mods));
}

/** Player's total poise (armor sum). */
export function playerPoise(mods: StatsReader = globalStats): number {
  return mods.get('poise');
}

/** PLAN section 5: no flinch if total poise >= the hit's poise damage. A 0-poise hit never flinches. */
export function poiseHolds(poiseDamage: number, mods: StatsReader = globalStats): boolean {
  return poiseDamage <= 0 || playerPoise(mods) >= poiseDamage;
}
