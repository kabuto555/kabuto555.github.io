// §7 Mimic (Burg B7, drops the Dead Silence Patch). Looks like a Burg chest (tells: gold chain slung off-axis + a
// slow breath, see mimicModel.ts). Two ways to wake it:
//   * E on it  -> "chomp": a grab that bites for 40% of max HP (unblockable, ignores i-frames), locks controls
//                 ~1.2 s, then it stands up on legs and fights.
//   * shooting the closed chest wakes it WITHOUT the chomp (it just rises).
// Fight: lunge bite / sweep / hop back (telegraphed, high poise, ~400 hp). Kill = persistent flag `mimic:<id>`
// (reload: a dead open chest, no respawn). Resting at a bonfire resets a living mimic to dormant.
//
// Wiring (main.ts, after `ai` and `lockControls` exist; ChestSystem replays the recorded `mimic` ops and drives
// mimics.update/dispose from its own tick):
//   const mimics = new MimicSystem({ ai, combat, player: pl, world, interact, progress, parent: scene,
//     lockControls: (on) => (on ? lockControls('mimic') : unlockControls('mimic')) });
//   chests.setMimicHost(mimics);
import type { Object3D } from 'three';
import { DamageType, type DamageEvent, type EntityId, type Health, type Poise, type Transform } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import type { DamageResult } from '../combat/types';
import type { HitShape, HitTarget } from '../combat/targets';
import { aabbFromFootprint } from '../physics/aabb';
import { Layer, type Collider, type CollisionWorld } from '../physics/types';
import type { WorldProgress } from '../economy/progress';
import type { Interactable } from '../world/interact';
import { DEFAULT_AI_TUNING, type AiCombat, type AiTarget, type AiTuning, type ArchetypeDef, type Enemy, type EnemyCtx } from './enemy';
import { createCommonStates } from './states';
import { registerArchetype } from './spawner';
import type { AiStateId, FsmState } from './types';
import {
  applyMimicPose,
  createMimicRig,
  deadPose,
  dormantPose,
  MIMIC_TIMING,
  MimicView,
  N as POSE_N,
  type MimicRig,
  type MimicRuntime,
} from './mimicModel';

// ------------------------------------------------------------------ tuning

/** Fraction of the player's max HP the chomp takes. */
export const MIMIC_CHOMP_FRACTION = 0.4;
const LUNGE_SPEED = 5.5; // m/s, held through the lunge's active frames
const HOP_SPEED = 7; // m/s backwards through the hop's active frames

export const MIMIC_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 1.0,
  chaseSpeedMul: 0.95,
  turnRate: 3.2,
  windupTurnRate: 1.8,
  alertTime: 0.4,
  staggerTime: 1.0,
  staggerKnockback: 0.6,
  stopDist: 2.1,
  attackFacing: 0.5,
  attackCooldown: [0.5, 1.2],
  leashRadius: 22,
  wanderRadius: 0,
  reachBonus: 0.3,
  capsuleRadius: 0.45,
  capsuleHeight: 1.5,
  eyeHeight: 1.2,
  chestHeight: 1.0,
  deathFall: 0.8,
  corpseTime: 0.4, // collapses into the open chest, then the dead-chest visual replaces it (no sinking)
  sinkTime: 0.01,
};

export const MIMIC_HIT: HitShape = { bodyRadius: 0.45, bodyHeight: 1.4, headRadius: 0.3, headY: 1.25 };

/** Hit volume of the closed chest (a squat sphere over the box; bullets pass the Barrier-layer collider into it). */
const DORMANT_HIT: HitShape = { bodyRadius: 0.38, bodyHeight: 0.76, headRadius: 0.01, headY: 0.3 };

// ------------------------------------------------------------------ states

type S = FsmState<EnemyCtx, AiStateId>;

interface MimicState extends MimicRuntime {
  bitten: boolean;
  /** Called once when the chomp lands. */
  bite: () => void;
}

const RUNTIME = new WeakMap<Enemy, MimicState>();

const common = createCommonStates();
const commonAlert = common.find((s) => s.id === 'alert')!;

/** `alert` doubles as the rise: chomp (bite at biteAt, stand up) or shot (just stand up); later alerts are the plain beat. */
const alert: S = {
  id: 'alert',
  enter(ctx, from) {
    const e = ctx.self;
    const rt = RUNTIME.get(e);
    if (!rt || rt.risen) return commonAlert.enter?.(ctx, from);
    e.aware = true;
    e.heard = false;
    e.wasHit = false;
    e.resetPath();
    e.releaseToken();
    // no stagger while it is waking up
    e.staggerImmuneT = Math.max(e.staggerImmuneT, (rt.mode === 'chomp' ? MIMIC_TIMING.chompRise : MIMIC_TIMING.shotRise) + 0.1);
  },
  update(ctx, dt) {
    const e = ctx.self;
    const rt = RUNTIME.get(e);
    if (!rt || rt.risen) return commonAlert.update(ctx, dt);
    e.holdStill();
    e.facePlayer(rt.mode === 'chomp' && !rt.bitten ? 8 : 3, dt);
    if (rt.mode === 'chomp' && !rt.bitten && ctx.stateTime >= MIMIC_TIMING.biteAt) {
      rt.bitten = true;
      rt.bite();
    }
    const dur = rt.mode === 'chomp' ? MIMIC_TIMING.chompRise : MIMIC_TIMING.shotRise;
    if (ctx.stateTime >= dur) {
      rt.risen = true;
      e.attackCooldown = Math.max(e.attackCooldown, 0.6); // a beat before the first attack
      return 'chase';
    }
  },
};

/** Lunge steps through its active frames, the hop backs off (no damage), the sweep swats from where it stands. */
const attack: S = {
  id: 'attack',
  update(ctx) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    if (!a) return 'recover';
    const anim = e.extra(a)?.anim;
    if (anim === 'hop') e.steer(-e.fwdX * HOP_SPEED, -e.fwdZ * HOP_SPEED);
    else {
      if (anim === 'lunge' && e.distToPlayer > 1.2) e.steer(e.fwdX * LUNGE_SPEED, e.fwdZ * LUNGE_SPEED);
      else e.holdStill();
      e.meleeHit(a);
    }
    if (ctx.stateTime >= a.active) return 'recover';
  },
};

export const MIMIC: ArchetypeDef = {
  archetype: 'mimic',
  tuning: MIMIC_TUNING,
  hit: MIMIC_HIT,
  attackExtras: {
    lunge_bite: { anim: 'lunge' },
    sweep: { anim: 'sweep' },
    hop_back: { anim: 'hop', followUp: 'lunge_bite', followUpChance: 0.8, followUpDelay: 0.3 },
  },
  states: () => createCommonStates({ alert, attack }),
  createView: () => new MimicView((e) => RUNTIME.get(e)),
};

registerArchetype(MIMIC);

// ------------------------------------------------------------------ system

export type MimicOp = { id: string; pos: readonly [number, number, number]; yaw: number };

/** What the system needs from AiSystem (AiSystem satisfies it). */
export interface MimicAi {
  spawn(defId: string, pos: Vec3Like, yaw?: number, placementId?: string): Enemy | null;
  despawn(e: Enemy): void;
}

export interface MimicPlayer extends AiTarget {
  readonly health: { hp: number; maxHp: number };
  /** Dodge i-frames etc.; the grab ignores it (restored right after). */
  invulnerable?: boolean;
}

export interface MimicSystemDeps {
  ai: MimicAi;
  combat: Pick<AiCombat, 'addTarget' | 'removeTarget' | 'hitPlayer'>;
  player: MimicPlayer;
  world: CollisionWorld;
  interact: { register(i: Interactable): () => void };
  progress: Pick<WorldProgress, 'hasFlag' | 'setFlag'>;
  /** Mount point for the dormant/dead chest visuals; omit for headless (tests). */
  parent?: Object3D;
  bus?: EventBus;
  /** `true` while the grab holds the player, `false` when it lets go (~1.2 s later). */
  lockControls?: (on: boolean) => void;
}

/** Progress flag set when the mimic placed as `id` is killed. */
export const mimicFlag = (id: string): string => `mimic:${id}`;

const W = 0.9;
const H = 0.5;
const D = 0.55;
let nextSlotId = 30000;

type Phase = 'dormant' | 'awake' | 'dead';

/** One placed mimic: the closed chest (interactable + shootable target), then its Enemy, then the open dead chest. */
export class MimicSlot implements Interactable, HitTarget {
  readonly id: EntityId = nextSlotId++;
  readonly team = 'enemy' as const;
  readonly transform: Transform;
  readonly health: Health = { hp: 1, maxHp: 1 };
  readonly poise: Poise = { current: 1, max: 1 };
  readonly hit = DORMANT_HIT;
  readonly range = 2.4;
  readonly pos: Vec3Like;
  phase: Phase = 'dormant';
  enemy: Enemy | null = null;
  rig: MimicRig | null = null;
  collider: Collider | null = null;
  unregister: (() => void) | null = null;

  constructor(
    readonly op: MimicOp,
    private readonly sys: MimicSystem,
  ) {
    this.transform = { position: { x: op.pos[0], y: op.pos[1], z: op.pos[2] }, yaw: op.yaw };
    this.pos = { x: op.pos[0], y: op.pos[1] + 0.55, z: op.pos[2] };
  }

  get alive(): boolean {
    return this.phase === 'dormant';
  }
  enabled(): boolean {
    return this.phase === 'dormant';
  }
  prompt(): string | null {
    return this.phase === 'dormant' ? 'Open chest' : null; // identical to a real chest
  }
  interact(): void {
    this.sys.chomp(this);
  }
  applyDamage(e: DamageEvent): DamageResult {
    return this.sys.shoot(this, e);
  }
}

const NO_DAMAGE: DamageResult = { dealt: 0, blocked: false, poiseBroken: false, killed: false };

export class MimicSystem implements System {
  readonly name = 'mimics';
  readonly slots = new Map<string, MimicSlot>();
  /** Chomps landed (debug/tests). */
  bites = 0;
  private readonly bus: EventBus;
  private readonly offs: Array<() => void> = [];
  private readonly pose = new Float32Array(POSE_N);
  private time = 0;
  private lockT = 0;

  constructor(private readonly d: MimicSystemDeps) {
    this.bus = d.bus ?? globalEvents;
    this.offs.push(this.bus.on('enemyDeath', (e) => this.onDeath(e)));
    // Constructed after AiSystem, so its own respawnAll (which despawns non-placed enemies) already ran.
    this.offs.push(this.bus.on('bonfireRest', () => this.onRest()));
  }

  /** ChestSystem hook: a `mimic` level op. */
  add(op: MimicOp): MimicSlot {
    const slot = new MimicSlot(op, this);
    this.slots.set(op.id, slot);
    if (this.d.progress.hasFlag(mimicFlag(op.id))) this.setDead(slot);
    else this.setDormant(slot);
    return slot;
  }

  // ------------------------------------------------------------------ wake-ups

  /** E on the closed chest: the grab. */
  chomp(slot: MimicSlot): Enemy | null {
    const e = this.wake(slot, 'chomp');
    if (!e) return null;
    this.lockT = MIMIC_TIMING.grabLock;
    this.d.lockControls?.(true);
    return e;
  }

  /** Damage to the closed chest wakes it (no chomp); the shot itself lands on the risen mimic. */
  shoot(slot: MimicSlot, ev: DamageEvent): DamageResult {
    const e = this.wake(slot, 'shot');
    return e ? e.applyDamage(ev) : NO_DAMAGE;
  }

  private wake(slot: MimicSlot, mode: MimicRuntime['mode']): Enemy | null {
    if (slot.phase !== 'dormant') return null;
    const t = slot.transform;
    // Enemy forward is -z at yaw 0; a chest's front is +z, so the mouth faces the chest's front at yaw + PI.
    const e = this.d.ai.spawn('mimic', t.position, slot.op.yaw + Math.PI, slot.op.id);
    if (!e) return null;
    this.clearVisual(slot);
    slot.phase = 'awake';
    slot.enemy = e;
    const rt: MimicState = { mode, risen: false, bitten: false, bite: () => this.bite() };
    RUNTIME.set(e, rt);
    const p = this.d.player.position;
    e.lastKnown.x = p.x;
    e.lastKnown.y = p.y;
    e.lastKnown.z = p.z;
    e.hasLastKnown = true;
    e.lostTime = 0;
    e.aware = true;
    e.state = 'alert'; // the rise
    return e;
  }

  /** The chomp: a big unblockable hit that ignores dodge i-frames (a grab started by E). */
  private bite(): void {
    const pl = this.d.player;
    if (pl.health.hp <= 0) return;
    const pp = pl.position;
    const amount = Math.max(1, Math.round(pl.health.maxHp * MIMIC_CHOMP_FRACTION));
    const inv = pl.invulnerable;
    if (inv) pl.invulnerable = false;
    this.d.combat.hitPlayer({
      source: null, // no source and no dir: the shield cannot resolve a facing, so it is unblockable
      target: pl.id,
      amount,
      type: DamageType.Physical,
      poiseDamage: 100,
      hitPos: { x: pp.x, y: pp.y + 1.1, z: pp.z },
      weaponId: 'mimic:chomp',
    });
    if (inv) pl.invulnerable = inv;
    this.bites++;
  }

  // ------------------------------------------------------------------ slot visuals / colliders

  private clearVisual(slot: MimicSlot): void {
    slot.unregister?.();
    slot.unregister = null;
    this.d.combat.removeTarget(slot);
    if (slot.collider) this.d.world.remove(slot.collider.id);
    slot.collider = null;
    slot.rig?.dispose();
    slot.rig = null;
  }

  private mount(slot: MimicSlot, layer: number): void {
    const { op } = slot;
    const side = Math.abs(Math.sin(op.yaw)) > 0.7;
    slot.collider = this.d.world.add({
      aabb: aabbFromFootprint(op.pos[0], op.pos[1], op.pos[2], side ? D : W, H, side ? W : D),
      layer,
      solid: true,
      tag: `mimic:${op.id}`,
    });
    if (this.d.parent) {
      const rig = createMimicRig();
      rig.root.position.set(op.pos[0], op.pos[1], op.pos[2]);
      rig.root.rotation.y = op.yaw + Math.PI;
      this.d.parent.add(rig.root);
      slot.rig = rig;
    }
  }

  private setDormant(slot: MimicSlot): void {
    this.clearVisual(slot);
    slot.phase = 'dormant';
    slot.enemy = null;
    // Barrier layer: solid for the player, but bullets (World|Prop) pass into the hit target instead of stopping on the box.
    this.mount(slot, Layer.Barrier);
    this.d.combat.addTarget(slot);
    slot.unregister = this.d.interact.register(slot);
    if (slot.rig) {
      dormantPose(this.pose, this.time);
      applyMimicPose(slot.rig, this.pose, this.time);
    }
  }

  private setDead(slot: MimicSlot): void {
    this.clearVisual(slot);
    slot.phase = 'dead';
    slot.enemy = null;
    this.mount(slot, Layer.Prop);
    if (slot.rig) {
      deadPose(this.pose);
      applyMimicPose(slot.rig, this.pose, 0);
    }
  }

  /** After the Enemy is gone (corpse removed / bonfire rest): dead chest if killed, else back to dormant. */
  private settle(slot: MimicSlot): void {
    if (this.d.progress.hasFlag(mimicFlag(slot.op.id))) this.setDead(slot);
    else this.setDormant(slot);
  }

  // ------------------------------------------------------------------ events

  private onDeath(e: { enemyId: EntityId; defId: string; killerId?: EntityId | null }): void {
    if (e.defId !== 'mimic') return;
    if (e.killerId == null || e.killerId !== this.d.player.id) return; // dev kills (killAll) must not persist
    for (const s of this.slots.values()) {
      if (s.enemy && s.enemy.id === e.enemyId) this.d.progress.setFlag(mimicFlag(s.op.id));
    }
  }

  private onRest(): void {
    for (const s of this.slots.values()) {
      if (s.phase !== 'awake') continue;
      if (s.enemy) this.d.ai.despawn(s.enemy);
      this.settle(s);
    }
    this.releaseLock();
  }

  private releaseLock(): void {
    if (this.lockT <= 0) return;
    this.lockT = 0;
    this.d.lockControls?.(false);
  }

  // ------------------------------------------------------------------ System

  update(dt: number): void {
    this.time += dt;
    if (this.lockT > 0) {
      this.lockT -= dt;
      if (this.lockT <= 0) {
        this.lockT = 0;
        this.d.lockControls?.(false);
      }
    }
    for (const s of this.slots.values()) {
      if (s.phase === 'dormant') {
        if (s.rig) {
          dormantPose(this.pose, this.time);
          applyMimicPose(s.rig, this.pose, this.time);
        }
      } else if (s.phase === 'awake' && s.enemy?.removed) this.settle(s);
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.releaseLock();
    for (const s of this.slots.values()) this.clearVisual(s);
    this.slots.clear();
  }
}
