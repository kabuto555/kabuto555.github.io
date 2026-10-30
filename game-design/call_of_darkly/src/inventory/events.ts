import type { EquipSlot, ItemId } from '../data/types';

declare module '../core/events' {
  interface EventMap {
    /** Inventory count of an item rose. `count` = amount actually added (after stack cap), `total` = new count. */
    itemAdded: { itemId: ItemId; count: number; total: number };
    /** Inventory count of an item fell. `count` = amount removed, `total` = new count. */
    itemRemoved: { itemId: ItemId; count: number; total: number };
    /** An equipment slot changed (equip, unequip, or forced unequip after the item left the inventory). */
    equipmentChanged: { slot: EquipSlot; itemId: ItemId | null; prev: ItemId | null };
    /** Quick belt selection or assignment changed. */
    quickBeltChanged: { selected: number; itemId: ItemId | null };
  }
}
