// Enemy-fired world hazards, all pooled (no per-tick allocation): crossbow bolts, thrown molotov
// bottles + their fire pools, and rolling barrels. Every hit on the player goes through
// combat.hitPlayer (i-frames / shield resolved there). Owned by AiSystem (`ai.hazards`).
import * as THREE from 'three';
import { splashDamage, GRENADE_TUNING } from '../combat/grenades';
import { newBulletHit, castBullet, type BulletHit } from '../combat/hitscan';
import { DamageType } from '../core/entity';
import type { EventBus } from '../core/events';
import type { Vec3Like } from '../core/types';
import { GRENADES } from '../data/items';
import type { EnemyAttackDef } from '../data/types';
import { Layer, type CollisionWorld, type Ray, type RayHit } from '../physics/types';
import type { AiCombat, AiTarget } from './enemy';
import { createBarrelMesh, createBoltMesh, createBottleMesh } from './models';

declare module './enemy' {
  interface AiShared {
    /** Pooled bolts / bottles / fire / rolling barrels (set by AiSystem). */
    hazards: AiHazards;
  }
}

declare module '../core/events' {
  interface EventMap {
    /** A rolling barrel connected: the player controller may play a knockdown. */
    playerKnockdown: { sourceId: number; dir: Vec3Like; duration: number };
    /** A rolling barrel finished (wall / end of path). */
    barrelBroke: { pos: Vec3Like };
  }
}

export const HAZARD_TUNING = {
  bolts: 12,
  bottles: 8,
  fires: 6,
  barrels: 4,
  boltLife: 4,
  boltRadius: 0.22,
  bottleRadius: 0.35,
  /** Player body used for projectile / barrel overlap (feet-based). */
  playerRadius: 0.35,
  playerHeight: 1.8,
  /** Molotov fire pool (grenades molotov dot as base). */
  fireRadius: 2.5,
  barrelRadius: 0.5,
  barrelSpeed: 6.5,
  barrelAccel: 5,
  barrelDamage: 45,
  barrelPoise: 100,
  barrelKnockdown: 1.3,
  barrelBreakTime: 0.35,
} as const;

// ------------------------------------------------------------------ pure aim helpers (unit-tested)

/**
 * Where to aim at a moving target: `to + vel * flightTime * lead`, flight time from straight-line
 * distance / speed (iterated twice), lead distance capped at `maxLead` m. `lead` < 1 is deliberate
 * under-leading (§9 leniency: moving laterally still dodges).
 */
export function leadPoint(
  from: Vec3Like,
  to: Vec3Like,
  velX: number,
  velZ: number,
  speed: number,
  lead: number,
  maxLead: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  let t = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / speed;
  let ox = 0;
  let oz = 0;
  for (let i = 0; i < 2; i++) {
    ox = velX * t * lead;
    oz = velZ * t * lead;
    const l = Math.hypot(ox, oz);
    if (l > maxLead) {
      ox *= maxLead / l;
      oz *= maxLead / l;
    }
    t = Math.hypot(to.x + ox - from.x, to.y - from.y, to.z + oz - from.z) / speed;
  }
  out.x = to.x + ox;
  out.y = to.y;
  out.z = to.z + oz;
  return out;
}

/**
 * Launch velocity for a gravity arc from `from` to `to` at (at least) `speed`: the low arc, or when
 * out of range the slowest speed that reaches (min-energy arc). Returns the flight time.
 */
export function solveLob(from: Vec3Like, to: Vec3Like, speed: number, g: number, out: { x: number; y: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const h = to.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) {
    out.x = out.z = 0;
    out.y = Math.sqrt(2 * g * Math.max(0.5, h + 0.5));
    return out.y / g;
  }
  let v2 = speed * speed;
  const need = g * (h + Math.sqrt(h * h + d * d)); // min v² to reach
  if (v2 < need) v2 = need * 1.02;
  const disc = Math.max(0, v2 * v2 - g * (g * d * d + 2 * h * v2));
  const tanT = (v2 - Math.sqrt(disc)) / (g * d);
  const cosT = 1 / Math.sqrt(1 + tanT * tanT);
  const v = Math.sqrt(v2);
  const hs = v * cosT;
  out.x = (dx / d) * hs;
  out.z = (dz / d) * hs;
  out.y = v * cosT * tanT;
  return d / hs;
}

// ------------------------------------------------------------------ pool slots

interface Shot {
  active: boolean;
  kind: 0 | 1; // 0 bolt, 1 bottle
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  age: number;
  damage: number;
  poise: number;
  splash: number;
  ownerId: number;
  weaponId: string;
  mesh: THREE.Object3D | null;
}

interface Fire {
  active: boolean;
  x: number;
  y: number;
  z: number;
  radius: number;
  dps: number;
  life: number;
  tick: number;
  ownerId: number;
  mesh: THREE.Mesh | null;
}

export interface BarrelSlot {
  /** 0 free, 1 staged (at rest in front of the hollow), 2 rolling, 3 breaking. */
  phase: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  rot: number;
  /** Waypoints (XZ) after the start; the barrel breaks on reaching the last. */
  wx: Float32Array;
  wz: Float32Array;
  wn: number;
  wi: number;
  breakT: number;
  /** One damaging contact per barrel (a dodged contact is spent too). */
  spent: boolean;
  ownerId: number;
  mesh: THREE.Object3D | null;
}

const MAX_WP = 8;
const _dir = { x: 0, y: 0, z: 1 };
const _org = { x: 0, y: 0, z: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const _ray: Ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: -1, z: 0 }, maxDist: 3 };
const _rh: RayHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, distance: 0, collider: null };

export interface AiHazardsOptions {
  world: CollisionWorld;
  combat: AiCombat;
  player: AiTarget;
  bus: EventBus;
  /** Omit for headless. */
  scene?: THREE.Object3D | null;
}

export class AiHazards {
  /** Smoothed player velocity (XZ, m/s) for target leading. */
  readonly playerVel = { x: 0, z: 0 };
  readonly shots: Shot[] = [];
  readonly fires: Fire[] = [];
  readonly barrels: BarrelSlot[] = [];
  private readonly hit: BulletHit = newBulletHit();
  private readonly group: THREE.Group | null;
  private lastPx = 0;
  private lastPz = 0;
  private velInit = false;
  private readonly o: AiHazardsOptions;

  constructor(o: AiHazardsOptions) {
    this.o = o;
    this.group = o.scene ? new THREE.Group() : null;
    const T = HAZARD_TUNING;
    const mk = (obj: THREE.Object3D | null): THREE.Object3D | null => {
      if (obj && this.group) {
        obj.visible = false;
        this.group.add(obj);
      }
      return obj;
    };
    const vis = !!this.group;
    for (let i = 0; i < T.bolts + T.bottles; i++) {
      const bolt = i < T.bolts;
      this.shots.push({
        active: false, kind: bolt ? 0 : 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, age: 0, damage: 0, poise: 0,
        splash: 0, ownerId: 0, weaponId: '', mesh: vis ? mk(bolt ? createBoltMesh() : createBottleMesh()) : null,
      });
    }
    for (let i = 0; i < T.fires; i++) {
      let mesh: THREE.Mesh | null = null;
      if (this.group) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 }));
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.fires.push({ active: false, x: 0, y: 0, z: 0, radius: 1, dps: 0, life: 0, tick: 0, ownerId: 0, mesh });
    }
    for (let i = 0; i < T.barrels; i++) {
      this.barrels.push({
        phase: 0, x: 0, y: 0, z: 0, dx: 0, dz: 1, speed: 0, rot: 0, wx: new Float32Array(MAX_WP), wz: new Float32Array(MAX_WP),
        wn: 0, wi: 0, breakT: 0, spent: false, ownerId: 0, mesh: vis ? mk(createBarrelMesh()) : null,
      });
    }
    if (this.group) o.scene!.add(this.group);
  }

  // ------------------------------------------------------------------ spawning

  /** Fire a slow bolt along `dir` (unit). Returns false when the pool is exhausted. */
  fireBolt(ownerId: number, a: EnemyAttackDef, from: Vec3Like, dir: Vec3Like): boolean {
    const s = this.claim(0);
    if (!s) return false;
    const sp = a.projectile?.speed ?? 18;
    s.x = from.x;
    s.y = from.y;
    s.z = from.z;
    s.vx = dir.x * sp;
    s.vy = dir.y * sp;
    s.vz = dir.z * sp;
    s.g = a.projectile?.gravity ?? 0.8;
    s.damage = a.damage;
    s.poise = a.poiseDamage;
    s.splash = 0;
    s.ownerId = ownerId;
    s.weaponId = a.id;
    return true;
  }

  /** Lob a molotov at `to` (arc solved from the attack's speed/gravity). Returns flight time or -1. */
  lobBottle(ownerId: number, a: EnemyAttackDef, from: Vec3Like, to: Vec3Like): number {
    const s = this.claim(1);
    if (!s) return -1;
    const pr = a.projectile!;
    const t = solveLob(from, to, pr.speed, pr.gravity, _vel);
    s.x = from.x;
    s.y = from.y;
    s.z = from.z;
    s.vx = _vel.x;
    s.vy = _vel.y;
    s.vz = _vel.z;
    s.g = pr.gravity;
    s.damage = a.damage;
    s.poise = a.poiseDamage;
    s.splash = pr.splashRadius ?? 3;
    s.ownerId = ownerId;
    s.weaponId = a.id;
    return t;
  }

  private claim(kind: 0 | 1): Shot | null {
    const arr = this.shots;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i]!;
      if (s.active || s.kind !== kind) continue;
      s.active = true;
      s.age = 0;
      if (s.mesh) s.mesh.visible = true;
      return s;
    }
    return null;
  }

  /** Put a barrel at rest at (x,y,z) (y = centre). Null when the pool is full. */
  stageBarrel(ownerId: number, x: number, y: number, z: number, yaw: number): BarrelSlot | null {
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i]!;
      if (b.phase !== 0) continue;
      b.phase = 1;
      b.x = x;
      b.y = y;
      b.z = z;
      b.dx = -Math.sin(yaw);
      b.dz = -Math.cos(yaw);
      b.speed = 0;
      b.rot = 0;
      b.wn = 0;
      b.wi = 0;
      b.spent = false;
      b.ownerId = ownerId;
      if (b.mesh) {
        b.mesh.visible = true;
        b.mesh.scale.setScalar(1);
      }
      this.syncBarrel(b);
      return b;
    }
    return null;
  }

  /** Release a staged barrel along `wps` (flat [x,z,x,z...]; empty: straight ahead `len` m). */
  launchBarrel(b: BarrelSlot, wps: ArrayLike<number>, len = 14): void {
    if (b.phase !== 1) return;
    let n = Math.min(MAX_WP, wps.length >> 1);
    for (let i = 0; i < n; i++) {
      b.wx[i] = wps[i * 2]!;
      b.wz[i] = wps[i * 2 + 1]!;
    }
    if (n === 0) {
      b.wx[0] = b.x + b.dx * len;
      b.wz[0] = b.z + b.dz * len;
      n = 1;
    }
    b.wn = n;
    b.wi = 0;
    b.speed = 1.2;
    b.spent = false;
    b.phase = 2;
  }

  /** Free a barrel slot (hollow despawned). */
  releaseBarrel(b: BarrelSlot): void {
    b.phase = 0;
    if (b.mesh) b.mesh.visible = false;
  }

  activeShots(kind?: 0 | 1): number {
    let n = 0;
    for (const s of this.shots) if (s.active && (kind === undefined || s.kind === kind)) n++;
    return n;
  }

  activeFires(): number {
    let n = 0;
    for (const f of this.fires) if (f.active) n++;
    return n;
  }

  clear(): void {
    for (const s of this.shots) this.killShot(s);
    for (const f of this.fires) {
      f.active = false;
      if (f.mesh) f.mesh.visible = false;
    }
    for (const b of this.barrels) this.releaseBarrel(b);
  }

  dispose(): void {
    this.clear();
    this.group?.parent?.remove(this.group);
  }

  // ------------------------------------------------------------------ tick

  update(dt: number): void {
    this.trackPlayer(dt);
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i]!;
      if (s.active) this.stepShot(s, dt);
    }
    this.stepFires(dt);
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i]!;
      if (b.phase >= 2) this.stepBarrel(b, dt);
    }
  }

  private trackPlayer(dt: number): void {
    const p = this.o.player.position;
    if (!this.velInit) {
      this.velInit = true;
      this.lastPx = p.x;
      this.lastPz = p.z;
    }
    if (dt > 0) {
      const vx = (p.x - this.lastPx) / dt;
      const vz = (p.z - this.lastPz) / dt;
      const m = Math.hypot(vx, vz);
      const c = m > 14 ? 14 / m : 1; // teleports / respawns are not "movement"
      const k = 1 - Math.exp(-12 * dt);
      this.playerVel.x += (vx * c - this.playerVel.x) * k;
      this.playerVel.z += (vz * c - this.playerVel.z) * k;
    }
    this.lastPx = p.x;
    this.lastPz = p.z;
  }

  /** Sphere (x,y,z,r) vs the player body (vertical capsule, feet-based). */
  private touchesPlayer(x: number, y: number, z: number, r: number): boolean {
    const pp = this.o.player.position;
    const T = HAZARD_TUNING;
    if (this.o.player.health.hp <= 0) return false;
    if (y < pp.y - r || y > pp.y + T.playerHeight + r) return false;
    const dx = pp.x - x;
    const dz = pp.z - z;
    const rr = T.playerRadius + r;
    return dx * dx + dz * dz <= rr * rr;
  }

  private killShot(s: Shot): void {
    s.active = false;
    if (s.mesh) s.mesh.visible = false;
  }

  private stepShot(s: Shot, dt: number): void {
    const T = HAZARD_TUNING;
    s.age += dt;
    if (s.age > T.boltLife * (s.kind === 0 ? 1 : 2) || s.y < -60) {
      this.killShot(s);
      return;
    }
    s.vy -= s.g * dt;
    const speed = Math.hypot(s.vx, s.vy, s.vz);
    const len = speed * dt;
    _dir.x = s.vx / speed;
    _dir.y = s.vy / speed;
    _dir.z = s.vz / speed;
    _org.x = s.x;
    _org.y = s.y;
    _org.z = s.z;
    const h = castBullet(this.o.world, EMPTY, _org, _dir, len, this.hit);
    const r = s.kind === 0 ? T.boltRadius : T.bottleRadius;
    // sub-step the player check (long steps at high speed must not skip the capsule)
    const steps = Math.max(1, Math.ceil((h.kind === 'none' ? len : h.distance) / 0.25));
    const reach = h.kind === 'none' ? len : h.distance;
    for (let i = 1; i <= steps; i++) {
      const f = (reach * i) / steps;
      const px = s.x + _dir.x * f;
      const py = s.y + _dir.y * f;
      const pz = s.z + _dir.z * f;
      if (this.touchesPlayer(px, py, pz, r)) {
        s.x = px;
        s.y = py;
        s.z = pz;
        this.shotHit(s, _dir);
        return;
      }
    }
    if (h.kind !== 'none') {
      s.x = h.point.x;
      s.y = h.point.y;
      s.z = h.point.z;
      if (s.kind === 1) this.burst(s, h.normal.y * 0.05);
      else this.killShot(s);
      return;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.mesh) {
      s.mesh.position.set(s.x, s.y, s.z);
      if (s.kind === 0) s.mesh.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
      else {
        s.mesh.rotation.x += dt * 9;
        s.mesh.rotation.z += dt * 5;
      }
    }
  }

  private shotHit(s: Shot, dir: Vec3Like): void {
    if (s.kind === 1) {
      this.burst(s, 0);
      return;
    }
    const pl = this.o.player;
    const pp = pl.position;
    this.o.combat.hitPlayer({
      source: s.ownerId,
      target: pl.id,
      amount: s.damage,
      type: DamageType.Physical,
      poiseDamage: s.poise,
      hitPos: { x: s.x, y: Math.min(Math.max(s.y, pp.y + 0.3), pp.y + 1.6), z: s.z },
      dir: { x: dir.x, y: 0, z: dir.z },
      weaponId: `${s.ownerId}:${s.weaponId}`,
    });
    this.killShot(s);
  }

  /** Bottle shatters: direct splash on the player + a fire pool at the impact point. */
  private burst(s: Shot, lift: number): void {
    const pl = this.o.player;
    const pp = pl.position;
    const dot = GRENADES.molotov?.dot ?? { dps: 10, duration: 5, radius: 3 };
    const dist = Math.hypot(pp.x - s.x, pp.z - s.z);
    if (dist <= s.splash && pl.health.hp > 0 && pp.y <= s.y + 2 && pp.y + 1.8 >= s.y - 0.5) {
      const amount = splashDamage(s.damage, dist, s.splash);
      if (amount > 0) {
        const len = dist || 1;
        this.o.combat.hitPlayer({
          source: s.ownerId,
          target: pl.id,
          amount,
          type: DamageType.Fire,
          poiseDamage: s.poise,
          hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
          dir: { x: (pp.x - s.x) / len, y: 0, z: (pp.z - s.z) / len },
          weaponId: `${s.ownerId}:${s.weaponId}`,
        });
      }
    }
    this.startFire(s.ownerId, s.x, s.y + lift, s.z, Math.min(HAZARD_TUNING.fireRadius, dot.radius), dot.dps, dot.duration);
    this.o.bus.emit('grenadeExploded', { kind: 'molotov', pos: { x: s.x, y: s.y, z: s.z }, radius: dot.radius });
    this.killShot(s);
  }

  startFire(ownerId: number, x: number, y: number, z: number, radius: number, dps: number, life: number): void {
    let f = this.fires.find((q) => !q.active);
    if (!f) f = this.fires.reduce((a, b) => (a.life < b.life ? a : b));
    f.active = true;
    f.x = x;
    f.y = y;
    f.z = z;
    f.radius = radius;
    f.dps = dps;
    f.life = life;
    f.tick = GRENADE_TUNING.fireTick;
    f.ownerId = ownerId;
    if (f.mesh) {
      f.mesh.visible = true;
      f.mesh.position.set(x, y + 0.04, z);
      f.mesh.scale.set(radius * 2, 1, radius * 2);
    }
  }

  private stepFires(dt: number): void {
    const pl = this.o.player;
    const pp = pl.position;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i]!;
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        if (f.mesh) f.mesh.visible = false;
        continue;
      }
      if (f.mesh) (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(f.life * 14);
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick += GRENADE_TUNING.fireTick;
      if (pl.health.hp > 0 && Math.hypot(pp.x - f.x, pp.z - f.z) <= f.radius && pp.y <= f.y + GRENADE_TUNING.fireHeight && pp.y + 1.8 >= f.y - 0.2) {
        this.o.combat.hitPlayer({
          source: f.ownerId,
          target: pl.id,
          amount: f.dps * GRENADE_TUNING.fireTick,
          type: DamageType.Fire,
          poiseDamage: 0,
          hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
          weaponId: 'molotov',
        });
      }
    }
  }

  // ------------------------------------------------------------------ barrels

  private groundY(x: number, y: number, z: number): number | null {
    _ray.origin.x = x;
    _ray.origin.y = y;
    _ray.origin.z = z;
    _ray.maxDist = 3;
    const h = (this.o.world as { raycast(r: Ray, m?: number, o?: RayHit): RayHit | null }).raycast(_ray, Layer.World | Layer.Prop, _rh);
    return h ? h.point.y : null;
  }

  private stepBarrel(b: BarrelSlot, dt: number): void {
    const T = HAZARD_TUNING;
    if (b.phase === 3) {
      b.breakT -= dt;
      if (b.mesh) b.mesh.scale.setScalar(Math.max(0.01, b.breakT / T.barrelBreakTime));
      if (b.breakT <= 0) this.releaseBarrel(b);
      return;
    }
    b.speed = Math.min(T.barrelSpeed, b.speed + T.barrelAccel * dt);
    const step = b.speed * dt;
    // waypoint steering (XZ)
    let tx = b.wx[b.wi]! - b.x;
    let tz = b.wz[b.wi]! - b.z;
    let td = Math.hypot(tx, tz);
    while (td <= step + 1e-3) {
      if (b.wi + 1 >= b.wn) {
        this.breakBarrel(b);
        return;
      }
      b.wi++;
      tx = b.wx[b.wi]! - b.x;
      tz = b.wz[b.wi]! - b.z;
      td = Math.hypot(tx, tz);
    }
    b.dx = tx / td;
    b.dz = tz / td;
    // a wall in front breaks it (ray at axle height, so low stair risers don't count)
    _org.x = b.x;
    _org.y = b.y;
    _org.z = b.z;
    _dir.x = b.dx;
    _dir.y = 0;
    _dir.z = b.dz;
    const wall = castBullet(this.o.world, EMPTY, _org, _dir, step + T.barrelRadius, this.hit);
    if (wall.kind === 'world') {
      this.breakBarrel(b);
      return;
    }
    b.x += b.dx * step;
    b.z += b.dz * step;
    // follow the ground (stairs); fall when there is none
    const gy = this.groundY(b.x, b.y + 1.2, b.z);
    if (gy !== null) {
      const want = gy + T.barrelRadius;
      b.y += (want - b.y) * Math.min(1, 24 * dt);
    } else {
      b.y -= 12 * dt;
      if (b.y < -40) {
        this.releaseBarrel(b);
        return;
      }
    }
    b.rot += step / T.barrelRadius;
    // contact (one damaging hit per barrel; a dodge spends it too, so rolling through is safe)
    if (!b.spent && this.touchesBarrel(b)) {
      b.spent = true;
      const pl = this.o.player;
      const pp = pl.position;
      const r = this.o.combat.hitPlayer({
        source: b.ownerId,
        target: pl.id,
        amount: T.barrelDamage,
        type: DamageType.Physical,
        poiseDamage: T.barrelPoise,
        hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
        dir: { x: b.dx, y: 0, z: b.dz },
        weaponId: `${b.ownerId}:barrel`,
      });
      if (r.dealt > 0) this.o.bus.emit('playerKnockdown', { sourceId: b.ownerId, dir: { x: b.dx, y: 0, z: b.dz }, duration: T.barrelKnockdown });
    }
    this.syncBarrel(b);
  }

  private touchesBarrel(b: BarrelSlot): boolean {
    const pp = this.o.player.position;
    const T = HAZARD_TUNING;
    if (this.o.player.health.hp <= 0) return false;
    if (pp.y > b.y + T.barrelRadius || pp.y + T.playerHeight < b.y - T.barrelRadius) return false;
    const dx = pp.x - b.x;
    const dz = pp.z - b.z;
    const rr = T.playerRadius + T.barrelRadius;
    return dx * dx + dz * dz <= rr * rr;
  }

  private breakBarrel(b: BarrelSlot): void {
    b.phase = 3;
    b.breakT = HAZARD_TUNING.barrelBreakTime;
    this.o.bus.emit('barrelBroke', { pos: { x: b.x, y: b.y, z: b.z } });
  }

  private syncBarrel(b: BarrelSlot): void {
    const m = b.mesh;
    if (!m) return;
    m.position.set(b.x, b.y, b.z);
    // axle perpendicular to travel; roll about it
    m.rotation.set(0, Math.atan2(-b.dx, -b.dz), 0);
    m.children[0]?.rotation.set(b.rot, 0, 0);
  }
}

const EMPTY: readonly never[] = [];
