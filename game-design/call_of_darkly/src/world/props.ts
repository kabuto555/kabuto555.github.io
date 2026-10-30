import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aabbFromFootprint } from '../physics/aabb';
import { Layer, type CollisionWorld } from '../physics/types';
import { makePs1Material } from '../render/materials';
import { getTexture, toPs1Texture } from '../render/textures';
import type { LevelOp } from './types';

/**
 * Level props (§2 perf: InstancedMesh for repeated props). One InstancedMesh per prop kind:
 * pylons, striped sawhorse barriers, "ROAD CLOSED" signs, crates, rubble, skeleton silhouettes.
 * 🚧 barrier ops (kind 'construction') are dressed by `PropsBuilder.barrier(op)` (the builder's
 * `onBarrier` callback): the collider already exists, this is visuals only.
 */

/** Box part for merged vertex-colored models: [w, h, d, x, y, z, color, rotY?, rotZ?]. */
export type ColoredBox = readonly [w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY?: number, rotZ?: number];

/** Merge colored boxes into one vertex-colored geometry (shared by NPCs, bonfire, skeletons). */
export function coloredBoxes(parts: readonly ColoredBox[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const [w, h, d, x, y, z, color, ry = 0, rz = 0] of parts) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    paintGeo(g, c.setHex(color));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return merged;
}

function paintGeo(g: THREE.BufferGeometry, c: THREE.Color): void {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

const ORANGE = 0xff6a10;
const WHITE = 0xece8dc;

function pylonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  const seg = (y0: number, y1: number, color: number) => {
    const r = (y: number) => 0.17 - (0.17 - 0.055) * (y / 0.72);
    const g = new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 6, 1);
    g.translate(0, (y0 + y1) / 2, 0);
    paintGeo(g, c.setHex(color));
    parts.push(g);
  };
  const base = new THREE.BoxGeometry(0.4, 0.05, 0.4);
  base.translate(0, 0.025, 0);
  paintGeo(base, c.setHex(0x2a2420));
  parts.push(base);
  seg(0.05, 0.28, ORANGE);
  seg(0.28, 0.42, WHITE);
  seg(0.42, 0.72, ORANGE);
  const m = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return m;
}

/** 32x16 diagonal orange/white stripes. */
function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 16;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
      const on = (x + y) % 8 < 4;
      const o = (y * 32 + x) * 4;
      img.data[o] = on ? 245 : 235;
      img.data[o + 1] = on ? 110 : 232;
      img.data[o + 2] = on ? 20 : 220;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return toPs1Texture(c);
}

/** Sawhorse barrier: striped board (1.6 m) on two legs, unit-yaw along +X. Origin at the ground. */
function sawhorseGeometry(): THREE.BufferGeometry {
  const board = new THREE.BoxGeometry(1.6, 0.26, 0.05);
  board.translate(0, 0.72, 0);
  const board2 = new THREE.BoxGeometry(1.6, 0.26, 0.05);
  board2.translate(0, 0.42, 0);
  const legs: THREE.BufferGeometry[] = [];
  for (const lx of [-0.65, 0.65]) {
    const l = new THREE.BoxGeometry(0.07, 0.9, 0.07);
    l.translate(lx, 0.45, 0);
    legs.push(l);
  }
  const all = [board, board2, ...legs];
  for (const g of all) {
    paintGeo(g, new THREE.Color(0xffffff));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i));
  }
  const m = mergeGeometries(all, false)!;
  for (const g of all) g.dispose();
  return m;
}

/** 64x64: top 48 rows = red "ROAD CLOSED" sign, bottom = dark post. */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3430';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b01c14';
  g.fillRect(0, 0, 64, 48);
  g.strokeStyle = '#f0ece0';
  g.lineWidth = 2;
  g.strokeRect(2, 2, 60, 44);
  g.fillStyle = '#f0ece0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 15px monospace';
  g.fillText('ROAD', 32, 16);
  g.font = 'bold 13px monospace';
  g.fillText('CLOSED', 32, 33);
  return toPs1Texture(c);
}

function signGeometry(): THREE.BufferGeometry {
  const board = new THREE.BoxGeometry(1.0, 0.75, 0.05);
  board.translate(0, 1.15, 0);
  const buv = board.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i), 0.25 + buv.getY(i) * 0.75);
  const post = new THREE.BoxGeometry(0.07, 1.3, 0.07);
  post.translate(0, 0.65, -0.06);
  const puv = post.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < puv.count; i++) puv.setXY(i, 0.5, 0.1);
  for (const g of [board, post]) paintGeo(g, new THREE.Color(0xffffff));
  const m = mergeGeometries([board, post], false)!;
  board.dispose();
  post.dispose();
  return m;
}

const BONE = 0xcfc8b0;
const BONE_D = 0x9a9480;

/** Standing skeleton silhouette (~1.7 m): skull, spine, ribcage, pelvis, arms, legs. */
function skeletonGeometry(): THREE.BufferGeometry {
  const parts: ColoredBox[] = [
    [0.2, 0.22, 0.22, 0, 1.58, 0, BONE], // skull
    [0.12, 0.05, 0.14, 0, 1.44, 0.02, BONE_D], // jaw
    [0.05, 0.5, 0.05, 0, 1.2, 0, BONE_D], // spine
    [0.34, 0.06, 0.18, 0, 1.38, 0, BONE], // clavicles
    [0.3, 0.05, 0.16, 0, 1.3, 0, BONE], // ribs
    [0.28, 0.05, 0.15, 0, 1.2, 0, BONE_D],
    [0.24, 0.05, 0.13, 0, 1.1, 0, BONE],
    [0.26, 0.12, 0.14, 0, 0.92, 0, BONE], // pelvis
    [0.05, 0.4, 0.05, -0.2, 1.15, 0.05, BONE_D, 0, 0.08], // arms
    [0.05, 0.4, 0.05, 0.2, 1.15, 0.05, BONE_D, 0, -0.08],
    [0.06, 0.46, 0.06, -0.09, 0.62, 0, BONE], // legs
    [0.06, 0.46, 0.06, 0.09, 0.62, 0, BONE],
    [0.06, 0.4, 0.06, -0.09, 0.2, 0, BONE_D],
    [0.06, 0.4, 0.06, 0.09, 0.2, 0, BONE_D],
  ];
  return coloredBoxes(parts);
}

function rubbleGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.scale(1, 0.6, 1);
  g.translate(0, 0.15, 0);
  return g;
}

export interface BuiltProps {
  group: THREE.Group;
  /** InstancedMesh draw calls added. */
  meshCount: number;
  /** Instance counts by kind (debug / report). */
  counts: Record<string, number>;
  dispose(): void;
}

type Inst = readonly [x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number];

/** Collects prop placements, then `build()` makes one InstancedMesh per kind. */
export class PropsBuilder {
  private readonly pylons: Inst[] = [];
  private readonly horses: Inst[] = [];
  private readonly signs: Inst[] = [];
  private readonly crates: Inst[] = [];
  private readonly rubbles: Inst[] = [];
  private readonly skeletons: Inst[] = [];
  private readonly crateBoxes: Array<[number, number, number, number, number, number]> = [];

  /** Dress a 'construction' barrier op: pylons at the ends and every ~2.2 m, sawhorses + a sign between. */
  barrier(op: Extract<LevelOp, { op: 'barrier' }>): void {
    const alongX = op.w >= op.d;
    const len = alongX ? op.w : op.d;
    const yaw = alongX ? 0 : Math.PI / 2;
    const bays = Math.max(1, Math.round(len / 2.2));
    const step = (len - 0.8) / bays;
    const start = -len / 2 + 0.4;
    const at = (t: number): [number, number] => (alongX ? [op.x + t, op.z] : [op.x, op.z + t]);
    for (let i = 0; i <= bays; i++) {
      const [px, pz] = at(start + step * i);
      this.pylons.push([px, op.y, pz, 0, 1, 1, 1]);
    }
    const signBay = Math.floor(bays / 2);
    for (let i = 0; i < bays; i++) {
      const [px, pz] = at(start + step * (i + 0.5));
      if (i === signBay) {
        // sign faces the long side's normal (±Z for x-aligned barriers): double-sided box, so either way reads
        this.signs.push([px, op.y, pz, alongX ? 0 : Math.PI / 2, 1, 1, 1]);
      } else {
        this.horses.push([px, op.y, pz, yaw, (step - 0.3) / 1.6, 1, 1]);
      }
    }
  }

  pylon(x: number, y: number, z: number): void {
    this.pylons.push([x, y, z, 0, 1, 1, 1]);
  }

  /** Solid crate (axis-aligned collider; `build(world)` registers it). */
  crate(x: number, y: number, z: number, w = 1, h = 1, d = 1, yaw = 0): void {
    this.crates.push([x, y, z, yaw, w, h, d]);
    this.crateBoxes.push([x, y, z, w, h, d]);
  }

  /** Decorative rubble heap (no collider). */
  rubble(x: number, y: number, z: number, size = 1, yaw = 0): void {
    this.rubbles.push([x, y, z, yaw, size, size * 0.8, size * 1.2]);
  }

  /** Static idle skeleton (non-aggro prop). */
  skeleton(x: number, y: number, z: number, yaw = 0): void {
    this.skeletons.push([x, y, z, yaw, 1, 1, 1]);
  }

  build(world?: CollisionWorld): BuiltProps {
    const group = new THREE.Group();
    group.name = 'props';
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    const counts: Record<string, number> = {};
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const mk = (name: string, list: readonly Inst[], geo: THREE.BufferGeometry, mat: THREE.Material) => {
      if (!list.length) {
        geo.dispose();
        mat.dispose();
        return;
      }
      geos.push(geo);
      mats.push(mat);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.name = `props:${name}`;
      list.forEach(([x, y, z, yaw, sx, sy, sz], i) => {
        q.setFromAxisAngle(up, yaw);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.frustumCulled = false; // few instances, spread wide; cheaper than per-frame bounds upkeep
      counts[name] = list.length;
      group.add(im);
    };

    mk('pylons', this.pylons, pylonGeometry(), makePs1Material({ vertexColors: true, emissive: 0x401800 }));
    const stripe = stripeTexture();
    mk('sawhorses', this.horses, sawhorseGeometry(), makePs1Material({ map: stripe, vertexColors: true, emissive: 0x301000 }));
    mk('signs', this.signs, signGeometry(), makePs1Material({ map: signTexture(), vertexColors: true, emissive: 0x201010 }));

    // Crates: unit cube scaled per instance.
    const crateGeo = new THREE.BoxGeometry(1, 1, 1);
    crateGeo.translate(0, 0.5, 0);
    mk('crates', this.crates, crateGeo, makePs1Material({ map: getTexture('wood', 32, 5), color: 0xc8a070 }));

    const rubbleGeo = rubbleGeometry();
    mk('rubble', this.rubbles, rubbleGeo, makePs1Material({ map: getTexture('stone', 32, 11), color: 0x9a9080 }));

    // Skeletons: vertex-colored bone, slightly emissive so they read in the fog.
    mk('skeletons', this.skeletons, skeletonGeometry(), makePs1Material({ vertexColors: true, emissive: 0x201c14 }));

    if (world) {
      for (const [x, y, z, w, h, d] of this.crateBoxes) world.add({ aabb: aabbFromFootprint(x, y, z, w, h, d), layer: Layer.World, solid: true, tag: 'prop:crate' });
    }
    group.updateMatrixWorld(true);
    return {
      group,
      meshCount: group.children.length,
      counts,
      dispose() {
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        group.removeFromParent();
      },
    };
  }
}
