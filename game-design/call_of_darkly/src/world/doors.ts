import * as THREE from 'three';
import { events as globalEvents, type EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import { KEYS } from '../data';
import type { WorldProgress } from '../economy/progress';
import type { Inventory } from '../inventory/store';
import { aabbFromFootprint } from '../physics/aabb';
import { Layer, type Collider, type CollisionWorld } from '../physics/types';
import { makePs1Material } from '../render/materials';
import { getTexture } from '../render/textures';
import type { InteractPlayer, InteractSystem, Interactable } from './interact';
import type { LevelOp } from './types';

/** Door op + optional one-way/shortcut flag (DSL support lands with the Burg area; see M5). */
export type DoorOp = Extract<LevelOp, { op: 'door' }> & { oneWay?: boolean };

const THICK = 0.2;

/** Key ids whose data says they open door `doorId` (built once; hasKey runs from the prompt each frame). */
let keysByDoor: Map<string, string[]> | null = null;
function keysFor(doorId: string): readonly string[] {
  if (!keysByDoor) {
    keysByDoor = new Map();
    for (const k of Object.values(KEYS)) {
      if (!k.opens) continue;
      const list = keysByDoor.get(k.opens);
      if (list) list.push(k.id);
      else keysByDoor.set(k.opens, [k.id]);
    }
  }
  return keysByDoor.get(doorId) ?? NO_KEYS;
}
const NO_KEYS: readonly string[] = [];
const SWING_TIME = 0.9;

export interface DoorDeps {
  parent: THREE.Object3D;
  world: CollisionWorld;
  interact: InteractSystem;
  progress: WorldProgress;
  inventory: Pick<Inventory, 'has'>;
  player: InteractPlayer;
  bus?: EventBus;
}

class Door implements Interactable {
  readonly range = 2.6;
  readonly pos: Vec3Like;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  lock: THREE.Mesh | null = null;
  collider: Collider | null = null;
  unregister: (() => void) | null = null;
  open = false;
  /** 0..1 swing progress. */
  swing = 0;
  dir = 1;
  constructor(
    readonly op: DoorOp,
    private readonly sys: DoorSystem,
  ) {
    this.pos = { x: op.pos[0], y: op.pos[1] + Math.min(op.h, 1.2), z: op.pos[2] };
  }
  enabled(): boolean {
    return !this.open;
  }
  prompt(): string | null {
    if (this.open) return null;
    if (this.op.keyId && !this.sys.hasKey(this.op)) return 'Locked';
    return this.op.keyId ? 'Unlock door' : 'Open door';
  }
  interact(): void {
    this.sys.tryOpen(this);
  }
}

/** Doors (§7 keys): locked collider; E with the key swings it open and removes the collider; persisted. */
export class DoorSystem implements System {
  readonly name = 'doors';
  readonly doors = new Map<string, Door>();
  private readonly bus: EventBus;
  private readonly mats: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(private readonly d: DoorDeps) {
    this.bus = d.bus ?? globalEvents;
  }

  hasKey(op: DoorOp): boolean {
    if (!op.keyId) return true;
    if (this.d.inventory.has(op.keyId)) return true;
    // Any owned key whose data says it opens this door id.
    const ids = keysFor(op.id);
    for (let i = 0; i < ids.length; i++) if (this.d.inventory.has(ids[i]!)) return true;
    return false;
  }

  addDoor(op: DoorOp): Door {
    const dr = new Door(op, this);
    const wood = makePs1Material({ map: getTexture('wood', 32, 5), color: 0x9a7a58 });
    const metal = makePs1Material({ map: getTexture('metal', 32, 9), color: 0xa0a8b0 });
    this.mats.push(wood, metal);
    const box = (w: number, h: number, d: number): THREE.BoxGeometry => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geos.push(g);
      return g;
    };
    // hinge on the local -x edge; panel extends toward +x
    dr.pivot.position.set(-op.w / 2, 0, 0);
    const panel = new THREE.Mesh(box(op.w, op.h, THICK), wood);
    panel.position.set(op.w / 2, op.h / 2, 0);
    const strap = new THREE.Mesh(box(op.w, 0.12, THICK + 0.02), metal);
    strap.position.set(op.w / 2, op.h * 0.7, 0);
    const strap2 = strap.clone();
    strap2.position.y = op.h * 0.25;
    dr.pivot.add(panel, strap, strap2);
    if (op.keyId) {
      dr.lock = new THREE.Mesh(box(0.16, 0.2, THICK + 0.08), metal);
      dr.lock.position.set(op.w * 0.85, op.h * 0.48, 0);
      dr.pivot.add(dr.lock);
    }
    dr.group.add(dr.pivot);
    dr.group.position.set(op.pos[0], op.pos[1], op.pos[2]);
    dr.group.rotation.y = op.yaw;
    this.d.parent.add(dr.group);
    this.doors.set(op.id, dr);

    if (this.d.progress.isDoorOpened(op.id)) {
      dr.open = true;
      dr.swing = 1;
      dr.pivot.rotation.y = -Math.PI / 2;
      if (dr.lock) dr.lock.visible = false;
    } else {
      const side = Math.abs(Math.sin(op.yaw)) > 0.7;
      dr.collider = this.d.world.add({
        aabb: aabbFromFootprint(op.pos[0], op.pos[1], op.pos[2], side ? THICK : op.w, op.h, side ? op.w : THICK),
        layer: Layer.Prop,
        solid: true,
        tag: `door:${op.id}`,
      });
      dr.unregister = this.d.interact.register(dr);
    }
    return dr;
  }

  tryOpen(dr: Door): void {
    if (dr.open) return;
    const { op } = dr;
    if (op.keyId && !this.hasKey(op)) {
      this.bus.emit('toast', { text: 'Locked', kind: 'info' });
      return;
    }
    // Side the player stands on (door-local +z is "front").
    const p = this.d.player.position;
    const fx = Math.sin(op.yaw);
    const fz = Math.cos(op.yaw);
    const side = (p.x - op.pos[0]) * fx + (p.z - op.pos[2]) * fz;
    if (op.oneWay && side > 0) {
      this.bus.emit('toast', { text: "It won't open from this side", kind: 'info' });
      return;
    }
    dr.open = true;
    dr.dir = side >= 0 ? -1 : 1; // swing away from the player
    if (dr.collider) this.d.world.remove(dr.collider.id);
    dr.collider = null;
    dr.unregister?.();
    dr.unregister = null;
    if (dr.lock) dr.lock.visible = false;
    this.d.progress.markDoorOpened(op.id);
    this.bus.emit('doorOpened', { doorId: op.id });
  }

  update(dt: number): void {
    for (const dr of this.doors.values()) {
      if (!dr.open || dr.swing >= 1) continue;
      dr.swing = Math.min(1, dr.swing + dt / SWING_TIME);
      const e = 1 - (1 - dr.swing) ** 2;
      dr.pivot.rotation.y = -dr.dir * e * (Math.PI / 2);
    }
  }

  dispose(): void {
    for (const dr of this.doors.values()) {
      dr.unregister?.();
      if (dr.collider) this.d.world.remove(dr.collider.id);
      dr.group.removeFromParent();
    }
    this.doors.clear();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}

