import type { Object3D } from 'three';
import { type DamageEvent, type EntityId, type Health, type Poise, type Transform } from '../core/entity';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Vec3Like } from '../core/types';
import type { HitShape, HitTarget } from '../combat/targets';
import { hitsFront, inMeleeArc } from '../combat/math';
import type { DamageResult } from '../combat/types';
import type { EnemyArchetype, EnemyAttackDef, EnemyDef } from '../data/types';
import type { StatsReader } from '../inventory/types';
import { KinematicCapsule } from '../physics/capsule';
import type { CollisionWorld } from '../physics/types';
import { Fsm } from './fsm';
import { applyPoiseDamage, canSee, tickPoise, turnToward, wrapAngle, yawTo, type SightParams } from './logic';
import type { LineOfSight } from './perception';
import type { AiContext, AiStateId, EnemyInstance, FsmState, NavGraph } from './types';

// ------------------------------------------------------------------ contracts the AI consumes

/** What enemies need from the player (PlayerController satisfies it). */
export interface AiTarget {
  readonly id: EntityId;
  /** Feet. */
  readonly position: Vec3Like;
  readonly health: { hp: number };
  /** Optional body for enemy-vs-player overlap push-out (PlayerController has one). Default radius 0.35. */
  readonly capsule?: { readonly radius: number };
}

/** What enemies need from combat (CombatSystem satisfies it). */
export interface AiCombat {
  addTarget(t: HitTarget): void;
  removeTarget(t: HitTarget): void;
  hitPlayer(e: DamageEvent): DamageResult;
}

/** Shared services, one per AI system. */
export interface AiShared {
  readonly world: CollisionWorld;
  readonly combat: AiCombat;
  readonly player: AiTarget;
  readonly stats: StatsReader;
  readonly bus: EventBus;
  readonly rng: Rng;
  readonly los: LineOfSight;
  nav: NavGraph | null;
  /** Souls-style attack tokens: at most `maxAttackers` enemies in windup/attack at once. */
  attackers: number;
  maxAttackers: number;
}

/**
 * AI tuning NOT in data/enemies (PLAN gives behaviour only). Per-archetype overrides live with the
 * archetype (hollow.ts). Distances m, times s, angles rad unless noted.
 */
export interface AiTuning {
  walkSpeed: number;
  /** Chase speed multiplier on EnemyDef.moveSpeed. */
  chaseSpeedMul: number;
  accel: number;
  turnRate: number;
  /** Tracking during windup (commit happens at active frames: 0 turn). */
  windupTurnRate: number;
  /** Sight cone (deg) while unaware; aware enemies track 360°. */
  fovDeg: number;
  /** Noticed regardless of facing inside this radius (with LOS). */
  proximity: number;
  /** Aware enemies keep sight out to aggroRadius × this. */
  awareSightMul: number;
  /** "Notice" beat before chasing (§9 leniency: a readable aggro telegraph). */
  alertTime: number;
  hitReactTime: number;
  staggerTime: number;
  staggerKnockback: number;
  /**
   * Anti-stunlock: poise damage is ignored while staggered and for this long (s) after it ends, so
   * an automatic weapon can't chain staggers forever. HP damage still applies.
   */
  staggerImmunity: number;
  poiseRegenDelay: number;
  /** Max distance from home before giving up. */
  leashRadius: number;
  /** Seconds the player stays tracked after losing sight. */
  memory: number;
  /** Hold position this close to the player. */
  stopDist: number;
  attackCooldown: readonly [min: number, max: number];
  /** Must face the player within this angle (rad) to start an attack. */
  attackFacing: number;
  /** Forward lunge speed during active frames. */
  lungeSpeed: number;
  /** Extra hit reach beyond the attack's trigger range. */
  reachBonus: number;
  wanderRadius: number;
  idleTime: readonly [min: number, max: number];
  losInterval: number;
  repathInterval: number;
  /** Death: fall time, corpse lingering, sink-into-ground time. */
  deathFall: number;
  corpseTime: number;
  sinkTime: number;
  capsuleRadius: number;
  capsuleHeight: number;
  eyeHeight: number;
  /** Shoulder height the melee arc is measured from. */
  chestHeight: number;
}

export const DEFAULT_AI_TUNING: AiTuning = {
  walkSpeed: 1.1,
  chaseSpeedMul: 1,
  accel: 14,
  turnRate: 5,
  windupTurnRate: 2.6,
  fovDeg: 140,
  proximity: 4,
  awareSightMul: 1.6,
  alertTime: 0.5,
  hitReactTime: 0.3,
  staggerTime: 0.9,
  staggerKnockback: 2.2,
  staggerImmunity: 0.5,
  poiseRegenDelay: 2.5,
  leashRadius: 30,
  memory: 5,
  stopDist: 1.6,
  attackCooldown: [0.35, 1.1],
  attackFacing: 0.6,
  lungeSpeed: 2.4,
  reachBonus: 0.25,
  wanderRadius: 3,
  idleTime: [2.5, 5],
  losInterval: 0.2,
  repathInterval: 0.5,
  deathFall: 0.6,
  corpseTime: 2.5,
  sinkTime: 1.2,
  capsuleRadius: 0.3,
  capsuleHeight: 1.7,
  eyeHeight: 1.55,
  chestHeight: 1.25,
};

/** Per-attack AI extras keyed by EnemyAttackDef.id (animation key, combo chaining). */
export interface AttackExtra {
  /** View animation key (archetype-defined, e.g. 'overhead'). */
  anim?: string;
  /** Attack id to chain into from recover (combo). */
  followUp?: string;
  followUpChance?: number;
  /** Recover time before the follow-up's windup (replaces this attack's full recover). */
  followUpDelay?: number;
  /** Only usable as a follow-up, never as an opener. */
  followUpOnly?: boolean;
}

/** Visual side of an enemy. `null` views run headless (tests). */
export interface EnemyView {
  readonly root: Object3D;
  /** Sim tick: pose from state. */
  sync(e: Enemy, dt: number): void;
  /** Render frame: interpolate transform/pose. */
  render(e: Enemy, alpha: number): void;
  /** Hit flash: 'hit' red, 'block' blue, 'stagger' white. */
  flash(kind: 'hit' | 'block' | 'stagger'): void;
  dispose(): void;
}

export interface ArchetypeDef {
  archetype: EnemyArchetype;
  tuning: AiTuning;
  hit: HitShape;
  attackExtras: Record<string, AttackExtra>;
  /** Shielded archetypes: true while the guard is dropped (attacking/recovering = punish window). */
  guardOpen?(e: Enemy): boolean;
  /** States (usually `createCommonStates()` with overrides). */
  states(): FsmState<EnemyCtx, AiStateId>[];
  /** Build the mesh/animator (browser only; the system skips it when headless). */
  createView(): EnemyView;
}

export interface EnemyCtx extends AiContext {
  readonly self: Enemy;
}

let nextEnemyId = 20000;

// ------------------------------------------------------------------ Enemy

/**
 * Runtime enemy: entity + HitTarget + FSM + capsule. States drive it through the "verbs" below
 * (pursue, face, holdStill, meleeHit). Nothing here allocates per tick.
 */
export class Enemy implements EnemyInstance, HitTarget {
  readonly id: EntityId = nextEnemyId++;
  readonly team = 'enemy' as const;
  readonly defId: string;
  readonly def: EnemyDef;
  readonly arch: ArchetypeDef;
  readonly tuning: AiTuning;
  readonly hit: HitShape;
  readonly capsule: KinematicCapsule;
  readonly transform: Transform;
  readonly health: Health;
  readonly poise: Poise;
  readonly home: Vec3Like;
  readonly homeYaw: number;
  /** Level placement id (respawn bookkeeping). */
  readonly placementId: string | undefined;
  readonly ctx: EnemyCtx;
  readonly fsm: Fsm<EnemyCtx, AiStateId>;
  readonly view: EnemyView | null;
  readonly shared: AiShared;
  invulnerable = false;

  // --- blackboard (read by states and the view)
  /** Player position last seen/heard (valid when hasLastKnown). */
  readonly lastKnown: Vec3Like = { x: 0, y: 0, z: 0 };
  hasLastKnown = false;
  /** Seconds since the player was last seen. */
  lostTime = Infinity;
  /** Aggroed (chasing/fighting) vs unaware. */
  aware = false;
  /** Pending stimulus for unaware states. */
  heard = false;
  wasHit = false;
  /** Current distance to the player (XZ) and raw offset. */
  distToPlayer = Infinity;
  readonly toPlayer = { x: 0, y: 0, z: 0 };
  losClear = false;
  walkClear = false;
  attackCooldown = 0;
  /** Set when the current attack has connected (or been dodged through). */
  attackSpent = false;
  hasToken = false;
  /** 0..1 additive flinch (view), decays. */
  flinch = 0;
  flinchSide = 1;
  /** Speed (XZ) after the last move (view walk cycle). */
  speed = 0;
  /** Death bookkeeping. */
  killerId: EntityId | null = null;
  removed = false;
  readonly wander = { x: 0, z: 0 };
  /** Previous tick transform (render interpolation). */
  private readonly _alertEv = { enemyId: 0, pos: { x: 0, y: 0, z: 0 } };
  private readonly _windupEv = { enemyId: 0, pos: { x: 0, y: 0, z: 0 }, attackId: '' };
  /** Emit `enemyAlert` (reused payload). */
  emitAlert(): void {
    const ev = this._alertEv;
    const p = this.capsule.position;
    ev.enemyId = this.id;
    ev.pos.x = p.x; ev.pos.y = p.y; ev.pos.z = p.z;
    this.shared.bus.emit('enemyAlert', ev);
  }
  /** Emit `enemyWindup` (reused payload). */
  emitWindup(attackId: string): void {
    const ev = this._windupEv;
    const p = this.capsule.position;
    ev.enemyId = this.id;
    ev.pos.x = p.x; ev.pos.y = p.y; ev.pos.z = p.z;
    ev.attackId = attackId;
    this.shared.bus.emit('enemyWindup', ev);
  }
  readonly prevPos = { x: 0, y: 0, z: 0 };
  prevYaw = 0;
  /** Stats (debug). */
  hitsTaken = 0;

  // --- movement intent (reset every tick, set by states)
  private wantX = 0;
  private wantZ = 0;
  /** One-shot velocity kick (lunge/knockback); survives until the next integrate, even if set between ticks. */
  private pendingX = 0;
  private pendingZ = 0;
  /** Remaining stun (s): the stagger state holds while > 0. */
  stunTime = 0;
  /** Remaining post-stagger poise immunity (s). */
  staggerImmuneT = 0;
  /** False when the last nav query found no route (retried only every repathInterval). */
  pathValid = true;
  /** Separation push from neighbours (set by the system). */
  sepX = 0;
  sepZ = 0;
  private losT: number;
  private repathT = 0;
  private path: Vec3Like[] = [];
  private pathIdx = 0;
  private readonly pathGoal = { x: 0, y: 0, z: 0 };
  private stuckT = 0;
  private forceNavT = 0;
  private poiseSince = 0;
  private readonly sight: SightParams = { radius: 0, fovDeg: 0, proximity: 0 };

  constructor(def: EnemyDef, arch: ArchetypeDef, shared: AiShared, pos: Vec3Like, yaw: number, placementId?: string, view: EnemyView | null = null) {
    this.def = def;
    this.defId = def.id;
    this.arch = arch;
    this.tuning = arch.tuning;
    this.hit = arch.hit;
    this.shared = shared;
    this.placementId = placementId;
    const t = this.tuning;
    this.capsule = new KinematicCapsule({ radius: t.capsuleRadius, height: t.capsuleHeight, stepHeight: 0.35 });
    this.capsule.teleport(pos);
    this.transform = { position: this.capsule.position, yaw };
    this.health = { hp: def.hp, maxHp: def.hp };
    this.poise = { current: def.poise, max: def.poise };
    this.home = { x: pos.x, y: pos.y, z: pos.z };
    this.homeYaw = yaw;
    this.prevPos.x = pos.x;
    this.prevPos.y = pos.y;
    this.prevPos.z = pos.z;
    this.prevYaw = yaw;
    this.losT = shared.rng.next() * t.losInterval; // stagger LOS rays across enemies
    this.ctx = { self: this, def, stateTime: 0, currentAttack: null, targetPos: null, canSeeTarget: false };
    this.fsm = new Fsm<EnemyCtx, AiStateId>(arch.states(), 'idle');
    this.view = view;
    this.fsm.start(this.ctx);
  }

  get state(): AiStateId {
    return this.fsm.current;
  }
  set state(s: AiStateId) {
    this.fsm.go(this.ctx, s);
  }

  get isBoss(): boolean {
    return this.def.isBoss === true;
  }

  get alive(): boolean {
    return this.health.hp > 0;
  }

  get fwdX(): number {
    return -Math.sin(this.transform.yaw);
  }
  get fwdZ(): number {
    return -Math.cos(this.transform.yaw);
  }

  get playerAlive(): boolean {
    return this.shared.player.health.hp > 0;
  }

  extra(a: EnemyAttackDef | null): AttackExtra | undefined {
    return a ? this.arch.attackExtras[a.id] : undefined;
  }

  // ------------------------------------------------------------------ HitTarget

  guards(dir: Vec3Like, e: DamageEvent): boolean {
    const fb = this.def.frontalBlock ?? 0;
    if (fb <= 0 || e.headshot || this.state === 'stagger' || this.state === 'dead') return false;
    if (this.arch.guardOpen?.(this)) return false;
    return hitsFront(dir.x, dir.z, this.fwdX, this.fwdZ);
  }

  applyDamage(e: DamageEvent): DamageResult {
    if (!this.alive) return { dealt: 0, blocked: false, poiseBroken: false, killed: false };
    this.hitsTaken++;
    let amount = e.amount;
    let blocked = false;
    if (e.dir && this.guards(e.dir, e)) {
      amount *= 1 - (this.def.frontalBlock ?? 0);
      blocked = true;
    }
    const dealt = Math.min(this.health.hp, amount);
    this.health.hp -= dealt;
    const fromPlayer = e.source === this.shared.player.id;
    if (fromPlayer) {
      const p = this.shared.player.position;
      this.lastKnown.x = p.x;
      this.lastKnown.y = p.y;
      this.lastKnown.z = p.z;
      this.hasLastKnown = true;
      this.lostTime = 0;
    }
    if (this.health.hp <= 0) {
      this.killerId = e.source;
      this.fsm.go(this.ctx, 'dead');
      return { dealt, blocked, poiseBroken: false, killed: true };
    }
    this.poiseSince = 0;
    const immune = this.state === 'stagger' || this.staggerImmuneT > 0;
    const broke = !blocked && !immune && applyPoiseDamage(this.poise, e.poiseDamage);
    this.view?.flash(broke ? 'stagger' : blocked ? 'block' : 'hit');
    this.flinch = 1;
    this.flinchSide = this.shared.rng.next() < 0.5 ? -1 : 1;
    if (broke) {
      this.aware = true;
      this.fsm.go(this.ctx, 'stagger');
    } else if (fromPlayer && !this.aware) {
      this.wasHit = true;
    }
    return { dealt, blocked, poiseBroken: broke, killed: false };
  }

  /** Dev/system: kill outright. */
  kill(source: EntityId | null = null): void {
    if (!this.alive) return;
    this.health.hp = 0;
    this.killerId = source;
    this.fsm.go(this.ctx, 'dead');
  }

  /** Gunshot / noise at `p` (system filters by hearing radius). */
  hear(p: Vec3Like): void {
    if (!this.alive) return;
    if (!this.aware) this.heard = true;
    this.lastKnown.x = p.x;
    this.lastKnown.y = p.y;
    this.lastKnown.z = p.z;
    this.hasLastKnown = true;
    this.lostTime = 0; // they come for you: tracked for `memory` s like a sighting
  }

  /** Targeted aggro ping (thrown knife): only this enemy notices and investigates `p`. */
  ping(p: Vec3Like): void {
    this.hear(p);
  }

  /**
   * Flashbang etc.: hold still (stagger pose, no attacks, token released) for `seconds`. No-op on
   * bosses and corpses. Re-stunning extends (max of remaining and new).
   */
  stun(seconds: number): void {
    if (!this.alive || this.isBoss || !(seconds > 0)) return;
    this.stunTime = Math.max(this.stunTime, seconds);
    if (this.state !== 'stagger') this.fsm.go(this.ctx, 'stagger');
  }

  // ------------------------------------------------------------------ tick

  update(dt: number): void {
    if (this.removed) return;
    const p = this.capsule.position;
    this.prevPos.x = p.x;
    this.prevPos.y = p.y;
    this.prevPos.z = p.z;
    this.prevYaw = this.transform.yaw;
    this.wantX = this.wantZ = 0;

    if (this.alive) {
      this.sense(dt);
      this.poiseSince = tickPoise(this.poise, this.poiseSince, dt, this.tuning.poiseRegenDelay);
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.forceNavT > 0) this.forceNavT -= dt;
      if (this.stunTime > 0) this.stunTime -= dt;
      if (this.staggerImmuneT > 0) this.staggerImmuneT -= dt;
    }
    this.fsm.update(this.ctx, dt);
    if (this.alive) this.integrate(dt);
    else this.speed = 0;
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 5);
    this.view?.sync(this, dt);
  }

  private sense(dt: number): void {
    const pl = this.shared.player;
    const pp = pl.position;
    const me = this.capsule.position;
    const t = this.tuning;
    const dx = pp.x - me.x;
    const dz = pp.z - me.z;
    this.toPlayer.x = dx;
    this.toPlayer.y = pp.y - me.y;
    this.toPlayer.z = dz;
    this.distToPlayer = Math.sqrt(dx * dx + dz * dz);
    if (!this.playerAlive) {
      this.ctx.canSeeTarget = false;
      this.losClear = false;
      this.lostTime += dt;
      return;
    }
    const sightMul = this.shared.stats.get('aggroRadius');
    const base = this.def.aggroRadius * sightMul;
    const maxR = base * (this.aware ? t.awareSightMul : 1);
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT += t.losInterval;
      if (this.distToPlayer <= maxR + 2) {
        const los = this.shared.los;
        this.losClear = los.clear(me.x, me.y + t.eyeHeight, me.z, pp.x, pp.y + 1.4, pp.z);
        this.walkClear = this.losClear && los.walkable(me, pp);
      } else {
        this.losClear = this.walkClear = false;
      }
    }
    const s = this.sight;
    s.radius = maxR;
    s.fovDeg = this.aware ? 360 : t.fovDeg;
    s.proximity = this.aware ? maxR : t.proximity * sightMul;
    const see = canSee(dx, dz, this.fwdX, this.fwdZ, this.losClear, s);
    this.ctx.canSeeTarget = see;
    if (see) {
      this.lastKnown.x = pp.x;
      this.lastKnown.y = pp.y;
      this.lastKnown.z = pp.z;
      this.hasLastKnown = true;
      this.lostTime = 0;
    } else {
      // No wallhack: lastKnown only refreshes on a real sighting (or a noise / being shot).
      this.lostTime += dt;
    }
    this.ctx.targetPos = this.hasLastKnown ? this.lastKnown : null;
  }

  private integrate(dt: number): void {
    const c = this.capsule;
    const v = c.velocity;
    const t = this.tuning;
    const tx = this.wantX + this.sepX;
    const tz = this.wantZ + this.sepZ;
    const k = Math.min(1, t.accel * dt);
    v.x += (tx - v.x) * k + this.pendingX;
    v.z += (tz - v.z) * k + this.pendingZ;
    this.pendingX = this.pendingZ = 0;
    v.y = c.grounded ? -2 : Math.max(-30, v.y - 20 * dt);
    const res = c.move(dt, this.shared.world);
    this.speed = Math.hypot(v.x, v.z);
    if (res.hitWall && this.wantX * this.wantX + this.wantZ * this.wantZ > 0.01) {
      this.stuckT += dt;
      if (this.stuckT > 0.4) {
        this.forceNavT = 2; // direct steering is blocked: trust the nav graph for a while
        this.stuckT = 0;
        this.repathT = 0;
      }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    // Out-of-world safety
    if (c.position.y < -20) c.teleport(this.home);
  }

  // ------------------------------------------------------------------ verbs (called by states)

  /** Steer toward (x, z) at `speed`, turning at `turnRate`. Returns XZ distance. */
  seek(x: number, z: number, speed: number, dt: number, stopDist = 0.05): number {
    const p = this.capsule.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    this.face(dx, dz, this.tuning.turnRate, dt);
    if (d > stopDist) {
      // move along facing-blended direction so turns arc instead of strafing
      const inv = 1 / d;
      const ax = dx * inv;
      const az = dz * inv;
      const align = Math.max(0, ax * this.fwdX + az * this.fwdZ);
      const s = speed * (0.35 + 0.65 * align);
      this.wantX = ax * s;
      this.wantZ = az * s;
    }
    return d;
  }

  /** Rotate toward direction (dx, dz). Returns remaining angle (abs, rad). */
  face(dx: number, dz: number, rate: number, dt: number): number {
    if (dx * dx + dz * dz < 1e-6) return 0;
    const target = yawTo(dx, dz);
    this.transform.yaw = turnToward(this.transform.yaw, target, rate * dt);
    return Math.abs(wrapAngle(target - this.transform.yaw));
  }

  facePlayer(rate: number, dt: number): number {
    return this.face(this.toPlayer.x, this.toPlayer.z, rate, dt);
  }

  /** Push along facing (lunges, knockback when negative). Applied once on top of steering. */
  impulse(vx: number, vz: number): void {
    this.pendingX += vx;
    this.pendingZ += vz;
  }

  /** Sustained movement intent this tick (m/s world XZ), independent of facing (backpedal/strafe). */
  steer(vx: number, vz: number): void {
    this.wantX = vx;
    this.wantZ = vz;
  }

  /** Hold position this tick (velocity decays via accel). */
  holdStill(): void {
    this.wantX = this.wantZ = 0;
  }

  /**
   * Chase `goal` (feet): direct steering when the walk line is clear, else follow the nav graph
   * (A*, cached; repath throttled). Stops at `stopDist`. Returns XZ distance to the goal.
   */
  pursue(goal: Vec3Like, speed: number, dt: number, stopDist: number, direct: boolean): number {
    const p = this.capsule.position;
    const nav = this.shared.nav;
    const gdx = goal.x - p.x;
    const gdz = goal.z - p.z;
    const gd = Math.sqrt(gdx * gdx + gdz * gdz);
    if (!nav || (direct && this.forceNavT <= 0) || gd < 1.5) {
      this.path = EMPTY_PATH;
      this.pathValid = true;
      this.repathT = 0; // entering the nav branch later queries immediately
      if (gd <= stopDist) {
        this.face(gdx, gdz, this.tuning.turnRate, dt);
        return gd;
      }
      return this.seek(goal.x, goal.z, speed, dt, stopDist);
    }
    this.repathT -= dt;
    const moved = (goal.x - this.pathGoal.x) ** 2 + (goal.z - this.pathGoal.z) ** 2;
    // An empty result (no route) is retried only every repathInterval, never every tick.
    if (this.repathT <= 0 || (moved > 4 && this.repathT < this.tuning.repathInterval * 0.5)) {
      this.repathT = this.tuning.repathInterval;
      this.pathGoal.x = goal.x;
      this.pathGoal.y = goal.y;
      this.pathGoal.z = goal.z;
      this.path = nav.path(p, goal);
      this.pathValid = this.path.length > 0;
      this.pathIdx = 0;
      // Skip the first node if we can already walk straight to the second (avoids backtracking).
      if (this.path.length >= 2 && this.shared.los.walkable(p, this.path[1]!)) this.pathIdx = 1;
    }
    while (this.pathIdx < this.path.length) {
      const n = this.path[this.pathIdx]!;
      const dx = n.x - p.x;
      const dz = n.z - p.z;
      if (dx * dx + dz * dz > 0.6 * 0.6) break;
      this.pathIdx++;
    }
    if (this.pathIdx >= this.path.length) {
      // past the last node: go straight for the goal
      if (gd <= stopDist) return gd;
      this.seek(goal.x, goal.z, speed, dt, stopDist);
      return gd;
    }
    const n = this.path[this.pathIdx]!;
    this.seek(n.x, n.z, speed, dt, 0);
    return gd;
  }

  /** Current waypoint (debug overlay), or null when steering directly. */
  get waypoint(): Vec3Like | null {
    return this.pathIdx < this.path.length ? this.path[this.pathIdx]! : null;
  }

  /** Clear the cached path (on state changes that pick a new goal). */
  resetPath(): void {
    this.path = EMPTY_PATH;
    this.pathIdx = 0;
    this.repathT = 0;
  }

  /**
   * Melee active-frame check vs the player capsule: arc/reach from the chest along facing. On
   * contact calls combat.hitPlayer once per attack (i-frames/shield resolved there). A swing that
   * passes through a rolling player is spent (lenient, Souls-like "rolled through it").
   */
  meleeHit(a: EnemyAttackDef): boolean {
    if (this.attackSpent || !this.playerAlive) return false;
    const t = this.tuning;
    const me = this.capsule.position;
    const pp = this.shared.player.position;
    const chestY = me.y + t.chestHeight;
    // nearest point on the player's body axis to our chest height
    const py = Math.min(Math.max(chestY, pp.y + 0.3), pp.y + 1.5);
    const vx = pp.x - me.x;
    const vy = py - chestY;
    const vz = pp.z - me.z;
    _fwd.x = this.fwdX;
    _fwd.y = 0;
    _fwd.z = this.fwdZ;
    if (!inMeleeArc(vx, vy, vz, _fwd, a.range + t.reachBonus, a.arc ?? 90, 0.35)) return false;
    // don't hit through walls
    if (!this.shared.los.clear(me.x, chestY, me.z, pp.x, py, pp.z)) return false;
    this.attackSpent = true;
    const len = Math.hypot(vx, vz) || 1;
    this.shared.combat.hitPlayer({
      source: this.id,
      target: this.shared.player.id,
      amount: a.damage,
      type: a.damageType,
      poiseDamage: a.poiseDamage,
      hitPos: { x: pp.x, y: py, z: pp.z },
      dir: { x: vx / len, y: 0, z: vz / len },
      weaponId: `${this.defId}:${a.id}`,
    });
    return true;
  }

  takeToken(): boolean {
    if (this.hasToken) return true;
    const s = this.shared;
    if (s.attackers >= s.maxAttackers) return false;
    s.attackers++;
    this.hasToken = true;
    return true;
  }

  releaseToken(): void {
    if (!this.hasToken) return;
    this.hasToken = false;
    this.shared.attackers = Math.max(0, this.shared.attackers - 1);
  }

  /** Distance from home (XZ). */
  get homeDist(): number {
    const p = this.capsule.position;
    return Math.hypot(p.x - this.home.x, p.z - this.home.z);
  }

  /** Dead long enough to be removed (system then unregisters it). */
  get corpseDone(): boolean {
    const t = this.tuning;
    return !this.alive && this.ctx.stateTime >= t.deathFall + t.corpseTime + t.sinkTime;
  }
}

const EMPTY_PATH: Vec3Like[] = [];
const _fwd = { x: 0, y: 0, z: 0 };
