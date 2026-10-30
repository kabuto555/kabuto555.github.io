import type { Vec3Tuple } from '../core/types';
import type { DropTableDef, ItemId, ShopDef } from '../data/types';
import type { Rng } from '../core/rng';
import type { StatsReader } from '../inventory/types';

export interface SoulWallet {
  readonly souls: number;
  /** Adds (applies nothing — callers pass already-scaled amounts; kill rewards use soulGain). */
  add(amount: number): void;
  /** False if insufficient. */
  spend(amount: number): boolean;
}

/** One rolled drop to spawn as a world pickup. */
export type RolledDrop =
  | { kind: 'ammo'; ammo: Partial<Record<string, number>> }
  | { kind: 'item'; id: ItemId; count: number; /** Guaranteed first-kill drop. */ firstKill?: boolean };

/** Roll a drop table. `owned` = ammo types the player can use (§4 "random owned"). */
export type DropRoller = (
  table: DropTableDef,
  rng: Rng,
  stats: StatsReader,
  owned: readonly string[],
  firstKill: boolean,
) => RolledDrop[];

/** §8 cost(L) = round(0.02L³ + 3.06L² + 105.6L − 895), floored. */
export type LevelCostFn = (level: number) => number;

export interface Merchant {
  readonly def: ShopDef;
  /** Remaining stock (null = infinite). */
  stock(itemId: ItemId): number | null;
  buy(itemId: ItemId, wallet: SoulWallet): boolean;
}

/** Bloodstain world marker. */
export interface Bloodstain {
  areaId: string;
  pos: Vec3Tuple;
  souls: number;
}
