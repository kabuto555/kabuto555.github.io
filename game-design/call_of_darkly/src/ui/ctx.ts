import type { EntityId } from '../core/entity';
import type { EventBus } from '../core/events';
import type { Action, Input, InputCode } from '../core/input';
import type { GunDef, ItemId, MeleeDef, ShieldDef, ShopDef, StatBlock, StatName } from '../data/types';
import type { InventorySystem } from '../inventory/system';
import type { RollTier } from '../inventory/types';
import { bindingLabel, type HintFade } from './logic';

// Structural views of the systems the UI reads. Real PlayerController / CombatSystem / Wallet satisfy them,
// and tests/harnesses can fake them.

export interface UiPlayer {
  readonly id: EntityId;
  readonly state: Readonly<{
    stamina: number;
    maxStamina: number;
    exhausted: boolean;
    estusCharges: number;
    yaw: number;
  }>;
  readonly health: { hp: number; maxHp: number };
  readonly levels: Readonly<StatBlock>;
  readonly rollTier: RollTier;
  /** weight / max load. */
  readonly equipLoad: number;
  readonly canMantle?: boolean;
  /** Gameplay gate (the UI clears it while a menu captures the mouse). */
  controlsEnabled?: boolean;
}

export interface UiGunState {
  id: ItemId;
  mag: number;
  reloading: boolean;
  reloadT: number;
}

export interface UiCombat {
  readonly gun: UiGunState | null;
  readonly gunDefNow: GunDef | null;
  readonly leftDefNow: MeleeDef | ShieldDef | null;
  readonly guns: readonly (UiGunState | null)[];
  readonly rightIdx: number;
  readonly leftIdx: number;
  readonly rightSlots: readonly (ItemId | null)[];
  readonly leftSlots: readonly (ItemId | null)[];
  readonly ads: number;
  readonly lastSpread: number;
  readonly ammo: { get(t: GunDef['ammo']): number; cap(t: GunDef['ammo']): number };
}

export interface UiWallet {
  readonly souls: number;
  spend(n: number): boolean;
  add(n: number): void;
}

export type ShopTable = ReadonlyMap<string, ShopDef> | Readonly<Record<string, ShopDef>>;

/** Called when the player buys a stat level. Apply it (levels[stat]++, refresh derived). Return false to refuse (souls are refunded). */
export type LevelUpFn = (stat: StatName) => boolean | void;

export interface UiCtx {
  readonly bus: EventBus;
  readonly player: UiPlayer;
  readonly combat: UiCombat;
  readonly inv: InventorySystem;
  readonly wallet: UiWallet;
  readonly input: Input;
  readonly hints: HintFade;
  readonly capture: Capture;
  readonly shops: ShopTable;
  readonly onLevelUp: LevelUpFn;
  /** UI clock (seconds, advances with render frames). */
  now(): number;
  /** Keycap label for an action, from the live bindings table. */
  key(action: Action, max?: number): string;
  bindings(): Record<Action, InputCode[]>;
}

export function makeKey(input: Input): (a: Action, max?: number) => string {
  return (a, max = 2) => bindingLabel(a, input.bindings, max);
}

export type CaptureListener = (capturing: boolean) => void;

/**
 * Tracks which UI surfaces hold the mouse. `capturing` is true while any token is held; transitions fire
 * `onChange` (pointer-lock exit/relock, controlsEnabled gate, `uiCapture` event).
 */
export class Capture {
  private readonly tokens = new Set<string>();
  constructor(private readonly onChange: CaptureListener) {}

  get capturing(): boolean {
    return this.tokens.size > 0;
  }

  acquire(token: string): void {
    const was = this.capturing;
    this.tokens.add(token);
    if (!was) this.onChange(true);
  }

  release(token: string): void {
    if (!this.tokens.delete(token)) return;
    if (!this.capturing) this.onChange(false);
  }
}
