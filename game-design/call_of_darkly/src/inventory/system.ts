import type { DamageEvent } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import type { SaveData } from '../core/save';
import { ALL_ITEMS } from '../data';
import type { EquipSlot, ItemId } from '../data/types';
import type { EquipLoadProvider } from '../player/controller';
import { AccessoryHooks, accessoryHooks as globalHooks } from './accessories';
import { applyAbsorb, playerPoise, poiseHolds } from './absorb';
import { GrenadePouch, QuickBeltImpl } from './belt';
import { InventoryEquipLoad } from './equipLoad';
import { EquipmentImpl, slotAccepts } from './equipment';
import './events';
import { stats as globalStats, type StatsResolver } from './modifiers';
import { Inventory } from './store';

/** What the system needs from `CombatSystem`. */
export interface InventoryCombat {
  setLoadout(right: [ItemId | null, ItemId | null], left: [ItemId | null, ItemId | null]): void;
}

/** What the system needs from `PlayerController`. */
export interface InventoryPlayer {
  equipLoadProvider: EquipLoadProvider;
  /** Stat levels; Endurance drives max equip load. Read lazily each query. */
  readonly levels: { readonly endurance: number };
}

export interface InventorySystemOptions {
  combat: InventoryCombat;
  player: InventoryPlayer;
  /** Loaded save, or null/undefined for a new game. Starting gear is granted unless `save.gearGranted` (or the save already holds items). */
  save?: SaveData | null;
  stats?: StatsResolver;
  events?: EventBus;
  hooks?: AccessoryHooks;
}

export interface StartingGear {
  items: ItemId[];
  equipment: Partial<Record<EquipSlot, ItemId>>;
}

/** Starting gear from data (`source: 'start'`): guns -> right1/2, melee/shield -> left1/2, armor by slot. */
export function startingGear(): StartingGear {
  const items: ItemId[] = [];
  const equipment: Partial<Record<EquipSlot, ItemId>> = {};
  const rights: EquipSlot[] = ['right1', 'right2'];
  const lefts: EquipSlot[] = ['left1', 'left2'];
  for (const d of ALL_ITEMS) {
    if (d.kind !== 'weapon' && d.kind !== 'armor') continue;
    if (d.source !== 'start') continue;
    items.push(d.id);
    let slot: EquipSlot | undefined;
    if (d.kind === 'armor') slot = d.slot;
    else slot = (d.hand === 'R' ? rights : lefts).shift();
    if (slot && slotAccepts(slot, d)) equipment[slot] = d.id;
  }
  return { items, equipment };
}

export interface InventorySystem {
  readonly store: Inventory;
  readonly equipment: EquipmentImpl;
  readonly belt: QuickBeltImpl;
  readonly pouch: GrenadePouch;
  readonly equipLoad: InventoryEquipLoad;
  readonly hooks: AccessoryHooks;
  readonly stats: StatsResolver;
  /** Damage the player takes from `e` after armor absorb (pure). The controller's damage handler should use this. */
  absorb(e: DamageEvent): number;
  /** Total armor poise. */
  poise(): number;
  /** True if armor poise absorbs `poiseDamage` (no flinch). */
  poiseHolds(poiseDamage: number): boolean;
  /** Replace all state from a save (null = new game with starting gear) and push the loadout to combat. */
  load(save: SaveData | null): void;
  /** Write inventory / equipment / quickBelt / grenade / gearGranted into `save` (ammo, mags, etc. untouched). Returns it. */
  writeSave(save: SaveData): SaveData;
  /** Push the right/left slots to combat.setLoadout. Called automatically on equipmentChanged. */
  syncCombat(): void;
  /** Unsubscribe listeners and unregister all equipment stat sources. */
  dispose(): void;
}

/**
 * Wires inventory to the rest of the game. Does not import main.ts.
 * - equipmentChanged (right/left slots) -> combat.setLoadout
 * - player.equipLoadProvider = InventoryEquipLoad (weight from equipment, max from Endurance x equipLoad)
 * - itemRemoved -> equipment.reconcile (selling/dropping an equipped item unequips it)
 * - core `playerDied` -> accessoryHooks.emit('playerDeath')
 */
export function createInventorySystem(opts: InventorySystemOptions): InventorySystem {
  const bus = opts.events ?? globalEvents;
  const mods = opts.stats ?? globalStats;
  const hooks = opts.hooks ?? globalHooks;
  const { combat, player } = opts;

  const store = new Inventory(bus);
  const equipment = new EquipmentImpl({ inventory: store, stats: mods, events: bus, hooks, endurance: () => player.levels.endurance });
  const belt = new QuickBeltImpl(store, bus);
  const pouch = new GrenadePouch(store);
  const equipLoad = new InventoryEquipLoad(equipment, () => player.levels.endurance, mods);
  player.equipLoadProvider = equipLoad;

  const syncCombat = (): void => {
    const l = equipment.loadout;
    combat.setLoadout([l.right1, l.right2], [l.left1, l.left2]);
  };

  const offs: (() => void)[] = [
    bus.on('equipmentChanged', (e) => {
      if (e.slot === 'right1' || e.slot === 'right2' || e.slot === 'left1' || e.slot === 'left2') syncCombat();
    }),
    bus.on('itemRemoved', () => equipment.reconcile()),
    // Temporary until the M6 belt UI: first acquisition of a consumable lands in the first empty belt slot.
    bus.on('itemAdded', (e) => void belt.autoAssign(e.itemId)),
    bus.on('playerDied', (e) => {
      hooks.emit('playerDeath', { pos: e.pos, souls: e.souls });
    }),
  ];

  let gearGranted = false;
  const load = (save: SaveData | null): void => {
    store.clear();
    equipment.clear();
    // Explicit flag: an emptied inventory in a played save must not regrant the start gear. Saves from
    // before the flag count as new only while truly empty.
    const fresh = !save || (!save.gearGranted && save.inventory.length === 0 && Object.keys(save.equipment).length === 0);
    gearGranted = true;
    if (fresh) {
      const g = startingGear();
      store.load(g.items.map((id) => ({ id, count: 1 })));
      equipment.load(g.equipment);
      belt.load([]);
      pouch.load(null);
    } else {
      store.load(save.inventory);
      equipment.load(save.equipment);
      belt.load(save.quickBelt);
      pouch.load(save.grenade);
    }
    syncCombat();
  };

  load(opts.save ?? null);

  return {
    store,
    equipment,
    belt,
    pouch,
    equipLoad,
    hooks,
    stats: mods,
    absorb: (e) => applyAbsorb(e, mods),
    poise: () => playerPoise(mods),
    poiseHolds: (p) => poiseHolds(p, mods),
    load,
    writeSave(save) {
      save.inventory = store.serialize();
      save.equipment = equipment.serialize();
      save.quickBelt = belt.serialize();
      save.grenade = pouch.selected;
      save.gearGranted = gearGranted;
      return save;
    },
    syncCombat,
    dispose() {
      for (const off of offs) off();
      equipment.clear();
    },
  };
}
