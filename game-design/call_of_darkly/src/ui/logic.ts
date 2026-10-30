/**
 * Pure UI logic (no DOM): keycap lookup, hint fade timer, stat-diff, equip planning/preview, level-up
 * affordability, shop buy logic, ammo-bar helpers. Unit-tested in ui.test.ts.
 */
import { EventBus } from '../core/events';
import { BINDINGS, type Action, type InputCode } from '../core/input';
import { ARMOR_SETS, STATS, levelCost } from '../data';
import type { AmmoType, EquipSlot, FireMode, ItemDef, ItemId, ShopDef, ShopEntry, StatBlock, StatName } from '../data/types';
import { AccessoryHooks } from '../inventory/accessories';
import { EquipmentImpl, slotAccepts } from '../inventory/equipment';
import { StatsResolver } from '../inventory/modifiers';
import { itemDef, maxStackOf } from '../inventory/store';
import type { Loadout, RollTier } from '../inventory/types';
import { evalCurve } from '../player/curve';

// ------------------------------------------------------------------ keycaps

/** Short human label for one input code ('KeyW' -> 'W', 'ShiftLeft' -> 'Shift', 'Mouse2' -> 'RMB'). */
export function codeLabel(code: InputCode): string {
  switch (code) {
    case 'Mouse0': return 'LMB';
    case 'Mouse1': return 'MMB';
    case 'Mouse2': return 'RMB';
    case 'WheelUp':
    case 'WheelDown': return 'Wheel';
    case 'ShiftLeft':
    case 'ShiftRight': return 'Shift';
    case 'ControlLeft':
    case 'ControlRight': return 'Ctrl';
    case 'AltLeft':
    case 'AltRight': return 'Alt';
    case 'Escape': return 'Esc';
    case 'Space': return 'Space';
    case 'Backquote': return '`';
    case 'ArrowUp': return 'Up';
    case 'ArrowDown': return 'Down';
    case 'ArrowLeft': return 'Left';
    case 'ArrowRight': return 'Right';
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

const codeRank = (c: InputCode): number => (c.startsWith('Wheel') ? 2 : c.startsWith('Mouse') ? 1 : 0);

/**
 * Keycap text for an action, read from the bindings table (never hardcode keys). Keyboard codes first,
 * then mouse, then wheel; duplicate labels (ShiftLeft/ShiftRight, WheelUp/WheelDown) collapse.
 * `max` limits how many alternatives are shown ('1/Wheel', 'Ctrl/C').
 */
export function bindingLabel(action: Action, bindings: Record<Action, InputCode[]> = BINDINGS, max = 2): string {
  const codes = [...(bindings[action] ?? [])].sort((a, b) => codeRank(a) - codeRank(b));
  const out: string[] = [];
  for (const c of codes) {
    const l = codeLabel(c);
    if (!out.includes(l)) out.push(l);
  }
  return out.slice(0, max).join('/');
}

// ------------------------------------------------------------------ key-hint visibility

export type HintMode = 'always' | 'fade' | 'off';
export const HINT_MODES: readonly HintMode[] = ['always', 'fade', 'off'];
export const HINT_FADE_SECONDS = 8;

/** "Fade" shows keycaps for 8 s after a poke (spawn, rest, slot change). Time is passed in (testable). */
export class HintFade {
  mode: HintMode = 'fade';
  private until = 0;

  constructor(private readonly seconds = HINT_FADE_SECONDS) {}

  /** (Re)start the visible window at `now` (never shortens an existing one). */
  poke(now: number): void {
    this.until = Math.max(this.until, now + this.seconds);
  }

  visible(now: number): boolean {
    if (this.mode === 'always') return true;
    if (this.mode === 'off') return false;
    return now < this.until;
  }
}

export function nextHintMode(m: HintMode): HintMode {
  return HINT_MODES[(HINT_MODES.indexOf(m) + 1) % HINT_MODES.length]!;
}

// ------------------------------------------------------------------ formatting

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Seconds -> m:ss (buff timers). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fireModeTag(mode: FireMode): string {
  switch (mode) {
    case 'auto': return 'AUTO';
    case 'semi': return 'SEMI';
    case 'pump': return 'PUMP';
    case 'double': return 'DOUBLE';
  }
}

/** Pretty name from an id ('burg_merchant' -> 'Burg Merchant'). */
export function prettyId(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ------------------------------------------------------------------ bars

/** DS1: bars grow with the stat. px width from max value: base at `refMin`, +1px per `perPx` extra. */
export function barWidthPx(max: number, refMin = 100, base = 140, perPx = 3, cap = 420): number {
  return Math.round(Math.min(cap, Math.max(base, base + (max - refMin) / perPx)));
}

// ------------------------------------------------------------------ ammo block

export type MagState = 'ok' | 'low' | 'empty';
export type ReserveState = 'ok' | 'gold' | 'low' | 'empty';

export interface AmmoStates {
  mag: MagState;
  reserve: ReserveState;
  /** [R] reload pulses. */
  reloadPrompt: boolean;
  /** Mag and reserve both empty: show NO AMMO + swap hint. */
  noAmmo: boolean;
}

/** Mag red at <=25%; reserve gold at cap, red under one spare mag. */
export function ammoStates(mag: number, magSize: number, reserve: number, cap: number): AmmoStates {
  const magS: MagState = mag <= 0 ? 'empty' : mag <= magSize * 0.25 ? 'low' : 'ok';
  const resS: ReserveState = reserve <= 0 ? 'empty' : reserve >= cap ? 'gold' : reserve < magSize ? 'low' : 'ok';
  return { mag: magS, reserve: resS, reloadPrompt: magS !== 'ok' && reserve > 0 && mag < magSize, noAmmo: mag <= 0 && reserve <= 0 };
}

/** Mag tick bar layout: one tick per round up to 40, otherwise segments of `per` rounds (~25 ticks). */
export function tickLayout(magSize: number): { ticks: number; per: number } {
  const per = magSize <= 40 ? 1 : Math.ceil(magSize / 25);
  return { ticks: Math.max(1, Math.ceil(magSize / per)), per };
}

export function filledTicks(mag: number, per: number): number {
  return mag <= 0 ? 0 : Math.ceil(mag / per);
}

// ------------------------------------------------------------------ damage direction arcs

/**
 * CSS rotation (degrees clockwise from screen-top) of the arc for a hit travelling along `dir`
 * (horizontal x/z) on a player facing `yaw` (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)).
 */
export function damageArcDeg(yaw: number, dirX: number, dirZ: number): number {
  const vx = -dirX; // toward the attacker
  const vz = -dirZ;
  const fwd = vx * -Math.sin(yaw) + vz * -Math.cos(yaw);
  const right = vx * Math.cos(yaw) + vz * -Math.sin(yaw);
  return (Math.atan2(right, fwd) * 180) / Math.PI;
}

// ------------------------------------------------------------------ stat diff (equipment list)

export interface DiffRow {
  label: string;
  cur: number | null;
  next: number | null;
  delta: number;
  /** +1 improvement (green), -1 worse (red), 0 same. */
  better: -1 | 0 | 1;
  unit: '' | '%' | 's' | 'm';
}

interface Metric {
  label: string;
  unit: DiffRow['unit'];
  lowerBetter?: boolean;
  get(d: ItemDef): number | undefined;
}

const W = (d: ItemDef): number | undefined => ('weight' in d ? d.weight : undefined);

const WEAPON_METRICS: Metric[] = [
  { label: 'Damage', unit: '', get: (d) => (d.kind === 'weapon' && 'damage' in d ? d.damage * ('pellets' in d ? d.pellets : 1) : undefined) },
  { label: 'Rate', unit: '', get: (d) => (d.kind === 'weapon' && 'rpm' in d ? d.rpm : undefined) },
  { label: 'Mag', unit: '', get: (d) => (d.kind === 'weapon' && 'mag' in d ? d.mag : undefined) },
  { label: 'Reload', unit: 's', lowerBetter: true, get: (d) => (d.kind === 'weapon' && 'reloadTime' in d ? d.reloadTime : undefined) },
  { label: 'Range', unit: 'm', get: (d) => (d.kind === 'weapon' && 'range' in d ? d.range : undefined) },
  { label: 'Stamina', unit: '', lowerBetter: true, get: (d) => (d.kind === 'weapon' && 'staminaCost' in d ? d.staminaCost : undefined) },
  { label: 'Reach', unit: 'm', get: (d) => (d.kind === 'weapon' && 'reach' in d ? d.reach : undefined) },
  { label: 'Block', unit: '%', get: (d) => (d.kind === 'weapon' && 'blockPhys' in d ? Math.round(d.blockPhys * 100) : undefined) },
  { label: 'Stability', unit: '', get: (d) => (d.kind === 'weapon' && 'stability' in d ? Math.round(d.stability * 100) : undefined) },
  { label: 'Weight', unit: '', lowerBetter: true, get: W },
];

const ARMOR_METRICS: Metric[] = [
  { label: 'Phys Abs', unit: '%', get: (d) => (d.kind === 'armor' ? Math.round(d.physAbsorb * 100) : undefined) },
  { label: 'Fire Abs', unit: '%', get: (d) => (d.kind === 'armor' ? Math.round(d.fireAbsorb * 100) : undefined) },
  { label: 'Expl Abs', unit: '%', get: (d) => (d.kind === 'armor' ? Math.round(d.explosiveAbsorb * 100) : undefined) },
  { label: 'Poise', unit: '', get: (d) => (d.kind === 'armor' ? d.poise : undefined) },
  { label: 'Weight', unit: '', lowerBetter: true, get: W },
];

const MOD_LABEL: Record<string, string> = {
  reloadSpeed: 'Reload spd', ammoDropChance: 'Ammo drops', ammoPackAmount: 'Ammo packs', soulGain: 'Souls',
  sprintStaminaCost: 'Sprint cost', staminaRegen: 'Stam regen', adsSway: 'ADS sway', recoil: 'Recoil',
  equipLoad: 'Max load', aggroRadius: 'Aggro rng', hearingRadius: 'Hearing rng', footstepVolume: 'Footsteps',
  moveSpeed: 'Move spd', gunDamage: 'Gun dmg', meleeDamage: 'Melee dmg', physAbsorb: 'Phys Abs', fireAbsorb: 'Fire Abs',
  explosiveAbsorb: 'Expl Abs', poise: 'Poise', maxHpBonus: 'Max HP', maxStaminaBonus: 'Max Stam', gunFireDamage: 'Fire dmg',
  martyrdom: 'Martyrdom', nightVision: 'Night vision',
};
const LOWER_BETTER_MODS = new Set(['sprintStaminaCost', 'adsSway', 'recoil', 'aggroRadius', 'hearingRadius', 'footstepVolume']);

/** Net percent/flat effect of an accessory on one modifier key (pct -> percent points, others raw). */
function accessoryValue(d: ItemDef | null | undefined, key: string): number | undefined {
  if (!d || d.kind !== 'accessory') return undefined;
  let v: number | undefined;
  for (const m of d.modifiers) {
    if (m.key !== key) continue;
    v = (v ?? 0) + (m.op === 'mul' ? (m.value - 1) * 100 : m.op === 'pct' ? m.value * 100 : m.value);
  }
  return v;
}

function makeRow(label: string, unit: DiffRow['unit'], lowerBetter: boolean, a: number | undefined, b: number | undefined): DiffRow | null {
  if (a === undefined && b === undefined) return null;
  const ca = a ?? 0;
  const cb = b ?? 0;
  const delta = Math.round((cb - ca) * 100) / 100;
  const sign = delta === 0 ? 0 : delta > 0 ? 1 : -1;
  return {
    label,
    cur: a ?? null,
    next: b ?? null,
    delta,
    better: (sign === 0 ? 0 : lowerBetter ? -sign : sign) as -1 | 0 | 1,
    unit,
  };
}

/** Rows comparing the item in a slot (`cur`, may be null) with a candidate (`next`, null = unequip). */
export function diffItems(cur: ItemDef | null | undefined, next: ItemDef | null | undefined): DiffRow[] {
  const ref = next ?? cur;
  if (!ref) return [];
  const rows: DiffRow[] = [];
  if (ref.kind === 'weapon' || ref.kind === 'armor') {
    const metrics = ref.kind === 'weapon' ? WEAPON_METRICS : ARMOR_METRICS;
    for (const m of metrics) {
      const r = makeRow(m.label, m.unit, !!m.lowerBetter, cur ? m.get(cur) : undefined, next ? m.get(next) : undefined);
      if (r) rows.push(r);
    }
    return rows;
  }
  if (ref.kind === 'accessory') {
    const keys = new Set<string>();
    for (const d of [cur, next]) if (d && d.kind === 'accessory') for (const m of d.modifiers) keys.add(m.key);
    for (const k of keys) {
      const r = makeRow(MOD_LABEL[k] ?? k, '%', LOWER_BETTER_MODS.has(k), accessoryValue(cur, k), accessoryValue(next, k));
      if (r) rows.push(r);
    }
  }
  return rows;
}

/** "35 -> 60 (+25)" style text for a diff row. */
export function fmtDiffRow(r: DiffRow): string {
  const f = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100) / 100}${r.unit}`);
  const d = r.delta === 0 ? '' : ` (${r.delta > 0 ? '+' : ''}${Math.round(r.delta * 100) / 100})`;
  return `${f(r.cur)} → ${f(r.next)}${d}`;
}

// ------------------------------------------------------------------ equip planning + load preview

export type EquipOp = readonly [slot: EquipSlot, id: ItemId | null];

/** Does `slot` hold items of the same class as `id` (so a displaced item can move into it)? */
function sameGroup(a: EquipSlot, b: EquipSlot): boolean {
  const g = (s: EquipSlot) => (s.startsWith('right') ? 'r' : s.startsWith('left') ? 'l' : s.startsWith('acc') ? 'a' : s);
  return g(a) === g(b);
}

/**
 * Operations (in order) that put `id` into `slot`. If `id` is already worn in another slot of the same
 * group and there aren't enough copies, the two swap (DS-style); otherwise it is a plain equip.
 */
export function planEquip(loadout: Readonly<Loadout>, slot: EquipSlot, id: ItemId | null, owned: number): EquipOp[] {
  if (id === null) return [[slot, null]];
  const worn = (Object.keys(loadout) as EquipSlot[]).filter((s) => s !== slot && loadout[s] === id);
  const isAcc = itemDef(id)?.kind === 'accessory';
  if (worn.length === 0 || (!isAcc && owned >= worn.length + 1)) return [[slot, id]];
  const other = worn.find((s) => sameGroup(s, slot)) ?? worn[0]!;
  const prev = loadout[slot];
  return [
    [other, null],
    [slot, id],
    ...(prev ? ([[other, prev]] as EquipOp[]) : []),
  ];
}

export function applyOps(loadout: Readonly<Loadout>, ops: readonly EquipOp[]): Loadout {
  const out = { ...loadout };
  for (const [s, id] of ops) out[s] = id;
  return out;
}

export interface LoadPreview {
  weight: number;
  max: number;
  ratio: number;
  tier: RollTier;
}

/** Equip load / roll tier for a hypothetical loadout (throwaway equipment + resolver, no global state). */
export function loadFor(loadout: Readonly<Loadout>, endurance: number): LoadPreview {
  const stats = new StatsResolver();
  const eq = new EquipmentImpl({ stats, events: new EventBus(), hooks: new AccessoryHooks(), endurance: () => endurance });
  const saved: Partial<Record<EquipSlot, ItemId>> = {};
  for (const s of Object.keys(loadout) as EquipSlot[]) {
    const id = loadout[s];
    if (id) saved[s] = id;
  }
  eq.load(saved);
  return { weight: eq.weight(), max: eq.maxLoad(), ratio: eq.loadRatio(), tier: eq.rollTier() };
}

/** Resulting load if `id` goes into `slot` (swap-aware). */
export function previewEquip(loadout: Readonly<Loadout>, slot: EquipSlot, id: ItemId | null, owned: number, endurance: number): { before: LoadPreview; after: LoadPreview } {
  return { before: loadFor(loadout, endurance), after: loadFor(applyOps(loadout, planEquip(loadout, slot, id, owned)), endurance) };
}

/** Owned items that may go in `slot`, display-sorted by name. Does not check duplicates/ownership counts. */
export function candidatesFor(slot: EquipSlot, ownedIds: readonly ItemId[]): ItemDef[] {
  const out: ItemDef[] = [];
  for (const id of ownedIds) {
    const d = itemDef(id);
    if (d && slotAccepts(slot, d)) out.push(d);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ level up

export const STAT_NAMES: readonly StatName[] = ['vitality', 'endurance', 'firearms', 'strength'];
export const STAT_MAX = 99;
export const STAT_LABEL: Record<StatName, string> = { vitality: 'Vitality', endurance: 'Endurance', firearms: 'Firearms', strength: 'Strength' };

/** Character level = start level + stat points gained since the start block (DS1 style). */
export function playerLevel(levels: StatBlock): number {
  let l = STATS.startLevel;
  for (const s of STAT_NAMES) l += levels[s] - STATS.start[s];
  return l;
}

export interface LevelUpInfo {
  level: number;
  /** The level you'd reach. */
  target: number;
  cost: number;
  affordable: boolean;
  /** Souls still missing (0 when affordable). */
  short: number;
}

export function levelUpInfo(levels: StatBlock, souls: number): LevelUpInfo {
  const level = playerLevel(levels);
  const cost = levelCost(level + 1);
  return { level, target: level + 1, cost, affordable: souls >= cost, short: Math.max(0, cost - souls) };
}

export function canLevelStat(levels: StatBlock, stat: StatName, souls: number): boolean {
  return levels[stat] < STAT_MAX && levelUpInfo(levels, souls).affordable;
}

export interface Derived {
  maxHp: number;
  maxStamina: number;
  staminaRegen: number;
  maxLoad: number;
  gunDamage: number;
  meleeDamage: number;
  meleePoise: number;
}

/** Stat-curve-only derived values (before equipment modifiers). */
export function derivedFor(levels: StatBlock): Derived {
  return {
    maxHp: evalCurve(STATS.maxHp, levels.vitality),
    maxStamina: evalCurve(STATS.maxStamina, levels.endurance),
    staminaRegen: evalCurve(STATS.staminaRegen, levels.endurance),
    maxLoad: evalCurve(STATS.maxEquipLoad, levels.endurance),
    gunDamage: evalCurve(STATS.gunDamage, levels.firearms),
    meleeDamage: evalCurve(STATS.meleeDamage, levels.strength),
    meleePoise: evalCurve(STATS.meleePoise, levels.strength),
  };
}

/** Which derived values `stat` feeds, with before/after, for the level-up preview. */
export function statPreview(levels: StatBlock, stat: StatName): { label: string; cur: number; next: number; unit: string; digits: number }[] {
  const a = derivedFor(levels);
  const b = derivedFor({ ...levels, [stat]: levels[stat] + 1 });
  switch (stat) {
    case 'vitality': return [{ label: 'Max HP', cur: a.maxHp, next: b.maxHp, unit: '', digits: 0 }];
    case 'endurance':
      return [
        { label: 'Max Stamina', cur: a.maxStamina, next: b.maxStamina, unit: '', digits: 0 },
        { label: 'Stam Regen/s', cur: a.staminaRegen, next: b.staminaRegen, unit: '', digits: 1 },
        { label: 'Max Equip Load', cur: a.maxLoad, next: b.maxLoad, unit: '', digits: 1 },
      ];
    case 'firearms': return [{ label: 'Gun Damage', cur: a.gunDamage, next: b.gunDamage, unit: 'x', digits: 3 }];
    case 'strength':
      return [
        { label: 'Melee Damage', cur: a.meleeDamage, next: b.meleeDamage, unit: 'x', digits: 3 },
        { label: 'Stagger', cur: a.meleePoise, next: b.meleePoise, unit: 'x', digits: 3 },
      ];
  }
}

// ------------------------------------------------------------------ shops

export type BuyBlock = 'soldOut' | 'poor' | 'maxed';

export interface BuyCheck {
  ok: boolean;
  reason?: BuyBlock;
  /** Units delivered per purchase. */
  qty: number;
}

/** Can the player buy `entry` right now? Order of precedence: sold out, maxed, poor. */
export function buyCheck(entry: ShopEntry, souls: number, owned: number, maxStack: number, stockLeft: number | null): BuyCheck {
  const qty = Math.max(1, entry.bundle ?? 1);
  if (stockLeft !== null && stockLeft <= 0) return { ok: false, reason: 'soldOut', qty };
  if (owned + qty > maxStack) return { ok: false, reason: 'maxed', qty };
  if (souls < entry.price) return { ok: false, reason: 'poor', qty };
  return { ok: true, qty };
}

/** Runtime remaining stock per shop entry (finite stock only). Serializable if the orchestrator wants to persist it. */
export class ShopStock {
  private left = new Map<string, number>();

  constructor(shops: Iterable<ShopDef>) {
    for (const s of shops) for (const e of s.entries) if (e.stock !== null) this.left.set(`${s.id}:${e.itemId}`, e.stock);
  }

  remaining(shopId: string, itemId: ItemId): number | null {
    return this.left.get(`${shopId}:${itemId}`) ?? null;
  }

  take(shopId: string, itemId: ItemId): void {
    const k = `${shopId}:${itemId}`;
    const v = this.left.get(k);
    if (v !== undefined) this.left.set(k, Math.max(0, v - 1));
  }

  serialize(): Record<string, number> {
    return Object.fromEntries(this.left);
  }

  load(saved: Record<string, number> | null | undefined): void {
    if (!saved) return;
    for (const [k, v] of Object.entries(saved)) if (this.left.has(k) && typeof v === 'number') this.left.set(k, Math.max(0, v));
  }
}

export interface PurchaseWallet {
  readonly souls: number;
  spend(n: number): boolean;
}
export interface PurchaseInventory {
  count(id: ItemId): number;
  add(id: ItemId, n?: number): number | void;
}

export type PurchaseResult = { ok: true; qty: number } | { ok: false; reason: BuyBlock | 'unknown' };

/** Buy one `entry`: wallet.spend, inventory.add, decrement stock. All-or-nothing. */
export function purchase(shop: ShopDef, entry: ShopEntry, wallet: PurchaseWallet, inv: PurchaseInventory, stock: ShopStock): PurchaseResult {
  const def = itemDef(entry.itemId);
  if (!def) return { ok: false, reason: 'unknown' };
  const chk = buyCheck(entry, wallet.souls, inv.count(entry.itemId), maxStackOf(def), stock.remaining(shop.id, entry.itemId));
  if (!chk.ok) return { ok: false, reason: chk.reason! };
  if (!wallet.spend(entry.price)) return { ok: false, reason: 'poor' };
  inv.add(entry.itemId, chk.qty);
  stock.take(shop.id, entry.itemId);
  return { ok: true, qty: chk.qty };
}

/** True when every ammo type the player can use is at cap (ammo crates would be wasted). */
export function ammoAllFull(levels: readonly { type: AmmoType | string; reserve: number; cap: number }[], usable: ReadonlySet<string> | null): boolean {
  let any = false;
  for (const l of levels) {
    if (usable && !usable.has(l.type)) continue;
    any = true;
    if (l.reserve < l.cap) return false;
  }
  return any;
}

/** Armor set bonus text for a piece, if it belongs to a set with a bonus ("Ghillie: 2+ pieces ..."). */
export function setBonusNote(def: ItemDef): string | null {
  if (def.kind !== 'armor') return null;
  const set = ARMOR_SETS[def.set];
  if (!set?.bonus) return null;
  return `${set.name}: ${set.bonus.minPieces}+ pieces for set bonus`;
}
