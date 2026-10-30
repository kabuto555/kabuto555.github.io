/**
 * Record types for every data table (§4–§8, §10). Tables themselves live in sibling files
 * (weapons.ts, armor.ts, ...) as `export const WEAPONS: Record<ItemId, WeaponDef>` etc.
 * Every item has a unique `id` (snake_case, e.g. 'm4_ar', 'residence_key'); saves store ids only.
 */
import type { DamageType } from '../core/entity';
import type { Modifier } from '../inventory/types';

// ---------------------------------------------------------------- ids & kinds

/** Item id. Plain string so data tables stay terse; use snake_case and keep ids unique across ALL tables. */
export type ItemId = string;
export type EnemyId = string;
export type DropTableId = string;
export type ShopId = string;
export type ArmorSetId = string;

export type ItemKind = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'grenade' | 'key' | 'ammo';

/** Fields shared by every item record. */
export interface ItemBase {
  id: ItemId;
  kind: ItemKind;
  name: string;
  /** Flavor/description text for the inventory panel. */
  description: string;
  /** Procedural icon key (render/textures). Defaults to id. */
  icon?: string;
  /** Max stack in inventory (default 1 for gear, 99 for consumables). */
  maxStack?: number;
  /** Base sell/buy value hint in souls (shops may override). */
  value?: number;
}

// ---------------------------------------------------------------- ammo (§4)

export type AmmoType = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'launcher';

export interface AmmoDef {
  type: AmmoType;
  name: string;
  /** Max reserve (COD-style cap). */
  cap: number;
}

// ---------------------------------------------------------------- weapons (§4)

export type Hand = 'R' | 'L';
export type GunClass = 'ar' | 'pistol' | 'revolver' | 'smg' | 'shotgun' | 'marksman' | 'lmg' | 'launcher';
/** auto: hold; semi: one per click; pump: semi with chamber delay; double: all barrels per click. */
export type FireMode = 'auto' | 'semi' | 'pump' | 'double';
/** Where the item comes from (documentation / balance only). */
export type Source = 'start' | 'shop' | 'found' | 'drop';

export interface WeaponBase extends ItemBase {
  kind: 'weapon';
  hand: Hand;
  /** Equip-load weight. */
  weight: number;
  source: Source;
}

export interface GunDef extends WeaponBase {
  hand: 'R';
  class: GunClass;
  ammo: AmmoType;
  mag: number;
  /** Damage per pellet/bullet before Firearms scaling. */
  damage: number;
  /** Pellets per shot (1 for non-shotguns). */
  pellets: number;
  /** Rounds per minute (fire-rate cap; for semi it's the max click rate). */
  rpm: number;
  fireMode: FireMode;
  /** Default 2 (§4); marksman 2.5. */
  headshotMult: number;
  /** Seconds, full reload (empty). */
  reloadTime: number;
  /** Seconds to fully ADS. */
  adsTime: number;
  /** Hip / ADS cone half-angle in degrees. */
  spreadHip: number;
  spreadAds: number;
  /** Vertical/horizontal kick per shot in degrees. */
  recoil: { up: number; side: number };
  /** Max effective range (m); damage falls off to `falloffMin` × beyond it. */
  range: number;
  falloffMin: number;
  damageType: DamageType;
  poiseDamage: number;
  /** Explosive weapons (RPG): splash radius in meters. */
  splashRadius?: number;
}

export type MeleeSpeed = 'fast' | 'medium' | 'slow';

export interface MeleeDef extends WeaponBase {
  hand: 'L';
  class: 'melee';
  damage: number;
  speed: MeleeSpeed;
  staminaCost: number;
  poiseDamage: number;
  /** Hit arc in degrees and reach in meters (halberd = wide sweep). */
  arc: number;
  reach: number;
  damageType: DamageType;
}

export interface ShieldDef extends WeaponBase {
  hand: 'L';
  class: 'shield';
  /** Fraction of physical damage blocked (riot 1.0, ballistic 0.8). */
  blockPhys: number;
  /** Stamina drained per blocked hit = damage × (1 - stability). */
  stability: number;
  canParry: boolean;
}

export type WeaponDef = GunDef | MeleeDef | ShieldDef;

// ---------------------------------------------------------------- armor (§5)

export type ArmorSlot = 'head' | 'chest' | 'arms' | 'legs';
export type WeightClass = 'light' | 'medium' | 'heavy';

export interface ArmorDef extends ItemBase {
  kind: 'armor';
  slot: ArmorSlot;
  set: ArmorSetId;
  /** Fractions 0..1 (pieces sum; phys capped at 0.7 by the consumer). */
  physAbsorb: number;
  fireAbsorb: number;
  explosiveAbsorb: number;
  poise: number;
  weight: number;
  weightClass: WeightClass;
  source: Source;
}

/** Set bonus (e.g. Ghillie 2+ pieces → aggroRadius −35%). */
export interface ArmorSetDef {
  id: ArmorSetId;
  name: string;
  pieces: ItemId[];
  bonus?: { minPieces: number; modifiers: Modifier[] };
}

// ---------------------------------------------------------------- accessories (§6)

export interface AccessoryDef extends ItemBase {
  kind: 'accessory';
  /** Registered into the StatsResolver while equipped. */
  modifiers: Modifier[];
  dsAnalog?: string;
}

// ---------------------------------------------------------------- consumables & grenades (§7)

export type ConsumableEffect =
  | { type: 'souls'; amount: number }
  | { type: 'warpToBonfire' }
  | { type: 'buff'; buffId: string; duration: number; modifiers: Modifier[] }
  /** Refill `fraction` of each owned ammo type's cap (clamped). */
  | { type: 'ammoRefill'; fraction: number };

export interface ConsumableDef extends ItemBase {
  kind: 'consumable';
  effect: ConsumableEffect;
  /** Seconds of use animation (movement slowed). */
  useTime: number;
}

export interface GrenadeDef extends ItemBase {
  kind: 'grenade';
  damage: number;
  radius: number;
  /** Seconds; 0 = impact. */
  fuse: number;
  cookable: boolean;
  damageType: DamageType;
  poiseDamage: number;
  /** Molotov: fire pool. */
  dot?: { dps: number; duration: number; radius: number };
  /** Flashbang: stun non-boss enemies (seconds). */
  stun?: number;
  /** Throwing knife: silent single-target. */
  silent?: boolean;
}

// ---------------------------------------------------------------- keys (§7)

export interface KeyDef extends ItemBase {
  kind: 'key';
  /** Door id (level DSL) it opens; null for the joke Basement Key. */
  opens: string | null;
}

/** Union of every item record (what an ItemId resolves to). */
export type ItemDef = WeaponDef | ArmorDef | AccessoryDef | ConsumableDef | GrenadeDef | KeyDef;

// ---------------------------------------------------------------- equipment slots (§4)

/** 10 gear slots. Grenade pouch + quick belt are tracked separately (inventory/QuickBelt). */
export type EquipSlot =
  | 'right1'
  | 'right2'
  | 'left1'
  | 'left2'
  | 'head'
  | 'chest'
  | 'arms'
  | 'legs'
  | 'accessory1'
  | 'accessory2';

// ---------------------------------------------------------------- enemies (§10)

export type EnemyArchetype =
  | 'hollowSword'
  | 'hollowFirebomb'
  | 'hollowCrossbow'
  | 'hollowSoldier'
  | 'barrelHollow'
  | 'blackKnight'
  | 'mimic'
  | 'taurusDemon';

/** One telegraphed attack. Times in seconds. */
export interface EnemyAttackDef {
  id: string;
  windup: number;
  active: number;
  recover: number;
  damage: number;
  damageType: DamageType;
  poiseDamage: number;
  /** Trigger distance (m). */
  range: number;
  /** Melee: hit arc in degrees. Projectile attacks set `projectile` instead. */
  arc?: number;
  projectile?: { speed: number; gravity: number; splashRadius?: number };
  /** Relative pick weight among in-range attacks. */
  weight?: number;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  archetype: EnemyArchetype;
  hp: number;
  poise: number;
  /** Souls on kill (before soulGain). */
  souls: number;
  dropTable: DropTableId | null;
  moveSpeed: number;
  /** Sight / hearing radii (m), scaled by player's aggroRadius / hearingRadius mods. */
  aggroRadius: number;
  hearingRadius: number;
  attacks: EnemyAttackDef[];
  /** Frontal block (hollow soldier shield): fraction of frontal damage blocked. */
  frontalBlock?: number;
  isBoss?: boolean;
  /** Bosses don't respawn on rest. */
  respawns: boolean;
}

// ---------------------------------------------------------------- drop tables (§4)

export type DropEntry =
  /** 1..n random OWNED ammo types, amount per type in rounds (scaled by ammoPackAmount). */
  | { kind: 'ammo'; chance: number; types: [min: number, max: number]; amount: [min: number, max: number] }
  /** Specific item(s): weapon/armor/grenade/consumable/key. One picked uniformly. */
  | { kind: 'item'; chance: number; ids: ItemId[]; count?: [min: number, max: number] };

export interface DropTableDef {
  id: DropTableId;
  /** Each entry rolls independently. Ammo chances are scaled by ammoDropChance. */
  entries: DropEntry[];
  /** Guaranteed only the first time this enemy type/instance is killed (Basement Key). */
  firstKill?: ItemId[];
}

// ---------------------------------------------------------------- shops

export interface ShopEntry {
  itemId: ItemId;
  price: number;
  /** null = infinite. */
  stock: number | null;
  /** For ammo/grenade bundles: how many per purchase. */
  bundle?: number;
}

export interface ShopDef {
  id: ShopId;
  merchant: string;
  entries: ShopEntry[];
}

// ---------------------------------------------------------------- stats & leveling (§8)

export type StatName = 'vitality' | 'endurance' | 'firearms' | 'strength';
export type StatBlock = Record<StatName, number>;

/** Piecewise-linear curve: [statLevel, value] points, sorted by level; clamped at ends. */
export type Curve = ReadonlyArray<readonly [level: number, value: number]>;

export interface StatsDef {
  startLevel: number;
  start: StatBlock;
  /** Vitality → max HP. */
  maxHp: Curve;
  /** Endurance → max stamina, stamina regen/s, max equip load. */
  maxStamina: Curve;
  staminaRegen: Curve;
  maxEquipLoad: Curve;
  /** Firearms → gun damage multiplier (soft caps encoded by curve slope). */
  gunDamage: Curve;
  /** Strength → melee damage multiplier and stagger (poise dmg) multiplier. */
  meleeDamage: Curve;
  meleePoise: Curve;
  /** Souls cost floor for low levels (§8). */
  levelCostFloor: number;
  estusCharges: number;
  estusHeal: number;
}
