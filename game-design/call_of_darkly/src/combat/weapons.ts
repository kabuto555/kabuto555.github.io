import { AMMO } from '../data/ammo';
import { WEAPONS } from '../data/weapons';
import type { AmmoType, GunDef, ItemId, MeleeDef, ShieldDef, WeaponDef } from '../data/types';
import { events as globalEvents, type EventBus } from '../core/events';
import { addCapped, clampReserve } from './math';
import './events';
import type { GunState } from './types';

export function gunDef(id: ItemId | null): GunDef | null {
  const d = id ? WEAPONS[id] : undefined;
  return d && d.hand === 'R' ? (d as GunDef) : null;
}
export function leftDef(id: ItemId | null): MeleeDef | ShieldDef | null {
  const d: WeaponDef | undefined = id ? WEAPONS[id] : undefined;
  return d && d.hand === 'L' ? (d as MeleeDef | ShieldDef) : null;
}

/** Reserve ammo per type with COD-style caps (data/ammo). */
export class AmmoStore {
  private reserve: Record<AmmoType, number> = { pistol: 0, rifle: 0, smg: 0, shotgun: 0, sniper: 0, launcher: 0 };
  constructor(private readonly bus: EventBus = globalEvents) {}

  get(t: AmmoType): number {
    return this.reserve[t];
  }
  cap(t: AmmoType): number {
    return AMMO[t].cap;
  }
  set(t: AmmoType, n: number): void {
    this.reserve[t] = clampReserve(n, AMMO[t].cap);
    this.bus.emit('ammoChanged', { type: t, reserve: this.reserve[t] });
  }
  /** Add under the cap; returns the overflow that did not fit (pickups leave it on the ground). */
  add(t: AmmoType, n: number): number {
    const r = addCapped(this.reserve[t], n, AMMO[t].cap);
    this.reserve[t] = r.total;
    this.bus.emit('ammoChanged', { type: t, reserve: r.total });
    return r.overflow;
  }
  /** Remove up to n; returns taken. */
  take(t: AmmoType, n: number): number {
    const taken = Math.min(n, this.reserve[t]);
    this.reserve[t] -= taken;
    this.bus.emit('ammoChanged', { type: t, reserve: this.reserve[t] });
    return taken;
  }
}

export function newGunState(id: ItemId, mag?: number): GunState {
  const d = gunDef(id);
  return { id, mag: mag ?? d?.mag ?? 0, cooldown: 0, reloading: false, reloadT: 0 };
}
