import * as THREE from 'three';
import { DamageType, type DamageEvent, type EntityId } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import { input as globalInput, type Input } from '../core/input';
import { Rng } from '../core/rng';
import type { System, Vec3Like } from '../core/types';
import type { GunDef, ItemId, MeleeDef, ShieldDef } from '../data/types';
import { stats as globalStats, type StatsResolver } from '../inventory/modifiers';
import { PLAYER_TUNING } from '../player/tuning';
import type { PlayerState } from '../player/types';
import { newViewmodelState, type Viewmodel, type ViewmodelState } from '../player/viewmodel';
import { Layer, type CollisionWorld } from '../physics/types';
import { dealDamage } from './damage';
import type { TrainingDummy } from './dummy';
import './events';
import { castBullet, newBulletHit } from './hitscan';
import {
  DEG,
  bloomStep,
  bulletDamage,
  coneOffset,
  distToVCapsule,
  computeSpread,
  fireInterval,
  hitsFront,
  inMeleeArc,
  pelletsForShot,
  recoilKick,
  recoilRecover,
  reloadDuration,
  reloadFill,
  resolveBlock,
  roundsPerShot,
  splashFalloff,
} from './math';
import type { HitTarget } from './targets';
import { COMBAT_TUNING as C } from './tuning';
import type { DamageResult, EntityRegistry, Damageable, GunState } from './types';
import { AmmoStore, gunDef, leftDef, newGunState } from './weapons';

/** What combat needs from the player (PlayerController satisfies it). */
export interface CombatPlayer {
  readonly id: EntityId;
  readonly state: Readonly<PlayerState>;
  readonly position: Vec3Like;
  readonly velocity: Vec3Like;
  readonly grounded: boolean;
  readonly canFire: boolean;
  readonly health: { hp: number; maxHp: number };
  readonly transform: { yaw: number };
  invulnerable?: boolean;
  controlsEnabled: boolean;
  spendStamina(amount: number): boolean;
  /** Forced loss (blocks): may empty the bar and exhaust. Falls back to spendStamina when absent. */
  loseStamina?(amount: number): void;
}

export interface CombatOptions {
  player: CombatPlayer;
  world: CollisionWorld;
  input?: Input;
  events?: EventBus;
  stats?: StatsResolver;
  camera?: THREE.PerspectiveCamera;
  viewmodel?: Viewmodel;
  /** Scene for impact sparks (optional). */
  scene?: THREE.Scene;
  rng?: Rng;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Bucket {
  amount: number;
  /** 0 = unused this shot (buckets are pooled and reused). */
  count: number;
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
}

interface BucketEntry {
  target: HitTarget | null;
  head: Bucket;
  body: Bucket;
}

const newBucket = (): Bucket => ({ amount: 0, count: 0, px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 0 });

/** Set that also keeps an array mirror so hot paths iterate without allocating an iterator. */
export class TargetSet extends Set<HitTarget> {
  readonly arr: HitTarget[] = [];
  override add(t: HitTarget): this {
    if (!this.has(t)) this.arr.push(t);
    return super.add(t);
  }
  override delete(t: HitTarget): boolean {
    const i = this.arr.indexOf(t);
    if (i >= 0) this.arr.splice(i, 1);
    return super.delete(t);
  }
  override clear(): void {
    this.arr.length = 0;
    super.clear();
  }
}

const coneTmp = { r: 0, u: 0 };
const meleeFwd = { x: 0, y: 0, z: 0 };
const meleeRay = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, maxDist: 0 };

/**
 * M2 combat: right-hand guns (hitscan, ADS, recoil, reload, swap) and left-hand knife/shield.
 * Register after the PlayerController (and before the render pass) so the camera is already placed.
 */
export class CombatSystem implements System, EntityRegistry {
  readonly name = 'combat';
  readonly ammo: AmmoStore;
  readonly targets = new TargetSet();
  readonly dummies: TrainingDummy[] = [];

  rightSlots: [ItemId | null, ItemId | null] = ['m4_ar', 'm1911_pistol'];
  leftSlots: [ItemId | null, ItemId | null] = ['combat_knife', 'riot_shield'];
  rightIdx = 0;
  leftIdx = 0;
  /** Per right slot. */
  readonly guns: [GunState | null, GunState | null] = [null, null];

  // right-hand swap
  private swapT = -1;
  private swapSwitched = false;
  // left-hand
  private leftSwapT = -1;
  private leftSwapSwitched = false;
  private blockT = 0;
  private guardBreakT = 0;
  private swing: { t: number; dur: number; hit: boolean; def: MeleeDef } | null = null;
  /** Seconds since a swing was denied (exhausted); HUD flashes. */
  swingDeniedT = 99;

  // gun runtime
  private adsT = 0;
  private reloadDur = 1;
  private readonly _dryEv = { weaponId: '' };
  private dryEv(id: string): { weaponId: string } {
    this._dryEv.weaponId = id;
    return this._dryEv;
  }
  private fireBuf = 0;
  private bloom = 0;
  private burstIdx = 0;
  private lastShotAt = -99;
  private pendUp = 0;
  private pendSide = 0;
  /** Recoil the camera has been kicked and not yet recovered (deg). */
  private accUp = 0;
  private accSide = 0;
  private expPitch = 0;
  private expYaw = 0;
  private lastSlowMul = 1;
  shotCount = 0;
  /** Last computed cone (deg) for the HUD crosshair. */
  lastSpread = 0;
  /** Last hit info for the HUD/debug. */
  lastHit: { label: string; head: boolean; dealt: number; blocked: boolean; killed: boolean; dist: number; at: number } | null = null;

  private readonly player: CombatPlayer;
  private readonly world: CollisionWorld;
  private readonly input: Input;
  private readonly bus: EventBus;
  /** Reused payload for `bulletImpact` (declared in fx/impacts) — listeners must copy, not keep. */
  private readonly impactEv: { pos: Vec3Like; normal: Vec3Like; dynamic?: boolean } = { pos: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
  private readonly stats: StatsResolver;
  private readonly camera: THREE.PerspectiveCamera | null;
  private readonly vm: Viewmodel | null;
  private readonly rng: Rng;
  private readonly vs: ViewmodelState = newViewmodelState();
  private readonly bh = newBulletHit();
  private readonly o = { x: 0, y: 0, z: 0 };
  private readonly d = { x: 0, y: 0, z: 1 };
  private readonly bucketPool: BucketEntry[] = [];
  private bucketN = 0;
  /** Per-gun-id state so re-equip / reorder keeps the mag (see setLoadout). */
  private readonly gunStates = new Map<ItemId, GunState>();
  private lastFov = 0;
  private lastBase = 0;
  private time = 0;
  private sparks: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private sparkGroup: THREE.Group | null = null;

  constructor(opts: CombatOptions) {
    this.player = opts.player;
    this.world = opts.world;
    this.input = opts.input ?? globalInput;
    this.bus = opts.events ?? globalEvents;
    this.stats = opts.stats ?? globalStats;
    this.camera = opts.camera ?? null;
    this.vm = opts.viewmodel ?? null;
    this.rng = opts.rng ?? new Rng(0xc0de);
    this.ammo = new AmmoStore(this.bus);
    this.setLoadout(this.rightSlots, this.leftSlots);
    for (const [k, v] of Object.entries(C.startReserve)) this.ammo.set(k as GunDef['ammo'], v);
    if (opts.scene) {
      this.sparkGroup = new THREE.Group();
      const g = new THREE.BoxGeometry(0.07, 0.07, 0.07);
      for (let i = 0; i < 16; i++) {
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd890 }));
        mesh.visible = false;
        this.sparkGroup.add(mesh);
        this.sparks.push({ mesh, life: 0 });
      }
      opts.scene.add(this.sparkGroup);
    }
  }

  // ------------------------------------------------------------------ public API

  /**
   * Set both hands' slot ids (M4 inventory calls this on equip). Gun state is remembered per gun id:
   * re-equipping or reordering keeps the mag; a never-seen gun starts with a FULL mag on first
   * acquisition only. In-flight reload/cooldown is cleared. If both slots hold the same id, the
   * second slot gets its own (untracked) state.
   */
  setLoadout(right: [ItemId | null, ItemId | null], left: [ItemId | null, ItemId | null]): void {
    this.rightSlots = right;
    this.leftSlots = left;
    for (let i = 0; i < 2; i++) {
      const id = right[i] ?? null;
      if (!id || !gunDef(id)) {
        this.guns[i] = null;
        continue;
      }
      let st: GunState;
      if (i === 1 && right[0] === id) st = newGunState(id);
      else {
        let known = this.gunStates.get(id);
        if (!known) this.gunStates.set(id, (known = newGunState(id)));
        st = known;
      }
      st.reloading = false;
      st.reloadT = 0;
      st.cooldown = 0;
      this.guns[i] = st;
    }
    this.rightIdx = this.guns[0] ? 0 : this.guns[1] ? 1 : 0;
    this.leftIdx = leftDef(left[0] ?? null) ? 0 : leftDef(left[1] ?? null) ? 1 : 0;
  }

  get gun(): GunState | null {
    return this.guns[this.rightIdx];
  }
  get gunDefNow(): GunDef | null {
    return gunDef(this.gun?.id ?? null);
  }
  get leftDefNow(): MeleeDef | ShieldDef | null {
    return leftDef(this.leftSlots[this.leftIdx] ?? null);
  }
  get ads(): number {
    return this.adsT;
  }
  get blockAmount(): number {
    return this.blockT;
  }
  /** Shield up and effective. */
  get blocking(): boolean {
    return this.blockT >= C.blockReadyT && this.leftDefNow?.class === 'shield' && this.guardBreakT <= 0 && !this.player.state.exhausted;
  }
  get guardBroken(): boolean {
    return this.guardBreakT > 0;
  }
  get swinging(): boolean {
    return this.swing !== null;
  }
  get swapping(): boolean {
    return this.swapT >= 0;
  }

  addTarget(t: HitTarget): void {
    this.targets.add(t);
  }
  removeTarget(t: HitTarget): void {
    this.targets.delete(t);
  }
  addDummy(d: TrainingDummy): void {
    this.dummies.push(d);
    this.targets.add(d);
  }

  // EntityRegistry
  get(id: EntityId): Damageable | undefined {
    const a = this.targets.arr;
    for (let i = 0; i < a.length; i++) if (a[i]!.id === id) return a[i];
    return undefined;
  }
  all(): Iterable<Damageable> {
    return this.targets;
  }

  /**
   * ALL damage to the player goes through here (enemy attacks, explosions, debug): i-frames, then
   * shield block (physical only, frontal), then the `damage` event the controller applies to HP.
   */
  hitPlayer(e: DamageEvent): DamageResult {
    const p = this.player;
    if (p.invulnerable) return { dealt: 0, blocked: false, poiseBroken: false, killed: false };
    let amount = e.amount;
    let blocked = false;
    let broke = false;
    const sh = this.leftDefNow;
    if (sh && sh.class === 'shield' && this.blocking) {
      const y = p.state.yaw;
      // Travel direction: explicit, else from the source entity toward the player, else unblockable.
      let dx = 0;
      let dz = 0;
      let known = false;
      if (e.dir) {
        dx = e.dir.x;
        dz = e.dir.z;
        known = true;
      } else if (e.source !== null && e.source !== undefined) {
        const src = this.get(e.source);
        if (src) {
          dx = p.position.x - src.transform.position.x;
          dz = p.position.z - src.transform.position.z;
          known = true;
        }
      }
      if (known && hitsFront(dx, dz, -Math.sin(y), -Math.cos(y))) {
        const r = resolveBlock(e.amount, e.type, sh, p.state.stamina);
        if (r.staminaCost > 0) {
          // forced loss: charged even when it empties the bar (that is the guard break)
          if (p.loseStamina) p.loseStamina(r.staminaCost);
          else p.spendStamina(r.staminaCost);
        }
        amount = r.damageTaken;
        blocked = e.amount - amount > 0 || r.staminaCost > 0;
        broke = r.guardBroken;
        if (blocked) this.bus.emit('shieldBlock', { weaponId: sh.id, absorbed: e.amount - amount, staminaCost: r.staminaCost, guardBroken: broke });
        if (broke) {
          this.guardBreakT = C.guardBreakTime;
          this.blockT = 0;
        }
      }
    }
    // A fully absorbed hit is signalled by `shieldBlock` only (no zero-amount `damage`).
    if (!(blocked && amount <= 0)) this.bus.emit('damage', blocked ? { ...e, amount } : e);
    return { dealt: amount, blocked, poiseBroken: broke, killed: p.health.hp <= 0 };
  }

  /** Dev: a physical hit of `dmg` on the player (default from the front, i.e. travelling against facing). */
  debugHitPlayer(dmg: number, fromFront = true, type: DamageType = DamageType.Physical): DamageResult {
    const y = this.player.state.yaw;
    const f = { x: -Math.sin(y), y: 0, z: -Math.cos(y) };
    const s = fromFront ? -1 : 1;
    const pos = this.player.position;
    return this.hitPlayer({
      source: null,
      target: this.player.id,
      amount: dmg,
      type,
      poiseDamage: 10,
      hitPos: { x: pos.x, y: pos.y + 1.4, z: pos.z },
      dir: { x: f.x * s, y: 0, z: f.z * s },
      weaponId: 'debug',
    });
  }

  /** Dev: point the camera at a world position (+ optional offset). */
  debugAimAt(x: number, y: number, z: number): void {
    const st = this.player.state as PlayerState;
    const p = this.player.position;
    const dx = x - p.x;
    const dy = y - (p.y + PLAYER_TUNING.eyeHeight);
    const dz = z - p.z;
    st.yaw = Math.atan2(-dx, -dz);
    st.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.player.transform.yaw = st.yaw;
    this.expPitch = st.pitch;
    this.expYaw = st.yaw;
  }

  // ------------------------------------------------------------------ System

  update(dt: number): void {
    this.time += dt;
    const p = this.player;
    const st = p.state as PlayerState;
    const inp = this.input;
    const on = p.controlsEnabled && st.move !== 'dead';
    const sprint = st.sprinting;
    const acting = !p.canFire; // roll / mantle / dead / drinking

    for (const d of this.dummies) d.update(dt);
    this.swingDeniedT += dt;

    // ---- right-hand swap
    if (on && inp.pressed('swapRight')) this.startSwapRight();
    if (this.swapT >= 0) {
      this.swapT += dt;
      if (!this.swapSwitched && this.swapT >= C.swapLower) {
        this.swapSwitched = true;
        this.rightIdx ^= 1;
        this.fireBuf = 0;
        this.bus.emit('weaponSwap', { hand: 'R', slot: this.rightIdx, weaponId: this.gun?.id ?? null });
      }
      if (this.swapT >= C.swapLower + C.swapRaise) this.swapT = -1;
    }
    const g = this.gun;
    const def = this.gunDefNow;

    // ---- reload cancel (sprint / dodge / mantle) then start
    if (g?.reloading && (sprint || acting)) this.cancelReload(g);
    if (on && g && def && inp.pressed('reload') && this.canReload(g, def)) this.startReload(g, def);

    // ---- ADS
    const wantAds = on && !!def && inp.down('ads') && !sprint && !acting && this.swapT < 0 && !g?.reloading;
    const adsTime = Math.max(0.05, def?.adsTime ?? 0.25);
    this.adsT = clamp01(this.adsT + ((wantAds ? 1 : -1.6) * dt) / adsTime);
    st.ads = wantAds;
    st.adsT = this.adsT;

    // ---- fire
    for (let i = 0; i < 2; i++) {
      const gi = this.guns[i];
      if (gi) gi.cooldown = Math.max(gi.cooldown - dt, -dt);
    }
    const firePressed = on && inp.pressed('fire');
    const fireHeld = on && inp.down('fire');
    this.fireBuf = firePressed ? C.fireBuffer : Math.max(0, this.fireBuf - dt);
    let fired = false;
    if (g && def) {
      const want = def.fireMode === 'auto' ? fireHeld : firePressed || this.fireBuf > 0;
      if (want && !g.reloading && this.swapT < 0 && !sprint && !acting) {
        if (g.mag <= 0) {
          if (firePressed) this.bus.emit('gunDryFire', this.dryEv(def.id));
          if (firePressed || (def.fireMode === 'auto' && fireHeld)) {
            if (this.canReload(g, def)) this.startReload(g, def);
          }
        } else if (g.cooldown <= 0) {
          this.fireShot(g, def);
          fired = true;
          this.fireBuf = 0;
        }
      }
      // reload progress
      if (g.reloading) {
        g.reloadT += dt / this.reloadDur;
        if (g.reloadT >= 1) this.finishReload(g, def);
      }
    }
    this.bloom = bloomStep(this.bloom, dt, fired);
    if (this.time - this.lastShotAt > C.recoilBurstReset) this.burstIdx = 0;
    this.applyRecoil(dt, st);

    // ---- left hand
    this.updateLeft(dt, on, sprint, acting, st);

    // ---- move-speed multiplier (ADS / block) via the stats resolver (controller reads `moveSpeed`)
    const adsMul = def ? (C.adsMoveMulByClass[def.class] ?? C.adsMoveMul) : 1;
    const mul = (1 + (adsMul - 1) * this.adsT) * (1 + (C.blockMoveMul - 1) * this.blockT);
    if (Math.abs(mul - this.lastSlowMul) > 0.004) {
      this.lastSlowMul = mul;
      if (mul > 0.998) this.stats.unregister('combat:slow');
      else this.stats.register('combat:slow', [{ key: 'moveSpeed', op: 'mul', value: mul }]);
    }
  }

  render(_alpha: number, frameDt: number): void {
    const def = this.gunDefNow;
    // FOV zoom on top of whatever the controller set this frame (it only rewrites cam.fov when its
    // target moved >0.01, so remember our own write to find the un-zoomed base).
    const cam = this.camera;
    let zoom = 1;
    if (def) zoom = 1 + ((C.adsZoom[def.class] ?? 1.2) - 1) * (this.adsT * this.adsT * (3 - 2 * this.adsT));
    this.vs.zoom = zoom;
    if (cam) {
      const base = cam.fov === this.lastFov ? this.lastBase : cam.fov;
      const fov = zoom > 1.0005 ? (2 * Math.atan(Math.tan((base * DEG) / 2) / zoom)) / DEG : base;
      if (fov !== cam.fov) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      this.lastFov = fov;
      this.lastBase = base;
    }

    if (this.vm) {
      const v = this.vs;
      const g = this.gun;
      const st = this.player.state;
      v.gunId = g?.id ?? null;
      v.leftId = this.leftSlots[this.leftIdx] ?? null;
      v.adsT = this.adsT;
      v.reloadT = g?.reloading ? g.reloadT : -1;
      v.raise = this.swapT < 0 ? 1 : this.swapT < C.swapLower ? 1 - this.swapT / C.swapLower : (this.swapT - C.swapLower) / C.swapRaise;
      v.leftRaise = this.leftSwapT < 0 ? 1 : Math.abs(this.leftSwapT / C.leftSwap - 0.5) * 2;
      v.blockT = this.blockT;
      v.swingT = this.swing ? this.swing.t / this.swing.dur : -1;
      v.sprinting = st.sprinting;
      v.speed = Math.hypot(this.player.velocity.x, this.player.velocity.z) * (this.player.grounded ? 1 : 0);
      v.shotCount = this.shotCount;
      v.yaw = st.yaw;
      v.pitch = st.pitch;
      this.vm.update(frameDt, v);
    }
    for (const s of this.sparks) {
      if (s.life > 0) {
        s.life -= frameDt;
        s.mesh.visible = s.life > 0;
        s.mesh.scale.setScalar(Math.max(0.1, s.life / 0.15));
      }
    }
  }

  // ------------------------------------------------------------------ guns

  private startSwapRight(): void {
    const other = this.guns[this.rightIdx ^ 1];
    if (!other || this.swapT >= 0) return;
    const g = this.gun;
    if (g?.reloading) this.cancelReload(g);
    this.swapT = 0;
    this.swapSwitched = false;
  }

  private canReload(g: GunState, def: GunDef): boolean {
    return !g.reloading && !this.player.state.sprinting && this.swapT < 0 && g.mag < def.mag && this.ammo.get(def.ammo) > 0 && this.player.canFire;
  }

  private startReload(g: GunState, def: GunDef): void {
    g.reloading = true;
    g.reloadT = 0;
    this.reloadDur = reloadDuration(def.reloadTime, g.mag, this.stats.get('reloadSpeed'));
    this.bus.emit('gunReload', { weaponId: def.id, phase: 'start', empty: g.mag === 0 });
  }

  private finishReload(g: GunState, def: GunDef): void {
    const r = reloadFill(g.mag, def.mag, this.ammo.get(def.ammo));
    const taken = this.ammo.get(def.ammo) - r.reserve;
    g.mag = r.mag;
    if (taken > 0) this.ammo.take(def.ammo, taken);
    g.reloading = false;
    g.reloadT = 0;
    this.bus.emit('gunReload', { weaponId: def.id, phase: 'done', empty: false });
  }

  /** Cancel: keeps the fresh mag if past the insert point, otherwise nothing changes. */
  private cancelReload(g: GunState): void {
    const def = gunDef(g.id);
    if (def && g.reloadT >= C.reloadInsertPoint) {
      this.finishReload(g, def);
      return;
    }
    g.reloading = false;
    g.reloadT = 0;
    this.bus.emit('gunReload', { weaponId: g.id, phase: 'cancel', empty: g.mag === 0 });
  }

  private fireShot(g: GunState, def: GunDef): void {
    const p = this.player;
    const st = p.state;
    const rounds = roundsPerShot(def.fireMode, g.mag);
    g.mag -= rounds;
    g.cooldown += fireInterval(def.rpm);
    const pellets = pelletsForShot(def, rounds);
    this.shotCount++;

    // Aim frame (from yaw/pitch at fire time, origin at the eye).
    const cy = Math.cos(st.yaw);
    const sy = Math.sin(st.yaw);
    const cp = Math.cos(st.pitch);
    const sp = Math.sin(st.pitch);
    const fx = -sy * cp;
    const fy = sp;
    const fz = -cy * cp;
    const rx = cy;
    const rz = -sy;
    const ux = sy * sp; // up = right × forward
    const uy = cp;
    const uz = cy * sp;
    const o = this.o;
    o.x = p.position.x;
    o.y = p.position.y + PLAYER_TUNING.eyeHeight;
    o.z = p.position.z;

    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    const spread = computeSpread({
      hip: def.spreadHip,
      ads: def.spreadAds,
      adsT: this.adsT,
      speed,
      walkSpeed: PLAYER_TUNING.walkSpeed,
      airborne: !p.grounded,
      bloom: this.bloom,
      classMul: C.spreadClassMul[def.class] ?? 1,
      adsSway: this.stats.get('adsSway'),
    });
    this.lastSpread = spread;
    const dmgMul = this.stats.get('gunDamage');
    const fireDmg = this.stats.get('gunFireDamage');
    const d = this.d;
    const splash = def.splashRadius ?? 0;
    this.bucketN = 0;
    for (let k = 0; k < this.bucketPool.length; k++) {
      const e = this.bucketPool[k]!;
      e.target = null;
      e.head.count = 0;
      e.body.count = 0;
    }

    for (let i = 0; i < pellets; i++) {
      const off = coneOffset(spread, this.rng.next(), this.rng.next(), coneTmp);
      let dx = fx + rx * off.r + ux * off.u;
      let dy = fy + uy * off.u;
      let dz = fz + rz * off.r + uz * off.u;
      const l = Math.hypot(dx, dy, dz);
      dx /= l;
      dy /= l;
      dz /= l;
      d.x = dx;
      d.y = dy;
      d.z = dz;
      const hit = castBullet(this.world, this.targets.arr, o, d, C.maxRayDist, this.bh);
      if (splash > 0) {
        // Launcher: projectile-less instant blast at the first thing the ray meets.
        if (hit.kind !== 'none') this.explode(def, hit.point.x + hit.normal.x * 0.05 * (hit.kind === 'world' ? 1 : 0), hit.point.y + hit.normal.y * 0.05 * (hit.kind === 'world' ? 1 : 0), hit.point.z + hit.normal.z * 0.05 * (hit.kind === 'world' ? 1 : 0), dmgMul);
        continue;
      }
      if (hit.kind === 'target' && hit.target) {
        const head = hit.region === 'head';
        let e: BucketEntry | null = null;
        for (let k = 0; k < this.bucketN; k++) {
          if (this.bucketPool[k]!.target === hit.target) {
            e = this.bucketPool[k]!;
            break;
          }
        }
        if (!e) {
          if (this.bucketN === this.bucketPool.length) this.bucketPool.push({ target: null, head: newBucket(), body: newBucket() });
          e = this.bucketPool[this.bucketN++]!;
          e.target = hit.target;
          e.head.amount = e.body.amount = 0;
        }
        const b = head ? e.head : e.body;
        if (b.count === 0) b.amount = 0;
        b.amount += bulletDamage(def, hit.distance, head, dmgMul);
        b.count++;
        b.px = hit.point.x;
        b.py = hit.point.y;
        b.pz = hit.point.z;
        b.dx = dx;
        b.dy = dy;
        b.dz = dz;
        this.spark(hit.point, 0xff5030);
      } else if (hit.kind === 'world') {
        this.spark(hit.point, 0xffd890);
        this.impactEv.pos = hit.point;
        this.impactEv.normal = hit.normal;
        this.impactEv.dynamic = hit.dynamic;
        this.bus.emit('bulletImpact', this.impactEv);
      }
    }

    this.bus.emit('gunFired', { weaponId: def.id, pos: { x: o.x, y: o.y, z: o.z }, dir: { x: fx, y: fy, z: fz } });

    // One `damage` per (target, region) bucket, ONE `hit` (hitmarker) per target per shot.
    for (let k = 0; k < this.bucketN; k++) {
      const e = this.bucketPool[k]!;
      const t = e.target!;
      let dealt = 0;
      let anyBlocked = false;
      let killed = false;
      let headHit = false;
      let last: Bucket = e.body;
      for (let reg = 0; reg < 2; reg++) {
        const head = reg === 0;
        const b = head ? e.head : e.body;
        if (b.count === 0) continue;
        const ev: DamageEvent = {
          source: p.id,
          target: t.id,
          amount: b.amount,
          type: def.damageType,
          poiseDamage: def.poiseDamage * b.count,
          hitPos: { x: b.px, y: b.py, z: b.pz },
          headshot: head,
          weaponId: def.id,
          dir: { x: b.dx, y: b.dy, z: b.dz },
        };
        const r = dealDamage(t, ev, this.bus, false);
        dealt += r.dealt;
        if (fireDmg > 0 && !r.blocked && t.alive) {
          // typed Fire bonus: still a `damage` event, but no second hitmarker
          const fr = dealDamage(t, { ...ev, amount: fireDmg * b.count, type: DamageType.Fire, headshot: false, poiseDamage: 0 }, this.bus, false);
          dealt += fr.dealt;
          killed ||= fr.killed;
        }
        anyBlocked ||= r.blocked;
        killed ||= r.killed;
        headHit ||= head;
        last = b;
      }
      const dist = Math.hypot(last.px - o.x, last.py - o.y, last.pz - o.z);
      this.setLastHit(t, headHit, dealt, anyBlocked, killed, dist);
      this.bus.emit('hit', { targetId: t.id, pos: { x: last.px, y: last.py, z: last.pz }, headshot: headHit, dealt, blocked: anyBlocked, killed, weaponId: def.id });
    }

    // recoil
    this.burstIdx++;
    this.lastShotAt = this.time;
    const k = recoilKick(def, this.burstIdx - 1, this.rng.next(), this.adsT > 0.5, this.stats.get('recoil'));
    this.pendUp += k.up;
    this.pendSide += k.side;
  }

  /** Apply pending kick smoothly, honour the player's own counter-pull, recover the rest. */
  private applyRecoil(dt: number, st: PlayerState): void {
    // the player's own look change since our last write (render-rate mouse look)
    const userPitch = (st.pitch - this.expPitch) / DEG;
    let userYaw = (st.yaw - this.expYaw) / DEG;
    userYaw = ((userYaw + 180) % 360 + 360) % 360 - 180;
    if (userPitch < 0 && this.accUp > 0) this.accUp = Math.max(0, this.accUp + userPitch);
    if (userYaw !== 0 && this.accSide !== 0 && Math.sign(userYaw) !== Math.sign(this.accSide)) {
      this.accSide = Math.sign(this.accSide) * Math.max(0, Math.abs(this.accSide) - Math.abs(userYaw));
    }

    let dUp = 0;
    let dSide = 0;
    if (this.pendUp !== 0 || this.pendSide !== 0) {
      const k = 1 - Math.exp(-dt / C.recoilKickTau);
      dUp = this.pendUp * k;
      dSide = this.pendSide * k;
      this.pendUp -= dUp;
      this.pendSide -= dSide;
      if (Math.abs(this.pendUp) < 1e-4) this.pendUp = 0;
      if (Math.abs(this.pendSide) < 1e-4) this.pendSide = 0;
      this.accUp += dUp;
      this.accSide += dSide;
    }
    const idle = this.time - this.lastShotAt;
    if (this.pendUp === 0) {
      const ru = recoilRecover(this.accUp, dt, idle);
      const rs = recoilRecover(this.accSide, dt, idle);
      this.accUp -= ru;
      this.accSide -= rs;
      dUp -= ru;
      dSide -= rs;
    }
    if (dUp !== 0 || dSide !== 0) {
      const lim = Math.PI / 2 - 0.01;
      const want = st.pitch + dUp * DEG;
      st.pitch = Math.max(-lim, Math.min(lim, want));
      // kick the pitch clamp swallowed never reached the camera, so there is nothing to recover
      const lost = (want - st.pitch) / DEG;
      if (lost > 0) this.accUp = Math.max(0, this.accUp - lost);
      st.yaw += dSide * DEG;
      this.player.transform.yaw = st.yaw;
    }
    this.expPitch = st.pitch;
    this.expYaw = st.yaw;
  }

  // ------------------------------------------------------------------ left hand

  private updateLeft(dt: number, on: boolean, sprint: boolean, acting: boolean, st: PlayerState): void {
    const inp = this.input;
    if (on && inp.pressed('swapLeft') && this.leftSwapT < 0 && leftDef(this.leftSlots[this.leftIdx ^ 1] ?? null) && !this.swing) {
      this.leftSwapT = 0;
      this.leftSwapSwitched = false;
    }
    if (this.leftSwapT >= 0) {
      this.leftSwapT += dt;
      if (!this.leftSwapSwitched && this.leftSwapT >= C.leftSwap / 2) {
        this.leftSwapSwitched = true;
        this.leftIdx ^= 1;
        this.blockT = 0;
        this.bus.emit('weaponSwap', { hand: 'L', slot: this.leftIdx, weaponId: this.leftSlots[this.leftIdx] ?? null });
      }
      if (this.leftSwapT >= C.leftSwap) this.leftSwapT = -1;
    }
    const ld = this.leftDefNow;
    this.guardBreakT = Math.max(0, this.guardBreakT - dt);

    // shield: hold to raise
    const wantBlock = on && ld?.class === 'shield' && inp.down('leftHand') && this.guardBreakT <= 0 && !st.exhausted && !sprint && !acting && this.leftSwapT < 0;
    this.blockT = clamp01(this.blockT + ((wantBlock ? 1 : -1) * dt) / C.blockRaise);

    // melee: press to swing (stamina)
    if (ld && ld.class === 'melee') {
      if (on && inp.pressed('leftHand') && !this.swing && !acting && this.leftSwapT < 0) {
        if (this.player.spendStamina(ld.staminaCost)) {
          this.swing = { t: 0, dur: C.swingTime[ld.speed], hit: false, def: ld };
          this.bus.emit('meleeSwing', { weaponId: ld.id });
        } else this.swingDeniedT = 0;
      }
    }
    // a swing in flight is cancelled by dodge/mantle/death/loss of control
    if (this.swing && (!on || acting)) this.swing = null;
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (!s.hit && s.t >= s.dur * C.swingHitFrac) {
        s.hit = true;
        this.meleeHit(s.def);
      }
      if (s.t >= s.dur) this.swing = null;
    }
  }

  private meleeHit(def: MeleeDef): void {
    const p = this.player;
    const st = p.state;
    const cp = Math.cos(st.pitch);
    const fwd = meleeFwd;
    fwd.x = -Math.sin(st.yaw) * cp;
    fwd.y = Math.sin(st.pitch);
    fwd.z = -Math.cos(st.yaw) * cp;
    const ex = p.position.x;
    const ey = p.position.y + PLAYER_TUNING.eyeHeight;
    const ez = p.position.z;
    const mul = this.stats.get('meleeDamage');
    const ray = meleeRay;
    ray.origin.x = ex;
    ray.origin.y = ey;
    ray.origin.z = ez;
    const arr = this.targets.arr;
    for (let ti = 0; ti < arr.length; ti++) {
      const t = arr[ti]!;
      if (!t.alive) continue;
      const tp = t.transform.position;
      const r = t.hit.bodyRadius;
      const y0 = tp.y + r;
      const y1 = tp.y + Math.max(r, t.hit.bodyHeight - r);
      const cy = Math.max(y0, Math.min(y1, ey));
      const vx = tp.x - ex;
      const vy = cy - ey;
      const vz = tp.z - ez;
      if (!inMeleeArc(vx, vy, vz, fwd, def.reach, def.arc, r)) continue;
      const len = Math.hypot(vx, vy, vz) || 1e-6;
      ray.dir.x = vx / len;
      ray.dir.y = vy / len;
      ray.dir.z = vz / len;
      ray.maxDist = Math.max(0, len - r);
      if (ray.maxDist > 0 && this.world.raycast(ray, Layer.World | Layer.Prop)) continue; // wall in the way
      const dist = Math.max(0, len - r);
      const ev: DamageEvent = {
        source: p.id,
        target: t.id,
        amount: def.damage * mul,
        type: def.damageType,
        poiseDamage: def.poiseDamage,
        hitPos: { x: ex + ray.dir.x * dist, y: ey + ray.dir.y * dist, z: ez + ray.dir.z * dist },
        headshot: false,
        weaponId: def.id,
        dir: { x: ray.dir.x, y: ray.dir.y, z: ray.dir.z },
      };
      const res = dealDamage(t, ev, this.bus);
      this.setLastHit(t, false, res.dealt, res.blocked, res.killed, dist);
    }
  }

  private setLastHit(t: HitTarget, head: boolean, dealt: number, blocked: boolean, killed: boolean, dist: number): void {
    const lh = (this.lastHit ??= { label: '', head: false, dealt: 0, blocked: false, killed: false, dist: 0, at: 0 });
    lh.label = (t as { label?: string }).label ?? `#${t.id}`;
    lh.head = head;
    lh.dealt = dealt;
    lh.blocked = blocked;
    lh.killed = killed;
    lh.dist = dist;
    lh.at = this.time;
  }

  /**
   * Instant splash (launcher): linear falloff to 0 at `splashRadius`, measured to the target's body
   * capsule surface. Hits every living target in range (no line-of-sight check) and the player (self-damage).
   */
  private explode(def: GunDef, x: number, y: number, z: number, dmgMul: number): void {
    const R = def.splashRadius ?? 0;
    const p = this.player;
    this.spark({ x, y, z }, 0xffa040);
    const arr = this.targets.arr;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i]!;
      if (!t.alive) continue;
      const tp = t.transform.position;
      const r = t.hit.bodyRadius;
      const dist = distToVCapsule(x, y, z, tp.x, tp.y + r, tp.y + Math.max(r, t.hit.bodyHeight - r), tp.z, r);
      const f = splashFalloff(dist, R);
      if (f <= 0) continue;
      let dx = tp.x - x;
      let dy = tp.y + t.hit.bodyHeight * 0.5 - y;
      let dz = tp.z - z;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      const ev: DamageEvent = {
        source: p.id,
        target: t.id,
        amount: def.damage * dmgMul * f,
        type: DamageType.Explosive,
        poiseDamage: def.poiseDamage * f,
        hitPos: { x: tp.x, y: tp.y + t.hit.bodyHeight * 0.5, z: tp.z },
        headshot: false,
        weaponId: def.id,
        dir: { x: dx, y: dy, z: dz },
      };
      const res = dealDamage(t, ev, this.bus);
      this.setLastHit(t, false, res.dealt, res.blocked, res.killed, Math.hypot(tp.x - this.o.x, tp.y - this.o.y, tp.z - this.o.z));
    }
    // self-damage
    const pp = p.position;
    const pd = distToVCapsule(x, y, z, pp.x, pp.y + 0.4, pp.y + 1.4, pp.z, 0.4);
    const pf = splashFalloff(pd, R);
    if (pf > 0 && p.health.hp > 0) {
      let dx = pp.x - x;
      let dy = pp.y + 0.9 - y;
      let dz = pp.z - z;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      this.hitPlayer({
        source: p.id,
        target: p.id,
        amount: def.damage * dmgMul * pf,
        type: DamageType.Explosive,
        poiseDamage: def.poiseDamage * pf,
        hitPos: { x: pp.x, y: pp.y + 0.9, z: pp.z },
        weaponId: def.id,
        dir: { x: dx, y: dy, z: dz },
      });
    }
  }

  private spark(at: Vec3Like, color: number): void {
    if (!this.sparkGroup) return;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.life = 0.15;
      s.mesh.position.set(at.x, at.y, at.z);
      s.mesh.visible = true;
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      return;
    }
  }
}
