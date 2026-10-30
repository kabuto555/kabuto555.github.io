import * as THREE from 'three';

/**
 * Proxy-driven instancing. Gameplay code keeps animating plain scene-graph objects ("proxies": position,
 * scale, quaternion, visible, parenting all work as usual) but the proxy itself is never drawn (it sits on a
 * layer no camera sees). Once per frame — after matrices are updated, before the main pass — every live,
 * visible, in-scene proxy's matrixWorld is copied into one shared InstancedMesh = ONE draw call per batch.
 * Proxies are held weakly, so dropped pickups/enemies need no explicit unregister.
 */

/** Layer nothing renders / raycasts (cameras use layer 0). */
const HIDDEN_LAYER = 30;
const batches: InstanceBatch[] = [];

export class InstanceBatch {
  mesh: THREE.InstancedMesh;
  private readonly refs: WeakRef<THREE.Object3D>[] = [];
  private capacity: number;
  /** Instances drawn last flush (debug / tests). */
  count = 0;

  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly name: string,
    private readonly renderOrder = 0,
    capacity = 32,
  ) {
    this.capacity = capacity;
    this.mesh = this.makeMesh();
    batches.push(this);
  }

  private makeMesh(): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    m.name = `batch:${this.name}`;
    m.frustumCulled = false; // instances are scattered; per-instance culling would cost more than it saves
    m.renderOrder = this.renderOrder;
    m.count = 0;
    return m;
  }

  /** Unregister from the module list and free the instance buffer (geometry/material are the caller's). */
  dispose(): void {
    const i = batches.indexOf(this);
    if (i >= 0) batches.splice(i, 1);
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.refs.length = 0;
    this.count = 0;
  }

  /** A new undrawn proxy mesh (shares geometry/material for type-compat). Add it to the scene graph and animate it. */
  proxy(): THREE.Mesh {
    const p = new THREE.Mesh(this.geometry, this.material);
    p.layers.set(HIDDEN_LAYER);
    p.frustumCulled = false;
    p.name = `proxy:${this.name}`;
    this.refs.push(new WeakRef(p));
    return p;
  }

  /** Copy every live visible proxy's world matrix into the instance buffer. Call after scene.updateMatrixWorld(). */
  flush(scene: THREE.Scene): void {
    const refs = this.refs;
    let n = 0;
    let w = 0;
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]!;
      const o = ref.deref();
      if (!o) continue;
      refs[w++] = ref;
      let a: THREE.Object3D | null = o;
      while (a && a.visible && a !== scene) a = a.parent;
      if (a !== scene) continue; // hidden somewhere up the chain, or detached
      if (n >= this.capacity) this.grow(scene, n + 1);
      this.mesh.setMatrixAt(n++, o.matrixWorld);
    }
    refs.length = w;
    this.count = n;
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.parent !== scene) scene.add(this.mesh);
    }
    this.mesh.visible = n > 0;
  }

  private grow(scene: THREE.Scene, need: number): void {
    const old = this.mesh;
    const keep = old.instanceMatrix.array as Float32Array;
    while (this.capacity < need) this.capacity *= 2;
    this.mesh = this.makeMesh();
    (this.mesh.instanceMatrix.array as Float32Array).set(keep);
    old.removeFromParent();
    old.dispose();
    scene.add(this.mesh);
  }
}

/** Flush all batches (called by the pipeline each frame). */
export function flushInstanceBatches(scene: THREE.Scene): void {
  for (let i = 0; i < batches.length; i++) batches[i]!.flush(scene);
}
