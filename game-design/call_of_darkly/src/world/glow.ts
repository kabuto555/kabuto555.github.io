import * as THREE from 'three';
import { makePs1Material } from '../render/materials';
import { toPs1Texture } from '../render/textures';
import { InstanceBatch } from '../render/batch';

/**
 * Item glow (§7): a pulsing white sparkle billboard. One shared 32px texture (4-point star + soft
 * core), one shared additive PS1 material, one shared quad; per-pickup cost is a Mesh.
 */

let tex: THREE.CanvasTexture | null = null;
let mat: THREE.Material | null = null;
let geo: THREE.PlaneGeometry | null = null;
let batch: InstanceBatch | null = null;

function glowTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const h = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - h) / h;
      const dy = (y - h) / h;
      const r = Math.hypot(dx, dy);
      const core = Math.max(0, 1 - r * 1.6) ** 1.5;
      // 4-point star arms: thin along each axis, fading with distance.
      const arm = Math.max(0, 1 - Math.min(Math.abs(dx), Math.abs(dy)) * 7) * Math.max(0, 1 - r * 1.05);
      const v = Math.min(1, core + arm * 0.9);
      const q = Math.round(v * 5) / 5; // PS1-ish banding
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(q * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  tex = toPs1Texture(c);
  return tex;
}

export function glowMaterial(): THREE.Material {
  if (mat) return mat;
  const m = makePs1Material({ map: glowTexture(), lit: false, transparent: true, side: THREE.DoubleSide });
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  mat = m;
  return m;
}

export function glowGeometry(): THREE.PlaneGeometry {
  return (geo ??= new THREE.PlaneGeometry(1, 1));
}

/** A new glow quad. Size in meters. An undrawn proxy: ALL glows render as one InstancedMesh (render/batch). */
export function createGlow(size = 0.5): THREE.Mesh {
  batch ??= new InstanceBatch(glowGeometry(), glowMaterial(), 'glow', 5, 64);
  const m = batch.proxy();
  m.scale.setScalar(size);
  m.name = 'glow';
  return m;
}

/** Pulse scale factor (0.75..1.15) for time `t` and a per-item phase. */
export function glowPulse(t: number, phase = 0): number {
  return 0.95 + 0.2 * Math.sin(t * 4.2 + phase);
}

export function disposeGlow(): void {
  tex?.dispose();
  mat?.dispose();
  geo?.dispose();
  tex = null;
  mat = null;
  geo = null;
}
