// Boss gates (runtime, they change state): the shimmering fog wall at the bridge entry (one-way
// while the boss lives: [E] from outside walks you through) and the far-end pylon barrier
// (opens on victory). Visuals are skipped when `parent` is null (headless tests).
import * as THREE from 'three';
import { coloredBoxes, type ColoredBox } from '../../world/props';
import { aabbFromFootprint } from '../../physics/aabb';
import { Layer, type Collider, type CollisionWorld } from '../../physics/types';
import { makePs1Material, toPs1Texture } from '../../render';
import type { Vec3Like } from '../../core/types';
import { ARENA, type ArenaFrame } from './arena';

/** What the fog wall needs from the [E] system (InteractSystem satisfies it). */
export interface FogInteract {
  register(i: { readonly pos: Vec3Like; readonly range: number; enabled?(): boolean; prompt(): string | null; interact(): void }): () => void;
}

export const FOG_PROMPT = 'Traverse the white fog';

/** Barrier layer blocks the player capsule; Prop also stops bullets / sight through the fog. */
const GATE_LAYER = Layer.Barrier | Layer.Prop;

function addBox(world: CollisionWorld, frame: ArenaFrame, lx: number, ly: number, lz: number, w: number, h: number, d: number, tag: string): Collider {
  const c = frame.toWorld(lx, ly, lz);
  const [ww, dd] = frame.sizeToWorld(w, d);
  return world.add({ aabb: aabbFromFootprint(c.x, c.y, c.z, ww, h, dd), layer: GATE_LAYER, solid: true, tag });
}

// ------------------------------------------------------------------ fog wall

let fogTex: THREE.CanvasTexture | null = null;
/** 32px wispy fog: soft vertical streaks with brighter swirls (tiles horizontally). */
function fogTexture(): THREE.CanvasTexture {
  if (fogTex) return fogTex;
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const a = (x / S) * Math.PI * 2;
      const b = (y / S) * Math.PI * 2;
      const v = 0.55 + 0.25 * Math.sin(a * 2 + Math.sin(b * 2) * 1.5) + 0.2 * Math.sin(a * 5 - b * 3);
      const o = (y * S + x) * 4;
      const l = Math.round(200 + 55 * Math.max(0, Math.min(1, v)));
      img.data[o] = l;
      img.data[o + 1] = l;
      img.data[o + 2] = Math.min(255, l + 12);
      img.data[o + 3] = Math.round(255 * Math.max(0.15, Math.min(1, v)));
    }
  g.putImageData(img, 0, 0);
  fogTex = toPs1Texture(c);
  fogTex.wrapS = fogTex.wrapT = THREE.RepeatWrapping;
  return fogTex;
}

export interface FogWallOptions {
  world: CollisionWorld;
  frame: ArenaFrame;
  parent: THREE.Object3D | null;
  interact: FogInteract | null;
  /** Player feet (read each tick). */
  player: { readonly position: Vec3Like };
  /** [E] pressed in range from the outside (the boss system moves the player and engages). */
  onTraverse: () => void;
}

/**
 * The fog wall spans the bridge (8 m) at local z = 0. While armed it is solid; the [E] prompt only
 * shows from the outside (local z < 0), so once through you can't walk back out.
 */
export class FogWall {
  private readonly o: FogWallOptions;
  private collider: Collider | null = null;
  private unregister: (() => void) | null = null;
  private readonly group: THREE.Group | null = null;
  private readonly layers: THREE.Mesh[] = [];
  private readonly mats: THREE.MeshBasicMaterial[] = [];
  private time = 0;
  /** Interactable aim point: slides along the wall to the player's nearest point. */
  private readonly aim = { x: 0, y: 0, z: 0 };
  private readonly local = { x: 0, y: 0, z: 0 };

  constructor(o: FogWallOptions) {
    this.o = o;
    if (o.parent && typeof document !== 'undefined') {
      this.group = new THREE.Group();
      this.group.name = 'taurus:fogWall';
      const tex = fogTexture();
      const W = ARENA.halfWidth * 2 + 0.2;
      for (let i = 0; i < 3; i++) {
        const t = tex.clone();
        t.needsUpdate = true;
        t.repeat.set(2 + i * 0.7, 1.2);
        const m = makePs1Material({ lit: false, map: t, transparent: true, opacity: 0.5, side: THREE.DoubleSide }) as THREE.MeshBasicMaterial;
        m.depthWrite = false;
        m.color.setHex(i === 1 ? 0xf4f0ff : 0xe0e6f0);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, ARENA.fogHeight), m);
        const p = o.frame.toWorld(0, ARENA.fogHeight / 2, (i - 1) * 0.14);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = o.frame.yaw;
        mesh.renderOrder = 3;
        this.group.add(mesh);
        this.layers.push(mesh);
        this.mats.push(m);
      }
      o.parent.add(this.group);
    }
    this.arm();
  }

  get armed(): boolean {
    return this.collider !== null;
  }

  /** Solid + visible + [E] prompt. Idempotent. */
  arm(): void {
    const o = this.o;
    if (!this.collider) this.collider = addBox(o.world, o.frame, 0, 0, ARENA.fogZ, ARENA.halfWidth * 2, ARENA.fogHeight, 0.4, 'taurus:fog');
    if (this.group) this.group.visible = true;
    if (!this.unregister && o.interact) {
      const self = this;
      this.unregister = o.interact.register({
        pos: this.aim,
        range: 3.2,
        enabled: () => self.armed && self.outside(),
        prompt: () => (self.armed && self.outside() ? FOG_PROMPT : null),
        interact: () => self.traverse(),
      });
    }
  }

  /** Gone (boss defeated). */
  remove(): void {
    if (this.collider) this.o.world.remove(this.collider.id);
    this.collider = null;
    this.unregister?.();
    this.unregister = null;
    if (this.group) this.group.visible = false;
  }

  dispose(): void {
    this.remove();
    if (this.group) {
      this.group.removeFromParent();
      for (const l of this.layers) l.geometry.dispose();
      for (const m of this.mats) {
        m.map?.dispose();
        m.dispose();
      }
    }
  }

  /** Player on the near side (local z < fog plane), on the approach. */
  outside(): boolean {
    const p = this.o.player.position;
    const l = this.o.frame.toLocal(p.x, p.y, p.z, this.local);
    return l.z < ARENA.fogZ && l.z > ARENA.fogZ - 6 && Math.abs(l.x) < ARENA.halfWidth + 1 && Math.abs(l.y) < 3;
  }

  /** Direct [E] (no InteractSystem, or dev). */
  traverse(): boolean {
    if (!this.armed || !this.outside()) return false;
    this.o.onTraverse();
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.o.player.position;
    const f = this.o.frame;
    const l = f.toLocal(p.x, p.y, p.z, this.local);
    const lx = Math.max(-ARENA.halfWidth + 0.5, Math.min(ARENA.halfWidth - 0.5, l.x));
    f.toWorld(lx, 1.5, ARENA.fogZ, this.aim);
  }

  render(): void {
    if (!this.group?.visible) return;
    const t = this.time;
    for (let i = 0; i < this.mats.length; i++) {
      const m = this.mats[i]!;
      const s = i % 2 ? -1 : 1;
      m.map!.offset.set(t * 0.07 * s * (1 + i * 0.4), t * (0.12 + i * 0.05));
      m.opacity = 0.3 + 0.1 * Math.sin(t * (1.7 + i) + i * 2);
    }
  }
}

// ------------------------------------------------------------------ far-end pylon barrier

const ORANGE = 0xff6a10;
const WHITE = 0xece8dc;
const DARK = 0x2a2420;

/** Box-built cone pylon at (x, z), feet y = 0. */
function pylon(x: number, z: number): ColoredBox[] {
  return [
    [0.42, 0.05, 0.42, x, 0.025, z, DARK],
    [0.3, 0.24, 0.3, x, 0.17, z, ORANGE],
    [0.22, 0.14, 0.22, x, 0.36, z, WHITE],
    [0.15, 0.28, 0.15, x, 0.57, z, ORANGE],
  ];
}

/** Striped sawhorse (1.6 m) centred at (x, z) across local x. */
function sawhorse(x: number, z: number): ColoredBox[] {
  const out: ColoredBox[] = [];
  for (let i = 0; i < 8; i++) {
    const c = i % 2 ? WHITE : ORANGE;
    out.push([0.2, 0.24, 0.05, x - 0.7 + i * 0.2, 0.75, z, c]);
    out.push([0.2, 0.2, 0.05, x - 0.7 + i * 0.2, 0.42, z, i % 2 ? ORANGE : WHITE]);
  }
  out.push([0.07, 0.9, 0.07, x - 0.65, 0.45, z, DARK], [0.07, 0.9, 0.07, x + 0.65, 0.45, z, DARK]);
  return out;
}

/** "ROAD CLOSED" sign board + post (white/red stripes read as a sign at 240p). */
function sign(x: number, z: number): ColoredBox[] {
  return [
    [0.1, 1.5, 0.1, x, 0.75, z, DARK],
    [1.1, 0.55, 0.06, x, 1.6, z, 0xc02018],
    [0.9, 0.12, 0.07, x, 1.6, z, WHITE],
  ];
}

/** 🚧 pylons + sawhorses across the far end of the bridge. Solid until `open()`. */
export class FarBarrier {
  private collider: Collider | null = null;
  private readonly mesh: THREE.Mesh | null = null;

  constructor(
    private readonly world: CollisionWorld,
    frame: ArenaFrame,
    parent: THREE.Object3D | null,
  ) {
    this.collider = addBox(world, frame, 0, 0, ARENA.farZ, ARENA.halfWidth * 2, 3, 0.8, 'taurus:farBarrier');
    if (parent && typeof document !== 'undefined') {
      const z = 0; // built in barrier-local space, then placed
      const parts: ColoredBox[] = [
        ...sawhorse(-2.6, z),
        ...sawhorse(0, z + 0.15),
        ...sawhorse(2.6, z),
        ...sign(1.3, z - 0.3),
      ];
      for (let i = 0; i < 9; i++) parts.push(...pylon(-3.6 + i * 0.9, z - 0.6 + (i % 2) * 0.25));
      const geo = coloredBoxes(parts);
      this.mesh = new THREE.Mesh(geo, makePs1Material({ vertexColors: true }));
      this.mesh.name = 'taurus:farBarrier';
      const p = frame.toWorld(0, 0, ARENA.farZ);
      this.mesh.position.set(p.x, p.y, p.z);
      this.mesh.rotation.y = frame.yaw;
      parent.add(this.mesh);
    }
  }

  get closed(): boolean {
    return this.collider !== null;
  }

  open(): void {
    if (this.collider) this.world.remove(this.collider.id);
    this.collider = null;
    if (this.mesh) this.mesh.visible = false;
  }

  dispose(): void {
    this.open();
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
  }
}
