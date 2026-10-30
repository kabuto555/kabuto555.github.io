// §8 Stats & leveling. Curves and start values are placeholders (PLAN gives no numbers).
import type { StatsDef } from './types';

export const STATS: StatsDef = {
  startLevel: 1, // placeholder
  start: { vitality: 10, endurance: 10, firearms: 10, strength: 10 }, // placeholder
  maxHp: [[1, 100], [99, 1000]], // placeholder
  maxStamina: [[1, 100], [99, 300]], // placeholder
  staminaRegen: [[1, 20], [99, 40]], // placeholder
  maxEquipLoad: [[1, 40], [99, 90]], // placeholder
  gunDamage: [[1, 1], [99, 1.5]], // placeholder
  meleeDamage: [[1, 1], [99, 1.5]], // placeholder
  meleePoise: [[1, 1], [99, 1.5]], // placeholder
  levelCostFloor: 100, // placeholder
  estusCharges: 5, // placeholder
  estusHeal: 125, // balance: ~68% of the 183 starting max HP (DS1: a sip is a real heal); flat like DS1, so it eases off as Vitality grows
};

/**
 * Souls to reach `targetLevel` (§8, DS1 semantics: L = the level you are leveling UP TO, i.e. current + 1):
 * round(0.02L³ + 3.06L² + 105.6L − 895), floored at levelCostFloor.
 */
export function levelCost(targetLevel: number): number {
  const L = targetLevel;
  const raw = Math.round(0.02 * L ** 3 + 3.06 * L ** 2 + 105.6 * L - 895);
  return Math.max(STATS.levelCostFloor, raw);
}
