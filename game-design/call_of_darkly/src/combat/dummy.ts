import * as THREE from 'three';
import type { DamageEvent, Health, Poise, Transform } from '../core/entity';
import { makeBoxGeometry, makePs1Material } from '../render';
import { getTexture } from '../render/textures';
import { hitsFront } from './math';
import { HUMANOID_SHAPE, type HitShape, type HitTarget } from './targets';
import type { DamageResult } from './types';

let nextId = 9000;

export interface DummyOptions {
  x: number;
  z: number;
  /** Facing yaw (0 = -Z). */
  yaw?: number;
  hp?: number;
  /** Frontal riot-shield plate: blocks body hits from the front (head still hittable). */
  shield?: boolean;
  label?: string;
  /** Seconds after the last hit (or death) before the dummy resets. */
  resetAfter?: number;
}

/** Training dummy: health, hit flash, falls on death, resets after a few seconds. */
export class TrainingDummy implements HitTarget {
  readonly id = nextId++;
  readonly team = 'enemy' as const;
  readonly transform: Transform;
  readonly health: Health;
  readonly poise: Poise = { current: 0, max: 0 };
  readonly hit: HitShape = HUMANOID_SHAPE;
  readonly group = new THREE.Group();
  readonly label: string;
  readonly shielded: boolean;
  private readonly body: THREE.Group;
  private readonly mats: THREE.MeshLambertMaterial[] = [];
  private flash = 0;
  private flashBlue = false;
  private sinceHit = 0;
  private fall = 0;
  private readonly resetAfter: number;
  /** Total hits taken since last reset (debug/tests). */
  hits = 0;

  constructor(o: DummyOptions) {
    const hp = o.hp ?? 150;
    this.health = { hp, maxHp: hp };
    this.transform = { position: { x: o.x, y: 0, z: o.z }, yaw: o.yaw ?? 0 };
    this.label = o.label ?? 'dummy';
    this.shielded = !!o.shield;
    this.resetAfter = o.resetAfter ?? 4;
    this.group.position.set(o.x, 0, o.z);
    this.group.rotation.y = this.transform.yaw;
    this.body = new THREE.Group();
    this.group.add(this.body);

    const wood = getTexture('wood', 32, 5);
    const metal = getTexture('metal', 32, 3);
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, tex: THREE.Texture) => {
      const m = makePs1Material({ map: tex, color }) as THREE.MeshLambertMaterial;
      this.mats.push(m);
      const mesh = new THREE.Mesh(makeBoxGeometry(w, h, d, { tile: 0.5 }), m);
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      return mesh;
    };
    mk(0.5, 0.06, 0.5, 0, 0.03, 0, 0x6a5a48, wood); // base
    mk(0.1, 0.7, 0.1, 0, 0.4, 0, 0x7a6850, wood); // post
    mk(0.2, 0.3, 0.16, 0, 0.78, 0, 0x7a6850, wood); // pelvis
    mk(0.56, 0.62, 0.26, 0, 1.2, 0, 0xc9a96a, wood); // torso (burlap)
    mk(0.14, 0.5, 0.14, -0.36, 1.18, 0, 0xc9a96a, wood); // arms
    mk(0.14, 0.5, 0.14, 0.36, 1.18, 0, 0xc9a96a, wood);
    mk(0.3, 0.3, 0.3, 0, 1.62, 0, 0xd8b878, wood); // head
    mk(0.32, 0.06, 0.32, 0, 1.78, 0, 0xb83a2e, wood); // red band: "headshot here"
    if (this.shielded) mk(0.9, 1.15, 0.07, 0, 1.0, -0.26, 0x4a5058, metal); // riot plate, chest down
  }

  get alive(): boolean {
    return this.health.hp > 0;
  }

  /** True if this hit is stopped by the frontal plate. */
  guards(dir: { x: number; y: number; z: number }, e: DamageEvent): boolean {
    if (!this.shielded || e.headshot) return false;
    const y = this.transform.yaw;
    return hitsFront(dir.x, dir.z, -Math.sin(y), -Math.cos(y));
  }

  applyDamage(e: DamageEvent): DamageResult {
    if (!this.alive) return { dealt: 0, blocked: false, poiseBroken: false, killed: false };
    this.sinceHit = 0;
    this.hits++;
    if (e.dir && this.guards(e.dir, e)) {
      this.flash = 0.12;
      this.flashBlue = true;
      return { dealt: 0, blocked: true, poiseBroken: false, killed: false };
    }
    const dealt = Math.min(this.health.hp, e.amount);
    this.health.hp -= dealt;
    this.flash = 0.1;
    this.flashBlue = false;
    const killed = this.health.hp <= 0;
    return { dealt, blocked: false, poiseBroken: false, killed };
  }

  reset(): void {
    this.health.hp = this.health.maxHp;
    this.fall = 0;
    this.sinceHit = 0;
    this.hits = 0;
    this.body.rotation.x = 0;
  }

  update(dt: number): void {
    this.sinceHit += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    const e = this.flash > 0 ? (this.flashBlue ? 0x2050a0 : 0xa02010) : 0x000000;
    for (const m of this.mats) m.emissive.setHex(e);
    if (!this.alive) {
      this.fall = Math.min(1, this.fall + dt / 0.25);
      this.body.rotation.x = this.fall * (Math.PI / 2) * 0.95; // tips backward
    }
    if (this.sinceHit >= this.resetAfter && (this.health.hp < this.health.maxHp || this.fall > 0)) this.reset();
  }
}
