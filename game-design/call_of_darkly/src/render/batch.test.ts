import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstanceBatch } from './batch';
import { disposeSkeletons, skinMeshes } from './skin';

describe('InstanceBatch', () => {
  it('draws only visible in-scene proxies and grows past capacity', () => {
    const b = new InstanceBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 't', 0, 2);
    const scene = new THREE.Scene();
    const ps = Array.from({ length: 5 }, (_, i) => {
      const p = b.proxy();
      p.position.set(i, 0, 0);
      scene.add(p);
      return p;
    });
    b.proxy(); // detached: skipped
    ps[1]!.visible = false;
    scene.updateMatrixWorld();
    b.flush(scene);
    expect(b.count).toBe(4);
    expect(b.mesh.parent).toBe(scene);
    b.dispose();
    expect(b.mesh.parent).toBeNull();
    const m = new THREE.Matrix4();
    b.mesh.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(2);
  });
});

describe('skinMeshes', () => {
  it('merges per-bone meshes of one material into a single skinned mesh', () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.position.y = 1;
    root.add(arm);
    const mat = new THREE.MeshBasicMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    root.add(a);
    arm.add(c);
    const out = skinMeshes(root, [a, c], 'test');
    expect(out).toHaveLength(1);
    expect(out[0]!.mesh.skeleton.bones).toHaveLength(2);
    expect(root.children.filter((o) => (o as THREE.Mesh).isMesh)).toHaveLength(1);
  });

  it('disposeSkeletons disposes each per-enemy skeleton once and leaves shared geometry alone', () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    root.add(arm);
    const mat = new THREE.MeshBasicMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    root.add(a);
    arm.add(c);
    const out = skinMeshes(root, [a, c], 'test-dispose');
    const sk = out[0]!.mesh.skeleton;
    let skDisposed = 0;
    sk.dispose = () => void skDisposed++;
    let geoDisposed = 0;
    out[0]!.mesh.geometry.addEventListener('dispose', () => geoDisposed++);
    disposeSkeletons(root);
    expect(skDisposed).toBe(1);
    expect(geoDisposed).toBe(0);
  });
});
