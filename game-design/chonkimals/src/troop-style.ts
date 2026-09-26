// Troop HQ styling — which troop gear (pennant colour / tent colour) the player has
// equipped. Gear comes from Camp Care Packages or the Shop's Troop tab (owned items
// live in care-package/inventory.ts); troop-tent.ts recolours the HQ tent + felt
// pennant from this. Local + persisted, like everything else.

import { storageGet, storageSet } from './storage';
import { rewardById, type Reward } from './care-package/rewards';

export type GearSlot = 'pennant' | 'tent';

const KEY = 'chonk.troopstyle.v1';
type State = Partial<Record<GearSlot, string>>;
type Listener = () => void;

class TroopStyle {
  private s: State = storageGet<State>(KEY, {});
  private listeners = new Set<Listener>();

  /** The equipped gear in a slot (null = the default look). */
  equipped(slot: GearSlot): Reward | null {
    const id = this.s[slot];
    return (id && rewardById(id)) || null;
  }

  isEquipped(id: string): boolean { return this.s.pennant === id || this.s.tent === id; }

  equip(r: Reward): void {
    if (r.kind !== 'pennant' && r.kind !== 'tent') return;
    this.s[r.kind] = r.id;
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const troopStyle = new TroopStyle();

/** A gear item's colours as an array (swatch may be a single colour). */
export function gearColors(r: Reward): string[] {
  return typeof r.swatch === 'string' ? [r.swatch] : [...(r.swatch ?? [])];
}
