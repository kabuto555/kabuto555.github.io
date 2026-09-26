/**
 * Local port of three r170 `SkeletonUtils.clone` — the `three/addons/utils/
 * SkeletonUtils.js` addon is not on WIM's publish allowlist.
 *
 * `Object3D.clone()` alone leaves cloned SkinnedMeshes bound to the SOURCE
 * bones, so every instance would animate together. This rebinds each cloned
 * SkinnedMesh to a cloned skeleton whose bones are the matching cloned nodes.
 */
type Object3D = import('three').Object3D;
type SkinnedMesh = import('three').SkinnedMesh;
type Bone = import('three').Bone;

function parallelTraverse(a: Object3D, b: Object3D, callback: (a: Object3D, b: Object3D) => void): void {
  callback(a, b);
  for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i], callback);
}

export function cloneSkinned<T extends Object3D>(source: T): T {
  const sourceLookup = new Map<Object3D, Object3D>();
  const cloneLookup = new Map<Object3D, Object3D>();
  const clone = source.clone() as T;

  parallelTraverse(source, clone, (sourceNode, clonedNode) => {
    sourceLookup.set(clonedNode, sourceNode);
    cloneLookup.set(sourceNode, clonedNode);
  });

  clone.traverse((node) => {
    if (!(node as SkinnedMesh).isSkinnedMesh) return;
    const clonedMesh = node as SkinnedMesh;
    const sourceMesh = sourceLookup.get(node) as SkinnedMesh;
    clonedMesh.skeleton = sourceMesh.skeleton.clone();
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);
    clonedMesh.skeleton.bones = sourceMesh.skeleton.bones.map((bone) => cloneLookup.get(bone) as Bone);
    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
  });

  return clone;
}
