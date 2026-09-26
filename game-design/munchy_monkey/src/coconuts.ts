// CoconutWallet: manages the player's 🥥 coconut currency.
// Starting balance: 10. Each power-up costs 5. Clearing a stage earns 3.
// Balance is persisted across sessions via safe localStorage helpers.

import { storageGet, storageSet } from './storage';

const STORAGE_KEY = 'coconutBalance';
export const POWERUP_COST   = 5;
export const STAGE_CLEAR_REWARD = 3;
const STARTING_BALANCE = 10;

export class CoconutWallet {
  private _balance: number;
  private _onChange: ((balance: number) => void) | null = null;

  constructor() {
    this._balance = storageGet<number>(STORAGE_KEY, STARTING_BALANCE);
  }

  get balance(): number { return this._balance; }

  /** Register a listener called whenever the balance changes */
  onChange(cb: (balance: number) => void): void { this._onChange = cb; }

  /** Returns true if the player can afford `cost` coconuts */
  canAfford(cost = POWERUP_COST): boolean { return this._balance >= cost; }

  /**
   * Spend `cost` coconuts. Returns true on success, false if insufficient funds.
   */
  spend(cost = POWERUP_COST): boolean {
    if (this._balance < cost) return false;
    this._balance -= cost;
    this._save();
    this._onChange?.(this._balance);
    return true;
  }

  /**
   * Earn `amount` coconuts and return the new balance.
   */
  earn(amount = STAGE_CLEAR_REWARD): number {
    this._balance += amount;
    this._save();
    this._onChange?.(this._balance);
    return this._balance;
  }

  private _save(): void {
    storageSet(STORAGE_KEY, this._balance);
  }
}
