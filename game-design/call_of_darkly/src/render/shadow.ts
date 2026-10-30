import * as THREE from 'three';
import { makePs1Material } from './materials';
import { toPs1Texture } from './textures';
import { InstanceBatch } from './batch';

/**
 * Blob shadows (PLAN §2: no real shadows). One shared unit quad + material; each blob is a Mesh
 * scaled to radius. Position it at the ground under the character each render frame:
 * `blob.position.set(x, groundY + BLOB_LIFT, z)`.
 */

/** Lift above the ground plane, in meters (polygonOffset handles most z-fighting; this covers the rest). */
export const BLOB_LIFT = 0.02;

let sharedGeo: THREE.PlaneGeometry | null = null;
let sharedMat: THREE.Material | null = null;
let batch: InstanceBatch | null = null;

/** 16px stepped radial falloff — chunky rings read better through the dither than a smooth gradient. */
function blobCanvas(size = 16): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - r) / r;
      const dy = (y + 0.5 - r) / r;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = d >= 1 ? 0 : Math.round((1 - d * d) * 4) / 4; // 4 steps
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function shared(): { geo: THREE.PlaneGeometry; mat: THREE.Material } {
  if (!sharedGeo) {
    sharedGeo = new THREE.PlaneGeometry(2, 2); // unit radius
    sharedGeo.rotateX(-Math.PI / 2);
  }
  if (!sharedMat) {
    const tex = toPs1Texture(blobCanvas());
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = makePs1Material({ map: tex, lit: false, transparent: true, opacity: 0.6 });
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    sharedMat = m;
  }
  return { geo: sharedGeo, mat: sharedMat };
}

/**
 * A dark ground blob of `radius` meters. The returned Mesh is an undrawn proxy: position/scale/visible work as
 * usual and every live blob is drawn as ONE InstancedMesh (see ./batch).
 */
export function createBlobShadow(radius = 0.45): THREE.Mesh {
  const { geo, mat } = shared();
  batch ??= new InstanceBatch(geo, mat, 'blobShadow', 1, 64);
  const mesh = batch.proxy();
  mesh.scale.set(radius, 1, radius);
  mesh.name = 'blobShadow';
  return mesh;
}
