import type { Modifier, ModifierKey, StatsReader } from './types';

/** Base (unmodified) value of every key. Multiplier keys 1, flat/flag keys 0. */
export const MODIFIER_BASE: Record<ModifierKey, number> = {
  reloadSpeed: 1,
  ammoDropChance: 1,
  ammoPackAmount: 1,
  soulGain: 1,
  sprintStaminaCost: 1,
  staminaRegen: 1,
  adsSway: 1,
  recoil: 1,
  equipLoad: 1,
  aggroRadius: 1,
  hearingRadius: 1,
  footstepVolume: 1,
  moveSpeed: 1,
  gunDamage: 1,
  meleeDamage: 1,
  physAbsorb: 0,
  fireAbsorb: 0,
  explosiveAbsorb: 0,
  poise: 0,
  maxHpBonus: 0,
  maxStaminaBonus: 0,
  gunFireDamage: 0,
  martyrdom: 0,
  nightVision: 0,
};

/**
 * Per-key result clamps applied in `get()` after resolution. Documented caps:
 * - multiplier-style keys (base 1) are floored at 0 (a stack of negative pct can't flip sign);
 * - physAbsorb clamped to [0, 0.7]; fire/explosive absorb to [0, 0.8];
 * - other flat keys (poise, bonuses, flags) floored at 0.
 * Keys with no entry are unclamped beyond the base-class rule above.
 */
export const MODIFIER_LIMITS: Partial<Record<ModifierKey, { min: number; max: number }>> = {
  physAbsorb: { min: 0, max: 0.7 },
  fireAbsorb: { min: 0, max: 0.8 },
  explosiveAbsorb: { min: 0, max: 0.8 },
};

function clampKey(key: ModifierKey, v: number): number {
  const lim = MODIFIER_LIMITS[key];
  const min = lim?.min ?? 0;
  const max = lim?.max ?? Infinity;
  return Math.min(max, Math.max(min, v));
}

/**
 * The single modifier resolver (§12 `stats.get(mod)`).
 * Sources (equipped accessory, armor piece, set bonus, timed buff, stat curve) register a
 * list of modifiers under a unique source id, e.g. 'acc:scavenger_patch', 'set:ghillie',
 * 'buff:energy_drink', 'stat:firearms'. Re-registering the same id replaces it.
 * Resolution: (base + Σadd) × (1 + Σpct) × Πmul — see Modifier docs. Cached until changed.
 */
export class StatsResolver implements StatsReader {
  private sources = new Map<string, readonly Modifier[]>();
  private cache = new Map<ModifierKey, number>();

  register(sourceId: string, mods: readonly Modifier[]): void {
    this.sources.set(sourceId, mods);
    this.cache.clear();
  }

  unregister(sourceId: string): void {
    if (this.sources.delete(sourceId)) this.cache.clear();
  }

  hasSource(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  /** Remove all sources whose id starts with prefix (e.g. 'buff:' on death). */
  unregisterPrefix(prefix: string): void {
    for (const id of [...this.sources.keys()]) if (id.startsWith(prefix)) this.sources.delete(id);
    this.cache.clear();
  }

  get(key: ModifierKey): number {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let add = 0;
    let pct = 0;
    let mul = 1;
    for (const mods of this.sources.values()) {
      for (const m of mods) {
        if (m.key !== key) continue;
        if (m.op === 'add') add += m.value;
        else if (m.op === 'pct') pct += m.value;
        else mul *= m.value;
      }
    }
    const v = clampKey(key, (MODIFIER_BASE[key] + add) * (1 + pct) * mul);
    this.cache.set(key, v);
    return v;
  }

  has(key: ModifierKey): boolean {
    return this.get(key) > 0;
  }

  clear(): void {
    this.sources.clear();
    this.cache.clear();
  }
}

/** Global resolver. Inventory/equipment/buff systems write; everyone else reads. */
export const stats = new StatsResolver();
