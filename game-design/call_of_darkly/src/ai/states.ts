// Common FSM states (§10: idle → alert → chase → windup → attack → recover → (stagger) → dead),
// plus patrol (idle wander), hitReact (startled when shot unaware) and return (leash home).
// Archetypes take `createCommonStates()` and replace entries (e.g. a ranged `attack`).
import type { EnemyAttackDef } from '../data/types';
import type { EnemyCtx } from './enemy';
import { pickAttack } from './logic';
import type { AiStateId, FsmState } from './types';

type S = FsmState<EnemyCtx, AiStateId>;

const _pt = { x: 0, y: 0, z: 0 };

/** Shared stimulus check for unaware states. Returns the reaction state, if any. */
function stimulus(ctx: EnemyCtx): AiStateId | void {
  const e = ctx.self;
  if (e.wasHit) return 'hitReact';
  if (ctx.canSeeTarget || e.heard) return 'alert';
}

function pickRange(min: number, max: number, rnd: number): number {
  return min + (max - min) * rnd;
}

const idle: S = {
  id: 'idle',
  enter(ctx) {
    const e = ctx.self;
    e.aware = false;
    e.releaseToken();
    e.wander.x = pickRange(e.tuning.idleTime[0], e.tuning.idleTime[1], e.shared.rng.next()); // wander.x = idle duration
  },
  update(ctx) {
    const e = ctx.self;
    e.holdStill();
    const s = stimulus(ctx);
    if (s) return s;
    if (e.tuning.wanderRadius > 0 && ctx.stateTime >= e.wander.x) return 'patrol';
  },
};

const patrol: S = {
  id: 'patrol',
  enter(ctx) {
    const e = ctx.self;
    const r = e.tuning.wanderRadius * Math.sqrt(e.shared.rng.next());
    const a = e.shared.rng.next() * Math.PI * 2;
    e.wander.x = e.home.x + Math.cos(a) * r;
    e.wander.z = e.home.z + Math.sin(a) * r;
    // keep wander targets reachable in a straight line
    _pt.x = e.wander.x;
    _pt.y = e.home.y;
    _pt.z = e.wander.z;
    if (!e.shared.los.walkable(e.capsule.position, _pt)) {
      e.wander.x = e.home.x;
      e.wander.z = e.home.z;
    }
  },
  update(ctx, dt) {
    const e = ctx.self;
    const s = stimulus(ctx);
    if (s) return s;
    const d = e.seek(e.wander.x, e.wander.z, e.tuning.walkSpeed, dt, 0.3);
    if (d <= 0.3 || ctx.stateTime > 6) return 'idle';
  },
};

const alert: S = {
  id: 'alert',
  enter(ctx, from) {
    const e = ctx.self;
    if (from === 'idle' || from === 'patrol') e.emitAlert();
    e.aware = true;
    e.heard = false;
    e.wasHit = false;
    e.resetPath();
  },
  update(ctx, dt) {
    const e = ctx.self;
    e.holdStill();
    const tp = ctx.targetPos;
    if (tp) e.face(tp.x - e.capsule.position.x, tp.z - e.capsule.position.z, e.tuning.turnRate * 0.8, dt);
    if (ctx.stateTime >= e.tuning.alertTime) return 'chase';
  },
};

const hitReact: S = {
  id: 'hitReact',
  enter(ctx) {
    const e = ctx.self;
    e.aware = true;
    e.wasHit = false;
    e.heard = false;
    e.resetPath();
  },
  update(ctx, dt) {
    const e = ctx.self;
    e.holdStill();
    const tp = ctx.targetPos;
    if (tp) e.face(tp.x - e.capsule.position.x, tp.z - e.capsule.position.z, e.tuning.turnRate, dt);
    if (ctx.stateTime >= e.tuning.hitReactTime) return 'chase';
  },
};

const chase: S = {
  id: 'chase',
  enter(ctx) {
    ctx.self.aware = true;
    ctx.self.releaseToken();
  },
  update(ctx, dt) {
    const e = ctx.self;
    const t = e.tuning;
    if (!e.playerAlive) return 'return';
    if (e.homeDist > t.leashRadius) return 'return';
    const tp = ctx.targetPos;
    if (!tp) return 'return';
    if (e.lostTime > t.memory) {
      // lost the player: go look where they were last seen, then give up
      const d = e.pursue(tp, e.def.moveSpeed * t.chaseSpeedMul * 0.7, dt, 0.8, e.walkClear);
      if (d <= 1 || e.lostTime > t.memory + 6) return 'return';
      return;
    }
    // attack when in range, facing, and holding a token
    if (ctx.canSeeTarget && e.attackCooldown <= 0) {
      const dist = e.distToPlayer;
      const facing = Math.abs(Math.atan2(e.toPlayer.x * e.fwdZ - e.toPlayer.z * e.fwdX, e.toPlayer.x * e.fwdX + e.toPlayer.z * e.fwdZ));
      if (facing <= t.attackFacing) {
        const a = pickAttack(e.def.attacks, dist, e.shared.rng.next(), (x) => !e.extra(x)?.followUpOnly && !x.projectile);
        if (a && e.takeToken()) {
          ctx.currentAttack = a;
          return 'windup';
        }
      }
    }
    e.pursue(tp, e.def.moveSpeed * t.chaseSpeedMul, dt, t.stopDist, e.walkClear);
    if (e.distToPlayer <= t.stopDist + 0.4) e.facePlayer(t.turnRate, dt);
  },
};

const windup: S = {
  id: 'windup',
  enter(ctx) {
    const e = ctx.self;
    e.attackSpent = false;
    e.takeToken();
    if (ctx.currentAttack) e.emitWindup(ctx.currentAttack.id);
  },
  update(ctx, dt) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    if (!a) return 'chase';
    e.holdStill();
    // track the player during the windup (commit at active frames)
    if (e.playerAlive) e.facePlayer(e.tuning.windupTurnRate, dt);
    if (ctx.stateTime >= a.windup) return 'attack';
  },
};

const attack: S = {
  id: 'attack',
  enter(ctx) {
    const e = ctx.self;
    // step into the swing (gap closer), stronger when the player backs off
    const gap = Math.max(0, Math.min(1.2, e.distToPlayer - 1.0));
    const lunge = e.tuning.lungeSpeed * (0.4 + 0.6 * gap);
    e.impulse(e.fwdX * lunge, e.fwdZ * lunge);
  },
  update(ctx) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    if (!a) return 'recover';
    e.holdStill();
    e.meleeHit(a);
    if (ctx.stateTime >= a.active) return 'recover';
  },
};

const recover: S = {
  id: 'recover',
  enter(ctx) {
    ctx.self.releaseToken();
  },
  update(ctx, dt) {
    const e = ctx.self;
    const a = ctx.currentAttack;
    e.holdStill();
    if (!a) return 'chase';
    const x = e.extra(a);
    if (x?.followUp && e.playerAlive) {
      const delay = x.followUpDelay ?? a.recover;
      if (ctx.stateTime >= delay && ctx.stateTime - dt < delay) {
        const next = findAttack(e.def.attacks, x.followUp);
        // chain only if the player is still close and the roll succeeds
        if (next && e.distToPlayer <= next.range + 0.75 && e.shared.rng.next() < (x.followUpChance ?? 1)) {
          if (e.takeToken()) {
            ctx.currentAttack = next;
            return 'windup';
          }
        }
      }
    }
    if (ctx.stateTime >= a.recover) {
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
    const e = ctx.self;
    e.releaseToken();
    ctx.currentAttack = null;
    if (e.stunTime > 0) return; // stunned (flashbang): no knockback, no forced aggro
    e.aware = true;
    const k = e.tuning.staggerKnockback;
    e.impulse(-e.fwdX * k, -e.fwdZ * k);
  },
  update(ctx) {
    const e = ctx.self;
    e.holdStill();
    if (e.stunTime > 0) return; // held for the full stun
    if (ctx.stateTime >= e.tuning.staggerTime) {
      e.attackCooldown = Math.max(e.attackCooldown, 0.2);
      return e.aware ? 'chase' : 'idle';
    }
  },
  exit(ctx) {
    ctx.self.staggerImmuneT = ctx.self.tuning.staggerImmunity;
  },
};

const giveUp: S = {
  id: 'return',
  enter(ctx) {
    const e = ctx.self;
    e.aware = false;
    e.heard = false;
    e.wasHit = false;
    e.releaseToken();
    e.resetPath();
    ctx.currentAttack = null;
  },
  update(ctx, dt) {
    const e = ctx.self;
    // a short grace before re-aggro so leashing can't ping-pong at the boundary
    if (ctx.stateTime > 1.5 && e.homeDist < e.tuning.leashRadius * 0.8) {
      const s = stimulus(ctx);
      if (s) return s;
    } else if (e.wasHit) return 'hitReact';
    const d = e.pursue(e.home, e.tuning.walkSpeed * 1.6, dt, 0.4, false);
    if (d <= 0.5) {
      const dyaw = e.face(-Math.sin(e.homeYaw), -Math.cos(e.homeYaw), e.tuning.turnRate, dt);
      if (dyaw < 0.05) return 'idle';
    }
  },
};

const dead: S = {
  id: 'dead',
  enter(ctx) {
    const e = ctx.self;
    e.releaseToken();
    e.aware = false;
    ctx.currentAttack = null;
    ctx.canSeeTarget = false;
    const p = e.capsule.position;
    e.capsule.velocity.x = e.capsule.velocity.z = 0;
    const pos = { x: p.x, y: p.y, z: p.z };
    e.shared.bus.emit('enemyDeath', {
      enemyId: e.id,
      defId: e.defId,
      dropTableId: e.def.dropTable,
      pos,
      souls: e.def.souls,
      killerId: e.killerId,
    });
    e.shared.bus.emit('death', { entityId: e.id, killerId: e.killerId, pos, enemyId: e.defId });
  },
  update() {
    // corpse: the view animates fall → linger → sink; the system removes it when corpseDone.
  },
};

function findAttack(list: readonly EnemyAttackDef[], id: string): EnemyAttackDef | null {
  for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return list[i]!;
  return null;
}

/** Fresh copy of the common state table; override entries by id. */
export function createCommonStates(overrides: Partial<Record<AiStateId, S>> = {}): S[] {
  const base: Record<AiStateId, S> = { idle, patrol, alert, hitReact, chase, windup, attack, recover, stagger, return: giveUp, dead };
  return Object.values({ ...base, ...overrides });
}
