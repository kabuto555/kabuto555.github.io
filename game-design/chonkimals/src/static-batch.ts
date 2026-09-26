/**
 * Static batching — after everything has loaded, merge the stage's many small
 * visual-only meshes (boulders, props, barricades, tents…) into one mesh per
 * material per chunk. Hundreds of draw calls (twice, with the shadow pass) become
 * a few dozen; the look is identical.
 *
 * Only safe meshes are merged: not walkable (collision raycasts need those as-is),
 * not water / animated / transparent / skinned / instanced, not the dodgeball
 * court's toggled balls (zone_*), not anything flagged `userData.noBatch` (runtime props that
 * animate: mailbox flag/door, canteen sign). Run it LAST in init, after every system has
 * looked up the meshes it needs by name.
 */
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Material = import('three').Material;
type BufferGeometry = import('three').BufferGeometry;

const SKIP_NAME = /water|fall|foam|mist|sheet|streak|crest|splash|zone_|marker|socket/i;

/** Merge static meshes under each chunk of `stageRoot`; returns how many meshes were folded away. */
export function batchStatic(scene: import('three').Scene, stageRoot: Object3D, walkable: readonly Mesh[]): number {
  const keep = new Set<Object3D>(walkable);
  stageRoot.updateMatrixWorld(true);
  let folded = 0;
  for (const chunk of stageRoot.children) {
    const groups = new Map<string, { mat: Material; cast: boolean; meshes: Mesh[] }>();
    chunk.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || keep.has(m) || !m.visible || SKIP_NAME.test(m.name) || m.userData.noBatch) return;
      if ((m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
      if (Array.isArray(m.material)) return;
      const mat = m.material as Material;
      if (mat.transparent || !/^Mesh(Standard|Physical|Lambert|Phong|Basic)Material$/.test(mat.type)) return;
      if (m.geometry.morphAttributes && Object.keys(m.geometry.morphAttributes).length) return;
      const attrs = Object.keys(m.geometry.attributes).sort().join(',') + (m.geometry.index ? '|i' : '|n');
      const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${attrs}`;
      let g = groups.get(key);
      if (!g) { g = { mat, cast: m.castShadow, meshes: [] }; groups.set(key, g); }
      g.meshes.push(m);
    });
    for (const g of groups.values()) {
      if (g.meshes.length < 2) continue;
      const geos: BufferGeometry[] = g.meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
      const merged = mergeGeometries(geos, false);
      geos.forEach((geo) => geo.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const batch = new THREE.Mesh(merged, g.mat);
      batch.name = `batch_${chunk.name}_${g.mat.name || 'mat'}`;
      batch.castShadow = g.cast;
      batch.receiveShadow = g.meshes[0].receiveShadow;
      batch.matrixAutoUpdate = false; // baked in world space
      scene.add(batch);
      for (const m of g.meshes) m.removeFromParent();
      folded += g.meshes.length - 1;
    }
  }
  return folded;
}

/**
 * Merge a static group's meshes (e.g. a fence of hundreds of posts and rails) into one
 * mesh per material, in place. Returns how many meshes were folded away.
 */
export function mergeGroup(group: Object3D | undefined): number {
  if (!group) return 0;
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const byMat = new Map<string, { mat: Material; cast: boolean; meshes: Mesh[] }>();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible || Array.isArray(m.material)) return;
    if ((m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    const attrs = Object.keys(m.geometry.attributes).sort().join(',') + (m.geometry.index ? '|i' : '|n');
    const key = `${(m.material as Material).uuid}|${m.castShadow ? 1 : 0}|${attrs}`;
    let g = byMat.get(key);
    if (!g) { g = { mat: m.material as Material, cast: m.castShadow, meshes: [] }; byMat.set(key, g); }
    g.meshes.push(m);
  });
  let folded = 0;
  for (const g of byMat.values()) {
    if (g.meshes.length < 2) continue;
    const geos = g.meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld.clone().premultiply(toLocal)));
    const merged = mergeGeometries(geos, false);
    geos.forEach((geo) => geo.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const batch = new THREE.Mesh(merged, g.mat);
    batch.name = `${group.name}_batch`;
    batch.castShadow = g.cast;
    batch.receiveShadow = true;
    for (const m of g.meshes) m.removeFromParent();
    group.add(batch);
    folded += g.meshes.length - 1;
  }
  return folded;
}
