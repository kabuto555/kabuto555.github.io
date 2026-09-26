// The player's inventory — what they own, from anywhere (Care Packages, the Shop, the
// Camp Pass…). Just ids + counts, persisted locally; item details live in the catalog
// (items.ts). Grant with a `source` so the Backpack can say where things came from.

import { storageGet, storageSet } from '../storage';
import { allItems, itemById, type Item } from './items';

const KEY = 'chonk.items.v1';
/** The old Care-Package-only inventory — its `owned` map is carried over on first load. */
const LEGACY_KEY = 'chonk.inventory.v1';

interface State {
  /** Item id → how many you own. */
  owned: Record<string, number>;
  /** Item id → when you first got it (ms) and from where. */
  first: Record<string, { at: number; source: string }>;
}

export interface GrantResult {
  item: Item | undefined;
  /** First time you've got this item. */
  isNew: boolean;
  /** How many you own now. */
  count: number;
}

type Listener = () => void;

/** Everyone owns these from the start (not equipped) — topped up on load, so existing saves get them too. */
const STARTER_ITEMS = ['toy_words_with_friends', 'toy_dice_with_friends'];

class PlayerInventory {
  private s: State;
  private listeners = new Set<Listener>();
  /** Debug: act as if every catalog item (bar consumable tokens) is owned. Never saved — turn it
   * off and the real inventory is exactly as it was (anything granted meanwhile is kept). */
  private ownAll = false;

  constructor() {
    const saved = storageGet<State | null>(KEY, null);
    if (saved) {
      this.s = { owned: saved.owned ?? {}, first: saved.first ?? {} };
    } else {
      const legacy = storageGet<{ owned?: Record<string, number> }>(LEGACY_KEY, {});
      const owned = { ...(legacy.owned ?? {}) };
      const first: State['first'] = {};
      for (const id of Object.keys(owned)) first[id] = { at: 0, source: 'care_package' };
      this.s = { owned, first };
      storageSet(KEY, this.s);
    }
    this.grantStarters();
  }

  private grantStarters(): void {
    const missing = STARTER_ITEMS.filter((id) => !(this.s.owned[id] > 0));
    if (!missing.length) return;
    for (const id of missing) {
      this.s.owned[id] = 1;
      this.s.first[id] = { at: Date.now(), source: 'starter' };
    }
    storageSet(KEY, this.s);
  }

  count(id: string): number {
    const real = this.s.owned[id] ?? 0;
    if (!this.ownAll || real > 0) return real;
    const it = itemById(id);
    return it && it.kind !== 'token' ? 1 : 0;
  }

  /** Really owned — ignores the debug "own everything" toggle (e.g. what a Care Package can still give). */
  ownsReally(id: string): boolean { return (this.s.owned[id] ?? 0) > 0; }

  get debugOwnAll(): boolean { return this.ownAll; }
  set debugOwnAll(on: boolean) {
    if (on === this.ownAll) return;
    this.ownAll = on;
    this.listeners.forEach((l) => l());
  }
  owns(id: string): boolean { return this.count(id) > 0; }
  /** Where the player first got `id` (e.g. 'care_package', 'camp_pass', 'shop'). */
  sourceOf(id: string): string | undefined { return this.s.first[id]?.source; }

  grant(id: string, source: string, n = 1): GrantResult {
    const count = (this.s.owned[id] ?? 0) + n;
    const isNew = count === n;
    this.s.owned[id] = count;
    if (isNew) this.s.first[id] = { at: Date.now(), source };
    this.save();
    return { item: itemById(id), isNew, count };
  }

  /** Use up `n` of a consumable (e.g. a Care Package token). False (no change) if you don't have enough. */
  take(id: string, n = 1): boolean {
    const have = this.s.owned[id] ?? 0;
    if (have < n) return false;
    const left = have - n;
    if (left > 0) this.s.owned[id] = left;
    else delete this.s.owned[id];
    this.save();
    return true;
  }

  /** Everything owned (that's in the catalog), optionally filtered. */
  list(filter?: (it: Item) => boolean): { item: Item; count: number }[] {
    const out: { item: Item; count: number }[] = [];
    for (const [id, count] of Object.entries(this.s.owned)) {
      const item = itemById(id);
      if (item && count > 0 && (!filter || filter(item))) out.push({ item, count });
    }
    if (this.ownAll) {
      for (const item of allItems((it) => it.kind !== 'token' && !(this.s.owned[it.id] > 0))) {
        if (!filter || filter(item)) out.push({ item, count: 1 });
      }
    }
    return out;
  }

  reset(): void {
    this.s = { owned: {}, first: {} };
    this.grantStarters();
    this.save();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

export const playerInventory = new PlayerInventory();
