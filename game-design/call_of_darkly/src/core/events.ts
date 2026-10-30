import type { DamageEvent, EntityId } from './entity';
import type { Vec3Like } from './types';

/**
 * Central typed event map. Other folders ADD events via declaration merging:
 *
 *   declare module '../core/events' {
 *     interface EventMap { gunFired: { weaponId: string } }
 *   }
 *
 * Keep payloads plain data (no class instances) so they can be logged/replayed.
 */
export interface EventMap {
  /** A hit landed (pre-absorb). Combat emits; health/UI/audio listen. */
  damage: DamageEvent;
  /** Entity HP reached 0. */
  death: { entityId: EntityId; killerId: EntityId | null; pos: Vec3Like; enemyId?: string };
  /** Player picked something up (world item, chest loot, drop, purchase). */
  itemPickup: { itemId: string; count: number; source: 'world' | 'chest' | 'drop' | 'shop' | 'other' };
  /** Top-left item toast / center banner text. */
  toast: { text: string; icon?: string; count?: number; kind?: 'item' | 'info' | 'banner' };
  /** Player rested at a bonfire: refill HP/estus, respawn enemies, refill caches. */
  bonfireRest: { bonfireId: string };
  /** Souls total changed (delta may be negative). */
  soulsChanged: { total: number; delta: number };
  /** Player died: drop bloodstain at pos with souls. */
  playerDied: { pos: Vec3Like; souls: number };
  /** Player was moved instantly (dev teleport, ladder, boss entry): any "last grounded" memory is stale. */
  playerTeleported: { pos: Vec3Like };
  /** Bloodstain recovered. */
  bloodstainRecovered: { souls: number };
  /** Door opened (id from level DSL). */
  doorOpened: { doorId: string };
}

export type EventName = keyof EventMap;
export type Handler<K extends EventName> = (payload: EventMap[K]) => void;

type AnyFn = (p: unknown) => void;

interface Slot {
  set: Set<AnyFn>;
  /** Cached iteration snapshot; null when the set changed since it was built. */
  snap: AnyFn[] | null;
}

/** Synchronous typed pub/sub. Handlers run immediately inside `emit`, in subscribe order. */
export class EventBus {
  private handlers = new Map<EventName, Slot>();
  /** once() wrappers keyed by original fn, so off(evt, fn) cancels a once. */
  private onceWrappers = new Map<EventName, Map<AnyFn, AnyFn>>();

  /** Subscribe; returns an unsubscribe function. */
  on<K extends EventName>(type: K, fn: Handler<K>): () => void {
    let slot = this.handlers.get(type);
    if (!slot) this.handlers.set(type, (slot = { set: new Set(), snap: null }));
    slot.set.add(fn as AnyFn);
    slot.snap = null;
    return () => this.off(type, fn);
  }

  once<K extends EventName>(type: K, fn: Handler<K>): () => void {
    const orig = fn as AnyFn;
    const wrapper: AnyFn = (p) => {
      this.off(type, fn);
      orig(p);
    };
    let m = this.onceWrappers.get(type);
    if (!m) this.onceWrappers.set(type, (m = new Map()));
    m.set(orig, wrapper);
    this.on(type, wrapper as Handler<K>);
    return () => this.off(type, fn);
  }

  off<K extends EventName>(type: K, fn: Handler<K>): void {
    const slot = this.handlers.get(type);
    if (!slot) return;
    const m = this.onceWrappers.get(type);
    const wrapper = m?.get(fn as AnyFn);
    if (wrapper) {
      m!.delete(fn as AnyFn);
      if (slot.set.delete(wrapper)) slot.snap = null;
    }
    if (slot.set.delete(fn as AnyFn)) slot.snap = null;
  }

  emit<K extends EventName>(type: K, payload: EventMap[K]): void {
    const slot = this.handlers.get(type);
    if (!slot || slot.set.size === 0) return;
    const snap = (slot.snap ??= [...slot.set]);
    for (let i = 0; i < snap.length; i++) {
      const fn = snap[i]!;
      if (!slot.set.has(fn)) continue; // removed mid-emit
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${type}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
    this.onceWrappers.clear();
  }
}

/** Global game event bus. */
export const events = new EventBus();
