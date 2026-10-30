import { STATS } from '../data';
import type { EquipSlot, ItemId } from '../data/types';
import { evalCurve } from '../player/curve';
import type { EquipLoadProvider } from '../player/controller';
import { equipLoadRatio, rollTierFromRatio, type RollTier } from '../player/rollTier';
import { itemDef } from './store';
import type { StatsReader } from './types';

/** Slots that count toward equip load (guns, left hand, armor). Accessories weigh nothing. */
export const WEIGHT_SLOTS: readonly EquipSlot[] = ['right1', 'right2', 'left1', 'left2', 'head', 'chest', 'arms', 'legs'];

/** Total weight of a loadout (§5: guns + left-hand items + armor). */
export function loadoutWeight(loadout: Readonly<Record<EquipSlot, ItemId | null>>): number {
  let w = 0;
  for (let i = 0; i < WEIGHT_SLOTS.length; i++) {
    const d = itemDef(loadout[WEIGHT_SLOTS[i]!]);
    if (d && (d.kind === 'weapon' || d.kind === 'armor')) w += d.weight;
  }
  return w;
}

/** §8: max equip load = Endurance curve (data/stats.ts) x stats.get('equipLoad') (Tac Vest Frame etc.). */
export function maxEquipLoad(endurance: number, mods: StatsReader): number {
  return evalCurve(STATS.maxEquipLoad, endurance) * mods.get('equipLoad');
}

/** weight / maxLoad -> roll tier. Thin wrapper over player/rollTier (single source of the boundaries). */
export function rollTierForLoad(weight: number, maxLoad: number): RollTier {
  return rollTierFromRatio(equipLoadRatio(weight, maxLoad));
}

/** What the equip-load provider needs from equipment (structural; avoids a cycle). */
export interface WeightSource {
  weight(): number;
}

/** `PlayerController.equipLoadProvider` implementation backed by equipment weight + Endurance. */
export class InventoryEquipLoad implements EquipLoadProvider {
  constructor(
    private readonly equipment: WeightSource,
    private readonly endurance: () => number,
    private readonly mods: StatsReader,
  ) {}
  weight(): number {
    return this.equipment.weight();
  }
  maxLoad(): number {
    return maxEquipLoad(this.endurance(), this.mods);
  }
  ratio(): number {
    return equipLoadRatio(this.weight(), this.maxLoad());
  }
  rollTier(): RollTier {
    return rollTierFromRatio(this.ratio());
  }
}
