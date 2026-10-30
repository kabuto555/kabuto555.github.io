import * as THREE from 'three';
import { events } from '../core/events';
import type { SaveData } from '../core/save';
import type { System, Vec3Like } from '../core/types';
import type { AmmoType } from '../data/types';
import { InstanceBatch } from '../render/batch';
import { makePs1Material } from '../render/materials';
import { BLOB_LIFT } from '../render/shadow';
import type { Interactable, InteractSystem } from './interact';
import { coloredBoxes, type ColoredBox } from './props';
import type { LevelOp } from './types';

export type BonfireOp = Extract<LevelOp, { op: 'bonfire' }>;

/** §9 anti-softlock: on rest or respawn the pistol reserve is topped up to at least this. */
export const PISTOL_FLOOR = 24;

/** Minimal ammo store surface (combat.ammo satisfies it). */
export interface AmmoLike {
  get(t: AmmoType): number;
  set(t: AmmoType, n: number): void;
}

/** Raise pistol reserve to `floor` if lower. Returns true if it changed. Ammo is otherwise NOT refilled by rests (§9). */
export function applyPistolFloor(ammo: AmmoLike, floor = PISTOL_FLOOR): boolean {
  if (ammo.get('pistol') >= floor) return false;
  ammo.set('pistol', floor);
  return true;
}

export interface BonfireDeps {
  parent: THREE.Object3D;
  interact: InteractSystem;
  player: { refill(): void; readonly state: { readonly estusCharges: number } };
  ammo: AmmoLike;
  save: SaveData;
  /** Flush the save (main's persist()). */
  persist: () => void;
  /** False while the player is dead / in the death cam: resting is disabled. Default always alive. */
  alive?: () => boolean;
  /** Flicker clock, seconds; default performance.now. */
  now?: () => number;
}

/** Spot where the player reappears next to a bonfire (open side is +Z, facing the fire at -Z). */
export function bonfireRespawn(pos: readonly [number, number, number]): { pos: Vec3Like; yaw: number } {
  return { pos: { x: pos[0], y: pos[1], z: pos[2] + 2.2 }, yaw: 0 };
}

const ASH = 0x2c2622;
const ROCK = 0x6a645c;
const WOOD = 0x3a2a1e;
const BLADE = 0xb8b8b0;
const GRIP = 0x4a3020;

let baseGeo: THREE.BufferGeometry | null = null;
let flameGeo: THREE.BufferGeometry | null = null;

/** Ring of rocks, ash pile, charred logs and the sword spike. One draw call. */
function bonfireBase(): THREE.BufferGeometry {
  if (baseGeo) return baseGeo;
  const parts: ColoredBox[] = [
    [0.9, 0.12, 0.9, 0, 0.06, 0, ASH],
    [0.5, 0.1, 0.5, 0, 0.16, 0, 0x1c1814],
    [0.7, 0.08, 0.1, 0, 0.26, 0, WOOD, 0.5], // logs
    [0.7, 0.08, 0.1, 0, 0.3, 0, WOOD, -0.7],
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push([0.3, 0.2 + (i % 3) * 0.05, 0.28, Math.cos(a) * 0.62, 0.11, Math.sin(a) * 0.62, ROCK, -a]);
  }
  // sword stuck blade-down in the ash, leaning slightly
  parts.push([0.05, 1.0, 0.012, 0.02, 0.62, 0, BLADE, 0, 0.06]);
  parts.push([0.26, 0.04, 0.05, 0.0, 1.0, 0, GRIP, 0, 0.06]); // crossguard
  parts.push([0.04, 0.16, 0.04, -0.01, 1.1, 0, GRIP, 0, 0.06]); // hilt
  baseGeo = coloredBoxes(parts);
  return baseGeo;
}

/** Stacked tapered tongues: orange base, yellow core, pale tip. One draw call. */
function flame(): THREE.BufferGeometry {
  if (flameGeo) return flameGeo;
  flameGeo = coloredBoxes([
    [0.46, 0.28, 0.46, 0, 0.34, 0, 0xd83c10, 0.4],
    [0.34, 0.32, 0.34, 0, 0.6, 0, 0xff7a1c, 0.9],
    [0.22, 0.3, 0.22, 0.02, 0.86, 0, 0xffb23c, 0.2],
    [0.12, 0.26, 0.12, -0.02, 1.08, 0.01, 0xffe08a, 0.6],
    [0.28, 0.22, 0.06, 0, 0.55, 0, 0xffa030], // crossed blades for silhouette width
    [0.06, 0.22, 0.28, 0, 0.55, 0, 0xffa030],
  ]);
  return flameGeo;
}

class Bonfire implements Interactable {
  readonly pos: Vec3Like;
  readonly range = 3.2;
  readonly group = new THREE.Group();
  readonly flameMesh: THREE.Mesh;
  readonly light: THREE.PointLight;
  cooldown = 0;
  unregister: (() => void) | null = null;
  constructor(
    readonly op: BonfireOp,
    private readonly sys: BonfireSystem,
  ) {
    this.pos = { x: op.pos[0], y: op.pos[1] + 0.7, z: op.pos[2] };
    this.group.position.set(op.pos[0], op.pos[1], op.pos[2]);
    this.group.name = `bonfire:${op.id}`;
    this.flameMesh = sys.flameBatch(flame()).proxy();
    this.light = new THREE.PointLight(0xff9040, 14, 16, 1.2);
    this.light.position.set(0, 1.1, 0);
    const base = sys.baseBatch(bonfireBase()).proxy();
    const disc = sys.discBatch.proxy();
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = BLOB_LIFT;
    this.group.add(base, this.flameMesh, this.light, disc);
  }
  enabled(): boolean {
    return this.cooldown <= 0 && this.sys.isAlive();
  }
  prompt(): string | null {
    return this.cooldown > 0 || !this.sys.isAlive() ? null : 'Rest at bonfire';
  }
  interact(): void {
    this.sys.rest(this.op.id);
  }
}

/** Bonfires (§9/§10): E to rest = refill HP/estus, pistol floor, set save bonfire, persist, emit `bonfireRest`. */
export class BonfireSystem implements System {
  readonly name = 'bonfires';
  readonly bonfires = new Map<string, Bonfire>();
  readonly baseMat = makePs1Material({ vertexColors: true });
  readonly flameMat = makePs1Material({ vertexColors: true, lit: false });
  readonly discGeo = new THREE.CircleGeometry(1.4, 12);
  readonly discMat = makePs1Material({ lit: false, color: 0x120e0a, transparent: true, opacity: 0.55 });
  // Base/flame/ground-disc of every bonfire are undrawn proxies drawn as one InstancedMesh each (render/batch).
  private _base: InstanceBatch | null = null;
  private _flame: InstanceBatch | null = null;
  readonly discBatch = new InstanceBatch(this.discGeo, this.discMat, 'bonfireDisc', 1);
  baseBatch(geo: THREE.BufferGeometry): InstanceBatch {
    return (this._base ??= new InstanceBatch(geo, this.baseMat, 'bonfireBase', 0, 4));
  }
  flameBatch(geo: THREE.BufferGeometry): InstanceBatch {
    return (this._flame ??= new InstanceBatch(geo, this.flameMat, 'bonfireFlame', 0, 4));
  }
  private readonly now: () => number;

  constructor(private readonly d: BonfireDeps) {
    this.now = d.now ?? (() => performance.now() / 1000);
  }

  isAlive(): boolean {
    return this.d.alive ? this.d.alive() : true;
  }

  addBonfire(op: BonfireOp): void {
    if (this.bonfires.has(op.id)) return;
    const b = new Bonfire(op, this);
    b.unregister = this.d.interact.register(b);
    this.bonfires.set(op.id, b);
    this.d.parent.add(b.group);
  }

  /** Rest at `id` (also callable from the dev console / death loop). */
  rest(id: string): boolean {
    const b = this.bonfires.get(id);
    if (!b) return false;
    b.cooldown = 1.5;
    const { save, player, ammo } = this.d;
    save.bonfireId = id;
    player.refill();
    applyPistolFloor(ammo);
    save.estusCharges = player.state.estusCharges;
    events.emit('toast', { text: 'BONFIRE RESTED', kind: 'banner' });
    events.emit('bonfireRest', { bonfireId: id });
    this.d.persist();
    return true;
  }

  /** Respawn spot for a bonfire id (null when unknown to this area). */
  respawnPoint(id: string | null): { pos: Vec3Like; yaw: number } | null {
    const b = id ? this.bonfires.get(id) : undefined;
    return b ? bonfireRespawn(b.op.pos) : null;
  }

  update(dt: number): void {
    for (const b of this.bonfires.values()) if (b.cooldown > 0) b.cooldown -= dt;
  }

  render(): void {
    const t = this.now();
    for (const b of this.bonfires.values()) {
      const f = 1 + 0.12 * Math.sin(t * 13 + b.op.pos[0]) + 0.08 * Math.sin(t * 29.7) + 0.05 * Math.sin(t * 7.3);
      b.flameMesh.scale.set(1 + (f - 1) * 0.4, f, 1 + (f - 1) * 0.4);
      b.flameMesh.rotation.y = Math.floor(t * 8) * 0.9; // chunky stepped flicker
      b.light.intensity = 14 * (0.85 + (f - 1) * 1.6);
    }
  }

  dispose(): void {
    for (const b of this.bonfires.values()) {
      b.unregister?.();
      b.group.removeFromParent();
    }
    this.bonfires.clear();
    this._base?.dispose();
    this._flame?.dispose();
    this.discBatch.dispose();
    this._base = this._flame = null;
    this.baseMat.dispose();
    this.flameMat.dispose();
    this.discGeo.dispose();
    this.discMat.dispose();
  }
}
