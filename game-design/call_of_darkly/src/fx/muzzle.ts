import * as THREE from 'three';
import { makePs1Material } from '../render';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _o = new THREE.Object3D();

/** Brief point light; created once at init (constant light count -> no shader recompiles). */
export class MuzzleLight {
  readonly light = new THREE.PointLight(0xffb060, 0, 9, 2);
  private t = 0;
  private peak = 0;
  constructor() {
    this.light.name = 'fx-muzzle-light';
  }
  flash(x: number, y: number, z: number, intensity: number): void {
    this.light.position.set(x, y, z);
    this.peak = intensity;
    this.t = 0.06;
    this.light.intensity = intensity;
  }
  update(dt: number): void {
    if (this.t <= 0) return;
    this.t -= dt;
    this.light.intensity = this.t > 0 ? this.peak * (this.t / 0.06) : 0;
  }
}

/** Pooled ejected casings (tiny boxes + gravity + one floor bounce), single InstancedMesh. */
export class ShellPool {
  readonly mesh: THREE.InstancedMesh;
  alive = 0;
  private cursor = 0;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly life: Float32Array;
  private readonly floor: Float32Array;

  constructor(readonly capacity = 24, private readonly rand: () => number = Math.random) {
    const mat = makePs1Material({ color: 0xc89a3a, lit: false, snap: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.045), mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-shells';
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.floor = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, ZERO);
  }

  /** Eject from world pos with base velocity (right/up in world space). Recycles oldest when full. */
  eject(x: number, y: number, z: number, vx: number, vy: number, vz: number, floorY: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const r = this.rand;
    const j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx + (r() - 0.5) * 0.6;
    this.v[j + 1] = vy + (r() - 0.5) * 0.6;
    this.v[j + 2] = vz + (r() - 0.5) * 0.6;
    this.rot[j] = r() * 6; this.rot[j + 1] = r() * 6; this.rot[j + 2] = r() * 6;
    this.spin[j] = (r() - 0.5) * 30; this.spin[j + 1] = (r() - 0.5) * 30; this.spin[j + 2] = (r() - 0.5) * 30;
    this.life[i] = 1.4;
    this.floor[i] = floorY;
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
      const j = i * 3;
      const moving = this.v[j + 1]! !== 0 || Math.abs(this.v[j]!) > 0.01;
      if (moving) {
        this.v[j + 1] = this.v[j + 1]! - 9.8 * dt;
        this.p[j] = this.p[j]! + this.v[j]! * dt;
        this.p[j + 1] = this.p[j + 1]! + this.v[j + 1]! * dt;
        this.p[j + 2] = this.p[j + 2]! + this.v[j + 2]! * dt;
        if (this.p[j + 1]! < this.floor[i]!) {
          this.p[j + 1] = this.floor[i]!;
          if (Math.abs(this.v[j + 1]!) < 0.8) {
            this.v[j] = this.v[j + 1] = this.v[j + 2] = 0;
            this.spin[j] = this.spin[j + 1] = this.spin[j + 2] = 0;
          } else {
            this.v[j + 1] = -this.v[j + 1]! * 0.35;
            this.v[j] = this.v[j]! * 0.5;
            this.v[j + 2] = this.v[j + 2]! * 0.5;
          }
        }
        this.rot[j] = this.rot[j]! + this.spin[j]! * dt;
        this.rot[j + 1] = this.rot[j + 1]! + this.spin[j + 1]! * dt;
        this.rot[j + 2] = this.rot[j + 2]! + this.spin[j + 2]! * dt;
      }
      _o.position.set(this.p[j]!, this.p[j + 1]!, this.p[j + 2]!);
      _o.rotation.set(this.rot[j]!, this.rot[j + 1]!, this.rot[j + 2]!);
      _o.scale.setScalar(this.life[i]! < 0.25 ? this.life[i]! * 4 : 1);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    if (alive > 0 || this.alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
  }
}
