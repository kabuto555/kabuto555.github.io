// §10 Hollow (crossbow): 60 hp, stationary on its perch (no nav, no movement). Tracks the player
// inside a firing cone, raises the crossbow with a clear 0.8 s aim, fires a SLOW visible bolt
// (18 m/s, dodgeable; leads the player a little), then spends a reload before the next shot.
import type { Vec3Like } from '../core/types';
import { DEFAULT_AI_TUNING, type ArchetypeDef, type AiTuning, type Enemy, type EnemyCtx } from './enemy';
import { leadPoint } from './hazards';
import {
  clamp01,
  easeOut,
  ELL_X,
  ELR_X,
  HOLLOW_HIT,
  HollowView,
  lerp,
  SHD_X,
  SHD_Z,
  SHL_X,
  SHL_Z,
  SHR_X,
  SPINE_X,
} from './hollow';
import { turnToward, wrapAngle, yawTo } from './logic';
import { createCrossbowRig, WEAPON_BASE } from './models';
import { createCommonStates } from './states';
import type { AiStateId, FsmState } from './types';

type S = FsmState<EnemyCtx, AiStateId>;

export const CROSSBOW_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 0,
  chaseSpeedMul: 0,
  turnRate: 3.6,
  windupTurnRate: 2.2,
  alertTime: 0.45,
  staggerTime: 1.0,
  wanderRadius: 0,
  leashRadius: 4,
  attackCooldown: [0.8, 1.6], // on top of the attack's own recover = the reload
  attackFacing: 0.22,
  staggerKnockback: 0, // pinned to the perch
};

export const CROSSBOW = {
  /** Half-angle (rad) of the firing/tracking cone around the perch facing. */
  cone: (75 * Math.PI) / 180,
  /** Lead fraction / cap (m): under-leads so a sidestep still dodges. */
  lead: 0.55,
  maxLead: 3,
  /** Muzzle offset from the feet. */
  muzzleY: 1.38,
  muzzleFwd: 0.6,
} as const;

/** Is the direction (dx, dz) inside the cone around `homeYaw`? */
export function inAimCone(homeYaw: number, dx: number, dz: number, cone: number = CROSSBOW.cone): boolean {
  return Math.abs(wrapAngle(yawTo(dx, dz) - homeYaw)) <= cone;
}

/** Yaw to face for a target direction: the exact yaw inside the cone, else the nearest cone edge. */
export function clampAimYaw(homeYaw: number, dx: number, dz: number, cone: number = CROSSBOW.cone): number {
  const err = wrapAngle(yawTo(dx, dz) - homeYaw);
  return homeYaw + Math.max(-cone, Math.min(cone, err));
}

const _from = { x: 0, y: 0, z: 0 };
const _pt = { x: 0, y: 0, z: 0 };
const _aim = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

/**
 * Bolt direction from the muzzle at the player, led by their velocity and lifted to cancel the
 * bolt's own drop. Writes a unit vector into `out`; returns it.
 */
export function boltAim(from: Vec3Like, target: Vec3Like, velX: number, velZ: number, speed: number, gravity: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  leadPoint(from, target, velX, velZ, speed, CROSSBOW.lead, CROSSBOW.maxLead, _aim);
  const d = Math.hypot(_aim.x - from.x, _aim.y - from.y, _aim.z - from.z);
  const t = d / speed;
  const lift = 0.5 * gravity * t * t;
  let x = _aim.x - from.x;
  let y = _aim.y + lift - from.y;
  let z = _aim.z - from.z;
  const l = Math.hypot(x, y, z) || 1;
  x /= l;
  y /= l;
  z /= l;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

function desiredYaw(e: Enemy): number {
  return clampAimYaw(e.homeYaw, e.toPlayer.x, e.toPlayer.z);
}

function aim(e: Enemy, dt: number, rate: number): void {
  const y = desiredYaw(e);
  e.transform.yaw = turnToward(e.transform.yaw, y, rate * dt);
}

function buildStates(): S[] {
  const chase: S = {
    id: 'chase',
    enter(ctx) {
      ctx.self.aware = true;
      ctx.self.releaseToken();
    },
    update(ctx, dt) {
      const e = ctx.self;
      const t = e.tuning;
      e.holdStill();
      if (!e.playerAlive || e.lostTime > t.memory || !ctx.targetPos) return 'return';
      if (ctx.canSeeTarget) {
        aim(e, dt, t.turnRate);
        const a = e.def.attacks[0]!;
        const fe = Math.abs(wrapAngle(desiredYaw(e) - e.transform.yaw));
        if (e.attackCooldown <= 0 && inAimCone(e.homeYaw, e.toPlayer.x, e.toPlayer.z) && fe <= t.attackFacing && e.distToPlayer <= a.range) {
          ctx.currentAttack = a;
          return 'windup';
        }
      } else {
        // lost sight: look toward where they were (inside the cone)
        const tp = ctx.targetPos;
        const p = e.capsule.position;
        e.transform.yaw = turnToward(e.transform.yaw, clampAimYaw(e.homeYaw, tp.x - p.x, tp.z - p.z), t.turnRate * 0.6 * dt);
      }
    },
  };

  const windup: S = {
    id: 'windup',
    enter(ctx) {
      ctx.self.attackSpent = false;
    },
    update(ctx, dt) {
      const e = ctx.self;
      const a = ctx.currentAttack;
      if (!a) return 'chase';
      e.holdStill();
      if (e.playerAlive) aim(e, dt, e.tuning.windupTurnRate);
      if (ctx.stateTime >= a.windup) return 'attack';
    },
  };

  const attack: S = {
    id: 'attack',
    enter(ctx) {
      const e = ctx.self;
      const a = ctx.currentAttack;
      if (!a?.projectile) return;
      const p = e.capsule.position;
      _from.x = p.x + e.fwdX * CROSSBOW.muzzleFwd;
      _from.y = p.y + CROSSBOW.muzzleY;
      _from.z = p.z + e.fwdZ * CROSSBOW.muzzleFwd;
      const pp = e.shared.player.position;
      _pt.x = pp.x;
      _pt.y = pp.y + 1.1;
      _pt.z = pp.z;
      const v = e.shared.hazards.playerVel;
      boltAim(_from, _pt, v.x, v.z, a.projectile.speed, a.projectile.gravity, _dir);
      e.shared.hazards.fireBolt(e.id, a, _from, _dir);
      e.attackSpent = true;
    },
    update(ctx) {
      const e = ctx.self;
      const a = ctx.currentAttack;
      e.holdStill();
      if (!a || ctx.stateTime >= a.active) return 'recover';
    },
  };

  return createCommonStates({ chase, windup, attack });
}

// ------------------------------------------------------------------ animator

class CrossbowView extends HollowView {
  constructor() {
    super(createCrossbowRig());
  }

  protected override pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const st = e.state;
    const a = e.ctx.currentAttack;
    const t = e.ctx.stateTime;
    let raise = 0.15;
    let crank = 0;
    let rate = 10;
    switch (st) {
      case 'windup':
        if (a) {
          const u = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.75)));
          raise = lerp(0.35, 1, u);
          if (u >= 1) T[SPINE_X] = -0.1 + Math.sin(this.time * 40) * 0.015; // held breath
        }
        this.idlePose();
        break;
      case 'attack':
        raise = 1;
        rate = 40;
        this.idlePose();
        break;
      case 'recover':
        if (a) {
          const u = clamp01(t / Math.max(0.05, a.recover));
          raise = u < 0.25 ? lerp(1, 0.2, u / 0.25) : 0.2;
          crank = u < 0.25 ? 0 : Math.min(1, (u - 0.25) / 0.6); // cranking the string back
        }
        this.idlePose();
        break;
      case 'chase':
      case 'alert':
        raise = 0.5;
        this.idlePose();
        break;
      default: {
        const r = super.pose(e, dt);
        T[SHD_Z] = 0.15;
        T[SHD_X] = 0;
        return r;
      }
    }
    const k = easeOut(raise);
    T[SHL_X] = lerp(0.85, 1.5, k);
    T[SHL_Z] = lerp(-0.1, 0.05, k);
    T[ELL_X] = lerp(0.9, 0.35, k);
    T[SHR_X] = lerp(0.6, 1.4, k);
    T[ELR_X] = lerp(1.1, 0.4, k);
    if (st !== 'windup') T[SPINE_X] = lerp(-0.3, -0.08, k) + crank * -0.12;
    T[SHD_Z] = raise;
    T[SHD_X] = crank;
    return rate;
  }

  override render(e: Enemy, alpha: number): void {
    super.render(e, alpha);
    const w = this.rig.weapon;
    if (!w) return;
    const raise = this.out[SHD_Z]!;
    const crank = this.out[SHD_X]!;
    const k = easeOut(clamp01(raise));
    w.position.set(WEAPON_BASE.x, WEAPON_BASE.y + 0.24 * k - 0.06 * crank, WEAPON_BASE.z - 0.1 * k + 0.12 * crank);
    w.rotation.set(lerp(-0.55, 0.03, k) - 0.5 * crank, 0, 0);
  }
}

export const HOLLOW_CROSSBOW: ArchetypeDef = {
  archetype: 'hollowCrossbow',
  tuning: CROSSBOW_TUNING,
  hit: HOLLOW_HIT,
  attackExtras: { slow_bolt: { anim: 'bolt' } },
  states: buildStates,
  createView: () => new CrossbowView(),
};
