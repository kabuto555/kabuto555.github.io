import type { AmmoType, EquipSlot, ItemId } from '../data/types';

/**
 * Modifier hooks (§6, §12). Systems read the resolved value via `stats.get(key)` — never
 * check for a specific accessory/armor id in gameplay code.
 *
 * Unit convention (see MODIFIER_BASE in ./modifiers.ts):
 * - "multiplier" keys have base 1 (1 = unchanged). Example: reloadSpeed 1.4 = 40% faster.
 * - "flat" keys have base 0 and are summed fractions/amounts. Example: fireAbsorb 0.25.
 * - "flag" keys have base 0; any value > 0 means on.
 */
export type ModifierKey =
  // --- multipliers (base 1) ---
  | 'reloadSpeed' // Sleight of Hand: reload anim speed
  | 'ammoDropChance' // Scavenger: chance multiplier for ammo drops
  | 'ammoPackAmount' // Scavenger: ammo per pack
  | 'soulGain' // Bounty Tag: souls from kills
  | 'sprintStaminaCost' // Marathon: stamina drain per second while sprinting
  | 'staminaRegen' // Energy Drink
  | 'adsSway' // Steady Aim
  | 'recoil' // Steady Aim
  | 'equipLoad' // Tac Vest Frame: MAX equip load multiplier
  | 'aggroRadius' // Ghillie (2+ pieces): enemy sight aggro radius
  | 'hearingRadius' // Dead Silence: enemy hearing radius
  | 'footstepVolume' // Dead Silence: 0 = silent
  | 'moveSpeed' // roll tier / buffs
  | 'gunDamage' // Firearms stat curve feeds this
  | 'meleeDamage' // Strength stat curve feeds this
  // --- flat (base 0) ---
  | 'physAbsorb' // fraction, armor sum (cap 0.7 applied by consumer)
  | 'fireAbsorb' // fraction, armor + Fire Discipline
  | 'explosiveAbsorb' // fraction, EOD suit
  | 'poise' // armor sum
  | 'maxHpBonus'
  | 'maxStaminaBonus'
  | 'gunFireDamage' // Incendiary Rounds: extra fire dmg per gun hit
  // --- flags (base 0) ---
  | 'martyrdom' // drop live frag on death
  | 'nightVision'; // NV visor tint

/**
 * One modifier contribution.
 * Resolution: value = (base + Σadd) × (1 + Σpct) × Πmul
 * - add: flat, summed (absorbs, poise, flags).
 * - pct: additive percent, summed before applying (two +20% = +40%). 0.4 = +40%, -0.4 = -40%.
 * - mul: independent factor, multiplied (0.5 = halve).
 */
export interface Modifier {
  key: ModifierKey;
  op: 'add' | 'pct' | 'mul';
  value: number;
}

/** Read-only view systems depend on (lets tests stub it). */
export interface StatsReader {
  get(key: ModifierKey): number;
  /** Shorthand for flag keys. */
  has(key: ModifierKey): boolean;
}

/** One inventory stack. Unique items (weapons/armor) use count 1 per entry. */
export interface ItemStack {
  id: ItemId;
  count: number;
}

export interface InventoryStore {
  add(id: ItemId, count?: number): void;
  /** Returns false if not enough. */
  remove(id: ItemId, count?: number): boolean;
  count(id: ItemId): number;
  has(id: ItemId): boolean;
  list(): readonly ItemStack[];
}

/** Equipped item per slot (null = empty). See EquipSlot in data/types. */
export type Loadout = Record<EquipSlot, ItemId | null>;

export interface Equipment {
  readonly loadout: Readonly<Loadout>;
  equip(slot: EquipSlot, id: ItemId | null): void;
  /** Total weight of equipped guns + left-hand items + armor. */
  weight(): number;
  /** weight / max load (max from Endurance curve × stats.get('equipLoad')). */
  loadRatio(): number;
  rollTier(): RollTier;
}

/** §3 Dodge tiers by load ratio: <0.25 fast, <=0.5 normal, <=1 slow, >1 fat. */
export type RollTier = 'fast' | 'normal' | 'slow' | 'fat';

/** Ammo reserves per type, capped by AmmoDef.cap. */
export type AmmoReserve = Record<AmmoType, number>;

/** Quick-item belt: 5 slots (§4), plus selected index. Grenade pouch is separate. */
export interface QuickBelt {
  slots: (ItemId | null)[];
  selected: number;
}
