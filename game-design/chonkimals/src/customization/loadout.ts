// Customization loadouts — what a character wears / holds, and how the player's camp
// spot is dressed. Slots map onto catalog item kinds (inventory/items.ts); a slot
// holds one item id or nothing. The player's picks persist here and are checked
// against the inventory (an item you no longer own reads as empty). Bots roll a
// deterministic outfit from the whole catalog (rollBotAvatar) and always hold a toy.
//
// Avatar loadouts are known for everyone (avatarLoadoutOf); the tent is player-only.

import { storageGet, storageSet } from '../storage';
import type { Rng } from '../rng';
import { playerInventory } from '../inventory/inventory';
import { allItems, itemById, type Item, type ItemKind } from '../inventory/items';
import { RARITY_INFO } from '../care-package/rewards';
// Content modules register their items with the catalog on load.
import '../camp-pass/content';
import '../drives/content';

// ── Avatar ────────────────────────────────────────────────────────────────

export type AvatarSlot = 'head' | 'top' | 'bottom' | 'feet' | 'accessory' | 'toy';

export const AVATAR_SLOTS: readonly { id: AvatarSlot; label: string; emoji: string; kinds: readonly ItemKind[] }[] = [
  { id: 'head',      label: 'Headwear',  emoji: '🧢', kinds: ['hat'] },
  { id: 'top',       label: 'Top',       emoji: '👕', kinds: ['top'] },
  { id: 'bottom',    label: 'Bottom',    emoji: '🩳', kinds: ['bottom'] },
  { id: 'feet',      label: 'Footwear',  emoji: '👟', kinds: ['shoes'] },
  { id: 'accessory', label: 'Accessory', emoji: '🎒', kinds: ['accessory', 'wrist', 'necklace', 'bag'] },
  { id: 'toy',       label: 'Toy',       emoji: '🦆', kinds: ['toy'] },
];

/** Slot → equipped item id (missing = empty). */
export type AvatarLoadout = Partial<Record<AvatarSlot, string>>;

// ── Tent (the player's camp spot) ─────────────────────────────────────────

export type TentSlot = 'tentStyle' | 'tentMaterial' | 'bedStyle' | 'bedMaterial' | 'lantern';

/** `none` labels the empty choice: the built-in default, or nothing at all for the lantern. */
export const TENT_SLOTS: readonly { id: TentSlot; label: string; emoji: string; kinds: readonly ItemKind[]; none: string }[] = [
  { id: 'tentStyle',    label: 'Tent',               emoji: '⛺', kinds: ['tent_style'],                  none: 'Classic A-Frame' },
  { id: 'tentMaterial', label: 'Tent Material',      emoji: '🧵', kinds: ['tent_material', 'tent_colour'], none: 'Camp Canvas' },
  { id: 'bedStyle',     label: 'Sleeping Bag',       emoji: '🛏️', kinds: ['bed_style'],                   none: 'Sleeping Bag' },
  { id: 'bedMaterial',  label: 'Sleeping Bag Material', emoji: '🧶', kinds: ['bed_material', 'bed_colour'], none: 'Nylon' },
  { id: 'lantern',      label: 'Lantern',            emoji: '🏮', kinds: ['lantern'],                     none: 'No lantern' },
];

export interface TentLoadout {
  slots: Partial<Record<TentSlot, string>>;
  /** Items shown in / on / around the tent, in the order they were put out. */
  displayed: string[];
}

/** Kinds that can be put on display at your tent: toys and anything physical you own. */
const DISPLAY_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'toy', 'hat', 'top', 'bottom', 'shoes', 'accessory', 'wrist', 'necklace', 'bag', 'pennant',
]);
export const isDisplayable = (it: Item): boolean => DISPLAY_KINDS.has(it.kind);

// ── Player loadout store ──────────────────────────────────────────────────

const KEY = 'chonk.loadout.v1';

interface State { avatar: AvatarLoadout; tent: TentLoadout; }

class PlayerLoadout {
  private s: State;
  private listeners = new Set<() => void>();

  constructor() {
    const saved = storageGet<Partial<State>>(KEY, {});
    this.s = {
      avatar: { ...(saved.avatar ?? {}) },
      tent: { slots: { ...(saved.tent?.slots ?? {}) }, displayed: [...(saved.tent?.displayed ?? [])] },
    };
    // Selling / resetting the inventory unequips whatever's gone.
    playerInventory.subscribe(() => this.listeners.forEach((l) => l()));
  }

  /** What's worn: owned items that still fit their slot (an item can move slot, e.g. caps → headwear). */
  get avatar(): AvatarLoadout {
    const out: AvatarLoadout = {};
    for (const { id, kinds } of AVATAR_SLOTS) {
      const item = this.s.avatar[id];
      if (item && fits(kinds, item)) out[id] = item;
    }
    return out;
  }

  get tent(): TentLoadout {
    const slots: TentLoadout['slots'] = {};
    for (const { id, kinds } of TENT_SLOTS) {
      const item = this.s.tent.slots[id];
      if (item && fits(kinds, item)) slots[id] = item;
    }
    return { slots, displayed: this.s.tent.displayed.filter((id) => playerInventory.owns(id)) };
  }

  /** Equip `itemId` (must be owned and fit the slot), or empty the slot with null. */
  equip(slot: AvatarSlot, itemId: string | null): boolean {
    if (itemId !== null && !fits(AVATAR_SLOTS.find((s) => s.id === slot)!.kinds, itemId)) return false;
    if (itemId === null) delete this.s.avatar[slot];
    else this.s.avatar[slot] = itemId;
    this.save();
    return true;
  }

  setTent(slot: TentSlot, itemId: string | null): boolean {
    if (itemId !== null && !fits(TENT_SLOTS.find((s) => s.id === slot)!.kinds, itemId)) return false;
    if (itemId === null) delete this.s.tent.slots[slot];
    else this.s.tent.slots[slot] = itemId;
    this.save();
    return true;
  }

  isDisplayed(itemId: string): boolean { return this.s.tent.displayed.includes(itemId); }

  setDisplayed(itemId: string, on: boolean): void {
    const it = itemById(itemId);
    const list = this.s.tent.displayed.filter((id) => id !== itemId);
    if (on && it && isDisplayable(it) && playerInventory.owns(itemId)) list.push(itemId);
    this.s.tent.displayed = list;
    this.save();
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

function fits(kinds: readonly ItemKind[], itemId: string): boolean {
  const it = itemById(itemId);
  return !!it && kinds.includes(it.kind) && playerInventory.owns(itemId);
}

export const playerLoadout = new PlayerLoadout();

// ── Bots ──────────────────────────────────────────────────────────────────

/** Chance a bot fills each slot (the toy is always filled). */
const BOT_FILL: Record<AvatarSlot, number> = { head: 0.6, top: 0.55, bottom: 0.4, feet: 0.45, accessory: 0.45, toy: 1 };

/** A procedural camper's camp spot: a tent + bag from the whole catalog (rarer items turn up
 * less), sometimes a lantern, and a few of their things out on display. */
export function rollBotTent(rng: Rng): TentLoadout {
  const slots: TentLoadout['slots'] = {};
  const FILL: Record<TentSlot, number> = { tentStyle: 0.75, tentMaterial: 0.85, bedStyle: 0.6, bedMaterial: 0.7, lantern: 0.5 };
  for (const slot of TENT_SLOTS) {
    const fill = rng.chance(FILL[slot.id]);
    const pick = rng.weighted(allItems((it) => slot.kinds.includes(it.kind)), (it) => RARITY_INFO[it.rarity].weight);
    if (fill && pick) slots[slot.id] = pick.id;
  }
  const pool = allItems(isDisplayable);
  const displayed: string[] = [];
  const n = rng.int(0, 4);
  for (let i = 0; i < n && pool.length; i++) {
    const it = rng.weighted(pool, (x) => RARITY_INFO[x.rarity].weight);
    if (it && !displayed.includes(it.id)) displayed.push(it.id);
  }
  return { slots, displayed };
}

/** A procedural camper's outfit, from the whole catalog (rarer items turn up less). Always has a toy. */
export function rollBotAvatar(rng: Rng): AvatarLoadout {
  const out: AvatarLoadout = {};
  for (const slot of AVATAR_SLOTS) {
    // Always consume both rolls so each slot stays stable per seed as the catalog grows elsewhere.
    const fill = rng.chance(BOT_FILL[slot.id]);
    const pool = allItems((it) => slot.kinds.includes(it.kind));
    const pick = rng.weighted(pool, (it) => RARITY_INFO[it.rarity].weight);
    if ((fill || slot.id === 'toy') && pick) out[slot.id] = pick.id;
  }
  return out;
}
