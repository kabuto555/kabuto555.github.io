import * as THREE from 'three';
import type { EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import type { WorldProgress } from '../economy/progress';
import { aabbFromFootprint } from '../physics/aabb';
import { Layer, type Collider, type CollisionWorld } from '../physics/types';
import { skinMeshes } from '../render/skin';
import { makePs1Material } from '../render/materials';
import { getTexture } from '../render/textures';
import type { InteractSystem, Interactable } from './interact';
import type { PickupSystem } from './pickups';
import type { LevelOp } from './types';

type ChestOp = Extract<LevelOp, { op: 'chest' }>;
type MimicOp = Extract<LevelOp, { op: 'mimic' }>;

const W = 0.9;
const H = 0.5;
const D = 0.55;
const OPEN_TIME = 0.65;
const LOOT_AT = 0.55;
const LID_OPEN = 1.9; // rad

export interface ChestDeps {
  parent: THREE.Object3D;
  world: CollisionWorld;
  interact: InteractSystem;
  pickups: PickupSystem;
  progress: WorldProgress;
  bus?: EventBus;
  /** Called for every `mimic` op as it is added (before a host is set, ops are only recorded in `mimics`). */
  onMimic?: (op: MimicOp) => void;
}

/**
 * M7 mimic host (ai/mimic.ts `MimicSystem`). ChestSystem forwards every `mimic` op to it, and drives its
 * update/dispose from the chest tick, so main.ts only needs `chests.setMimicHost(new MimicSystem({...}))`.
 * (Chests are built before the AI exists, hence a setter that replays the recorded ops.)
 */
export interface MimicHost {
  add(op: MimicOp): unknown;
  update?(dt: number): void;
  dispose?(): void;
}

class Chest implements Interactable {
  readonly range = 2.4;
  readonly pos: Vec3Like;
  readonly group = new THREE.Group();
  readonly lid = new THREE.Group();
  collider: Collider | null = null;
  unregister: (() => void) | null = null;
  /** Seconds since the kick; -1 = closed. */
  t = -1;
  lootSpawned = false;
  constructor(
    readonly op: ChestOp,
    private readonly sys: ChestSystem,
  ) {
    this.pos = { x: op.pos[0], y: op.pos[1] + 0.45, z: op.pos[2] };
  }
  get opened(): boolean {
    return this.t >= 0;
  }
  enabled(): boolean {
    return !this.opened;
  }
  prompt(): string | null {
    return this.opened ? null : 'Open chest';
  }
  interact(): void {
    this.sys.open(this);
  }
}

/** Chests (§7): E kicks the lid open, loot pops as a glow on the lid; one-time, persisted by id. */
export class ChestSystem implements System {
  readonly name = 'chests';
  readonly chests = new Map<string, Chest>();
  /** Every mimic op seen (replayed to a host set later). */
  readonly mimics: MimicOp[] = [];
  private mimicHost: MimicHost | null = null;
  private readonly mats: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(private readonly d: ChestDeps) {
  }

  addChest(op: ChestOp): Chest {
    const c = new Chest(op, this);
    const wood = makePs1Material({ map: getTexture('wood', 32, 5), color: 0xc8a070 });
    const metal = makePs1Material({ map: getTexture('metal', 32, 9), color: 0x9098a0 });
    this.mats.push(wood, metal);
    const box = (w: number, h: number, d: number): THREE.BoxGeometry => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geos.push(g);
      return g;
    };
    const base = new THREE.Mesh(box(W, H * 0.6, D), wood);
    base.position.y = H * 0.3;
    const band = new THREE.Mesh(box(W + 0.02, H * 0.6, 0.08), metal);
    band.position.y = H * 0.3;
    // lid pivots on the back edge (-z in chest space)
    c.lid.position.set(0, H * 0.6, -D / 2);
    const lidMesh = new THREE.Mesh(box(W, H * 0.4, D), wood);
    lidMesh.position.set(0, H * 0.2, D / 2);
    const lidBand = new THREE.Mesh(box(W + 0.02, H * 0.4, 0.08), metal);
    lidBand.position.set(0, H * 0.2, D / 2);
    const latch = new THREE.Mesh(box(0.1, 0.12, 0.05), metal);
    latch.position.set(0, -0.02, D + 0.02);
    c.lid.add(lidMesh, lidBand, latch);
    c.group.add(base, band, c.lid);
    // 5 meshes -> wood + metal skinned meshes (lid pivot is the second bone); must bind before the group is placed.
    skinMeshes(c.group, [base, band, lidMesh, lidBand, latch], 'chest');
    c.group.position.set(op.pos[0], op.pos[1], op.pos[2]);
    c.group.rotation.y = op.yaw;
    this.d.parent.add(c.group);

    const side = Math.abs(Math.sin(op.yaw)) > 0.7;
    c.collider = this.d.world.add({
      aabb: aabbFromFootprint(op.pos[0], op.pos[1], op.pos[2], side ? D : W, H, side ? W : D),
      layer: Layer.Prop,
      solid: true,
      tag: `chest:${op.id}`,
    });
    c.unregister = this.d.interact.register(c);
    this.chests.set(op.id, c);

    if (this.d.progress.isChestOpened(op.id)) {
      // Restore: lid open; loot glow still there unless already taken.
      c.t = OPEN_TIME;
      c.lid.rotation.x = -LID_OPEN;
      c.lootSpawned = true;
      this.spawnLoot(c); // no-op when already looted; spawns only the remainder when partly taken
    }
    return c;
  }

  /** Mimic op: recorded, passed to `onMimic`, and spawned dormant through the host when one is set. */
  addMimic(op: MimicOp): void {
    this.mimics.push(op);
    this.d.onMimic?.(op);
    this.mimicHost?.add(op);
  }

  /** Attach the mimic system: replays the ops recorded so far, then receives later ones plus update/dispose. */
  setMimicHost(host: MimicHost): void {
    this.mimicHost = host;
    for (const op of this.mimics) host.add(op);
  }

  open(c: Chest): void {
    if (c.opened) return;
    c.t = 0;
    this.d.progress.markChestOpened(c.op.id);
  }

  private spawnLoot(c: Chest): void {
    const { op } = c;
    // Loot sits on the opened lid: just above the chest, slightly behind its center.
    const back = 0.15;
    this.d.pickups.spawnPlaced(
      `chest:${op.id}`,
      { x: op.pos[0] + Math.sin(op.yaw) * -back, y: op.pos[1] + H + 0.3, z: op.pos[2] + Math.cos(op.yaw) * -back },
      op.contents.map((l) => ({ id: l.id, count: l.count })),
    );
  }

  update(dt: number): void {
    this.mimicHost?.update?.(dt);
    for (const c of this.chests.values()) {
      if (c.t < 0 || c.t >= OPEN_TIME) continue;
      c.t = Math.min(OPEN_TIME, c.t + dt);
      const k = c.t / OPEN_TIME;
      // ease-out with a small overshoot, then settle
      const e = 1 - (1 - k) ** 3;
      const over = Math.sin(k * Math.PI) * 0.12;
      c.lid.rotation.x = -LID_OPEN * Math.min(1.08, e + over);
      // kick: the chest jolts back in the first moments
      c.group.position.y = c.op.pos[1] + (c.t < 0.18 ? Math.sin((c.t / 0.18) * Math.PI) * 0.04 : 0);
      if (!c.lootSpawned && c.t >= LOOT_AT) {
        c.lootSpawned = true;
        this.spawnLoot(c);
      }
      if (c.t >= OPEN_TIME) c.lid.rotation.x = -LID_OPEN;
    }
  }

  dispose(): void {
    this.mimicHost?.dispose?.();
    this.mimicHost = null;
    for (const c of this.chests.values()) {
      c.unregister?.();
      if (c.collider) this.d.world.remove(c.collider.id);
      c.group.removeFromParent();
    }
    this.chests.clear();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}
