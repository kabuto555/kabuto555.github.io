import type { Vec3Like } from '../core/types';
import type { EquipSlot, ItemId } from '../data/types';

/**
 * Accessory effects (PLAN section 6). Equipping registers the accessory's `modifiers` in `stats` under
 * source id `acc:<id>` (see Equipment); unequipping unregisters it. Gameplay code never checks
 * accessory ids, it reads the key:
 *
 *   scavenger_patch       ammoDropChance +50%, ammoPackAmount +25%   -> economy/drops
 *   sleight_of_hand_patch reloadSpeed +40%                           -> combat reload
 *   marathon_patch        sprintStaminaCost -40%                     -> player sprint drain
 *   bounty_tag            soulGain +20%                              -> economy kill souls
 *   steady_aim_patch      adsSway -30%, recoil -30%                  -> combat spread/recoil
 *   tac_vest_frame        equipLoad +40% (max load)                  -> inventory/equipLoad
 *   fire_discipline_patch fireAbsorb +0.25                           -> inventory/absorb
 *   dead_silence_patch    footstepVolume x0, hearingRadius -50%      -> audio / ai hearing
 *   martyrdom_dogtag      martyrdom flag (stats.has('martyrdom')) AND the `playerDeath` hook below
 *
 * Only effects that are NOT a plain modifier get a hook. Today that is just Martyrdom.
 */
export interface AccessoryHookMap {
  /**
   * Fired by the inventory system when the player dies (core `playerDied`), once per equipped
   * accessory that provides the hook. Martyrdom Dogtag: the subscriber (combat/grenades) spawns a live
   * frag at `pos` that damages enemies but NOT the player. Payload is the death position + souls dropped.
   */
  playerDeath: { pos: Vec3Like; souls: number };
}

export type AccessoryHookName = keyof AccessoryHookMap;

/** Which accessory ids provide which hooks. */
export const ACCESSORY_HOOKS: Readonly<Record<ItemId, readonly AccessoryHookName[]>> = {
  martyrdom_dogtag: ['playerDeath'],
};

export type AccessoryHookHandler<K extends AccessoryHookName> = (payload: AccessoryHookMap[K], accessoryId: ItemId) => void;

/**
 * Hook list other systems subscribe to: `accessoryHooks.on('playerDeath', (p, accId) => ...)`.
 * Handlers only run while an equipped accessory provides that hook (so Martyrdom unequipped = no frag).
 * Equipment keeps `setSlot` current; the inventory system calls `emit` from core events.
 */
export class AccessoryHooks {
  private readonly equipped = new Map<EquipSlot, ItemId>();
  private readonly handlers = new Map<AccessoryHookName, Set<AccessoryHookHandler<never>>>();

  on<K extends AccessoryHookName>(name: K, fn: AccessoryHookHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as AccessoryHookHandler<never>);
    return () => {
      set.delete(fn as AccessoryHookHandler<never>);
    };
  }

  /** Track which accessory sits in a slot (null = empty). */
  setSlot(slot: EquipSlot, id: ItemId | null): void {
    if (id) this.equipped.set(slot, id);
    else this.equipped.delete(slot);
  }

  /** True if an equipped accessory provides `name`. */
  isActive(name: AccessoryHookName): boolean {
    for (const id of this.equipped.values()) if (ACCESSORY_HOOKS[id]?.includes(name)) return true;
    return false;
  }

  /** Run handlers once per equipped providing accessory. Returns the number of provider accessories. */
  emit<K extends AccessoryHookName>(name: K, payload: AccessoryHookMap[K]): number {
    const set = this.handlers.get(name);
    let n = 0;
    for (const id of this.equipped.values()) {
      if (!ACCESSORY_HOOKS[id]?.includes(name)) continue;
      n++;
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          (fn as AccessoryHookHandler<K>)(payload, id);
        } catch (err) {
          console.error(`[accessoryHooks] handler for "${name}" threw`, err);
        }
      }
    }
    return n;
  }

  clear(): void {
    this.equipped.clear();
    this.handlers.clear();
  }
}

/** Global hook list. */
export const accessoryHooks = new AccessoryHooks();
