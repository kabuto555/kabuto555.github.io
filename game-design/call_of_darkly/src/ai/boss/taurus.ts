// §10 Taurus Demon: archetype (tuning, hit shape, move table) + boss FSM states on the shared Fsm.
// The boss reuses the AiStateId chain (idle → alert → chase → windup → attack → recover → stagger →
// dead); which move is running lives in ctx.currentAttack (data/enemies taurus_demon attacks) and
// the per-move timings below. Moves: overhead smash, sweep, jump slam (leap + landing AoE), charge.
import type { HitShape } from '../../combat/targets';
import type { EnemyAttackDef } from '../../data/types';
import { DEFAULT_AI_TUNING, type AiTuning, type ArchetypeDef, type Enemy, type EnemyCtx } from '../enemy';
import { wrapAngle } from '../logic';
import { createCommonStates } from '../states';
import type { AiStateId, FsmState } from '../types';
import { ARENA, type ArenaFrame } from './arena';

export const TAURUS_ID = 'taurus_demon';

/** AI tuning (PLAN gives behaviour only). Big capsule: 1.1 m radius, 4.2 m tall. */
export const TAURUS_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 2.2,
  chaseSpeedMul: 0.85, // def moveSpeed 4 → 3.4 m/s stomp: the player can out-walk it, not out-think it
  accel: 7,
  turnRate: 2.4,
  windupTurnRate: 2.0,
  fovDeg: 360,
  proximity: 60,
  awareSightMul: 3,
  alertTime: 1.6, // intro roar
  staggerTime: 2.6, // plunge / burst stagger: a real punish window
  staggerKnockback: 0,
  staggerImmunity: 8, // no stagger-lock with RPGs
  poiseRegenDelay: 3,
  leashRadius: 1e9,
  memory: 1e9,
  stopDist: 3.0,
  attackCooldown: [0.5, 1.3],
  attackFacing: 0.7,
  lungeSpeed: 3.2,
  reachBonus: 0.4,
  wanderRadius: 0,
  idleTime: [1e9, 1e9],
  deathFall: 1.7,
  corpseTime: 8,
  sinkTime: 3,
  capsuleRadius: 1.1,
  capsuleHeight: 4.2,
  eyeHeight: 4.2,
  chestHeight: 2.6,
};

export const TAURUS_HIT: HitShape = { bodyRadius: 1.15, bodyHeight: 3.9, headRadius: 0.55, headY: 4.3 };
/** Top of the head (plunge contact band). */
export const TAURUS_HEIGHT = 4.7;

/** Per-move timings not in data/enemies (windup/damage/range/arc come from there). Seconds, m. */
export interface TaurusMove {
  /** Hit window (static moves) — must fit inside a normal roll's i-frames (§3: 0.30 s). */
  active: number;
  /** Punish window after the hit. */
  recover: number;
  /** Fraction of the windup during which it still tracks the player (then commits). */
  track: number;
  /** Turn rate while tracking (rad/s). */
  trackRate: number;
  /** Selection band (XZ distance to the player). */
  minRange: number;
  maxRange: number;
  weight: number;
}

export const TAURUS_MOVES: Record<string, TaurusMove> = {
  overhead_smash: { active: 0.25, recover: 1.3, track: 0.7, trackRate: 2.2, minRange: 0, maxRange: 4.2, weight: 1 },
  sweep: { active: 0.28, recover: 0.95, track: 0.8, trackRate: 1.8, minRange: 0, maxRange: 4.8, weight: 1 },
  jump_slam: { active: 0.15, recover: 1.4, track: 1, trackRate: 3.0, minRange: 5.5, maxRange: 16, weight: 1 },
  charge: { active: 0.2, recover: 1.2, track: 0.85, trackRate: 2.5, minRange: 8, maxRange: 26, weight: 1 },
};

/** Jump slam flight + landing AoE. */
export const JUMP = { flight: 0.8, arc: 2.4, maxLeap: 13, aoeRadius: 4.2, aoeHeight: 2.2 } as const;
/** Charge run. */
export const CHARGE = { speed: 11, maxTime: 1.9, overshoot: 6, maxDist: 24, width: 1.9, reach: 1.7 } as const;

/** Runtime per-boss blackboard (states + view + boss system share it). */
export interface TaurusData {
  /** Fight on: the player went through the fog wall. Set by the boss system. */
  engaged: boolean;
  frame: ArenaFrame | null;
  /** Called on every windup start (dodge tutorial hint). */
  onWindup: ((e: Enemy, a: EnemyAttackDef) => void) | null;
  readonly jumpFrom: { x: number; y: number; z: number };
  readonly jumpTo: { x: number; y: number; z: number };
  airborne: boolean;
  /** Seconds since the last slam landing (view shockwave), Infinity = none. */
  slamT: number;
  readonly chargeDir: { x: number; z: number };
  chargeLeft: number;
  lastMove: string | null;
  repeats: number;
  decideT: number;
}

const DATA = new WeakMap<Enemy, TaurusData>();

export function taurusData(e: Enemy): TaurusData {
  let d = DATA.get(e);
  if (!d) {
    d = {
      engaged: false,
      frame: null,
      onWindup: null,
      jumpFrom: { x: 0, y: 0, z: 0 },
      jumpTo: { x: 0, y: 0, z: 0 },
      airborne: false,
      slamT: Infinity,
      chargeDir: { x: 0, z: -1 },
      chargeLeft: 0,
      lastMove: null,
      repeats: 0,
      decideT: 0,
    };
    DATA.set(e, d);
  }
  return d;
}

// ------------------------------------------------------------------ move choice (pure)

/**
 * Weighted pick among moves whose band contains `dist`. `side` = |angle| (rad) between facing and
 * the player: sweeps are favoured when the player circles to the flank. A move used twice in a
 * row is skipped when there is an alternative. Returns null = keep walking.
 */
export function chooseTaurusMove(dist: number, side: number, rnd: number, last: string | null, repeats: number): string | null {
  let total = 0;
  const opts: [string, number][] = [];
  for (const [id, m] of Object.entries(TAURUS_MOVES)) {
    if (dist < m.minRange || dist > m.maxRange) continue;
    let w = m.weight;
    if (id === 'sweep' && side > 0.5) w *= 2.5;
    if (id === 'overhead_smash' && side > 0.9) w *= 0.3;
    if (id === 'jump_slam' && dist > 12) w *= 0.4;
    opts.push([id, w]);
  }
  if (opts.length > 1 && last && repeats >= 2) {
    const i = opts.findIndex((o) => o[0] === last);
    if (i >= 0) opts.splice(i, 1);
  }
  for (const o of opts) total += o[1];
  if (total <= 0) return null;
  let r = rnd * total;
  for (const [id, w] of opts) {
    r -= w;
    if (r <= 0) return id;
  }
  return opts[opts.length - 1]![0];
}

/** Clamp a jump target onto the deck interior (local), limited to `maxLeap` from the start. */
export function clampJumpTarget(fromX: number, fromZ: number, toX: number, toZ: number, frame: ArenaFrame | null, out: { x: number; z: number }): void {
  let dx = toX - fromX;
  let dz = toZ - fromZ;
  const d = Math.hypot(dx, dz);
  if (d > JUMP.maxLeap) {
    dx *= JUMP.maxLeap / d;
    dz *= JUMP.maxLeap / d;
  }
  out.x = fromX + dx;
  out.z = fromZ + dz;
  if (!frame) return;
  const l = frame.toLocal(out.x, 0, out.z);
  const m = ARENA.halfWidth - TAURUS_TUNING.capsuleRadius - 0.25;
  l.x = Math.max(-m, Math.min(m, l.x));
  l.z = Math.max(3, Math.min(ARENA.farZ - 2, l.z));
  const w = frame.toWorld(l.x, 0, l.z);
  out.x = w.x;
  out.z = w.z;
}

function findAttack(e: Enemy, id: string): EnemyAttackDef | null {
  const list = e.def.attacks;
  for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return list[i]!;
  return null;
}

/** Attack's per-move timings (falls back to the def's for unknown ids). */
export function moveOf(a: EnemyAttackDef): TaurusMove {
  return TAURUS_MOVES[a.id] ?? { active: a.active, recover: a.recover, track: 0.8, trackRate: 2, minRange: 0, maxRange: a.range, weight: 0 };
}

// ------------------------------------------------------------------ hit helpers

/** Player hit by the landing shockwave / charge body: once per attack, rolling through spends it. */
function hitPlayerAt(e: Enemy, a: EnemyAttackDef, dirX: number, dirZ: number): void {
  if (e.attackSpent || !e.playerAlive) return;
  e.attackSpent = true;
  const pp = e.shared.player.position;
  const len = Math.hypot(dirX, dirZ) || 1;
  e.shared.combat.hitPlayer({
    source: e.id,
    target: e.shared.player.id,
    amount: a.damage,
    type: a.damageType,
    poiseDamage: a.poiseDamage,
    hitPos: { x: pp.x, y: pp.y + 1, z: pp.z },
    dir: { x: dirX / len, y: 0, z: dirZ / len },
    weaponId: `${e.defId}:${a.id}`,
  });
}

const _slamEv = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };
function emitSlam(e: Enemy, radius: number): void {
  const p = e.capsule.position;
  _slamEv.pos.x = p.x; _slamEv.pos.y = p.y; _slamEv.pos.z = p.z;
  _slamEv.radius = radius;
  e.shared.bus.emit('bossSlam', _slamEv);
}

function slamCheck(e: Enemy, a: EnemyAttackDef): void {
  const p = e.capsule.position;
  const pp = e.shared.player.position;
  const dx = pp.x - p.x;
  const dz = pp.z - p.z;
  if (Math.hypot(dx, dz) > JUMP.aoeRadius || Math.abs(pp.y - p.y) > JUMP.aoeHeight) return;
  hitPlayerAt(e, a, dx, dz);
}

function chargeCheck(e: Enemy, a: EnemyAttackDef, d: TaurusData): void {
  const p = e.capsule.position;
  const pp = e.shared.player.position;
  const dx = pp.x - p.x;
  const dz = pp.z - p.z;
  const fwd = dx * d.chargeDir.x + dz * d.chargeDir.z;
  const lat = Math.abs(dx * d.chargeDir.z - dz * d.chargeDir.x);
  if (fwd < -0.6 || fwd > TAURUS_TUNING.capsuleRadius + CHARGE.reach || lat > CHARGE.width) return;
  if (pp.y - p.y > 3.5 || pp.y < p.y - 1.5) return;
  hitPlayerAt(e, a, d.chargeDir.x, d.chargeDir.z);
}

// ------------------------------------------------------------------ states

type S = FsmState<EnemyCtx, AiStateId>;

const idle: S = {
  id: 'idle',
  enter(ctx) {
    ctx.self.aware = false;
    ctx.currentAttack = null;
  },
  update(ctx, dt) {
    const e = ctx.self;
    e.holdStill();
    e.wasHit = e.heard = false;
    e.face(-Math.sin(e.homeYaw), -Math.cos(e.homeYaw), 1.5, dt);
    if (taurusData(e).engaged && e.playerAlive) return 'alert';
  },
};

/** Intro roar: the readable "fight starts now" beat. */
const alert: S = {
  id: 'alert',
  enter(ctx, from) {
    ctx.self.aware = true;
    if (from === 'idle' || from === 'patrol') ctx.self.emitAlert();
  },
  update(ctx, dt) {
    const e = ctx.self;
    e.holdStill();
    e.facePlayer(1.6, dt);
    if (ctx.stateTime >= e.tuning.alertTime) return 'chase';
  },
};

const chase: S = {
  id: 'chase',
  enter(ctx) {
    ctx.self.aware = true;
    taurusData(ctx.self).decideT = 0;
  },
  update(ctx, dt) {
    const e = ctx.self;
    const d = taurusData(e);
    const t = e.tuning;
    if (!d.engaged || !e.playerAlive) return 'return';
    const dist = e.distToPlayer;
    const side = Math.abs(wrapAngle(Math.atan2(-e.toPlayer.x, -e.toPlayer.z) - e.transform.yaw));
    d.decideT -= dt;
    if (e.attackCooldown <= 0 && d.decideT <= 0) {
      d.decideT = 0.25;
      const close = dist <= TAURUS_MOVES.sweep!.maxRange;
      // up close: always swing (once roughly facing). Mid/long range: a gap closer now and then.
      const roll = e.shared.rng.next();
      if (close ? side <= 1.4 : roll < 0.4) {
        const id = chooseTaurusMove(dist, side, e.shared.rng.next(), d.lastMove, d.repeats);
        const a = id ? findAttack(e, id) : null;
        if (a) {
          d.repeats = d.lastMove === a.id ? d.repeats + 1 : 1;
          d.lastMove = a.id;
          ctx.currentAttack = a;
          return 'windup';
        }
      }
    }
    const pp = e.shared.player.position;
    if (dist > t.stopDist) e.seek(pp.x, pp.z, e.def.moveSpeed * t.chaseSpeedMul, dt, t.stopDist);
    else {
      e.holdStill();
      e.facePlayer(t.turnRate, dt);
    }
  },
};

const windup: S = {
  id: 'windup',
  enter(ctx) {
    const e = ctx.self;
    e.attackSpent = false;
    const a = ctx.currentAttack;
    if (a) {
      e.emitWindup(a.id);
      taurusData(e).onWindup?.(e, a);
    }
  },
  update(ctx, dt) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    if (!a) return 'chase';
    const m = moveOf(a);
    e.holdStill();
    if (e.playerAlive && ctx.stateTime <= a.windup * m.track) e.facePlayer(m.trackRate, dt);
    if (ctx.stateTime >= a.windup) return 'attack';
  },
};

const attack: S = {
  id: 'attack',
  enter(ctx) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    const d = taurusData(e);
    if (!a) return;
    const p = e.capsule.position;
    if (a.id === 'overhead_smash') emitSlam(e, 3);
    if (a.id === 'jump_slam') {
      const pp = e.shared.player.position;
      d.jumpFrom.x = p.x;
      d.jumpFrom.y = p.y;
      d.jumpFrom.z = p.z;
      clampJumpTarget(p.x, p.z, pp.x, pp.z, d.frame, d.jumpTo);
      d.jumpTo.y = p.y;
      d.airborne = true;
    } else if (a.id === 'charge') {
      d.chargeDir.x = e.fwdX;
      d.chargeDir.z = e.fwdZ;
      d.chargeLeft = Math.min(CHARGE.maxDist, e.distToPlayer + CHARGE.overshoot);
    } else {
      // step into the swing
      const gap = Math.max(0, Math.min(1.5, e.distToPlayer - 2.5));
      const k = e.tuning.lungeSpeed * (0.3 + 0.7 * gap);
      e.impulse(e.fwdX * k, e.fwdZ * k);
    }
  },
  update(ctx, dt) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    if (!a) return 'recover';
    const d = taurusData(e);
    const m = moveOf(a);
    const c = e.capsule;
    if (a.id === 'jump_slam') {
      e.holdStill();
      if (d.airborne) {
        const u = Math.min(1, ctx.stateTime / JUMP.flight);
        const f = d.jumpFrom;
        const to = d.jumpTo;
        c.setPosition({
          x: f.x + (to.x - f.x) * u,
          y: f.y + (to.y - f.y) * u + JUMP.arc * 4 * u * (1 - u),
          z: f.z + (to.z - f.z) * u,
        });
        c.velocity.x = c.velocity.y = c.velocity.z = 0;
        c.setGrounded(false);
        e.face(to.x - f.x, to.z - f.z, 4, dt);
        if (u >= 1) {
          d.airborne = false;
          d.slamT = 0;
          emitSlam(e, JUMP.aoeRadius);
          ctx.stateTime = 0; // landing starts the AoE window
        }
        return;
      }
      if (e.playerAlive) slamCheck(e, a);
      if (ctx.stateTime >= m.active) return 'recover';
      return;
    }
    if (a.id === 'charge') {
      const step = CHARGE.speed * dt;
      const p = c.position;
      e.seek(p.x + d.chargeDir.x * 50, p.z + d.chargeDir.z * 50, CHARGE.speed, dt, 0);
      d.chargeLeft -= step;
      if (e.playerAlive) chargeCheck(e, a, d);
      // stop at the end of the run, at a wall, or on timeout
      const stalled = ctx.stateTime > 0.35 && e.speed < CHARGE.speed * 0.3;
      if (d.chargeLeft <= 0 || stalled || ctx.stateTime >= CHARGE.maxTime) return 'recover';
      return;
    }
    e.holdStill();
    e.meleeHit(a);
    if (ctx.stateTime >= m.active) return 'recover';
  },
  exit(ctx) {
    taurusData(ctx.self).airborne = false;
  },
};

const recover: S = {
  id: 'recover',
  update(ctx, dt) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    e.holdStill();
    if (!a) return 'chase';
    const m = moveOf(a);
    // the charge skids round to face the player again late in the recovery
    if (a.id === 'charge' && ctx.stateTime > m.recover * 0.5) e.facePlayer(1.8, dt);
    if (ctx.stateTime >= m.recover) {
      const t = e.tuning;
      e.attackCooldown = t.attackCooldown[0] + (t.attackCooldown[1] - t.attackCooldown[0]) * e.shared.rng.next();
      ctx.currentAttack = null;
      return 'chase';
    }
  },
};

const stagger: S = {
  id: 'stagger',
  enter(ctx) {
    ctx.currentAttack = null;
    taurusData(ctx.self).airborne = false;
  },
  update(ctx) {
    ctx.self.holdStill();
    if (ctx.stateTime >= ctx.self.tuning.staggerTime) {
      ctx.self.attackCooldown = 0.6;
      return taurusData(ctx.self).engaged ? 'chase' : 'return';
    }
  },
  exit(ctx) {
    ctx.self.staggerImmuneT = ctx.self.tuning.staggerImmunity;
  },
};

/** Disengaged (player died / left): walk home, then idle. */
const giveUp: S = {
  id: 'return',
  enter(ctx) {
    ctx.self.aware = false;
    ctx.currentAttack = null;
  },
  update(ctx, dt) {
    const e = ctx.self;
    if (taurusData(e).engaged && e.playerAlive) return 'chase';
    const h = e.home;
    const dist = e.seek(h.x, h.z, e.tuning.walkSpeed, dt, 0.5);
    if (dist <= 0.5) return 'idle';
  },
};

const toChase: S = { id: 'hitReact', update: () => 'chase' };
const toIdle: S = { id: 'patrol', update: () => 'idle' };

export const TAURUS: ArchetypeDef = {
  archetype: 'taurusDemon',
  tuning: TAURUS_TUNING,
  hit: TAURUS_HIT,
  attackExtras: {},
  states: () => createCommonStates({ idle, alert, chase, windup, attack, recover, stagger, return: giveUp, hitReact: toChase, patrol: toIdle }),
  // the view lives in taurusModel.ts (three.js); installTaurus swaps it in before spawning
  createView: () => {
    throw new Error('[taurus] view factory not installed');
  },
};
