// §10 Black Knight (mini-boss): slow, deliberate, high poise. Overhead, 2-hit wide sweep, thrust lunge
// (gap closer) and a reload punish: a gun reload starting within ~10 m with LOS triggers the
// (telegraphed) lunge immediately. Shows the mini-boss bar while engaged; never respawns once killed.
import type { HitShape } from '../combat/targets';
import type { EnemyAttackDef } from '../data/types';
import { DEFAULT_AI_TUNING, type ArchetypeDef, type AiTuning, type Enemy, type EnemyCtx } from './enemy';
import { createBlackKnightRig, BK_HIPS_Y } from './blackKnightModel';
import {
  BODY_X, BODY_Z, clamp01, easeOut, ELL_X, ELR_X, HIPL_X, HIPR_X, HIPS_Y, HollowView, KNEEL_X, KNEER_X, lerp,
  SHL_X, SHL_Z, SHR_X, SHR_Y, SHR_Z, SPINE_X, SPINE_Y, SPINE_Z,
} from './hollow';
import { createCommonStates } from './states';
import type { AiStateId, FsmState } from './types';

type S = FsmState<EnemyCtx, AiStateId>;

export const BLACK_KNIGHT_NAME = 'Black Knight';
/** Progress flag set on kill (WorldProgress.setFlag); a flagged knight never spawns again. */
export const BLACK_KNIGHT_FLAG = 'boss:black_knight';

export const BK = {
  /** Reload within this range (m) with LOS triggers the punish lunge. */
  punishRange: 10,
  /** The trigger stays armed this long (s) if the knight is busy when the reload starts. */
  punishWindow: 1.2,
  /** Opportunistic gap-closer thrust band (m) and cooldown (s). */
  thrustMin: 4.5,
  thrustCooldown: 4,
  /** Thrust hit reach (m) (the data `range` is only the trigger distance). */
  thrustReach: 2.6,
  /** Minimum telegraph (s): the player's dodge window. */
  dodgeWindow: 0.5,
} as const;

export const BLACK_KNIGHT_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 1.2,
  chaseSpeedMul: 0.7, // 3.5 * 0.7 ~ 2.5 m/s: a deliberate march
  accel: 12,
  turnRate: 3.2,
  windupTurnRate: 2,
  proximity: 6,
  alertTime: 0.8,
  staggerTime: 1.3,
  staggerImmunity: 1.5,
  staggerKnockback: 1.2,
  poiseRegenDelay: 4,
  leashRadius: 40,
  memory: 8,
  stopDist: 2.4,
  attackCooldown: [0.6, 1.4],
  attackFacing: 0.5,
  lungeSpeed: 2.2,
  reachBonus: 0.4,
  wanderRadius: 0,
  deathFall: 1.1,
  corpseTime: 6,
  sinkTime: 1.5,
  capsuleRadius: 0.45,
  capsuleHeight: 2.2,
  eyeHeight: 2,
  chestHeight: 1.6,
};

export const BLACK_KNIGHT_HIT: HitShape = { bodyRadius: 0.45, bodyHeight: 1.95, headRadius: 0.26, headY: 2.0 };

// ------------------------------------------------------------------ persistence deps

export interface BlackKnightDeps {
  isKilled(): boolean;
  markKilled(): void;
}
let deps: BlackKnightDeps = { isKilled: () => false, markKilled: () => {} };

/**
 * Wire persistence (main.ts): `configureBlackKnight({ isKilled: () => progress.hasFlag(BLACK_KNIGHT_FLAG),
 * markKilled: () => progress.setFlag(BLACK_KNIGHT_FLAG) })`. Pass `null` to reset (tests).
 */
export function configureBlackKnight(d: Partial<BlackKnightDeps> | null): void {
  deps = { isKilled: () => false, markKilled: () => {}, ...(d ?? {}) };
}

// ------------------------------------------------------------------ states

interface Bk {
  punishT: number;
  thrustCd: number;
  silent: boolean;
  off: (() => void)[];
  barShown: boolean;
  barHp: number;
  hitDefs: Map<string, EnemyAttackDef>;
  lungeV: number;
}

const THRUST = 'thrust';

function findAttack(e: Enemy, id: string): EnemyAttackDef | null {
  const list = e.def.attacks;
  for (let i = 0; i < list.length; i++) if (list[i]!.id === id) return list[i]!;
  return null;
}

function facingErr(e: Enemy): number {
  return Math.abs(Math.atan2(e.toPlayer.x * e.fwdZ - e.toPlayer.z * e.fwdX, e.toPlayer.x * e.fwdX + e.toPlayer.z * e.fwdZ));
}

function createStates(): S[] {
  const st: Bk = { punishT: 0, thrustCd: 0, silent: false, off: [], barShown: false, barHp: -1, hitDefs: new Map(), lungeV: 0 };
  const base = createCommonStates();
  const common = (id: AiStateId) => base.find((s) => s.id === id)!;

  const bar = (e: Enemy, show: boolean): void => {
    if (!show) {
      if (st.barShown) e.shared.bus.emit('bossBar', { show: false });
      st.barShown = false;
      st.barHp = -1;
      return;
    }
    const hp = Math.ceil(e.health.hp);
    if (st.barShown && hp === st.barHp) return;
    st.barShown = true;
    st.barHp = hp;
    e.shared.bus.emit('bossBar', { show: true, name: BLACK_KNIGHT_NAME, hp, max: e.health.maxHp });
  };

  const unsub = () => {
    for (const f of st.off) f();
    st.off.length = 0;
  };

  const idle: S = {
    ...common('idle'),
    enter(ctx, from) {
      const e = ctx.self;
      if (from === null) {
        // killed in an earlier session / run: vanish without drops, souls or a death event
        if (deps.isKilled()) {
          st.silent = true;
          e.health.hp = 0;
          e.fsm.go(ctx, 'dead');
          return;
        }
        const bus = e.shared.bus;
        st.off.push(
          bus.on('gunReload', (ev) => {
            if (e.removed) return unsub();
            if (ev.phase !== 'start' || !e.alive || !e.aware) return;
            if (e.distToPlayer <= BK.punishRange && e.losClear && e.ctx.canSeeTarget) st.punishT = BK.punishWindow;
          }),
          bus.on('bonfireRest', () => bar(e, false)),
        );
      }
      common('idle').enter!(ctx, from);
    },
  };

  const chase: S = {
    ...common('chase'),
    update(ctx, dt) {
      const e = ctx.self;
      const thrust = findAttack(e, THRUST);
      if (thrust && e.playerAlive && ctx.canSeeTarget && e.lostTime <= e.tuning.memory) {
        const punish = st.punishT > 0;
        const opportunist = e.attackCooldown <= 0 && st.thrustCd <= 0 && e.distToPlayer >= BK.thrustMin && e.distToPlayer <= thrust.range;
        if ((punish || opportunist) && (punish || facingErr(e) <= e.tuning.attackFacing) && e.takeToken()) {
          st.punishT = 0;
          st.thrustCd = BK.thrustCooldown;
          ctx.currentAttack = thrust;
          return 'windup';
        }
      }
      return common('chase').update(ctx, dt);
    },
  };

  const attack: S = {
    ...common('attack'),
    enter(ctx, from) {
      const a = ctx.currentAttack;
      if (a?.id !== THRUST) return common('attack').enter!(ctx, from);
      const e = ctx.self;
      st.lungeV = Math.max(4, Math.min(22, (e.distToPlayer - 1.8) / (a.active * 0.8)));
    },
    update(ctx, dt) {
      const a = ctx.currentAttack;
      if (a?.id !== THRUST) return common('attack').update(ctx, dt);
      const e = ctx.self;
      // charge along the committed facing; the (short-reach) hit check runs while closing
      const v = e.distToPlayer < 1.6 ? 0 : st.lungeV;
      e.steer(e.fwdX * v, e.fwdZ * v);
      let h = st.hitDefs.get(a.id);
      if (!h) st.hitDefs.set(a.id, (h = { ...a, range: BK.thrustReach }));
      e.meleeHit(h);
      if (ctx.stateTime >= a.active) return 'recover';
    },
  };

  const dead: S = {
    ...common('dead'),
    enter(ctx, from) {
      const e = ctx.self;
      unsub();
      bar(e, false);
      if (st.silent) {
        e.releaseToken();
        e.aware = false;
        ctx.currentAttack = null;
        ctx.canSeeTarget = false;
        ctx.stateTime = 1e3; // corpse already gone
        return;
      }
      // Only a real kill (player / player-owned projectile) persists; dev kills (killAll, kill()) must not corrupt the save.
      if (e.killerId !== null && e.killerId === e.shared.player.id) deps.markKilled();
      common('dead').enter!(ctx, from);
    },
  };

  const own: Partial<Record<AiStateId, S>> = { idle, chase, attack, dead };
  return base.map((s) => {
    const o = own[s.id] ?? s;
    return {
      ...o,
      update(ctx, dt) {
        const e = ctx.self;
        if (st.punishT > 0) st.punishT -= dt;
        if (st.thrustCd > 0) st.thrustCd -= dt;
        const r = o.update(ctx, dt);
        bar(e, e.alive && e.aware);
        return r;
      },
    };
  });
}

// ------------------------------------------------------------------ view

/** Pose: upright armored guard, heavy deliberate swings. Reuses the HollowView channel rig. */
export class BlackKnightView extends HollowView {
  constructor() {
    super(createBlackKnightRig());
  }

  override render(e: Enemy, alpha: number): void {
    super.render(e, alpha);
    this.rig.hips.position.y = BK_HIPS_Y + lerp(this.prev[HIPS_Y]!, this.cur[HIPS_Y]!, alpha);
  }

  protected override idlePose(): void {
    super.idlePose();
    const T = this.tgt;
    T[SPINE_X] = -0.04 + Math.sin(this.time * 1.2) * 0.02;
    T[SHR_X] = 0.75;
    T[SHR_Z] = 0.1;
    T[ELR_X] = 0.9;
    T[SHL_X] = 0.8;
    T[SHL_Z] = -0.3;
    T[ELL_X] = 1.0;
  }

  protected override pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const t = e.ctx.stateTime;
    switch (e.state) {
      case 'patrol':
      case 'return':
      case 'chase': {
        this.idlePose();
        this.phase += dt * (1.2 + e.speed * 1.5);
        this.walk(clamp01(e.speed / 2.6), 0.4);
        T[SHL_X]! += 0.2; // keep the polearm up while marching
        return 8;
      }
      case 'windup': {
        const a = e.ctx.currentAttack;
        if (!a) return 8;
        const u = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.8)));
        this.anim(e.extra(a)?.anim, u, 0);
        if (u >= 1) T[SHR_X]! += Math.sin(this.time * 34) * 0.02; // tremble at full draw
        return 9;
      }
      case 'attack': {
        const a = e.ctx.currentAttack;
        if (!a) return 30;
        this.anim(e.extra(a)?.anim, 1, easeOut(clamp01(t / Math.max(0.05, a.active))));
        return 34;
      }
      case 'recover': {
        const a = e.ctx.currentAttack;
        if (!a) return 5;
        if (t < a.recover * 0.5) {
          this.anim(e.extra(a)?.anim, 1, 1);
          return 10;
        }
        return 3.5;
      }
      default:
        return super.pose(e, dt);
    }
  }

  private anim(kind: string | undefined, w: number, s: number): void {
    const T = this.tgt;
    this.idlePose();
    switch (kind) {
      case 'sweep':
      case 'sweepBack': {
        const d = kind === 'sweep' ? 1 : -1;
        T[SPINE_Y] = lerp(lerp(0, -0.85 * d, w), 0.85 * d, s);
        T[SPINE_X] = lerp(-0.1, -0.35, s);
        T[SHR_Z] = lerp(0.15, 1.35, w);
        T[SHR_Y] = lerp(lerp(0, -0.55 * d, w), 2.1 * d, s);
        T[SHR_X] = lerp(0.6, 0.1, w);
        T[ELR_X] = lerp(lerp(0.7, 0.35, w), 0.1, s);
        T[SHL_X] = 0.6 * w;
        T[SHL_Z] = -0.5 * w;
        T[HIPL_X] = 0.3 * w;
        T[KNEEL_X] = -0.25 * w - 0.2 * s;
        T[HIPR_X] = -0.2 * w;
        T[KNEER_X] = -0.3 * w;
        T[HIPS_Y] = -0.07 * w - 0.05 * s;
        break;
      }
      case THRUST: {
        T[SPINE_Y] = lerp(lerp(0, -0.55, w), 0.15, s);
        T[SPINE_X] = lerp(lerp(-0.04, 0.12, w), -0.5, s);
        T[SHR_X] = lerp(lerp(0.75, 0.95, w), 1.55, s);
        T[SHR_Z] = lerp(0.1, 0.2, w);
        T[ELR_X] = lerp(lerp(0.9, 1.6, w), 0.1, s);
        T[SHL_X] = lerp(0.8, 1.45, w);
        T[SHL_Z] = -0.3;
        T[ELL_X] = lerp(1.0, 0.5, s);
        T[HIPL_X] = lerp(lerp(0, -0.25, w), 0.7, s);
        T[KNEEL_X] = lerp(-0.1, -0.5, s);
        T[HIPR_X] = lerp(lerp(0, 0.3, w), -0.4, s);
        T[KNEER_X] = -0.25 * w;
        T[HIPS_Y] = lerp(-0.08 * w, -0.16, s);
        T[BODY_X] = -0.1 * s;
        T[BODY_Z] = 0;
        break;
      }
      default: {
        // overhead: halberd raised high behind the head, then chopped down
        T[SHR_X] = lerp(lerp(0.75, 2.5, w), 0.85, s);
        T[SHR_Z] = lerp(0.1, 0.2, w);
        T[ELR_X] = lerp(lerp(0.9, 0.25, w), 0.05, s);
        T[SHL_X] = lerp(lerp(0.8, 2.3, w), 0.9, s);
        T[SHL_Z] = lerp(-0.3, -0.12, w);
        T[ELL_X] = lerp(1.0, 0.4, w);
        T[SPINE_X] = lerp(lerp(-0.04, 0.25, w), -0.7, s);
        T[SPINE_Y] = lerp(0, -0.12, w);
        T[SPINE_Z] = 0;
        T[HIPL_X] = 0.3 * w;
        T[KNEEL_X] = lerp(-0.2 * w, -0.55, s);
        T[HIPR_X] = -0.2 * w;
        T[KNEER_X] = -0.3 * w;
        T[HIPS_Y] = lerp(-0.06 * w, -0.14, s);
      }
    }
  }
}

// ------------------------------------------------------------------ archetype

export const BLACK_KNIGHT: ArchetypeDef = {
  archetype: 'blackKnight',
  tuning: BLACK_KNIGHT_TUNING,
  hit: BLACK_KNIGHT_HIT,
  attackExtras: {
    overhead: { anim: 'overhead' },
    sweep_1: { anim: 'sweep', followUp: 'sweep_2', followUpChance: 0.8, followUpDelay: 0.5 },
    sweep_2: { anim: 'sweepBack', followUpOnly: true },
    thrust: { anim: 'thrust', followUpOnly: true }, // never a common opener: chase() picks it (gap closer / reload punish)
  },
  states: createStates,
  createView: () => new BlackKnightView(),
};
