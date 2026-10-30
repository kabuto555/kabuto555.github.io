import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapse a rig's many per-bone meshes into one SkinnedMesh per material (rigid, weight-1 skinning).
 * The existing pivot Groups ARE the bones (nothing about how animators drive them changes); each source mesh's
 * geometry is baked into `root` space once per `key` and cached, so spawning another enemy of the same
 * archetype only builds a Skeleton. A hollow: ~13 draw calls -> 2 (body + eyes). PS1 snap/affine still apply
 * (the ps1 patch hooks project_vertex, which runs after skinning).
 *
 * Preconditions: `root` is at its rest pose (bone inverses are taken from it now) and every mesh's parent
 * is a pivot under `root`. Meshes whose own transform/visibility is animated must not be passed in.
 * Returns [] and leaves the rig untouched if geometries cannot be merged.
 */
export interface SkinResult {
  mesh: THREE.SkinnedMesh;
  material: THREE.Material;
}

interface Entry {
  geos: THREE.BufferGeometry[];
  bones: number;
}
const cache = new Map<string, Entry>();
const _rel = new THREE.Matrix4();

function boneIndexOf(meshes: readonly THREE.Mesh[]): { bones: THREE.Object3D[]; idx: Map<THREE.Object3D, number> } {
  const bones: THREE.Object3D[] = [];
  const idx = new Map<THREE.Object3D, number>();
  for (const m of meshes) {
    const b = m.parent!;
    if (!idx.has(b)) {
      idx.set(b, bones.length);
      bones.push(b);
    }
  }
  return { bones, idx };
}

function bake(list: THREE.Mesh[], root: THREE.Object3D, idx: Map<THREE.Object3D, number>): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const m of list) {
    _rel.identity();
    for (let o: THREE.Object3D | null = m; o && o !== root; o = o.parent) {
      o.updateMatrix();
      _rel.premultiply(o.matrix);
    }
    const g = m.geometry.clone();
    g.applyMatrix4(_rel);
    const n = g.getAttribute('position').count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const b = idx.get(m.parent!)!;
    for (let i = 0; i < n; i++) {
      si[i * 4] = b;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (merged) merged.computeBoundingSphere();
  return merged;
}

/** Dispose every per-enemy Skeleton (boneTexture) under `root`. Never touches the shared cached geometry. */
export function disposeSkeletons(root: THREE.Object3D): void {
  const seen = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && sk && !seen.has(sk)) {
      seen.add(sk);
      sk.dispose();
    }
  });
}

export function skinMeshes(root: THREE.Object3D, meshes: readonly THREE.Mesh[], key: string): SkinResult[] {
  if (meshes.length === 0) return [];
  root.updateMatrixWorld(true);
  const { bones, idx } = boneIndexOf(meshes);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const m of meshes) {
    const mat = m.material as THREE.Material;
    const l = groups.get(mat);
    if (l) l.push(m);
    else groups.set(mat, [m]);
  }
  let entry = cache.get(key);
  if (!entry) {
    const geos: THREE.BufferGeometry[] = [];
    for (const list of groups.values()) {
      const g = bake(list, root, idx);
      if (!g) {
        console.warn(`[skin] "${key}": mergeGeometries failed; rig left as separate meshes.`);
        for (const x of geos) x.dispose();
        return [];
      }
      geos.push(g);
    }
    entry = { geos, bones: bones.length };
    cache.set(key, entry);
  } else if (entry.geos.length !== groups.size || entry.bones !== bones.length) {
    console.warn(`[skin] "${key}": rig structure differs from the cached one; left as separate meshes.`);
    return [];
  }

  const skeleton = new THREE.Skeleton(bones as unknown as THREE.Bone[]);
  const out: SkinResult[] = [];
  let gi = 0;
  for (const [material, list] of groups) {
    const geo = entry.geos[gi++]!;
    const sm = new THREE.SkinnedMesh(geo, material);
    sm.name = `skin:${key}`;
    sm.renderOrder = list[0]!.renderOrder;
    const s = geo.boundingSphere!;
    // Conservative: limbs swing/fall away from the rest pose the sphere was baked in.
    sm.boundingSphere = new THREE.Sphere(s.center.clone(), s.radius * 1.35 + 0.4);
    root.add(sm);
    sm.bind(skeleton, root.matrixWorld);
    out.push({ mesh: sm, material });
  }
  for (const m of meshes) m.removeFromParent();
  return out;
}
