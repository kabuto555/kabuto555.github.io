import { events as globalEvents, type EventBus } from '../core/events';
import { GRENADE_LIST } from '../data';
import type { ItemId } from '../data/types';
import './events';
import { kindOf } from './store';
import type { InventoryStore, QuickBelt } from './types';

export const BELT_SIZE = 5;

/**
 * 5-slot quick-item belt (PLAN section 4/7). Slots hold consumable ids; counts live in the inventory.
 * A slot whose item count is 0 stays assigned (DS-style) but cycling skips it and use() refuses it.
 * Applying the item's effect (souls, buff, warp, ammo refill) is the caller's job: use() only
 * consumes one and returns the id.
 */
export class QuickBeltImpl implements QuickBelt {
  readonly slots: (ItemId | null)[] = [null, null, null, null, null];
  selected = 0;

  constructor(
    private readonly inv: InventoryStore,
    private readonly bus: EventBus = globalEvents,
  ) {}

  /** Assign a consumable (or null to clear) to slot `i`. False if out of range or not a consumable. */
  assign(i: number, id: ItemId | null): boolean {
    if (!Number.isInteger(i) || i < 0 || i >= BELT_SIZE) return false;
    if (id !== null && kindOf(id) !== 'consumable') return false;
    this.slots[i] = id;
    this.emitChanged();
    return true;
  }

  /**
   * Put a newly acquired consumable in the first empty slot (no-op if already on the belt or the belt
   * is full). Temporary until the M6 belt UI; also selects it if the current slot is unusable.
   */
  autoAssign(id: ItemId): boolean {
    if (kindOf(id) !== 'consumable') return false;
    let empty = -1;
    for (let i = 0; i < BELT_SIZE; i++) {
      const s = this.slots[i];
      if (s === id) return false;
      if (empty < 0 && (s === null || s === undefined)) empty = i;
    }
    if (empty < 0) return false;
    this.slots[empty] = id;
    if (!this.usable(this.selected) && this.usable(empty)) this.selected = empty;
    this.emitChanged();
    return true;
  }

  private usable(i: number): boolean {
    const id = this.slots[i];
    return id !== null && id !== undefined && this.inv.count(id) > 0;
  }

  /** Selected item id (even if its count is 0), or null for an empty slot. */
  current(): ItemId | null {
    return this.slots[this.selected] ?? null;
  }

  /**
   * Move the selection to the next (dir > 0) / previous (dir < 0) slot that holds a usable item,
   * skipping empty and count-0 slots. Returns the new current id, or null (selection unchanged)
   * when nothing is usable.
   */
  cycle(dir: 1 | -1 = 1): ItemId | null {
    for (let step = 1; step <= BELT_SIZE; step++) {
      const i = (((this.selected + dir * step) % BELT_SIZE) + BELT_SIZE) % BELT_SIZE;
      if (this.usable(i)) {
        const changed = i !== this.selected;
        this.selected = i;
        if (changed) this.emitChanged();
        return this.slots[i] ?? null;
      }
    }
    return null;
  }

  /** Consume one of the selected item. Returns its id, or null if the slot is empty / count is 0. */
  use(): ItemId | null {
    if (!this.usable(this.selected)) return null;
    const id = this.slots[this.selected]!;
    this.inv.remove(id, 1);
    return id;
  }

  serialize(): (ItemId | null)[] {
    return [...this.slots];
  }

  /** Restore from `SaveData.quickBelt` (silent). Non-consumable / unknown ids are dropped. */
  load(saved: readonly (ItemId | null)[]): void {
    for (let i = 0; i < BELT_SIZE; i++) {
      const id = saved[i] ?? null;
      this.slots[i] = id !== null && kindOf(id) === 'consumable' ? id : null;
    }
    this.selected = 0;
    if (!this.usable(0)) {
      for (let i = 1; i < BELT_SIZE; i++) {
        if (this.usable(i)) {
          this.selected = i;
          break;
        }
      }
    }
  }

  private emitChanged(): void {
    this.bus.emit('quickBeltChanged', { selected: this.selected, itemId: this.current() });
  }
}

/**
 * Grenade pouch (PLAN section 4): separate from the belt. Cycles owned grenades (frag, molotov,
 * flashbang, throwing knife) in data order; `SaveData.grenade` is the selected id.
 */
export class GrenadePouch {
  selected: ItemId | null = null;

  constructor(private readonly inv: InventoryStore) {}

  /** Owned grenade ids (count > 0), data order. */
  owned(): ItemId[] {
    return GRENADE_LIST.filter((g) => this.inv.count(g.id) > 0).map((g) => g.id);
  }

  /** Selected grenade if still owned, else the first owned one, else null. */
  current(): ItemId | null {
    if (this.selected && this.inv.count(this.selected) > 0) return this.selected;
    return this.owned()[0] ?? null;
  }

  cycle(dir: 1 | -1 = 1): ItemId | null {
    const o = this.owned();
    if (o.length === 0) return (this.selected = null);
    const cur = this.current();
    const i = cur ? o.indexOf(cur) : -1;
    this.selected = o[(((i + dir) % o.length) + o.length) % o.length] ?? null;
    return this.selected;
  }

  /** Consume one of the current grenade; returns its id or null. */
  use(): ItemId | null {
    const id = this.current();
    if (!id) return null;
    this.inv.remove(id, 1);
    this.selected = id;
    return id;
  }

  load(id: ItemId | null): void {
    this.selected = id !== null && kindOf(id) === 'grenade' ? id : null;
  }
}
