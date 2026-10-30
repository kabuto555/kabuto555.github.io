import { events as globalEvents, type EventBus } from '../core/events';
import { ITEMS_BY_ID } from '../data';
import type { ItemDef, ItemId, ItemKind } from '../data/types';
import './events';
import type { InventoryStore, ItemStack } from './types';

/** Max stack for an item: its `maxStack`, else 99 for consumables/grenades and 1 for everything else. */
export function maxStackOf(def: ItemDef): number {
  return def.maxStack ?? (def.kind === 'consumable' || def.kind === 'grenade' ? 99 : 1);
}

/** Item record for an id, or undefined. */
export function itemDef(id: ItemId | null | undefined): ItemDef | undefined {
  return id ? ITEMS_BY_ID.get(id) : undefined;
}

/** Item kind for an id (via data byId maps), or null if unknown. */
export function kindOf(id: ItemId): ItemKind | null {
  return ITEMS_BY_ID.get(id)?.kind ?? null;
}

/**
 * id -> count store. Ids must exist in data (add() of an unknown id throws; load() skips them so
 * stale saves survive data changes). Counts clamp to the item's max stack (gear/keys 1, consumables 99).
 */
export class Inventory implements InventoryStore {
  private readonly counts = new Map<ItemId, number>();

  constructor(private readonly bus: EventBus = globalEvents) {}

  /** Returns the amount actually added (0 when already at the stack cap). */
  add(id: ItemId, count = 1): number {
    const def = ITEMS_BY_ID.get(id);
    if (!def) throw new Error(`inventory.add: unknown item id "${id}"`);
    const n = Math.floor(count);
    if (!(n > 0)) return 0;
    const cur = this.counts.get(id) ?? 0;
    const next = Math.min(maxStackOf(def), cur + n);
    const added = next - cur;
    if (added <= 0) return 0;
    this.counts.set(id, next);
    this.bus.emit('itemAdded', { itemId: id, count: added, total: next });
    return added;
  }

  /** Returns false (and removes nothing) if fewer than `count` are held. */
  remove(id: ItemId, count = 1): boolean {
    const n = Math.floor(count);
    if (!(n > 0)) return true;
    const cur = this.counts.get(id) ?? 0;
    if (cur < n) return false;
    const next = cur - n;
    if (next === 0) this.counts.delete(id);
    else this.counts.set(id, next);
    this.bus.emit('itemRemoved', { itemId: id, count: n, total: next });
    return true;
  }

  count(id: ItemId): number {
    return this.counts.get(id) ?? 0;
  }

  has(id: ItemId): boolean {
    return (this.counts.get(id) ?? 0) > 0;
  }

  list(): readonly ItemStack[] {
    const out: ItemStack[] = [];
    for (const [id, count] of this.counts) out.push({ id, count });
    return out;
  }

  clear(): void {
    this.counts.clear();
  }

  /** SaveData.inventory shape: ids + counts only. */
  serialize(): { id: ItemId; count: number }[] {
    return this.list().map((s) => ({ id: s.id, count: s.count }));
  }

  /** Replace contents from a save. Silent (no events). Unknown ids / bad counts are skipped. */
  load(rows: readonly { id: ItemId; count: number }[]): void {
    this.counts.clear();
    for (const r of rows) {
      const def = ITEMS_BY_ID.get(r.id);
      if (!def || !Number.isFinite(r.count)) continue;
      const n = Math.min(maxStackOf(def), (this.counts.get(r.id) ?? 0) + Math.floor(r.count));
      if (n > 0) this.counts.set(r.id, n);
    }
  }
}
