import * as THREE from 'three';
import type { Vec3Like } from '../core/types';
import { makePs1Material } from '../render/materials';
import { toPs1Texture } from '../render/textures';
import type { Interactable } from './interact';

/**
 * Bloodstain marker (§9): a dark green-ish splat decal on the ground plus a soft pulsing glow column
 * (two crossed additive quads, so no camera needed). [E] within range recovers the souls (DS1: you
 * have to reach it). Visuals are skipped when there is no DOM (tests) or no parent group.
 */

export const BLOODSTAIN_RANGE = 2.6;
const GLOW_COLOR = 0x5dff8a;

let decalTex: THREE.CanvasTexture | null = null;
let glowTex: THREE.CanvasTexture | null = null;
let decalMat: THREE.Material | null = null;
let glowMat: THREE.Material | null = null;
let planeGeo: THREE.PlaneGeometry | null = null;

const hasDom = (): boolean => typeof document !== 'undefined';

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32px splat: irregular dark-green blob with brighter specks, alpha-cut. */
function splatTexture(): THREE.CanvasTexture {
  if (decalTex) return decalTex;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const rnd = mulberry(77);
  const h = (size - 1) / 2;
  const blobs = Array.from({ length: 7 }, () => ({ x: (rnd() - 0.5) * 0.9, y: (rnd() - 0.5) * 0.9, r: 0.22 + rnd() * 0.3 }));
  blobs.unshift({ x: 0, y: 0, r: 0.5 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - h) / h;
      const dy = (y - h) / h;
      let d = 9;
      for (const b of blobs) d = Math.min(d, Math.hypot(dx - b.x, dy - b.y) - b.r);
      const i = (y * size + x) * 4;
      if (d > 0) {
        img.data[i + 3] = 0;
        continue;
      }
      const n = rnd();
      const edge = Math.min(1, -d * 4);
      const speck = n > 0.9 ? 0.5 : 0;
      img.data[i] = Math.round(10 + speck * 40);
      img.data[i + 1] = Math.round((40 + edge * 20 + speck * 160) * (0.8 + n * 0.3));
      img.data[i + 2] = Math.round(18 + speck * 60);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  decalTex = toPs1Texture(c);
  return decalTex;
}

/** 32px soft glow column (brightest at the bottom, fading up, narrow at the edges). */
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - 15.5) / 15.5;
      const up = y / (size - 1); // y=0 is the top of the quad
      const v = Math.max(0, 1 - dx * 1.15) ** 1.5 * Math.max(0, up) ** 1.2;
      const q = Math.round(v * 6) / 6; // PS1-ish banding
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(q * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  glowTex = toPs1Texture(c);
  return glowTex;
}

function assets(): { decal: THREE.Material; glow: THREE.Material; geo: THREE.PlaneGeometry } {
  planeGeo ??= new THREE.PlaneGeometry(1, 1);
  decalMat ??= makePs1Material({ map: splatTexture(), lit: false, alphaTest: 0.5, side: THREE.DoubleSide });
  if (!glowMat) {
    const m = makePs1Material({ map: glowTexture(), color: GLOW_COLOR, lit: false, transparent: true, side: THREE.DoubleSide });
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
    glowMat = m;
  }
  return { decal: decalMat, glow: glowMat, geo: planeGeo };
}

export function disposeBloodstainAssets(): void {
  decalTex?.dispose();
  glowTex?.dispose();
  decalMat?.dispose();
  glowMat?.dispose();
  planeGeo?.dispose();
  decalTex = glowTex = null;
  decalMat = glowMat = null;
  planeGeo = null;
}

/** Minimal slice of InteractSystem the marker needs. */
export interface InteractRegistry {
  register(i: Interactable): () => void;
}

export interface BloodstainMarkerOptions {
  pos: Vec3Like;
  souls: number;
  interact: InteractRegistry;
  /** Where to mount the visuals (scene or a world group). Omit for headless. */
  parent?: THREE.Object3D | null;
  /** Called on [E]. */
  onRecover: () => void;
  /** Gate [E] (e.g. false while the death cam runs). */
  canRecover?: () => boolean;
}

/** Visual + interactable for one bloodstain. */
export class BloodstainMarker implements Interactable {
  readonly group: THREE.Group | null = null;
  /** Interact aim point (a bit above the ground). */
  readonly pos: Vec3Like;
  readonly range = BLOODSTAIN_RANGE;
  readonly souls: number;
  private readonly glowQuads: THREE.Mesh[] = [];
  private readonly unregister: () => void;
  private t = 0;
  private disposed = false;

  constructor(private readonly o: BloodstainMarkerOptions) {
    this.souls = o.souls;
    this.pos = { x: o.pos.x, y: o.pos.y + 0.5, z: o.pos.z };
    if (o.parent && hasDom()) {
      const { decal, glow, geo } = assets();
      const grp = new THREE.Group();
      grp.name = 'bloodstain';
      grp.position.set(o.pos.x, o.pos.y, o.pos.z);
      const splat = new THREE.Mesh(geo, decal);
      splat.rotation.x = -Math.PI / 2;
      splat.position.y = 0.03;
      splat.scale.setScalar(1.5);
      grp.add(splat);
      for (let i = 0; i < 2; i++) {
        const q = new THREE.Mesh(geo, glow);
        q.rotation.y = (i * Math.PI) / 2;
        q.position.y = 0.9;
        q.scale.set(1.1, 1.8, 1);
        q.renderOrder = 5;
        grp.add(q);
        this.glowQuads.push(q);
      }
      o.parent.add(grp);
      this.group = grp;
    }
    this.unregister = o.interact.register(this);
  }

  enabled(): boolean {
    return !this.disposed && (this.o.canRecover?.() ?? true);
  }

  prompt(): string | null {
    return this.enabled() ? `Recover souls (${this.souls})` : null;
  }

  interact(): void {
    if (this.enabled()) this.o.onRecover();
  }

  /** Visual pulse; call per sim tick. */
  tick(dt: number): void {
    if (!this.group) return;
    this.t += dt;
    const s = 0.9 + 0.15 * Math.sin(this.t * 3.1);
    const hgt = 1.8 * (0.95 + 0.1 * Math.sin(this.t * 2.3));
    for (const q of this.glowQuads) q.scale.set(1.1 * s, hgt, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregister();
    this.group?.removeFromParent();
  }
}

export function createBloodstainMarker(o: BloodstainMarkerOptions): BloodstainMarker {
  return new BloodstainMarker(o);
}
