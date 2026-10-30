import * as THREE from 'three';
import type { Vec3Like } from '../core/types';
import { makePs1Material } from '../render';
import { makeDecalTexture } from './tex';

declare module '../core/events' {
  interface EventMap {
    /** A hitscan bullet struck world geometry (combat should emit this; fx falls back to its own raycast until it sees one). */
    bulletImpact: { pos: Vec3Like; normal: Vec3Like; surface?: 'stone' | 'wood' | 'metal' | 'dirt' | 'flesh'; /** Hit a door/prop that moves: no decal. */ dynamic?: boolean };
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _o = new THREE.Object3D();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();

/** Ring-buffer bullet decals: one InstancedMesh, oldest recycled. */
export class DecalPool {
  readonly mesh: THREE.InstancedMesh;
  /** Number of decals ever placed, mod capacity = next slot. */
  next = 0;
  /** Live count (<= capacity). */
  count = 0;

  constructor(readonly capacity = 64) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = makePs1Material({ map: makeDecalTexture(), color: 0x15130f, lit: false, alphaTest: 0.5, snap: false, side: THREE.DoubleSide });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-decals';
    this.clear();
  }

  add(p: Vec3Like, n: Vec3Like, size: number, roll: number): void {
    _n.set(n.x, n.y, n.z);
    if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0);
    _n.normalize();
    _q.setFromUnitVectors(_z, _n);
    _o.quaternion.copy(_q);
    _o.rotateZ(roll);
    _o.position.set(p.x + _n.x * 0.012, p.y + _n.y * 0.012, p.z + _n.z * 0.012);
    _o.scale.set(size, size, 1);
    _o.updateMatrix();
    this.mesh.setMatrixAt(this.next, _o.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.next = (this.next + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.next = 0;
    this.count = 0;
  }
}

/** Pooled cube puffs (sparks / dust / blood): one InstancedMesh, scale shrinks over life. */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private cursor = 0;
  alive = 0;
  private readonly col = new THREE.Color();

  constructor(readonly capacity = 128, private readonly rand: () => number = Math.random) {
    const mat = makePs1Material({ color: 0xffffff, lit: false, snap: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-particles';
    const n = capacity;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, this.col.set(0xffffff));
    }
  }

  /** Burst `n` cubes around `p`, biased along `dir` (normal). Recycles the oldest slots when full. */
  burst(p: Vec3Like, dir: Vec3Like, n: number, color: number, speed: number, size: number, life: number, gravity: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const r = this.rand;
      this.px[i] = p.x;
      this.py[i] = p.y;
      this.pz[i] = p.z;
      this.vx[i] = (dir.x * 0.8 + (r() - 0.5)) * speed;
      this.vy[i] = (dir.y * 0.8 + (r() - 0.3)) * speed;
      this.vz[i] = (dir.z * 0.8 + (r() - 0.5)) * speed;
      this.maxLife[i] = this.life[i] = life * (0.6 + r() * 0.6);
      this.size[i] = size * (0.7 + r() * 0.6);
      this.grav[i] = gravity;
      this.mesh.setColorAt(i, this.col.set(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = this.life[i]! - dt;
      if (this.life[i]! <= 0) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      alive++;
      this.vy[i] = this.vy[i]! - this.grav[i]! * dt;
      const drag = Math.max(0, 1 - 3 * dt);
      this.vx[i] = this.vx[i]! * drag;
      this.vz[i] = this.vz[i]! * drag;
      this.px[i] = this.px[i]! + this.vx[i]! * dt;
      this.py[i] = this.py[i]! + this.vy[i]! * dt;
      this.pz[i] = this.pz[i]! + this.vz[i]! * dt;
      const s = this.size[i]! * (this.life[i]! / this.maxLife[i]!);
      _o.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      _o.quaternion.identity();
      _o.scale.set(s, s, s);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    if (alive > 0 || this.alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
  }
}

const SURF_COLOR: Record<string, number> = { stone: 0x9a948a, wood: 0x7a5a38, metal: 0xffd890, dirt: 0x6a5238, flesh: 0x8a1a14 };

/** Spawn the full impact: decal (not on flesh) + sparks/dust. */
export function spawnImpact(decals: DecalPool, parts: ParticlePool, pos: Vec3Like, normal: Vec3Like, surface: string | undefined, rand: () => number = Math.random, dynamic = false): void {
  const s = surface ?? 'stone';
  if (s !== 'flesh' && !dynamic) decals.add(pos, normal, 0.07 + rand() * 0.06, rand() * Math.PI * 2);
  if (s === 'metal') {
    parts.burst(pos, normal, 4, 0xffd890, 3.2, 0.025, 0.18, 9);
  } else {
    parts.burst(pos, normal, 4, SURF_COLOR[s] ?? SURF_COLOR.stone!, 1.2, 0.05, 0.4, 1.5);
    parts.burst(pos, normal, 2, 0xffd890, 3, 0.02, 0.12, 9);
  }
}

/** Enemy body hit: small dark-red (or grey if blocked) puff. */
export function spawnBodyHit(parts: ParticlePool, pos: Vec3Like, dir: Vec3Like, blocked: boolean): void {
  if (blocked) parts.burst(pos, dir, 4, 0xffd890, 3, 0.025, 0.14, 9);
  else parts.burst(pos, dir, 5, SURF_COLOR.flesh!, 1.6, 0.06, 0.35, 5);
}
