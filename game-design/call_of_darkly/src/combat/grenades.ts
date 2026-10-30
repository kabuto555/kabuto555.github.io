import * as THREE from 'three';
import { DamageType, type DamageEvent, type EntityId } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import { input as globalInput, type Input } from '../core/input';
import type { Vec3Like } from '../core/types';
import { GRENADES } from '../data/items';
import type { GrenadeDef, ItemId } from '../data/types';
import { accessoryHooks as globalHooks, type AccessoryHooks } from '../inventory/accessories';
import { Layer, type CollisionWorld } from '../physics/types';
import { dealDamage } from './damage';
import './events';
import type { BulletHit } from './hitscan';
import { distToVCapsule, splashFalloff } from './math';
import { ProjectilePool, type Projectile, type ProjectileHooks, type ProjectileKind } from './projectiles';
import type { HitTarget } from './targets';
import type { DamageResult, GunState } from './types';

declare module '../core/events' {
  interface EventMap {
    /** A grenade went off / landed (audio + screen fx). `kind` is the grenade item id. */
    grenadeExploded: { kind: ItemId; pos: Vec3Like; radius: number };
    /** A grenade/knife left the player's hand. Knife throws are silent: no `gunFired`, no noise. */
    /** A thrown grenade bounced off the world above a speed threshold. Payload is a reused scratch object. */
    grenadeBounce: { pos: Vec3Like; speed: number };
    grenadeThrown: { kind: ItemId; pos: Vec3Like; dir: Vec3Like };
    /** Throwing knife hit a single enemy: aggro ONLY that target toward `pos` (not a world noise). */
    aggroPing: { targetId: EntityId; pos: Vec3Like };
    /** Flashbang detonated within `radius` of `pos` (screen flash if the player is close and looking). */
    flashbang: { pos: Vec3Like; radius: number };
  }
}

/**
 * Optional capability on a HitTarget (enemies implement it in ai/). Flashbang calls `stun(seconds)`
 * on every living target in radius unless `isBoss === true`.
 */
export interface Stunnable {
  stun(seconds: number): void;
  isBoss?: boolean;
}

export const GRENADE_TUNING = {
  throwSpeed: 15,
  /** Extra upward velocity (m/s) so a level throw arcs. */
  throwLift: 3.5,
  knifeSpeed: 38,
  /** Seconds after a throw during which the gun cannot fire. */
  throwLock: 0.4,
  /** Pool sizes. */
  projectiles: 16,
  fireZones: 6,
  blasts: 6,
  /** Fire DoT tick interval (s). */
  fireTick: 0.5,
  /** Vertical reach of a fire pool above the floor point (m). */
  fireHeight: 1.8,
  /** Martyrdom frag fuse (s). */
  martyrdomFuse: 1.0,
  /** Knife headshot multiplier. */
  knifeHeadMult: 1.5,
  eyeHeight: 1.6,
} as const;

/** What the grenade system needs from CombatSystem. */
export interface GrenadeCombat {
  readonly targets: { readonly arr: readonly HitTarget[] };
  readonly guns: readonly (GunState | null)[];
  hitPlayer(e: DamageEvent): DamageResult;
}

export interface GrenadePlayer {
  readonly id: EntityId;
  readonly position: Vec3Like;
  readonly state: { readonly yaw: number; readonly pitch: number; readonly move: string };
  controlsEnabled: boolean;
}

export interface GrenadePouchLike {
  current(): ItemId | null;
  cycle(dir?: 1 | -1): ItemId | null;
  use(): ItemId | null;
}

export interface GrenadeSystemOptions {
  combat: GrenadeCombat;
  player: GrenadePlayer;
  pouch: GrenadePouchLike;
  world: CollisionWorld;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  input?: Input;
  events?: EventBus;
  hooks?: AccessoryHooks;
  /** Return false to block starting a throw (e.g. mid quick-item use). */
  canAct?: () => boolean;
}

/** Splash damage at `dist` from the blast centre: `damage` x linear falloff to 0 at `radius`. */
export function splashDamage(damage: number, dist: number, radius: number): number {
  return damage * splashFalloff(dist, radius);
}

interface FireZone {
  active: boolean;
  x: number;
  y: number;
  z: number;
  radius: number;
  dps: number;
  life: number;
  tick: number;
  mesh: THREE.Mesh | null;
}

interface Blast {
  life: number;
  max: number;
  mesh: THREE.Mesh;
}

const KIND_OF: Record<string, ProjectileKind> = { frag_grenade: 'frag', molotov: 'molotov', flashbang: 'flash', throwing_knife: 'knife' };

/** Minimum pre-bounce speed (m/s) that emits `grenadeBounce`. */
const BOUNCE_MIN_SPEED = 3;
const losRay = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, maxDist: 0 };
const fwd = { x: 0, y: 0, z: 0 };
const org = { x: 0, y: 0, z: 0 };
const vel = { x: 0, y: 0, z: 0 };

/**
 * Pouch grenades: select (T), throw (G, hold to cook cookable ones), flight via ProjectilePool,
 * detonation (frag splash, molotov fire pool, flashbang stun, throwing knife) and the Martyrdom frag.
 */
export class GrenadeSystem {
  readonly name = 'grenades';
  readonly pool: ProjectilePool;
  /** Cooking state: grenade held and fuse burning. */
  cooking: { id: ItemId; t: number } | null = null;
  /** Seconds left in which the gun cannot fire (read by the consumable system). */
  lockT = 0;

  private readonly bus: EventBus;
  private readonly input: Input;
  private readonly offs: (() => void)[] = [];
  private readonly zones: FireZone[] = [];
  private readonly blasts: Blast[] = [];
  private readonly group: THREE.Group | null;
  private readonly ph: ProjectileHooks;
  private readonly bounceEv = { pos: { x: 0, y: 0, z: 0 }, speed: 0 };

  constructor(private readonly o: GrenadeSystemOptions) {
    this.bus = o.events ?? globalEvents;
    this.input = o.input ?? globalInput;
    this.pool = new ProjectilePool(o.world, o.scene ?? null, GRENADE_TUNING.projectiles, o.combat.targets.arr);
    this.ph = {
      onDetonate: (p) => this.detonate(p),
      onImpact: (p, h) => this.impact(p, h),
      onBounce: (p, speed) => {
        if (speed < BOUNCE_MIN_SPEED) return;
        this.bounceEv.pos.x = p.x; this.bounceEv.pos.y = p.y; this.bounceEv.pos.z = p.z;
        this.bounceEv.speed = speed;
        this.bus.emit('grenadeBounce', this.bounceEv);
      },
    };
    this.group = o.scene ? new THREE.Group() : null;
    for (let i = 0; i < GRENADE_TUNING.fireZones; i++) {
      let mesh: THREE.Mesh | null = null;
      if (this.group) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 }));
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.zones.push({ active: false, x: 0, y: 0, z: 0, radius: 1, dps: 0, life: 0, tick: 0, mesh });
    }
    if (this.group) {
      for (let i = 0; i < GRENADE_TUNING.blasts; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.8 }));
        mesh.visible = false;
        this.group.add(mesh);
        this.blasts.push({ life: 0, max: 0.3, mesh });
      }
      o.scene!.add(this.group);
    }
    // Martyrdom Dogtag: a live frag at the death position that hurts enemies, not the player.
    this.offs.push(
      (o.hooks ?? globalHooks).on('playerDeath', (p) => {
        const def = GRENADES.frag_grenade;
        if (!def) return;
        org.x = p.pos.x;
        org.y = p.pos.y + 0.5;
        org.z = p.pos.z;
        vel.x = vel.z = 0;
        vel.y = 2;
        this.pool.spawn('frag', def.id, org, vel, GRENADE_TUNING.martyrdomFuse, false);
      }),
    );
  }

  /** Input + cook + throw lock. Call every sim tick. */
  update(dt: number): void {
    const p = this.o.player;
    const inp = this.input;
    const on = p.controlsEnabled && p.state.move !== 'dead';
    this.lockT = Math.max(0, this.lockT - dt);

    if (this.cooking && !on) this.cooking = null; // died / disabled mid-cook: grenade is lost
    if (on && inp.pressed('cycleGrenade')) this.o.pouch.cycle(1);

    if (on && !this.cooking && inp.pressed('throwGrenade') && this.lockT <= 0 && (this.o.canAct?.() ?? true)) this.beginThrow();

    const c = this.cooking;
    if (c) {
      c.t += dt;
      const def = GRENADES[c.id]!;
      if (c.t >= def.fuse) {
        this.cooking = null;
        this.explodeInHand(def);
      } else if (!inp.down('throwGrenade') || inp.released('throwGrenade')) {
        this.cooking = null;
        this.launch(def, def.fuse - c.t);
      }
    }

    this.pool.update(dt, this.ph);
    this.updateZones(dt);
    for (let i = 0; i < this.blasts.length; i++) {
      const b = this.blasts[i]!;
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) b.mesh.visible = false;
      else {
        const k = 1 - b.life / b.max;
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
        b.mesh.scale.multiplyScalar(1 + dt * 4);
      }
    }
  }

  /** Start throwing the pouch's current grenade (cookable ones start cooking, others throw now). Returns false if none. */
  beginThrow(): boolean {
    const id = this.o.pouch.current();
    const def = id ? GRENADES[id] : undefined;
    if (!id || !def) return false;
    this.o.pouch.use(); // consume now
    if (def.cookable) {
      this.cooking = { id, t: 0 };
      return true;
    }
    this.launch(def, def.fuse > 0 ? def.fuse : -1);
    return true;
  }

  /** Spawn the projectile for `def` from the player's eye along the aim. `fuse` = seconds remaining (-1 impact only). */
  private launch(def: GrenadeDef, fuse: number): void {
    const p = this.o.player;
    const cp = Math.cos(p.state.pitch);
    fwd.x = -Math.sin(p.state.yaw) * cp;
    fwd.y = Math.sin(p.state.pitch);
    fwd.z = -Math.cos(p.state.yaw) * cp;
    // Player pose, never the (screen-shaken) camera — same as guns.
    org.x = p.position.x;
    org.y = p.position.y + GRENADE_TUNING.eyeHeight;
    org.z = p.position.z;
    const kind = KIND_OF[def.id] ?? 'frag';
    const T = GRENADE_TUNING;
    const knife = kind === 'knife';
    const speed = knife ? T.knifeSpeed : T.throwSpeed;
    const lift = knife ? 0 : T.throwLift;
    org.x += fwd.x * 0.45;
    org.y += fwd.y * 0.45 - (knife ? 0.05 : 0.12);
    org.z += fwd.z * 0.45;
    vel.x = fwd.x * speed;
    vel.y = fwd.y * speed + lift;
    vel.z = fwd.z * speed;
    this.pool.spawn(kind, def.id, org, vel, fuse);
    this.lockT = T.throwLock;
    // Knife is silent: deliberately no `gunFired` and no noise event.
    this.bus.emit('grenadeThrown', { kind: def.id, pos: { x: org.x, y: org.y, z: org.z }, dir: { x: fwd.x, y: fwd.y, z: fwd.z } });
  }

  /** Over-cooked: blast at the player's hands, hurting the player and anything nearby. */
  explodeInHand(def: GrenadeDef): void {
    const p = this.o.player;
    this.explode(def, p.position.x, p.position.y + GRENADE_TUNING.eyeHeight - 0.4, p.position.z, true);
  }

  private detonate(p: Projectile): void {
    const def = GRENADES[p.itemId];
    if (!def) return;
    const x = p.x;
    const y = p.y;
    const z = p.z;
    if (p.kind === 'flash') this.flash(def, x, y, z);
    else if (p.kind === 'molotov') this.startFire(def, x, y, z);
    else this.explode(def, x, y, z, p.hurtPlayer);
  }

  private impact(p: Projectile, h: BulletHit): void {
    const def = GRENADES[p.itemId];
    if (!def) return;
    if (p.kind === 'molotov') {
      this.startFire(def, p.x, p.y + (h.kind === 'world' ? h.normal.y * 0.05 : 0), p.z);
      return;
    }
    if (p.kind !== 'knife' || h.kind !== 'target' || !h.target) return; // stuck in a wall: gone
    const t = h.target;
    const pl = this.o.player;
    const mag = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const head = h.region === 'head';
    const dir = { x: p.vx / mag, y: p.vy / mag, z: p.vz / mag };
    const ev: DamageEvent = {
      source: pl.id,
      target: t.id,
      amount: def.damage * (head ? GRENADE_TUNING.knifeHeadMult : 1),
      type: DamageType.Physical,
      poiseDamage: def.poiseDamage,
      hitPos: { x: p.x, y: p.y, z: p.z },
      headshot: head,
      weaponId: def.id,
      dir,
    };
    dealDamage(t, ev, this.bus);
    if (def.silent && t.alive) this.bus.emit('aggroPing', { targetId: t.id, pos: { x: pl.position.x, y: pl.position.y, z: pl.position.z } });
  }

  /** Is the straight line from the blast point to (tx,ty,tz) free of world/barrier geometry? */
  private visible(x: number, y: number, z: number, tx: number, ty: number, tz: number): boolean {
    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.3) return true;
    losRay.origin.x = x;
    losRay.origin.y = y;
    losRay.origin.z = z;
    losRay.dir.x = dx / d;
    losRay.dir.y = dy / d;
    losRay.dir.z = dz / d;
    losRay.maxDist = d;
    const hit = this.o.world.raycast(losRay, Layer.World | Layer.Barrier);
    return !hit || hit.distance >= d - 0.25;
  }

  /** Radial blast: every living target (and the player when `hurtPlayer`) gets falloff damage. */
  explode(def: GrenadeDef, x: number, y: number, z: number, hurtPlayer: boolean): void {
    const R = def.radius;
    const pl = this.o.player;
    this.blast(x, y, z, R * 0.5, 0xffb040);
    const arr = this.o.combat.targets.arr;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i]!;
      if (!t.alive) continue;
      const tp = t.transform.position;
      const r = t.hit.bodyRadius;
      const dist = distToVCapsule(x, y, z, tp.x, tp.y + r, tp.y + Math.max(r, t.hit.bodyHeight - r), tp.z, r);
      const f = splashFalloff(dist, R);
      if (f <= 0) continue;
      const cy = tp.y + t.hit.bodyHeight * 0.5;
      // No splash through walls: the blast must see the body centre or head.
      if (!this.visible(x, y, z, tp.x, cy, tp.z) && !this.visible(x, y, z, tp.x, tp.y + t.hit.bodyHeight, tp.z)) continue;
      const l = Math.hypot(tp.x - x, cy - y, tp.z - z) || 1;
      dealDamage(t, {
        source: pl.id,
        target: t.id,
        amount: def.damage * f,
        type: def.damageType,
        poiseDamage: def.poiseDamage * f,
        hitPos: { x: tp.x, y: cy, z: tp.z },
        weaponId: def.id,
        dir: { x: (tp.x - x) / l, y: (cy - y) / l, z: (tp.z - z) / l },
      }, this.bus);
    }
    if (hurtPlayer) {
      const pp = pl.position;
      const pd = distToVCapsule(x, y, z, pp.x, pp.y + 0.4, pp.y + 1.4, pp.z, 0.4);
      const pf = splashFalloff(pd, R);
      if (pf > 0 && (this.visible(x, y, z, pp.x, pp.y + 0.9, pp.z) || this.visible(x, y, z, pp.x, pp.y + GRENADE_TUNING.eyeHeight, pp.z))) {
        const l = Math.hypot(pp.x - x, pp.y + 0.9 - y, pp.z - z) || 1;
        this.o.combat.hitPlayer({
          source: pl.id,
          target: pl.id,
          amount: def.damage * pf,
          type: def.damageType,
          poiseDamage: def.poiseDamage * pf,
          hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
          weaponId: def.id,
          dir: { x: (pp.x - x) / l, y: (pp.y + 0.9 - y) / l, z: (pp.z - z) / l },
        });
      }
    }
    this.bus.emit('grenadeExploded', { kind: def.id, pos: { x, y, z }, radius: R });
  }

  private flash(def: GrenadeDef, x: number, y: number, z: number): void {
    const seconds = def.stun ?? 3;
    const arr = this.o.combat.targets.arr;
    this.blast(x, y, z, def.radius * 0.3, 0xffffff);
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i]!;
      if (!t.alive) continue;
      const tp = t.transform.position;
      if (Math.hypot(tp.x - x, tp.y + t.hit.bodyHeight * 0.5 - y, tp.z - z) > def.radius) continue;
      const s = t as HitTarget & Partial<Stunnable>;
      if (s.isBoss) continue;
      if (typeof s.stun === 'function') s.stun(seconds);
    }
    this.bus.emit('flashbang', { pos: { x, y, z }, radius: def.radius });
    this.bus.emit('grenadeExploded', { kind: def.id, pos: { x, y, z }, radius: def.radius });
  }

  private startFire(def: GrenadeDef, x: number, y: number, z: number): void {
    const dot = def.dot ?? { dps: 10, duration: 5, radius: def.radius };
    let zone = this.zones.find((zz) => !zz.active);
    if (!zone) zone = this.zones.reduce((a, b) => (a.life < b.life ? a : b)); // recycle the oldest
    zone.active = true;
    zone.x = x;
    zone.y = y;
    zone.z = z;
    zone.radius = dot.radius;
    zone.dps = dot.dps;
    zone.life = dot.duration;
    zone.tick = GRENADE_TUNING.fireTick; // first damage after one tick
    if (zone.mesh) {
      zone.mesh.visible = true;
      zone.mesh.position.set(x, y + 0.03, z);
      zone.mesh.scale.set(dot.radius * 2, 1, dot.radius * 2);
    }
    this.blast(x, y + 0.3, z, dot.radius * 0.35, 0xff6a10);
    this.bus.emit('grenadeExploded', { kind: def.id, pos: { x, y, z }, radius: dot.radius });
  }

  private updateZones(dt: number): void {
    const pl = this.o.player;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]!;
      if (!z.active) continue;
      z.life -= dt;
      if (z.life <= 0) {
        z.active = false;
        if (z.mesh) z.mesh.visible = false;
        continue;
      }
      if (z.mesh) (z.mesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(z.life * 14);
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick += GRENADE_TUNING.fireTick;
      const amount = z.dps * GRENADE_TUNING.fireTick;
      const arr = this.o.combat.targets.arr;
      for (let k = 0; k < arr.length; k++) {
        const t = arr[k]!;
        if (!t.alive) continue;
        const tp = t.transform.position;
        if (Math.hypot(tp.x - z.x, tp.z - z.z) - t.hit.bodyRadius > z.radius) continue;
        if (tp.y > z.y + GRENADE_TUNING.fireHeight || tp.y + t.hit.bodyHeight < z.y - 0.2) continue;
        dealDamage(t, {
          source: pl.id,
          target: t.id,
          amount,
          type: DamageType.Fire,
          poiseDamage: 0,
          hitPos: { x: tp.x, y: tp.y + t.hit.bodyHeight * 0.5, z: tp.z },
          weaponId: 'molotov',
        }, this.bus, false);
      }
      const pp = pl.position;
      if (Math.hypot(pp.x - z.x, pp.z - z.z) <= z.radius && pp.y <= z.y + GRENADE_TUNING.fireHeight && pp.y + 1.8 >= z.y - 0.2) {
        this.o.combat.hitPlayer({
          source: null,
          target: pl.id,
          amount,
          type: DamageType.Fire,
          poiseDamage: 0,
          hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
          weaponId: 'molotov',
        });
      }
    }
  }

  private blast(x: number, y: number, z: number, size: number, color: number): void {
    for (let i = 0; i < this.blasts.length; i++) {
      const b = this.blasts[i]!;
      if (b.life > 0) continue;
      b.life = b.max;
      b.mesh.visible = true;
      b.mesh.position.set(x, y, z);
      b.mesh.scale.setScalar(Math.max(0.3, size));
      (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      return;
    }
  }

  /** Number of live fire pools (tests/debug). */
  activeFireZones(): number {
    let n = 0;
    for (const z of this.zones) if (z.active) n++;
    return n;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.pool.clear();
    this.pool.dispose();
    this.group?.parent?.remove(this.group);
  }
}
