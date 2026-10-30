import * as THREE from 'three';
import { Layer, type Collider } from './types';

const LAYER_COLORS: Array<[number, number]> = [
  [Layer.Trigger, 0x40ff60],
  [Layer.Barrier, 0xff40ff],
  [Layer.Prop, 0xffd040],
  [Layer.World, 0x40e0ff],
];

/**
 * F9 overlay: every collider AABB as wireframe edges, merged into ONE LineSegments draw.
 * Colors: world cyan, barrier magenta, prop yellow, trigger green. Rebuild after level changes.
 * Kept out of physics/index so sim code stays three-free.
 */
export function createColliderDebugMesh(colliders: Iterable<Collider>): THREE.LineSegments {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const k of colliders) {
    const { min: a, max: b } = k.aabb;
    const hex = LAYER_COLORS.find(([l]) => (k.layer & l) !== 0)?.[1] ?? 0xffffff;
    c.setHex(hex);
    const v = [
      [a.x, a.y, a.z], [b.x, a.y, a.z], [b.x, a.y, b.z], [a.x, a.y, b.z],
      [a.x, b.y, a.z], [b.x, b.y, a.z], [b.x, b.y, b.z], [a.x, b.y, b.z],
    ] as const;
    const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    for (const i of e) {
      const p = v[i]!;
      pos.push(p[0], p[1], p[2]);
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true, fog: false, transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = 'colliderDebug';
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  return lines;
}
