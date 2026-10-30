import type * as THREE from 'three';
import { events as globalEvents, type EventBus } from '../core/events';
import type { DamageEvent, Health, Poise, Transform } from '../core/entity';
import { input as globalInput, type Input } from '../core/input';
import type { Vec3Like } from '../core/types';
import { STATS } from '../data/stats';
import type { StatName } from '../data/types';
import { stats as globalStats } from '../inventory/modifiers';
import type { StatsReader } from '../inventory/types';
import { KinematicCapsule } from '../physics/capsule';
import type { CollisionWorld } from '../physics/types';
import { evalCurve } from './curve';
import { probeMantle, type MantleTarget } from './mantle';
import {
  ROLL_TIERS,
  equipLoadRatio,
  rollDistanceFrac,
  rollInvulnerable,
  rollTierFromRatio,
  type RollParams,
  type RollTier,
} from './rollTier';
import {
  STAMINA_TUNING,
  canUseStamina,
  createStamina,
  drainStamina,
  loseStamina,
  refillStamina,
  regenStamina,
  setMaxStamina,
  spendStamina,
  type StaminaState,
} from './stamina';
import { EstusFlask } from './estus';
import { PLAYER_ENTITY_ID, PLAYER_TUNING } from './tuning';
import type { MoveState, Player, PlayerState } from './types';

declare module '../core/events' {
  interface EventMap {
    /** Stamina hit 0 (§3 exhaustion). HUD flashes the bar red. */
    staminaExhausted: { at: number };
    /** Bar refilled completely after exhaustion. */
    staminaRecovered: { at: number };
    playerJump: { pos: Vec3Like };
    /** Landed; fallSpeed = downward speed at impact (m/s, positive). */
    playerLand: { pos: Vec3Like; fallSpeed: number };
    playerDodge: { dir: Vec3Like; tier: RollTier };
    playerMantle: { pos: Vec3Like; height: number };
    estusDrink: { charges: number; hp: number };
    /** Charges / drink state changed (drink start, interrupt, finish, refill). */
    estusChanged: { charges: number; max: number; drinking: boolean };
  }
}

/** Supplies equip weight + max load (M4 inventory plugs in here). */
export interface EquipLoadProvider {
  /** Total weight of guns, left-hand items and armor. */
  weight(): number;
  /** Max equip load (Endurance curve × `equipLoad` modifier). */
  maxLoad(): number;
}

/** Stat levels the player reads (M6 leveling replaces). */
export type StatLevels = Record<StatName, number>;

export interface PlayerOptions {
  world: CollisionWorld;
  /** Camera driven in render(); omit for headless/tests. */
  camera?: THREE.PerspectiveCamera;
  input?: Input;
  stats?: StatsReader;
  events?: EventBus;
  /** Sim clock seconds (event timestamps). */
  now?: () => number;
  spawn?: { pos: Vec3Like; yaw: number };
}

/** Default provider: fixed debug weight vs. the Endurance curve. Start kit (Operator Fatigues) ≈ light. */
export class SimpleEquipLoad implements EquipLoadProvider {
  constructor(
    public weightValue: number,
    private readonly levels: () => StatLevels,
    private readonly mods: StatsReader,
  ) {}
  weight(): number {
    return this.weightValue;
  }
  maxLoad(): number {
    return evalCurve(STATS.maxEquipLoad, this.levels().endurance) * this.mods.get('equipLoad');
  }
}

const T = PLAYER_TUNING;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const smoothstep = (u: number) => u * u * (3 - 2 * u);

interface MantleAnim {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  t: number;
}

const mantleOpts = (minHeight: number) => ({
  radius: T.radius,
  reach: T.mantleReach,
  minHeight,
  maxHeight: T.mantleMaxHeight,
  inset: T.mantleInset,
  facing: T.mantleFacing,
});
const MANTLE_OPTS_GROUND = mantleOpts(T.mantleMinHeight);
const MANTLE_OPTS_AIR = mantleOpts(T.mantleMinHeightAir);

/** Camera effects computed per sim tick (render interpolates prev→cur). */
interface CamFx {
  y: number;
  pitch: number;
  roll: number;
  fov: number;
}

/**
 * The player (§3): FPS camera + kinematic capsule + move/sprint/jump/mantle/dodge, stamina with
 * the exhaustion rule, DS1 roll tiers from equip load, health/estus stubs.
 * Register as a System after `input`. Sim at 60 Hz; camera look + interpolation in render().
 */
const KNOCK_GETUP = 0.3;
const KNOCK_SLIDE = 5; // initial slide speed (m/s), decays quadratically

export class PlayerController implements Player {
  readonly name = 'player';
  readonly id = PLAYER_ENTITY_ID;
  readonly team = 'player' as const;
  readonly capsule: KinematicCapsule;
  readonly transform: Transform;
  readonly health: Health;
  readonly poise: Poise = { current: 0, max: 0 };
  /** Dodge i-frames active. Damage is ignored while true. */
  invulnerable = false;
  /** Mantle probe result this tick (context prompt in M6). */
  canMantle = false;
  mantleTarget: MantleTarget | null = null;
  rollTier: RollTier = 'normal';
  equipLoad = 0;
  levels: StatLevels = { ...STATS.start };
  equipLoadProvider: EquipLoadProvider;
  /** Armor absorb: maps an incoming hit to HP lost. Inventory installs this (M4); default = raw amount. */
  damageFilter: (e: DamageEvent) => number = (e) => e.amount;
  /** Disable to freeze input (menus, death cam). */
  controlsEnabled = true;
  /** External hold (ladder climb): locomotion/gravity/buffers are skipped; mouse look still works. The holder moves us via teleport(). */
  hold = false;
  /** Climb target set by the ladder: applied every tick while `hold` so render interpolation stays smooth. */
  private holdTarget: { x: number; y: number; z: number } | null = null;
  /** Knockdown (barrel hit): seconds left lying down, then get-up i-frames. */
  private knockT = 0;
  private knockGetUpT = 0;
  private knockDirX = 0;
  private knockDirZ = 0;
  private knockTotal = 0;
  /** Estus Flask (§3): charges, drink lock, interrupt. */
  readonly estus = new EstusFlask(STATS.estusCharges, STATS.estusHeal);

  private world: CollisionWorld;
  private readonly camera: THREE.PerspectiveCamera | null;
  private readonly input: Input;
  private readonly stats: StatsReader;
  private readonly bus: EventBus;
  private readonly now: () => number;
  private readonly _state: PlayerState;
  private stamina: StaminaState;

  private readonly prev = { x: 0, y: 0, z: 0 };
  private coyote = 0;
  private jumpBuf = 0;
  private dodgeBuf = 0;
  private dodgeT = 0;
  private dodgeDirX = 0;
  private dodgeDirZ = 0;
  private dodgeSide = 0;
  private roll: RollParams = ROLL_TIERS.normal;
  private mantle: MantleAnim | null = null;
  private stepOffset = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private readonly fx: CamFx = { y: 0, pitch: 0, roll: 0, fov: T.fov };
  private readonly fxPrev: CamFx = { y: 0, pitch: 0, roll: 0, fov: T.fov };
  private wasExhausted = false;
  /** Seconds left in which a held jump may still grab a ledge in the air (armed by the takeoff press). */
  private jumpGrab = 0;
  private promptTicks = 0;
  private readonly fwd = { x: 0, z: -1 };
  private readonly mantleScratch: MantleTarget = { height: 0, end: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } };
  private readonly mantlePos = { x: 0, y: 0, z: 0 };

  /** Souls carried (the wallet plugs in here); reported in `playerDied` for the bloodstain. */
  soulsProvider: () => number = () => 0;

  constructor(opts: PlayerOptions) {
    this.world = opts.world;
    this.camera = opts.camera ?? null;
    this.input = opts.input ?? globalInput;
    this.stats = opts.stats ?? globalStats;
    this.bus = opts.events ?? globalEvents;
    this.now = opts.now ?? (() => 0);
    this.capsule = new KinematicCapsule({ radius: T.radius, height: T.height, stepHeight: T.stepHeight, slopeLimitDeg: T.slopeLimitDeg });
    this.transform = { position: this.capsule.position, yaw: 0 };
    const maxHp = this.computeMaxHp();
    this.health = { hp: maxHp, maxHp };
    this.stamina = createStamina(this.computeMaxStamina());
    this.equipLoadProvider = new SimpleEquipLoad(6, () => this.levels, this.stats);
    this._state = {
      move: 'ground',
      stamina: this.stamina.value,
      maxStamina: this.stamina.max,
      exhausted: false,
      estusCharges: STATS.estusCharges,
      sprinting: false,
      ads: false,
      adsT: 0,
      yaw: 0,
      pitch: 0,
    };
    if (opts.spawn) this.respawn(opts.spawn.pos, opts.spawn.yaw);
    this.bus.on('damage', (e) => this.onDamage(e));
    this.bus.on('playerKnockdown', (e) => this.knockDown(e.dir, e.duration));
  }

  /** True while lying down or getting up after a knockdown. */
  get knockedDown(): boolean {
    return this._state.move === 'knockdown';
  }

  /** Souls-like knockdown: no input for `duration`, slide along `dir`, then ~0.3s get-up with i-frames. */
  knockDown(dir: Vec3Like, duration: number): void {
    const s = this._state;
    if (s.move === 'dead' || s.move === 'knockdown' || this.invulnerable) return;
    const l = Math.hypot(dir.x, dir.z) || 1;
    this.knockDirX = dir.x / l;
    this.knockDirZ = dir.z / l;
    this.knockT = this.knockTotal = Math.max(0.1, duration);
    this.knockGetUpT = KNOCK_GETUP;
    this.mantle = null;
    this.mantleTarget = null;
    this.canMantle = false;
    if (this.estus.interrupt()) this.emitEstusChanged();
    this.jumpBuf = this.dodgeBuf = 0;
    s.move = 'knockdown';
    s.sprinting = false;
  }

  /** Ladder: move to `pos` over the next tick (interpolated by render) while `hold` is set. */
  climbTo(pos: Vec3Like, yaw: number): void {
    this.holdTarget = { x: pos.x, y: pos.y, z: pos.z };
    this._state.yaw = this.transform.yaw = yaw;
  }

  // ------------------------------------------------------------------ public API
  get state(): Readonly<PlayerState> {
    return this._state;
  }
  get position(): Vec3Like {
    return this.capsule.position;
  }
  get velocity(): Vec3Like {
    return this.capsule.velocity;
  }
  get grounded(): boolean {
    return this.capsule.grounded;
  }
  /** Guns may fire (not during roll / mantle / death). */
  get canFire(): boolean {
    const m = this._state.move;
    return (m === 'ground' || m === 'air') && !this.estus.drinking;
  }
  get staminaState(): StaminaState {
    return this.stamina;
  }

  setWorld(world: CollisionWorld): void {
    this.world = world;
  }

  spendStamina(amount: number): boolean {
    const next = spendStamina(this.stamina, amount);
    if (!next) return false;
    this.stamina = next;
    this.syncStamina();
    return true;
  }

  /** Forced stamina loss (shield blocks): ignores exhaustion gating and may empty the bar. */
  loseStamina(amount: number): void {
    this.stamina = loseStamina(this.stamina, amount);
    this.syncStamina();
  }

  respawn(pos: Vec3Like, yaw: number): void {
    this.capsule.teleport(pos);
    this.prev.x = pos.x;
    this.prev.y = pos.y;
    this.prev.z = pos.z;
    this._state.yaw = this.transform.yaw = yaw;
    this._state.pitch = 0;
    this._state.move = 'ground';
    this.mantle = null;
    this.mantleTarget = null;
    this.canMantle = false;
    this.jumpGrab = 0;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.promptTicks = 0;
    this.invulnerable = false;
    this.health.maxHp = this.computeMaxHp();
    this.health.hp = this.health.maxHp;
    this.estus.refill();
    this._state.estusCharges = this.estus.charges;
    this.stamina = refillStamina(setMaxStamina(this.stamina, this.computeMaxStamina()));
    this.stepOffset = 0;
    this.syncStamina();
  }

  /** Dev/teleport: move without refilling anything (unlike respawn). */
  teleport(pos: Vec3Like, yaw: number): void {
    this.capsule.teleport(pos);
    this.prev.x = pos.x;
    this.prev.y = pos.y;
    this.prev.z = pos.z;
    this._state.yaw = this.transform.yaw = yaw;
    this.capsule.velocity.x = this.capsule.velocity.y = this.capsule.velocity.z = 0;
    this.bus.emit('playerTeleported', { pos: { x: pos.x, y: pos.y, z: pos.z } });
  }

  /** Start an estus drink (§3): spends a charge, slow movement, heal lands mid-drink, hit interrupts. */
  drinkEstus(): boolean {
    const s = this._state;
    if ((s.move !== 'ground' && s.move !== 'air') || s.sprinting) return false;
    if (!this.estus.start(this.health.hp, this.health.maxHp)) return false;
    s.estusCharges = this.estus.charges;
    s.move = 'drinking';
    this.bus.emit('estusDrink', { charges: s.estusCharges, hp: this.health.hp });
    this.emitEstusChanged();
    return true;
  }

  /** Set charges (save load). */
  setEstusCharges(n: number): void {
    this.estus.setCharges(n);
    this._state.estusCharges = this.estus.charges;
    this.emitEstusChanged();
  }

  private emitEstusChanged(): void {
    this.bus.emit('estusChanged', { charges: this.estus.charges, max: this.estus.max, drinking: this.estus.drinking });
  }

  /**
   * Re-derive max HP / max stamina (and roll tier; regen + max equip load already read `levels` live) from `levels`
   * and the modifier bonuses. Growth also adds the gained amount to the current value (a full bar stays full);
   * `refill` tops everything up.
   */
  recomputeStats(refill = false): void {
    const hpMax = this.computeMaxHp();
    const dHp = hpMax - this.health.maxHp;
    this.health.maxHp = hpMax;
    this.health.hp = refill ? hpMax : this.health.hp <= 0 ? 0 : Math.min(hpMax, this.health.hp + Math.max(0, dHp));
    const sMax = this.computeMaxStamina();
    const dSt = sMax - this.stamina.max;
    this.stamina = setMaxStamina(this.stamina, sMax);
    if (refill) this.stamina = refillStamina(this.stamina);
    else if (dSt > 0) this.stamina = { ...this.stamina, value: Math.min(sMax, this.stamina.value + dSt) };
    this.refreshDerived();
    this.syncStamina();
  }

  /** Bonfire rest: refill estus + HP + stamina. */
  refill(): void {
    this.estus.refill();
    this._state.estusCharges = this.estus.charges;
    this.emitEstusChanged();
    this.health.hp = this.health.maxHp;
    this.stamina = refillStamina(this.stamina);
    this.syncStamina();
  }

  // ------------------------------------------------------------------ System
  update(dt: number): void {
    const p = this.capsule.position;
    this.prev.x = p.x;
    this.prev.y = p.y;
    this.prev.z = p.z;
    Object.assign(this.fxPrev, this.fx);

    const inp = this.input;
    const on = this.controlsEnabled && !this.hold;
    this.jumpBuf = on && inp.pressed('jump') ? T.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    this.dodgeBuf = on && inp.pressed('dodge') ? T.dodgeBuffer : Math.max(0, this.dodgeBuf - dt);
    if (on && inp.pressed('estus')) this.drinkEstus();
    if (this.estus.drinking) {
      const heal = this.estus.update(dt);
      if (heal > 0) this.health.hp = Math.min(this.health.maxHp, this.health.hp + heal);
      if (!this.estus.drinking) this.emitEstusChanged();
    }

    this.refreshDerived();

    const moveBefore = this._state.move;
    if (!this.hold) this.holdTarget = null;
    if (this.hold) {
      if (this.holdTarget) this.capsule.teleport(this.holdTarget);
      // Scripted climb: never grounded (deathloop / plunge must not see a stale flag) and no leftover i-frames.
      this.capsule.setGrounded(false);
      this.invulnerable = false;
      this.capsule.velocity.x = this.capsule.velocity.y = this.capsule.velocity.z = 0;
    } else
    switch (this._state.move) {
      case 'mantle':
        this.tickMantle(dt);
        break;
      case 'dodge':
        this.tickDodge(dt);
        break;
      case 'knockdown':
        this.tickKnockdown(dt);
        break;
      case 'dead':
        this.capsule.velocity.x = this.capsule.velocity.z = 0;
        this.applyGravityAndMove(dt);
        break;
      default:
        this.tickLocomotion(dt);
    }

    // Regen (gated only by the delay timer, which every spend/drain restarts: so sprinting drains
    // keep it paused, and airborne sprint — which drains nothing — does not). Rolling/mantling
    // keep the delay counting down at rate 0; when they END the delay is re-armed to a full
    // regenDelay, so the post-action pause is not eaten by the action itself.
    const m = this._state.move;
    const acting = m === 'dodge' || m === 'mantle';
    const st = this.stamina;
    if (!acting && (moveBefore === 'dodge' || moveBefore === 'mantle')) {
      if (st.delay < STAMINA_TUNING.regenDelay) this.stamina = { value: st.value, max: st.max, exhausted: st.exhausted, delay: STAMINA_TUNING.regenDelay };
    } else if (acting) {
      this.stamina = regenStamina(st, dt, 0);
    } else if (st.value < st.max || st.exhausted || st.delay > 0) {
      const rate = evalCurve(STATS.staminaRegen, this.levels.endurance) * this.stats.get('staminaRegen');
      this.stamina = regenStamina(st, dt, rate);
    }
    this.syncStamina();
    this.tickCamFx(dt);
  }

  render(alpha: number, _frameDt: number): void {
    const cam = this.camera;
    const s = this._state;
    // Mouse look at render rate (smooth on high-Hz displays).
    const d = this.input.takeLookDelta();
    if (this.controlsEnabled && s.move !== 'dead') {
      s.yaw -= d.x * T.mouseSensitivity;
      s.pitch -= d.y * T.mouseSensitivity;
      const lim = Math.PI / 2 - 0.01;
      s.pitch = s.pitch < -lim ? -lim : s.pitch > lim ? lim : s.pitch;
      s.yaw = ((s.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.transform.yaw = s.yaw;
    }
    if (!cam) return;
    const p = this.capsule.position;
    const a = alpha;
    const fp = this.fxPrev;
    const f = this.fx;
    cam.position.set(
      this.prev.x + (p.x - this.prev.x) * a,
      this.prev.y + (p.y - this.prev.y) * a + T.eyeHeight + fp.y + (f.y - fp.y) * a,
      this.prev.z + (p.z - this.prev.z) * a,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(s.pitch + fp.pitch + (f.pitch - fp.pitch) * a, s.yaw, fp.roll + (f.roll - fp.roll) * a);
    const fov = fp.fov + (f.fov - fp.fov) * a;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ internals
  private computeMaxHp(): number {
    return Math.round(evalCurve(STATS.maxHp, this.levels?.vitality ?? STATS.start.vitality) + this.stats.get('maxHpBonus'));
  }
  private computeMaxStamina(): number {
    return Math.round(evalCurve(STATS.maxStamina, this.levels?.endurance ?? STATS.start.endurance) + this.stats.get('maxStaminaBonus'));
  }

  private refreshDerived(): void {
    const lp = this.equipLoadProvider;
    this.equipLoad = equipLoadRatio(lp.weight(), lp.maxLoad());
    this.rollTier = rollTierFromRatio(this.equipLoad);
    this.stamina = setMaxStamina(this.stamina, this.computeMaxStamina());
    this.poise.max = this.poise.current = this.stats.get('poise');
  }

  private moveSpeedMul(): number {
    return ROLL_TIERS[this.rollTier].moveSpeedMul * this.stats.get('moveSpeed');
  }

  /** Look direction on the ground plane. Returns a shared scratch object: read it immediately. */
  private forward(): { x: number; z: number } {
    const y = this._state.yaw;
    const f = this.fwd;
    f.x = -Math.sin(y);
    f.z = -Math.cos(y);
    return f;
  }

  private tickLocomotion(dt: number): void {
    const cap = this.capsule;
    const v = cap.velocity;
    const s = this._state;
    const grounded = cap.grounded;
    this.coyote = grounded ? T.coyoteTime : Math.max(0, this.coyote - dt);
    const canGround = grounded || this.coyote > 0;

    // Wish direction (camera-relative).
    const inp = this.input;
    const ctl = this.controlsEnabled;
    let mx = ctl ? (inp.down('moveRight') ? 1 : 0) - (inp.down('moveLeft') ? 1 : 0) : 0;
    let my = ctl ? (inp.down('moveForward') ? 1 : 0) - (inp.down('moveBack') ? 1 : 0) : 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const f = this.forward();
    const rx = -f.z; // right = (cos yaw, -sin yaw)
    const rz = f.x;
    const wx = rx * mx + f.x * my;
    const wz = rz * mx + f.z * my;
    const moving = ml > 0;

    // Sprint (no backpedal sprint; fat roll disables it).
    const tier = ROLL_TIERS[this.rollTier];
    const wantSprint = !this.estus.drinking && this.controlsEnabled && this.input.down('sprint') && moving && my >= 0 && tier.canSprint;
    let sprinting = wantSprint && canUseStamina(this.stamina) && (grounded || s.sprinting);
    if (sprinting && grounded) {
      this.stamina = drainStamina(this.stamina, T.sprintCostPerSec * this.stats.get('sprintStaminaCost'), dt);
      if (this.stamina.exhausted) sprinting = false;
    }
    s.sprinting = sprinting;

    const speed = (sprinting ? T.sprintSpeed : T.walkSpeed) * this.moveSpeedMul() * this.estus.moveMul;
    const tx = wx * speed;
    const tz = wz * speed;
    if (grounded) this.accelerate(tx, tz, moving ? T.groundAccel : T.groundDecel, dt);
    else if (moving) this.accelerate(tx, tz, T.airAccel, dt);

    // Mantle: a jump press (buffered) near a ledge. In the air, a fresh press grabs too, and Space
    // held from the takeoff press stays armed for `mantleGrabWindow` (jump-grab of tall walls).
    this.jumpGrab = Math.max(0, this.jumpGrab - dt);
    const wantMantle = !this.estus.drinking && (this.jumpBuf > 0 || (!grounded && this.jumpGrab > 0 && ctl && inp.down('jump') && v.y < 3));
    // Probe only when a grab is wanted, plus a throttled probe for the HUD prompt.
    const promptDue = --this.promptTicks <= 0;
    if (promptDue) this.promptTicks = T.mantlePromptEvery;
    if (wantMantle || promptDue) this.probeMantle(grounded);
    if (wantMantle && this.mantleTarget && canUseStamina(this.stamina)) {
      this.startMantle(this.mantleTarget);
      return;
    }
    // Jump
    if (this.estus.drinking) {
      // drink lock: no jump / roll
    } else if (this.jumpBuf > 0 && canGround && canUseStamina(this.stamina)) {
      this.spendStamina(T.jumpCost);
      v.y = Math.sqrt(2 * T.gravity * T.jumpHeight);
      this.jumpBuf = 0;
      this.coyote = 0;
      this.jumpGrab = T.mantleGrabWindow;
      this.bus.emit('playerJump', { pos: { ...cap.position } });
    } else if (this.dodgeBuf > 0 && canGround && canUseStamina(this.stamina)) {
      // Dodge
      this.startDodge(moving ? wx : -f.x, moving ? wz : -f.z, dt);
      return;
    }

    this.applyGravityAndMove(dt);
    s.move = this.estus.drinking ? 'drinking' : cap.grounded ? 'ground' : 'air';

    // Head bob
    const hs = Math.hypot(v.x, v.z);
    if (cap.grounded && hs > 0.5) {
      this.bobPhase += ((hs * dt) / T.bobStride) * Math.PI * 2;
      const target = (sprinting ? T.bobSprint : T.bobWalk) * Math.min(1, hs / T.walkSpeed);
      this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 10);
    } else this.bobAmp += (0 - this.bobAmp) * Math.min(1, dt * 8);
  }

  /** Move horizontal velocity toward (tx, tz) by at most accel*dt. */
  private accelerate(tx: number, tz: number, accel: number, dt: number): void {
    const v = this.capsule.velocity;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const d = Math.hypot(dx, dz);
    const max = accel * dt;
    if (d <= max || d === 0) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / d) * max;
      v.z += (dz / d) * max;
    }
  }

  private applyGravityAndMove(dt: number): void {
    const cap = this.capsule;
    const v = cap.velocity;
    const wasGrounded = cap.grounded;
    v.y = Math.max(v.y - T.gravity * dt, -T.terminalVelocity);
    const fallSpeed = -v.y;
    cap.move(dt, this.world);
    // Step-up / snap: hide the vertical pop with a decaying camera offset.
    if (cap.grounded && cap.lastStepUp !== 0) this.stepOffset = Math.max(-0.45, Math.min(0.45, this.stepOffset - cap.lastStepUp));
    if (!wasGrounded && cap.grounded && fallSpeed > 0) {
      if (fallSpeed > 3) this.stepOffset -= Math.min(T.landDipMax, fallSpeed * T.landDipPerMs);
      this.bus.emit('playerLand', { pos: { ...cap.position }, fallSpeed });
    }
  }

  private probeMantle(grounded: boolean): void {
    const f = this.forward();
    this.mantleTarget = probeMantle(
      this.world,
      this.capsule,
      this.capsule.position,
      f.x,
      f.z,
      grounded ? MANTLE_OPTS_GROUND : MANTLE_OPTS_AIR,
      this.mantleScratch,
    );
    this.canMantle = this.mantleTarget !== null && canUseStamina(this.stamina);
  }

  private startMantle(t: MantleTarget): void {
    const p = this.capsule.position;
    this.spendStamina(T.mantleCost);
    this.mantle = { sx: p.x, sy: p.y, sz: p.z, ex: t.end.x, ey: t.end.y, ez: t.end.z, t: 0 };
    const v = this.capsule.velocity;
    v.x = v.y = v.z = 0;
    // Scripted motion from here: clear grounded so the closing move(0) decides it afresh.
    this.capsule.setGrounded(false);
    this.jumpGrab = 0;
    this._state.move = 'mantle';
    this._state.sprinting = false;
    this.jumpBuf = 0;
    this.canMantle = false;
    this.bus.emit('playerMantle', { pos: { ...p }, height: t.height });
  }

  private tickMantle(dt: number): void {
    const m = this.mantle!;
    m.t += dt;
    const u = clamp01(m.t / T.mantleDuration);
    const uy = easeOutCubic(clamp01(u / 0.7));
    const uxz = smoothstep(clamp01((u - 0.3) / 0.7));
    const mp = this.mantlePos;
    mp.x = m.sx + (m.ex - m.sx) * uxz;
    mp.y = m.sy + (m.ey - m.sy) * uy;
    mp.z = m.sz + (m.ez - m.sz) * uxz;
    this.capsule.setPosition(mp);
    if (u >= 1) {
      this.mantle = null;
      // Carry a little forward momentum onto the ledge.
      const f = this.forward();
      const v = this.capsule.velocity;
      v.x = f.x * 1.5;
      v.z = f.z * 1.5;
      v.y = 0;
      this.capsule.move(0, this.world); // settle + ground flag
      const grounded = this.capsule.grounded;
      this._state.move = grounded ? 'ground' : 'air';
      this.coyote = grounded ? T.coyoteTime : 0;
      if (grounded) this.bus.emit('playerLand', { pos: { ...this.capsule.position }, fallSpeed: 0 });
    }
  }

  private startDodge(dx: number, dz: number, dt: number): void {
    const l = Math.hypot(dx, dz) || 1;
    this.dodgeDirX = dx / l;
    this.dodgeDirZ = dz / l;
    const f = this.forward();
    this.dodgeSide = this.dodgeDirX * -f.z + this.dodgeDirZ * f.x; // dot with right
    this.roll = ROLL_TIERS[this.rollTier];
    this.spendStamina(T.dodgeCost);
    this.dodgeT = 0;
    this.dodgeBuf = 0;
    this._state.move = 'dodge';
    this._state.sprinting = false;
    this.bus.emit('playerDodge', { dir: { x: this.dodgeDirX, y: 0, z: this.dodgeDirZ }, tier: this.rollTier });
    this.tickDodge(dt); // first roll tick runs now (no dead tick between the press and movement)
  }

  private tickDodge(dt: number): void {
    const p = this.roll;
    const t0 = this.dodgeT;
    const t1 = t0 + dt;
    this.dodgeT = t1;
    const speed = ((rollDistanceFrac(p, t1) - rollDistanceFrac(p, t0)) * p.distance) / dt;
    const v = this.capsule.velocity;
    v.x = this.dodgeDirX * speed;
    v.z = this.dodgeDirZ * speed;
    // Evaluate at the tick midpoint: window edges never land on a tick boundary (stable at any dt).
    this.invulnerable = rollInvulnerable(p, (t0 + t1) * 0.5);
    this.applyGravityAndMove(dt);
    if (t1 >= p.duration) {
      this.invulnerable = false;
      this._state.move = this.capsule.grounded ? 'ground' : 'air';
      this.coyote = this.capsule.grounded ? T.coyoteTime : 0;
    }
  }

  private tickKnockdown(dt: number): void {
    const v = this.capsule.velocity;
    if (this.knockT > 0) {
      this.knockT -= dt;
      const u = Math.max(0, this.knockT) / this.knockTotal; // 1 -> 0
      const sp = KNOCK_SLIDE * u * u;
      v.x = this.knockDirX * sp;
      v.z = this.knockDirZ * sp;
      this.invulnerable = false;
    } else {
      v.x = v.z = 0;
      this.invulnerable = true; // get-up i-frames
      this.knockGetUpT -= dt;
      if (this.knockGetUpT <= 0) {
        this.invulnerable = false;
        this._state.move = this.capsule.grounded ? 'ground' : 'air';
      }
    }
    this.applyGravityAndMove(dt);
  }

  private tickCamFx(dt: number): void {
    const fx = this.fx;
    this.stepOffset *= Math.exp(-T.stepSmoothRate * dt);
    let y = this.stepOffset + Math.sin(this.bobPhase * 2) * this.bobAmp * 0.5;
    let pitch = 0;
    let roll = Math.sin(this.bobPhase) * this.bobAmp * 0.12;
    const s = this._state;
    if (s.move === 'dodge') {
      const u = clamp01(this.dodgeT / this.roll.duration);
      const w = Math.sin(Math.PI * u);
      y -= T.dodgeCamDrop * w;
      roll -= this.dodgeSide * T.dodgeCamRoll * w;
      pitch -= 0.05 * w;
    } else if (s.move === 'mantle' && this.mantle) {
      const u = clamp01(this.mantle.t / T.mantleDuration);
      pitch -= T.mantleCamDip * Math.sin(Math.PI * u);
    }
    if (s.move === 'knockdown') {
      // drop to the floor, tilt over, rise during get-up
      const rise = this.knockT > 0 ? 0 : clamp01(1 - this.knockGetUpT / KNOCK_GETUP);
      const down = this.knockT > 0 ? clamp01((this.knockTotal - this.knockT) / 0.12) : 1 - rise;
      y -= 1.1 * down;
      roll += 0.7 * down;
      pitch -= 0.25 * down;
    }
    fx.y = y;
    fx.pitch = pitch;
    fx.roll = roll;
    const fovT = T.fov + (s.sprinting && Math.hypot(this.capsule.velocity.x, this.capsule.velocity.z) > T.walkSpeed ? T.sprintFovKick : 0);
    fx.fov += (fovT - fx.fov) * Math.min(1, dt * 8);
  }

  private syncStamina(): void {
    const s = this._state;
    const st = this.stamina;
    s.stamina = st.value;
    s.maxStamina = st.max;
    s.exhausted = st.exhausted;
    if (st.exhausted && !this.wasExhausted) {
      s.sprinting = false;
      this.bus.emit('staminaExhausted', { at: this.now() });
    } else if (!st.exhausted && this.wasExhausted) this.bus.emit('staminaRecovered', { at: this.now() });
    this.wasExhausted = st.exhausted;
  }

  /** Health stub: raw damage, no absorb yet (TODO M4: absorb/poise/flinch). */
  private onDamage(e: DamageEvent): void {
    if (e.target !== this.id || this.invulnerable || this._state.move === 'dead') return;
    const dealt = this.damageFilter(e);
    this.health.hp = Math.max(0, this.health.hp - dealt);
    if (dealt > 0 && this.estus.interrupt()) this.emitEstusChanged();
    if (this.health.hp <= 0) {
      this._state.move = 'dead' as MoveState; // TODO M5: death loop / bloodstain
      // Once per death (the guard above blocks further hits while dead).
      const p = this.capsule.position;
      this.bus.emit('playerDied', { pos: { x: p.x, y: p.y, z: p.z }, souls: this.soulsProvider() });
    }
  }
}
