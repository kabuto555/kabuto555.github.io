import { events as globalEvents, type EventBus } from '../core/events';
import { ARMOR_SETS, STATS } from '../data';
import type { ArmorDef, EquipSlot, ItemDef, ItemId } from '../data/types';
import { equipLoadRatio, rollTierFromRatio } from '../player/rollTier';
import { AccessoryHooks, accessoryHooks as globalHooks } from './accessories';
import { loadoutWeight, maxEquipLoad } from './equipLoad';
import './events';
import { stats as globalStats, type StatsResolver } from './modifiers';
import { itemDef } from './store';
import type { Equipment, InventoryStore, Loadout, Modifier, RollTier } from './types';

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'right1', 'right2', 'left1', 'left2', 'head', 'chest', 'arms', 'legs', 'accessory1', 'accessory2',
];
const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'chest', 'arms', 'legs'];

export type EquipError = 'unknownItem' | 'wrongSlot' | 'notOwned' | 'duplicateAccessory';

/** Does `def` belong in `slot`? guns -> right1/2, melee/shield -> left1/2, armor by piece slot, accessories x2. */
export function slotAccepts(slot: EquipSlot, def: ItemDef): boolean {
  switch (slot) {
    case 'right1':
    case 'right2':
      return def.kind === 'weapon' && def.hand === 'R';
    case 'left1':
    case 'left2':
      return def.kind === 'weapon' && def.hand === 'L';
    case 'head':
    case 'chest':
    case 'arms':
    case 'legs':
      return def.kind === 'armor' && def.slot === slot;
    case 'accessory1':
    case 'accessory2':
      return def.kind === 'accessory';
  }
}

export function emptyLoadout(): Loadout {
  return {
    right1: null, right2: null, left1: null, left2: null,
    head: null, chest: null, arms: null, legs: null,
    accessory1: null, accessory2: null,
  };
}

export interface EquipmentOptions {
  /** When given, equipping requires owning the item (and enough copies if it fills several slots). */
  inventory?: InventoryStore;
  stats?: StatsResolver;
  events?: EventBus;
  hooks?: AccessoryHooks;
  /** Endurance level for max equip load. Default: starting Endurance. */
  endurance?: () => number;
}

function armorMods(a: ArmorDef): Modifier[] {
  const m: Modifier[] = [];
  if (a.physAbsorb) m.push({ key: 'physAbsorb', op: 'add', value: a.physAbsorb });
  if (a.fireAbsorb) m.push({ key: 'fireAbsorb', op: 'add', value: a.fireAbsorb });
  if (a.explosiveAbsorb) m.push({ key: 'explosiveAbsorb', op: 'add', value: a.explosiveAbsorb });
  if (a.poise) m.push({ key: 'poise', op: 'add', value: a.poise });
  // PLAN section 5: the Night-Vision Visor is the only NV source (head only).
  if (a.set === 'nv_visor') m.push({ key: 'nightVision', op: 'add', value: 1 });
  return m;
}

/**
 * The 10 equip slots. Stats sources registered while equipped:
 * - armor piece  -> `armor:<id>`  (physAbsorb/fireAbsorb/explosiveAbsorb/poise adds; NV visor adds nightVision)
 * - set bonus    -> `set:<setId>` (when >= minPieces of the set are worn, e.g. Ghillie 2+ -> aggroRadius -35%)
 * - accessory    -> `acc:<id>`    (the def's modifiers)
 * Unequip unregisters, so the resolver returns exactly to its prior values.
 */
export class EquipmentImpl implements Equipment {
  readonly loadout: Loadout = emptyLoadout();
  private readonly inv: InventoryStore | null;
  private readonly mods: StatsResolver;
  private readonly bus: EventBus;
  private readonly hooks: AccessoryHooks;
  private readonly endurance: () => number;
  private weightCache = 0;

  constructor(opts: EquipmentOptions = {}) {
    this.inv = opts.inventory ?? null;
    this.mods = opts.stats ?? globalStats;
    this.bus = opts.events ?? globalEvents;
    this.hooks = opts.hooks ?? globalHooks;
    this.endurance = opts.endurance ?? (() => STATS.start.endurance);
  }

  /** Why `id` can't go in `slot` right now, or null if it can. `id === null` (unequip) is always fine. */
  check(slot: EquipSlot, id: ItemId | null): EquipError | null {
    if (id === null) return null;
    const def = itemDef(id);
    if (!def) return 'unknownItem';
    if (!slotAccepts(slot, def)) return 'wrongSlot';
    if (def.kind === 'accessory') {
      for (const s of ['accessory1', 'accessory2'] as const) if (s !== slot && this.loadout[s] === id) return 'duplicateAccessory';
    }
    if (this.inv) {
      let used = 1;
      for (const s of EQUIP_SLOTS) if (s !== slot && this.loadout[s] === id) used++;
      if (this.inv.count(id) < used) return 'notOwned';
    }
    return null;
  }

  canEquip(slot: EquipSlot, id: ItemId | null): boolean {
    return this.check(slot, id) === null;
  }

  /** Equip (or unequip with null). Returns false and changes nothing if invalid. Emits `equipmentChanged`. */
  equip(slot: EquipSlot, id: ItemId | null): boolean {
    if (this.check(slot, id) !== null) return false;
    this.set(slot, id, true);
    return true;
  }

  unequip(slot: EquipSlot): void {
    this.equip(slot, null);
  }

  private set(slot: EquipSlot, id: ItemId | null, emit: boolean): void {
    const prev = this.loadout[slot];
    if (prev === id) return;
    this.loadout[slot] = id;
    this.weightCache = loadoutWeight(this.loadout);
    this.syncStats(slot, prev, id);
    if (emit) this.bus.emit('equipmentChanged', { slot, itemId: id, prev });
  }

  private syncStats(slot: EquipSlot, prev: ItemId | null, next: ItemId | null): void {
    const pd = itemDef(prev);
    const nd = itemDef(next);
    if (slot === 'accessory1' || slot === 'accessory2') {
      if (pd) this.mods.unregister(`acc:${pd.id}`);
      if (nd && nd.kind === 'accessory') this.mods.register(`acc:${nd.id}`, nd.modifiers);
      this.hooks.setSlot(slot, next);
      return;
    }
    if (!ARMOR_SLOTS.includes(slot)) return;
    if (pd) this.mods.unregister(`armor:${pd.id}`);
    if (nd && nd.kind === 'armor') {
      const m = armorMods(nd);
      if (m.length) this.mods.register(`armor:${nd.id}`, m);
    }
    if (pd && pd.kind === 'armor') this.syncSet(pd.set);
    if (nd && nd.kind === 'armor' && (!pd || pd.kind !== 'armor' || pd.set !== nd.set)) this.syncSet(nd.set);
  }

  /** Number of worn armor pieces belonging to `setId`. */
  setPieces(setId: string): number {
    let n = 0;
    for (const s of ARMOR_SLOTS) {
      const d = itemDef(this.loadout[s]);
      if (d && d.kind === 'armor' && d.set === setId) n++;
    }
    return n;
  }

  private syncSet(setId: string): void {
    const bonus = ARMOR_SETS[setId]?.bonus;
    if (!bonus) return;
    if (this.setPieces(setId) >= bonus.minPieces) this.mods.register(`set:${setId}`, bonus.modifiers);
    else this.mods.unregister(`set:${setId}`);
  }

  /** Drop any slot whose item the inventory no longer holds enough copies of (after remove()). */
  reconcile(): void {
    if (!this.inv) return;
    for (const slot of EQUIP_SLOTS) {
      const id = this.loadout[slot];
      if (!id) continue;
      let before = 0;
      for (const s of EQUIP_SLOTS) {
        if (this.loadout[s] === id) before++;
        if (s === slot) break;
      }
      if (this.inv.count(id) < before) this.set(slot, null, true);
    }
  }

  /** Replace everything from a save (`SaveData.equipment`). Silent; invalid / unowned entries are skipped. */
  load(saved: Partial<Record<EquipSlot, ItemId>>): void {
    for (const slot of EQUIP_SLOTS) this.set(slot, null, false);
    for (const slot of EQUIP_SLOTS) {
      const id = saved[slot];
      if (id && this.check(slot, id) === null) this.set(slot, id, false);
    }
  }

  /** `SaveData.equipment` shape: ids only, empty slots omitted. */
  serialize(): Partial<Record<EquipSlot, ItemId>> {
    const out: Partial<Record<EquipSlot, ItemId>> = {};
    for (const s of EQUIP_SLOTS) {
      const id = this.loadout[s];
      if (id) out[s] = id;
    }
    return out;
  }

  /** Unequip everything silently and unregister all sources. */
  clear(): void {
    for (const s of EQUIP_SLOTS) this.set(s, null, false);
  }

  weight(): number {
    return this.weightCache;
  }

  maxLoad(): number {
    return maxEquipLoad(this.endurance(), this.mods);
  }

  loadRatio(): number {
    return equipLoadRatio(this.weightCache, this.maxLoad());
  }

  rollTier(): RollTier {
    return rollTierFromRatio(this.loadRatio());
  }
}
