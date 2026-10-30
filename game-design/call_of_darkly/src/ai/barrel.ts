// §10 Barrel Hollow: scripted. Idles behind a staged barrel until its trigger volume is entered (or
// `ai.triggerBarrel(id)` / it is shot), shoves the barrel down a path (stairs), where it rolls as a
// kinematic cylinder (hazards.ts: heavy damage + knockdown, dodgeable with i-frames, breaks at the
// end). The hollow then fights as a weak sword hollow (hollow_sword animations/combos).
import type { Vec3Like, Vec3Tuple } from '../core/types';
import type { ArchetypeDef, AiTuning, Enemy, EnemyCtx } from './enemy';
import type { AiHazards, BarrelSlot } from './hazards';
import {
  clamp01,
  easeOut,
  ELL_X,
  ELR_X,
  HIPL_X,
  HIPR_X,
  HIPS_Y,
  HOLLOW_HIT,
  HOLLOW_TUNING,
  HollowView,
  KNEEL_X,
  KNEER_X,
  lerp,
  SHL_X,
  SHL_Z,
  SHR_Z,
  SHR_X,
  SPINE_X,
} from './hollow';
import { createBarrelHollowRig } from './models';
import { createCommonStates } from './states';
import type { SpawnRecord } from './spawner';
import type { AiStateId, FsmState } from './types';

type S = FsmState<EnemyCtx, AiStateId>;

export const BARREL_TUNING: AiTuning = {
  ...HOLLOW_TUNING,
  walkSpeed: 0.9,
  alertTime: 0.4,
  wanderRadius: 0,
  staggerTime: 0.8,
};

export const BARREL = {
  /** Barrel centre in front of the hollow (m) and the shove telegraph (s) before it is released. */
  stageDist: 0.95,
  pushTime: 0.9,
  /** Follow-through hold after the release (s). */
  followThrough: 0.55,
  /** Unscripted (no trigger volume): start when the player is seen within this range. */
  autoRange: 14,
  /** Default roll length (m) straight ahead when no path is given. */
  defaultLength: 14,
} as const;

/** Per-hollow scripting state, created by the AI system when it spawns a barrel hollow. */
export interface BarrelScript {
  readonly enemy: Enemy;
  readonly id: string | undefined;
  /** AABB (world) whose entry by the player starts the roll; null = start on sight / API / being shot. */
  readonly trigger: { min: Vec3Tuple; max: Vec3Tuple } | null;
  /** Flat [x,z,...] barrel waypoints (empty = straight ahead). */
  readonly path: Float32Array;
  readonly hazards: AiHazards;
  slot: BarrelSlot | null;
  /** The roll has been requested (volume entered / API / hit). */
  triggered: boolean;
  /** The barrel has left the hollow's hands. */
  launched: boolean;
}

const scripts = new WeakMap<Enemy, BarrelScript>();

export function barrelScript(e: Enemy): BarrelScript | undefined {
  return scripts.get(e);
}

/** Registry of live barrel scripts; owned by AiSystem. */
export class BarrelRegistry {
  readonly list: BarrelScript[] = [];

  attach(e: Enemy, rec: Pick<SpawnRecord, 'placementId' | 'trigger' | 'path'>, hazards: AiHazards): BarrelScript {
    const p = rec.path ?? [];
    const flat = new Float32Array(p.length * 2);
    for (let i = 0; i < p.length; i++) {
      flat[i * 2] = p[i]![0];
      flat[i * 2 + 1] = p[i]![2];
    }
    const pos = e.capsule.position;
    const slot = hazards.stageBarrel(e.id, pos.x + e.fwdX * BARREL.stageDist, pos.y + 0.5, pos.z + e.fwdZ * BARREL.stageDist, e.transform.yaw);
    const s: BarrelScript = { enemy: e, id: rec.placementId, trigger: rec.trigger ?? null, path: flat, hazards, slot, triggered: false, launched: false };
    scripts.set(e, s);
    this.list.push(s);
    return s;
  }

  /** Enemy removed: free a barrel that never left (a rolling one keeps rolling). */
  detach(e: Enemy): void {
    const s = scripts.get(e);
    if (!s) return;
    if (!s.launched && s.slot) s.hazards.releaseBarrel(s.slot);
    scripts.delete(e);
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Start the roll for a barrel hollow by placement id or enemy id. True if one was armed. */
  trigger(id: string | number): boolean {
    for (const s of this.list) {
      if (s.triggered || !s.enemy.alive) continue;
      if (typeof id === 'string' ? s.id === id : s.enemy.id === id) {
        s.triggered = true;
        return true;
      }
    }
    return false;
  }

  /** Trigger-volume check (call every sim tick). */
  update(p: Vec3Like): void {
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i]!;
      const t = s.trigger;
      if (s.triggered || !t || !s.enemy.alive) continue;
      if (p.x >= t.min[0] && p.x <= t.max[0] && p.y >= t.min[1] && p.y <= t.max[1] && p.z >= t.min[2] && p.z <= t.max[2]) s.triggered = true;
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}

function buildStates(): S[] {
  const base = createCommonStates();
  const baseIdle = base.find((s) => s.id === 'idle')!;
  const baseWindup = base.find((s) => s.id === 'windup')!;
  const baseRecover = base.find((s) => s.id === 'recover')!;

  /** Scripted phase: waiting / pushing; false = ordinary sword hollow. */
  const scripted = (e: Enemy): BarrelScript | null => {
    const s = barrelScript(e);
    return s && !s.launched && s.slot ? s : null;
  };

  const idle: S = {
    id: 'idle',
    enter: (ctx, from) => baseIdle.enter?.(ctx, from),
    update(ctx, dt) {
      const e = ctx.self;
      const s = scripted(e);
      if (!s) return baseIdle.update(ctx, dt);
      e.holdStill();
      e.aware = false;
      e.face(-Math.sin(e.homeYaw), -Math.cos(e.homeYaw), e.tuning.turnRate, dt);
      if (e.wasHit) s.triggered = true; // shot before the trigger: shove it now
      if (!s.trigger && ctx.canSeeTarget && e.distToPlayer <= BARREL.autoRange) s.triggered = true;
      if (s.triggered) return 'windup';
    },
  };

  const windup: S = {
    id: 'windup',
    enter(ctx, from) {
      baseWindup.enter?.(ctx, from);
    },
    update(ctx, dt) {
      const e = ctx.self;
      const s = scripted(e);
      if (!s || ctx.currentAttack) return baseWindup.update(ctx, dt);
      e.holdStill();
      e.face(-Math.sin(e.homeYaw), -Math.cos(e.homeYaw), e.tuning.turnRate, dt);
      if (ctx.stateTime < BARREL.pushTime) return;
      // release: barrel rolls, the hollow notices the player and follows
      s.hazards.launchBarrel(s.slot!, s.path, BARREL.defaultLength);
      s.launched = true;
      e.aware = true;
      e.wasHit = false;
      const pp = e.shared.player.position;
      e.lastKnown.x = pp.x;
      e.lastKnown.y = pp.y;
      e.lastKnown.z = pp.z;
      e.hasLastKnown = true;
      e.lostTime = 0;
      return 'recover';
    },
  };

  const recover: S = {
    id: 'recover',
    enter: (ctx, from) => baseRecover.enter?.(ctx, from),
    update(ctx, dt) {
      const e = ctx.self;
      const s = barrelScript(e);
      if (s?.launched && !ctx.currentAttack && ctx.stateTime < BARREL.followThrough) {
        e.holdStill(); // shove follow-through
        return;
      }
      return baseRecover.update(ctx, dt);
    },
  };

  return createCommonStates({ idle, windup, recover });
}

// ------------------------------------------------------------------ animator

class BarrelHollowView extends HollowView {
  constructor() {
    super(createBarrelHollowRig());
  }

  protected override pose(e: Enemy, dt: number): number {
    const s = barrelScript(e);
    const T = this.tgt;
    const st = e.state;
    const t = e.ctx.stateTime;
    if (s && e.alive && !e.ctx.currentAttack) {
      if (!s.launched && (st === 'idle' || st === 'windup')) {
        this.idlePose();
        // hands braced on the barrel, leaning into it
        T[SHL_X] = T[SHR_X] = 1.25;
        T[SHL_Z] = -0.12;
        T[SHR_Z] = 0.12;
        T[ELL_X] = T[ELR_X] = 0.3;
        T[SPINE_X] = -0.2 + Math.sin(this.time * 1.4) * 0.02;
        T[HIPL_X] = 0.2;
        T[HIPR_X] = -0.2;
        T[KNEEL_X] = T[KNEER_X] = -0.3;
        T[HIPS_Y] = -0.05;
        if (st === 'windup') {
          // heave back (0..60%) then shove (60..100%)
          const u = clamp01(t / BARREL.pushTime);
          const back = easeOut(clamp01(u / 0.6));
          const shove = clamp01((u - 0.6) / 0.4);
          T[SPINE_X] = lerp(lerp(-0.2, 0.3, back), -0.62, shove);
          T[SHL_X] = T[SHR_X] = lerp(lerp(1.25, 0.9, back), 1.55, shove);
          T[ELL_X] = T[ELR_X] = lerp(lerp(0.3, 0.9, back), 0.05, shove);
          T[HIPS_Y] = lerp(lerp(-0.05, -0.12, back), -0.1, shove);
          T[KNEEL_X] = T[KNEER_X] = lerp(-0.3, -0.6, back);
        }
        return 14;
      }
      if (s.launched && st === 'recover') {
        this.idlePose();
        T[SPINE_X] = -0.6;
        T[SHL_X] = T[SHR_X] = 1.55;
        T[ELL_X] = T[ELR_X] = 0.05;
        T[HIPS_Y] = -0.1;
        T[HIPL_X] = 0.45;
        T[KNEEL_X] = -0.3;
        T[HIPR_X] = -0.4;
        return 20;
      }
    }
    return super.pose(e, dt);
  }
}

export const BARREL_HOLLOW: ArchetypeDef = {
  archetype: 'barrelHollow',
  tuning: BARREL_TUNING,
  hit: HOLLOW_HIT,
  attackExtras: {
    // weak sword hollow: same overhead → sweep as the sword hollow, chained less often
    combo_1: { anim: 'overhead', followUp: 'combo_2', followUpChance: 0.4, followUpDelay: 0.35 },
    combo_2: { anim: 'horizontal', followUpOnly: true },
  },
  states: buildStates,
  createView: () => new BarrelHollowView(),
};
