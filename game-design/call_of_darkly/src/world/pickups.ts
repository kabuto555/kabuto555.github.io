import * as THREE from 'three';
import type { CombatSystem } from '../combat';
import { events as globalEvents, type EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import { AMMO, ITEMS_BY_ID } from '../data';
import type { GunDef, ItemDef, ItemId } from '../data/types';
import { collectAmmo, ownedAmmoTypes, type DropSpawn } from '../economy/drops';
import type { WorldProgress } from '../economy/progress';
import type { EquipmentImpl } from '../inventory/equipment';
import { maxStackOf, type Inventory } from '../inventory/store';
import { makePs1Material } from '../render/materials';
import { InstanceBatch } from '../render/batch';
import { createGlow, glowPulse } from './glow';
import type { InteractPlayer, InteractSystem, Interactable } from './interact';
import type { CacheContents, LevelOp, Loot } from './types';

/** Dropped (kill) pickups despawn after this many seconds (§4). */
export const PICKUP_TTL = 60;
/** Horizontal radius for walking over ammo to auto-collect it. */
export const AUTO_COLLECT_RADIUS = 1.2;
const BLINK_TIME = 3;

export interface PickupSpec extends Omit<DropSpawn, 'loot'> {
  loot?: { id: ItemId; count: number }[];
  /** Save key (level DSL placement id, or `chest:<id>`): marked looted when emptied; never despawns. */
  placementId?: string;
  /** Seconds until despawn. Default PICKUP_TTL, or Infinity for placed/cache pickups. */
  ttl?: number;
  /** Placed ammo cache: never despawns, refills on `bonfireRest`, not saved. */
  cache?: boolean;
}

export interface PickupDeps {
  parent: THREE.Object3D;
  camera: THREE.Camera;
  player: InteractPlayer;
  combat: CombatSystem;
  inv: { store: Inventory; equipment: EquipmentImpl };
  progress: WorldProgress;
  interact: InteractSystem;
  bus?: EventBus;
}

type Kind = 'gun' | 'ammo' | 'item' | 'cache';

let phaseSeq = 1;

export class Pickup implements Interactable {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly glow: THREE.Mesh;
  readonly range = 2.4;
  loot: { id: ItemId; count: number }[];
  ammo: Partial<Record<string, number>>;
  gun?: { mag: number; reserve: number };
  readonly placementId?: string;
  readonly ttl: number;
  readonly cache: boolean;
  /** Guaranteed first-kill drop: sets the progress flag when taken. */
  readonly firstKillFlag?: string;
  /** Keys of `ammo`, kept in sync by `refresh()` (no per-tick Object.keys). */
  ammoKeys: string[] = [];
  private promptCache: string | null | undefined = undefined;
  readonly phase = (phaseSeq++ * 2.399) % 6.28; // visual only
  readonly baseLoot: { id: ItemId; count: number }[];
  readonly baseAmmo: Partial<Record<string, number>>;
  age = 0;
  depleted = false;
  unregister: (() => void) | null = null;

  constructor(
    readonly pos: Vec3Like,
    spec: PickupSpec,
    body: THREE.Mesh,
    glow: THREE.Mesh,
    private readonly sys: PickupSystem,
  ) {
    this.loot = (spec.loot ?? []).map((l) => ({ ...l }));
    this.ammo = { ...(spec.ammo ?? {}) };
    this.baseLoot = this.loot.map((l) => ({ ...l }));
    this.baseAmmo = { ...this.ammo };
    this.gun = spec.gun ? { ...spec.gun } : undefined;
    this.placementId = spec.placementId;
    this.cache = !!spec.cache;
    this.firstKillFlag = spec.firstKillFlag;
    this.ammoKeys = Object.keys(this.ammo);
    this.ttl = spec.ttl ?? (spec.placementId || spec.cache ? Infinity : PICKUP_TTL);
    this.body = body;
    this.glow = glow;
    this.group.add(body, glow);
    this.group.position.set(pos.x, pos.y, pos.z);
  }

  get kind(): Kind {
    if (this.cache) return 'cache';
    const first = this.loot[0] && ITEMS_BY_ID.get(this.loot[0].id);
    if (first && isRightGun(first)) return 'gun';
    if (this.loot.length === 0) return 'ammo';
    return 'item';
  }

  /** Call after mutating loot/ammo/gun/depleted: refreshes the cached ammo keys and prompt text. */
  refresh(): void {
    this.ammoKeys = Object.keys(this.ammo);
    this.promptCache = undefined;
  }

  enabled(): boolean {
    return !this.depleted;
  }

  prompt(): string | null {
    if (this.depleted) return null;
    if (this.promptCache === undefined) this.promptCache = this.buildPrompt();
    return this.promptCache;
  }

  private buildPrompt(): string {
    const parts: string[] = [];
    for (const l of this.loot) {
      const n = ITEMS_BY_ID.get(l.id)?.name ?? l.id;
      parts.push(l.count > 1 ? `${n} x${l.count}` : n);
    }
    if (this.ammoKeys.length) parts.push('Ammo');
    const what = parts.join(', ') || 'Item';
    return this.kind === 'gun' ? `Swap in ${what}` : `Pick up ${what}`;
  }

  interact(): void {
    this.sys.take(this);
  }
}

function isRightGun(d: ItemDef): d is GunDef {
  return d.kind === 'weapon' && d.hand === 'R';
}

const bodyGeos: Partial<Record<Kind, THREE.BoxGeometry>> = {};
const bodyMats: Record<string, THREE.Material> = {};
const bodyBatches: Record<string, InstanceBatch> = {};
function bodyMesh(kind: Kind, key: boolean): THREE.Mesh {
  const geo = (bodyGeos[kind] ??= new THREE.BoxGeometry(
    ...(kind === 'gun' ? ([0.55, 0.08, 0.12] as const) : kind === 'ammo' ? ([0.22, 0.12, 0.14] as const) : kind === 'cache' ? ([0.5, 0.3, 0.34] as const) : ([0.18, 0.18, 0.18] as const)),
  ));
  const color = kind === 'gun' ? 0x4a5058 : kind === 'ammo' ? 0x8a7a40 : kind === 'cache' ? 0x4f6a3c : key ? 0xe0c040 : 0xa8a8b4;
  const mk = `${kind}:${color}`;
  const mat = (bodyMats[mk] ??= makePs1Material({ color }));
  // One InstancedMesh per (kind, colour); the returned mesh is an undrawn proxy (render/batch).
  const m = (bodyBatches[mk] ??= new InstanceBatch(geo, mat, `pickup:${mk}`)).proxy();
  m.name = `pickup:${kind}`;
  return m;
}

/**
 * World pickups (§4 drops, §7 item glow): glowing billboard + small body, [E] interact, ammo
 * auto-collect for owned guns, 60 s despawn for dropped ones, placed items persisted by id.
 */
export class PickupSystem implements System {
  readonly name = 'pickups';
  readonly pickups = new Set<Pickup>();
  private readonly d: PickupDeps;
  private readonly bus: EventBus;
  private t = 0;
  private readonly offs: (() => void)[] = [];
  private readonly removals: Pickup[] = [];
  private readonly scratchAmmo: Partial<Record<string, number>> = {};
  /** Owned ammo types (cached; null = rebuild). */
  private ownedAmmo: Set<string> | null = null;

  constructor(deps: PickupDeps) {
    this.d = deps;
    this.bus = deps.bus ?? globalEvents;
    this.offs.push(this.bus.on('bonfireRest', () => this.restockCaches()));
    const dirty = (): void => {
      this.ownedAmmo = null;
    };
    this.offs.push(this.bus.on('itemAdded', dirty), this.bus.on('itemRemoved', dirty), this.bus.on('equipmentChanged', dirty));
  }

  // ------------------------------------------------------------------ spawning

  spawn(spec: PickupSpec): Pickup {
    const probe = spec.loot?.[0] && ITEMS_BY_ID.get(spec.loot[0].id);
    const kind: Kind = spec.cache ? 'cache' : probe && isRightGun(probe) ? 'gun' : spec.loot?.length ? 'item' : 'ammo';
    const isKey = !!spec.loot?.some((l) => ITEMS_BY_ID.get(l.id)?.kind === 'key');
    const body = bodyMesh(kind, isKey);
    const glow = createGlow(kind === 'cache' ? 0.9 : 0.6);
    glow.position.y = 0.15;
    const p = new Pickup(spec.pos, spec, body, glow, this);
    this.d.parent.add(p.group);
    p.unregister = this.d.interact.register(p);
    this.pickups.add(p);
    return p;
  }

  /** DSL `item` op: skipped when already looted (save). */
  spawnItemOp(op: Extract<LevelOp, { op: 'item' }>): Pickup | null {
    return this.spawnPlaced(op.id, { x: op.pos[0], y: op.pos[1] + 0.35, z: op.pos[2] }, toList(op.loot));
  }

  /**
   * Placed/chest loot keyed by a save id: nothing when already looted, only the saved remainder when
   * it was partly taken, otherwise the full `loot`.
   */
  spawnPlaced(id: string, pos: Vec3Like, loot: { id: ItemId; count: number }[]): Pickup | null {
    const { progress } = this.d;
    if (progress.isLooted(id)) {
      const rest = progress.getPartial(id);
      if (!rest) return null;
      return this.spawn({ pos, loot: rest.map((l) => ({ id: l.id, count: l.count })), placementId: id });
    }
    return this.spawn({ pos, loot, placementId: id });
  }

  /** True while an untaken first-kill pickup for `flag` is on the ground. */
  hasFirstKill(flag: string): boolean {
    for (const p of this.pickups) if (p.firstKillFlag === flag) return true;
    return false;
  }

  /** DSL `cache` op: ammo refills on bonfire rest, never despawns, never saved. */
  spawnCacheOp(op: Extract<LevelOp, { op: 'cache' }>): Pickup {
    const c: CacheContents = op.contents;
    return this.spawn({ pos: { x: op.pos[0], y: op.pos[1] + 0.2, z: op.pos[2] }, ammo: c.ammo ?? {}, loot: c.items ? toList(c.items) : [], cache: true });
  }

  /** Re-arm every cache (bonfire rest). */
  restockCaches(): void {
    for (const p of this.pickups) {
      if (!p.cache) continue;
      p.loot = p.baseLoot.map((l) => ({ ...l }));
      p.ammo = { ...p.baseAmmo };
      p.depleted = false;
      p.group.visible = true;
      p.refresh();
    }
  }

  private remove(p: Pickup): void {
    p.unregister?.();
    p.unregister = null;
    p.group.removeFromParent();
    this.pickups.delete(p);
  }

  clear(): void {
    for (const p of [...this.pickups]) this.remove(p);
  }

  dispose(): void {
    this.clear();
    for (const o of this.offs) o();
    for (const k of Object.keys(bodyBatches)) {
      bodyBatches[k]!.dispose();
      delete bodyBatches[k];
    }
  }

  // ------------------------------------------------------------------ taking

  /** E on a pickup: ammo -> reserve (capped), gun -> swap into the current right slot, items -> inventory. */
  take(p: Pickup): void {
    if (p.depleted) return;
    const { store } = this.d.inv;
    let took = this.takeAmmo(p, false);
    const rest: { id: ItemId; count: number }[] = [];
    for (const l of p.loot) {
      const def = ITEMS_BY_ID.get(l.id);
      if (def && isRightGun(def)) {
        this.takeGun(def, p.gun ?? { mag: def.mag, reserve: 0 });
        p.gun = undefined;
        took = true;
        continue;
      }
      const added = store.add(l.id, l.count);
      if (added > 0) {
        took = true;
        this.bus.emit('itemPickup', { itemId: l.id, count: added, source: p.placementId?.startsWith('chest:') ? 'chest' : p.placementId ? 'world' : 'drop' });
      }
      if (added < l.count) rest.push({ id: l.id, count: l.count - added });
    }
    p.loot = rest;
    p.refresh();
    if (!took) {
      // A unique piece of gear the player already owns reads as "Already owned" (the pickup stays un-looted).
      const dup = p.loot.some((l) => {
        const def = ITEMS_BY_ID.get(l.id);
        return !!def && maxStackOf(def) === 1 && store.count(l.id) > 0;
      });
      this.bus.emit('toast', { text: dup ? 'Already owned' : "Can't carry any more", kind: 'info' });
    }
    else if (p.placementId) {
      // Looted on the first successful take; whatever is left is saved so a reload doesn't duplicate or lose it.
      this.d.progress.markLooted(p.placementId);
      this.d.progress.setPartial(p.placementId, rest);
    }
    this.settle(p);
  }

  /** Remove (or deplete) an emptied pickup. With `defer`, non-cache removals are queued instead. */
  private settle(p: Pickup, defer?: Pickup[]): void {
    if (p.loot.length || p.ammoKeys.length) return;
    if (p.placementId) {
      this.d.progress.markLooted(p.placementId);
      this.d.progress.setPartial(p.placementId, null);
    }
    if (p.cache) {
      p.depleted = true;
      p.group.visible = false;
      p.refresh();
      return;
    }
    // Once every first-kill pickup for this flag has been taken, the guaranteed drop is spent.
    if (p.firstKillFlag) {
      let other = false;
      for (const q of this.pickups) if (q !== p && q.firstKillFlag === p.firstKillFlag && !defer?.includes(q)) other = true;
      if (!other) this.d.progress.setFlag(p.firstKillFlag);
    }
    if (defer) defer.push(p);
    else this.remove(p);
  }

  /** Move rolled ammo into reserves (only owned types when `onlyOwned`). Returns whether anything was taken. */
  private takeAmmo(p: Pickup, onlyOwned: boolean): boolean {
    const keys = p.ammoKeys;
    if (!keys.length) return false;
    let subset = p.ammo;
    if (onlyOwned) {
      const owned = (this.ownedAmmo ??= new Set<string>(ownedAmmoTypes(this.d.inv.store.list().map((s) => s.id))));
      subset = this.scratchAmmo;
      for (const k in subset) delete subset[k];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        if (owned.has(k)) subset[k] = p.ammo[k];
      }
    }
    const taken = collectAmmo(this.d.combat.ammo, subset);
    let any = false;
    for (const [t, n] of Object.entries(taken)) {
      const left = (p.ammo[t] ?? 0) - n!;
      if (left > 0) p.ammo[t] = left;
      else delete p.ammo[t];
      this.bus.emit('toast', { text: `${AMMO[t as keyof typeof AMMO].name} Ammo`, count: n, kind: 'item', icon: 'ammo' });
      any = true;
    }
    if (any) p.refresh();
    return any;
  }

  /** Swap `def` into the current right slot; the old gun is dropped as a pickup (keeping its mag). */
  private takeGun(def: GunDef, g: { mag: number; reserve: number }): void {
    const { store, equipment } = this.d.inv;
    const combat = this.d.combat;
    if (store.count(def.id) > 0) {
      // Already own it: just take the reserve ammo.
      collectAmmo(combat.ammo, { [def.ammo]: g.reserve + g.mag });
      this.bus.emit('toast', { text: `${def.name} (owned): +ammo`, kind: 'info' });
      return;
    }
    const idx = combat.rightIdx;
    const slot = idx === 0 ? 'right1' : 'right2';
    const otherSlot = idx === 0 ? 'right2' : 'right1';
    const old = equipment.loadout[slot];
    const oldMag = combat.guns[idx]?.mag ?? 0;
    store.add(def.id);
    equipment.equip(slot, def.id);
    combat.rightIdx = idx; // setLoadout resets the active slot to 0
    const gs = combat.guns[idx];
    if (gs) gs.mag = Math.min(def.mag, Math.max(0, g.mag));
    if (g.reserve > 0) collectAmmo(combat.ammo, { [def.ammo]: g.reserve });
    this.bus.emit('itemPickup', { itemId: def.id, count: 1, source: 'world' });
    if (old && old !== def.id && equipment.loadout[otherSlot] !== old) {
      store.remove(old);
      const pp = this.d.player.position;
      const { yaw } = this.d.player.state;
      this.spawn({
        pos: { x: pp.x - Math.sin(yaw) * 0.9, y: pp.y + 0.35, z: pp.z - Math.cos(yaw) * 0.9 },
        loot: [{ id: old, count: 1 }],
        gun: { mag: oldMag, reserve: 0 },
        ttl: Infinity, // gear the player dropped never vanishes
      });
    }
  }

  // ------------------------------------------------------------------ System

  update(dt: number): void {
    if (this.pickups.size === 0) return;
    const pp = this.d.player.position;
    const out = this.removals;
    out.length = 0;
    for (const p of this.pickups) {
      if (p.ttl !== Infinity) {
        p.age += dt;
        if (p.age >= p.ttl) {
          out.push(p);
          continue;
        }
      }
      if (p.depleted || p.ammoKeys.length === 0) continue;
      const dx = p.pos.x - pp.x;
      const dz = p.pos.z - pp.z;
      if (dx * dx + dz * dz > AUTO_COLLECT_RADIUS * AUTO_COLLECT_RADIUS || Math.abs(p.pos.y - pp.y) > 2) continue;
      if (this.takeAmmo(p, true)) this.settle(p, out);
    }
    for (let i = 0; i < out.length; i++) this.remove(out[i]!);
    out.length = 0;
  }

  render(_alpha: number, frameDt: number): void {
    this.t += frameDt;
    const q = this.d.camera.quaternion;
    for (const p of this.pickups) {
      if (p.depleted) continue;
      const left = p.ttl - p.age;
      const blinkOff = left < BLINK_TIME && Math.floor(p.age * 8) % 2 === 0;
      p.body.visible = !blinkOff;
      p.glow.visible = !blinkOff;
      p.glow.quaternion.copy(q);
      const s = (p.cache ? 0.9 : 0.6) * glowPulse(this.t, p.phase);
      p.glow.scale.set(s, s, s);
      p.body.position.y = Math.sin(this.t * 2 + p.phase) * 0.04;
      p.body.rotation.y = this.t * 0.8 + p.phase;
    }
  }
}

function toList(loot: Loot): { id: ItemId; count: number }[] {
  return loot.map((l) => ({ id: l.id, count: l.count }));
}
