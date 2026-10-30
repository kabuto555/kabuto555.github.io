// §10 Hollow (firebomb): 60 hp, keeps a 8–14 m band, lobs molotov arcs (lit bottle, 1 s windup,
// leads the player a little), runs when the player closes in, swipes with the bottle when cornered.
import type { EnemyAttackDef } from '../data/types';
import { DEFAULT_AI_TUNING, type ArchetypeDef, type AiTuning, type Enemy, type EnemyCtx } from './enemy';
import { leadPoint } from './hazards';
import {
  clamp01,
  easeOut,
  ELL_X,
  ELR_X,
  HIPS_Y,
  HOLLOW_HIT,
  HollowView,
  lerp,
  SHD_Z,
  SHL_X,
  SHL_Z,
  SHR_X,
  SHR_Z,
  SPINE_X,
  SPINE_Y,
} from './hollow';
import { createFirebombRig } from './models';
import { createCommonStates } from './states';
import type { AiStateId, FsmState } from './types';

type S = FsmState<EnemyCtx, AiStateId>;

export const FIREBOMB_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 1.0,
  alertTime: 0.5,
  staggerTime: 0.9,
  wanderRadius: 1.5,
  attackCooldown: [1.2, 2.2],
  attackFacing: 0.5,
  turnRate: 5.5,
  windupTurnRate: 2.4,
  stopDist: 1,
};

/** Behaviour numbers (m, s). Band = preferred distance to the player. */
export const FIREBOMB = {
  bandMin: 8,
  bandMax: 14,
  /** Player closer than this → run away briefly. */
  fleeDist: 4.5,
  fleeTime: 1.1,
  fleeCooldown: 3,
  fleeSpeedMul: 1.35,
  /** Cornered (can't back off) and this close → bottle swipe. */
  swipeDist: 2.2,
  /** Won't throw closer than this (the splash would land in its own face) or further than the attack range. */
  minThrow: 4,
  /** Fraction of the player's flight-time displacement the throw leads by (<1: lenient). */
  lead: 0.6,
  maxLead: 3.5,
  /** Hand height the bottle leaves from (arm overhead). */
  handY: 1.9,
} as const;

/** -1 back off, 0 hold (strafe), +1 close in. */
export function bandIntent(dist: number, min: number = FIREBOMB.bandMin, max: number = FIREBOMB.bandMax): -1 | 0 | 1 {
  return dist < min ? -1 : dist > max ? 1 : 0;
}

/** A fresh copy of the common state `id` to wrap/extend. */
export function commonState(states: S[], id: AiStateId): S {
  return states.find((s) => s.id === id)!;
}

const _from = { x: 0, y: 0, z: 0 };
const _to = { x: 0, y: 0, z: 0 };
const _pt = { x: 0, y: 0, z: 0 };

function facingError(e: Enemy): number {
  return Math.abs(Math.atan2(e.toPlayer.x * e.fwdZ - e.toPlayer.z * e.fwdX, e.toPlayer.x * e.fwdX + e.toPlayer.z * e.fwdZ));
}

function findAttack(e: Enemy, id: string): EnemyAttackDef | null {
  const l = e.def.attacks;
  for (let i = 0; i < l.length; i++) if (l[i]!.id === id) return l[i]!;
  return null;
}

/** Throw point + lead-adjusted lob target for the current player state. Returns flight time or -1. */
export function throwBottle(e: Enemy, a: EnemyAttackDef): number {
  const p = e.capsule.position;
  _from.x = p.x + e.fwdX * 0.25;
  _from.y = p.y + FIREBOMB.handY;
  _from.z = p.z + e.fwdZ * 0.25;
  const pp = e.shared.player.position;
  _pt.x = pp.x;
  _pt.y = pp.y + 0.1;
  _pt.z = pp.z;
  const v = e.shared.hazards.playerVel;
  leadPoint(_from, _pt, v.x, v.z, a.projectile!.speed, FIREBOMB.lead, FIREBOMB.maxLead, _to);
  return e.shared.hazards.lobBottle(e.id, a, _from, _to);
}

function buildStates(): S[] {
  let fleeT = 0;
  let fleeCool = 0;
  let strafe = 1;
  let strafeT = 0;
  let blockedT = 0;
  let cornered = false;

  const chase: S = {
    id: 'chase',
    enter(ctx) {
      ctx.self.aware = true;
      ctx.self.releaseToken();
      fleeT = 0;
      blockedT = 0;
      cornered = false;
    },
    update(ctx, dt) {
      const e = ctx.self;
      const t = e.tuning;
      const F = FIREBOMB;
      if (!e.playerAlive || e.homeDist > t.leashRadius) return 'return';
      const tp = ctx.targetPos;
      if (!tp) return 'return';
      if (e.lostTime > t.memory) {
        const d = e.pursue(tp, e.def.moveSpeed * 0.7, dt, 0.8, e.walkClear);
        if (d <= 1 || e.lostTime > t.memory + 6) return 'return';
        return;
      }
      const dist = e.distToPlayer;
      const inv = dist > 1e-3 ? 1 / dist : 0;
      const ax = -e.toPlayer.x * inv; // away from the player
      const az = -e.toPlayer.z * inv;
      fleeT = Math.max(0, fleeT - dt);
      fleeCool -= dt;
      strafeT -= dt;
      if (strafeT <= 0) {
        strafeT = 2 + e.shared.rng.next() * 2;
        strafe = e.shared.rng.next() < 0.5 ? -1 : 1;
      }
      if (cornered && dist > F.fleeDist + 1) cornered = false;

      // --- attacks
      if (ctx.canSeeTarget && e.attackCooldown <= 0 && fleeT <= 0) {
        const fe = facingError(e);
        let a: EnemyAttackDef | null = null;
        if (dist <= F.swipeDist + 0.3 || (cornered && dist <= 3)) a = findAttack(e, 'bottle_swipe');
        else if (dist >= F.minThrow) a = findAttack(e, 'molotov_lob');
        if (a && dist <= a.range && fe <= t.attackFacing && e.takeToken()) {
          ctx.currentAttack = a;
          return 'windup';
        }
      }

      // --- movement
      const spd = e.def.moveSpeed;
      let mx = 0;
      let mz = 0;
      let faceMove = false;
      if (fleeT <= 0 && fleeCool <= 0 && dist < F.fleeDist && !cornered) {
        fleeT = F.fleeTime;
        fleeCool = F.fleeCooldown;
      }
      if (fleeT > 0) {
        mx = (ax - az * 0.35 * strafe) * spd * F.fleeSpeedMul;
        mz = (az + ax * 0.35 * strafe) * spd * F.fleeSpeedMul;
        faceMove = true;
      } else {
        const intent = bandIntent(dist);
        if (intent < 0) {
          mx = (ax - az * 0.4 * strafe) * spd * 0.9;
          mz = (az + ax * 0.4 * strafe) * spd * 0.9;
        } else if (intent === 0) {
          mx = -az * strafe * spd * 0.45;
          mz = ax * strafe * spd * 0.45;
        } else {
          e.pursue(tp, spd, dt, F.bandMax - 1, e.walkClear);
          return;
        }
      }
      // never walk off a ledge / into a wall: probe a step ahead
      const len = Math.hypot(mx, mz);
      let moving = len > 1e-3;
      if (moving) {
        const p = e.capsule.position;
        _pt.x = p.x + (mx / len) * 1.3;
        _pt.y = p.y;
        _pt.z = p.z + (mz / len) * 1.3;
        if (!e.shared.los.walkable(p, _pt)) {
          moving = false;
          strafe = -strafe;
        }
      }
      const wantsBack = fleeT > 0 || bandIntent(dist) < 0;
      if (moving) e.steer(mx, mz);
      else e.holdStill();
      // cornered: trying to back off but not getting anywhere
      if (wantsBack && (!moving || (ctx.stateTime > 0.6 && e.speed < 0.35))) blockedT += dt;
      else blockedT = Math.max(0, blockedT - dt * 2);
      if (blockedT > 0.4 && dist < F.fleeDist + 1) {
        cornered = true;
        fleeT = 0;
        blockedT = 0;
      }
      if (faceMove && moving) e.face(mx, mz, t.turnRate * 1.4, dt);
      else e.facePlayer(t.turnRate, dt);
    },
  };

  const attack: S = {
    id: 'attack',
    enter(ctx) {
      const e = ctx.self;
      const a = ctx.currentAttack;
      e.attackSpent = false;
      if (a?.projectile) {
        throwBottle(e, a);
        e.attackSpent = true;
      }
    },
    update(ctx) {
      const e = ctx.self;
      const a = ctx.currentAttack;
      if (!a) return 'recover';
      e.holdStill();
      if (!a.projectile) e.meleeHit(a);
      if (ctx.stateTime >= a.active) return 'recover';
    },
  };

  return createCommonStates({ chase, attack });
}

// ------------------------------------------------------------------ animator

class FirebombView extends HollowView {
  constructor() {
    super(createFirebombRig());
  }

  protected override pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const st = e.state;
    const a = e.ctx.currentAttack;
    if ((st === 'windup' || st === 'attack' || st === 'recover') && a) {
      this.idlePose();
      const t = e.ctx.stateTime;
      const lob = !!a.projectile;
      let w = 0;
      let s = 0;
      let rate = 10;
      if (st === 'windup') w = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.75)));
      else if (st === 'attack') {
        w = 1;
        s = easeOut(clamp01(t / Math.max(0.05, a.active)));
        rate = 40;
      } else {
        w = 1;
        s = 1;
        rate = t < a.recover * 0.4 ? 12 : 4;
      }
      // arm cocked high behind the head (bottle overhead, the lit bottle reads from afar), then thrown
      T[SHR_X] = lerp(lerp(0.7, lob ? 2.7 : 2.3, w), 0.9, s);
      T[SHR_Z] = lerp(0.1, 0.25, w);
      T[ELR_X] = lerp(lerp(1.0, 0.25, w), 0.1, s);
      T[SPINE_X] = lerp(lerp(-0.1, lob ? 0.28 : 0.15, w), -0.55, s);
      T[SPINE_Y] = lerp(lerp(0, -0.2, w), 0.1, s);
      T[SHL_X] = lerp(0.7 * w, 0.3, s);
      T[SHL_Z] = -0.4 * w;
      T[ELL_X] = 0.5;
      if (st === 'windup' && w >= 1) T[SHR_X]! += Math.sin(this.time * 38) * 0.03;
      T[HIPS_Y] = lerp(-0.05 * w, -0.12, s);
      T[SHD_Z] = lob && (st === 'windup' || (st === 'attack' && s < 0.5)) && w > 0.15 ? 1 : 0; // glow flag
      return rate;
    }
    const rate = super.pose(e, dt);
    if (st === 'chase' || st === 'alert' || st === 'hitReact') {
      // upright, bottle held at the shoulder (not the sword-lunge shamble)
      T[SPINE_X] = st === 'chase' ? -0.12 : -0.05;
      T[SHR_X] = 0.8;
      T[SHR_Z] = 0.1;
      T[ELR_X] = 1.35;
      T[SHL_X] = 0.25;
      T[SHL_Z] = -0.25;
    }
    return rate;
  }

  override render(e: Enemy, alpha: number): void {
    super.render(e, alpha);
    const g = this.rig.glow;
    if (g) {
      const on = this.out[SHD_Z]! > 0.5 && e.alive;
      g.visible = on;
      if (on) g.scale.setScalar(1 + 0.25 * Math.sin(this.time * 30));
    }
  }
}

export const HOLLOW_FIREBOMB: ArchetypeDef = {
  archetype: 'hollowFirebomb',
  tuning: FIREBOMB_TUNING,
  hit: HOLLOW_HIT,
  attackExtras: {
    molotov_lob: { anim: 'lob' },
    bottle_swipe: { anim: 'swipe' },
  },
  states: buildStates,
  createView: () => new FirebombView(),
};
