import { ITEMS_BY_ID } from '../data';
import type { ItemId } from '../data/types';

/** Minimal view of a gun's runtime state (`CombatSystem.guns` entries satisfy it). */
export interface MagState {
  id: ItemId;
  mag: number;
}

/** Write each equipped gun's current mag into `into` (entries for unequipped guns are kept). */
export function collectMags(guns: readonly (MagState | null)[], into: Record<ItemId, number>): Record<ItemId, number> {
  for (const g of guns) if (g) into[g.id] = Math.max(0, Math.floor(g.mag));
  return into;
}

/**
 * Restores saved mag counts into the combat per-gun state, once per gun: the first time a gun shows up
 * in `combat.guns` after a load (initial loadout, or equipped later) it gets its saved rounds. After
 * that the live combat state is authoritative, so swapping away and back never rewinds a mag.
 */
export class MagRestorer {
  private readonly pending = new Map<ItemId, number>();

  constructor(saved: Record<ItemId, number> | null | undefined) {
    for (const [id, n] of Object.entries(saved ?? {})) if (Number.isFinite(n) && n >= 0) this.pending.set(id, Math.floor(n));
  }

  /** Apply to the guns currently held; call after every loadout change. */
  apply(guns: readonly (MagState | null)[]): void {
    if (this.pending.size === 0) return;
    for (const g of guns) {
      if (!g) continue;
      const n = this.pending.get(g.id);
      if (n === undefined) continue;
      this.pending.delete(g.id);
      const def = ITEMS_BY_ID.get(g.id);
      const cap = def && def.kind === 'weapon' && 'mag' in def ? def.mag : n;
      g.mag = Math.min(cap, n);
    }
  }
}
