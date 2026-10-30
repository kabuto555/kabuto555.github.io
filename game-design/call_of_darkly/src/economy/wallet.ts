import { events as globalEvents, type EventBus } from '../core/events';
import type { SaveData } from '../core/save';
import { stats as globalStats } from '../inventory/modifiers';
import type { StatsReader } from '../inventory/types';
import type { SoulWallet } from './types';

/** Souls wallet (§8/§9). Emits `soulsChanged`. Kill rewards go through `addKill` (applies `soulGain`). */
export class Wallet implements SoulWallet {
  private _souls = 0;

  constructor(
    private readonly bus: EventBus = globalEvents,
    private readonly stats: StatsReader = globalStats,
  ) {}

  get souls(): number {
    return this._souls;
  }

  /** Adds an already-scaled amount. */
  add(amount: number): void {
    const n = Math.floor(amount);
    if (!(n > 0)) return;
    this._souls += n;
    this.bus.emit('soulsChanged', { total: this._souls, delta: n });
  }

  /** Kill reward: `base` scaled by the `soulGain` modifier (Bounty Tag). Returns souls granted. */
  addKill(base: number): number {
    const n = Math.max(0, Math.round(base * this.stats.get('soulGain')));
    this.add(n);
    return n;
  }

  /** False (and no change) if insufficient. */
  spend(amount: number): boolean {
    const n = Math.floor(amount);
    if (!(n > 0)) return true;
    if (this._souls < n) return false;
    this._souls -= n;
    this.bus.emit('soulsChanged', { total: this._souls, delta: -n });
    return true;
  }

  /** Replace the balance (load / death wipe). */
  set(total: number): void {
    const t = Math.max(0, Math.floor(total) || 0);
    const delta = t - this._souls;
    this._souls = t;
    if (delta !== 0) this.bus.emit('soulsChanged', { total: t, delta });
  }

  load(save: SaveData | null | undefined): void {
    this._souls = Math.max(0, Math.floor(save?.souls ?? 0));
  }

  writeSave(save: SaveData): SaveData {
    save.souls = this._souls;
    return save;
  }
}
