import type * as THREE from 'three';
import { GrenadeSystem, type GrenadeCombat, type GrenadePlayer } from '../combat/grenades';
import { events as globalEvents, type EventBus } from '../core/events';
import { input as globalInput, type Input } from '../core/input';
import type { System } from '../core/types';
import { CONSUMABLES } from '../data/items';
import { GUN_LIST } from '../data';
import type { AmmoType, ConsumableDef, ItemId } from '../data/types';
import type { CollisionWorld } from '../physics/types';
import { AccessoryHooks, accessoryHooks as globalHooks } from './accessories';
import type { GrenadePouch, QuickBeltImpl } from './belt';
import { stats as globalStats, type StatsResolver } from './modifiers';
import type { InventoryStore } from './types';

declare module '../core/events' {
  interface EventMap {
    /** A quick item grants souls. The wallet (economy) adds them; this system does not import economy. */
    soulsGranted: { amount: number; source: ItemId };
    /** Extraction Flare used: teleport the player to the last rested bonfire (keeps souls). */
    warpToBonfire: { source: ItemId };
    /** A quick item finished its use animation and took effect. */
    consumableUsed: { itemId: ItemId };
    /** A timed buff started / ended (HUD icon). */
    buffChanged: { buffId: string; active: boolean; remaining: number };
  }
}

/** Ammo reserve access the ammo crate needs (CombatSystem.ammo satisfies it). */
export interface AmmoLike {
  add(t: AmmoType, n: number): number;
  cap(t: AmmoType): number;
}

export interface ConsumableCombat extends GrenadeCombat {
  readonly ammo: AmmoLike;
}

export interface ConsumableInventory {
  readonly store: Pick<InventoryStore, 'count'>;
  readonly belt: Pick<QuickBeltImpl, 'current' | 'cycle' | 'use'>;
  readonly pouch: Pick<GrenadePouch, 'current' | 'cycle' | 'use'>;
  readonly hooks?: AccessoryHooks;
}

export interface ConsumableSystemOptions {
  combat: ConsumableCombat;
  player: GrenadePlayer;
  inv: ConsumableInventory;
  world: CollisionWorld;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  input?: Input;
  events?: EventBus;
  stats?: StatsResolver;
}

export const CONSUMABLE_TUNING = {
  /** moveSpeed multiplier while the use animation plays. */
  useMoveMul: 0.55,
  /** Stats source id for the use slow. */
  slowSource: 'consumable:use',
} as const;

export interface ConsumableSystem extends System {
  readonly grenades: GrenadeSystem;
  /** Seconds left of the current use animation (0 = idle). */
  readonly useLock: number;
  /** Begin using the selected quick item (animation lock, effect at the end). False if none usable / already busy. */
  use(): boolean;
  /** Apply a consumable's effect immediately (no animation, no inventory consumption). */
  apply(def: ConsumableDef): void;
  /** Remaining seconds of an active buff (0 if none). */
  buffRemaining(buffId: string): number;
  dispose(): void;
}

/**
 * Quick belt (Z use / X cycle) and grenade pouch (G throw / T cycle). Wire in main.ts, after combat:
 *   const consumables = createConsumableSystem({ combat, player, inv, world, scene, camera });
 *   loop.add(consumables);   // and consumables.dispose() on teardown
 * Do not also handle cycleGrenade / cycleQuick / throwGrenade / useQuick elsewhere.
 */
export function createConsumableSystem(o: ConsumableSystemOptions): ConsumableSystem {
  const bus = o.events ?? globalEvents;
  const mods = o.stats ?? globalStats;
  const input = o.input ?? globalInput;
  const { combat, player, inv } = o;

  let useT = 0;
  let using: ItemId | null = null;
  const buffs = new Map<string, number>();

  const grenades = new GrenadeSystem({
    combat,
    player,
    pouch: inv.pouch,
    world: o.world,
    scene: o.scene,
    camera: o.camera,
    input,
    events: bus,
    hooks: inv.hooks ?? globalHooks,
    canAct: () => useT <= 0,
  });

  const ownedAmmoTypes = (): AmmoType[] => {
    const out: AmmoType[] = [];
    for (const g of GUN_LIST) if (inv.store.count(g.id) > 0 && !out.includes(g.ammo)) out.push(g.ammo);
    return out;
  };

  const apply = (def: ConsumableDef): void => {
    const e = def.effect;
    switch (e.type) {
      case 'souls':
        bus.emit('soulsGranted', { amount: e.amount, source: def.id });
        break;
      case 'warpToBonfire':
        bus.emit('warpToBonfire', { source: def.id });
        break;
      case 'buff': {
        mods.register(`buff:${e.buffId}`, e.modifiers);
        buffs.set(e.buffId, e.duration);
        bus.emit('buffChanged', { buffId: e.buffId, active: true, remaining: e.duration });
        break;
      }
      case 'ammoRefill':
        for (const t of ownedAmmoTypes()) combat.ammo.add(t, Math.ceil(combat.ammo.cap(t) * e.fraction)); // add() caps at the reserve limit
        break;
    }
    bus.emit('consumableUsed', { itemId: def.id });
  };

  const endUse = (): void => {
    useT = 0;
    using = null;
    mods.unregister(CONSUMABLE_TUNING.slowSource);
  };

  const use = (): boolean => {
    if (useT > 0) return false;
    const id = inv.belt.current();
    const def = id ? CONSUMABLES[id] : undefined;
    if (!id || !def || inv.store.count(id) <= 0) return false;
    using = id;
    useT = Math.max(0.05, def.useTime);
    mods.register(CONSUMABLE_TUNING.slowSource, [{ key: 'moveSpeed', op: 'mul', value: CONSUMABLE_TUNING.useMoveMul }]);
    return true;
  };

  const offs: (() => void)[] = [
    // A death wipes timed buffs.
    bus.on('playerDied', () => {
      endUse();
      for (const id of [...buffs.keys()]) {
        mods.unregister(`buff:${id}`);
        buffs.delete(id);
        bus.emit('buffChanged', { buffId: id, active: false, remaining: 0 });
      }
    }),
  ];

  const sys: ConsumableSystem = {
    name: 'consumables',
    grenades,
    get useLock() {
      return useT;
    },
    use,
    apply,
    buffRemaining: (id) => buffs.get(id) ?? 0,
    update(dt: number): void {
      const on = player.controlsEnabled && player.state.move !== 'dead';

      if (on && useT <= 0) {
        if (input.pressed('cycleQuick')) inv.belt.cycle(1);
        if (input.pressed('useQuick')) use();
      }
      if (useT > 0) {
        if (!on) endUse();
        else {
          useT -= dt;
          if (useT <= 0) {
            const id = using;
            endUse();
            // Consume at the end, so a cancelled use costs nothing. The belt still points at the same slot.
            if (id && inv.belt.current() === id && inv.belt.use() === id) {
              const def = CONSUMABLES[id];
              if (def) apply(def);
            }
          }
        }
      }

      grenades.update(dt);

      // Timed buffs
      for (const [id, left] of buffs) {
        const n = left - dt;
        if (n <= 0) {
          buffs.delete(id);
          mods.unregister(`buff:${id}`);
          bus.emit('buffChanged', { buffId: id, active: false, remaining: 0 });
        } else buffs.set(id, n);
      }

      // No firing during a use animation / throw: hold every gun's cooldown up.
      const lock = Math.max(useT, grenades.lockT);
      if (lock > 0) {
        for (const g of combat.guns) if (g && g.cooldown < lock) g.cooldown = lock;
      }
    },
    dispose(): void {
      for (const off of offs) off();
      offs.length = 0;
      grenades.dispose();
      endUse();
      for (const id of buffs.keys()) mods.unregister(`buff:${id}`);
      buffs.clear();
    },
  };
  return sys;
}
