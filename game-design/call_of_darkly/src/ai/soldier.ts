// §10 Hollow Soldier (shield): 140 hp, frontal block (data `frontalBlock`, enforced by Enemy.guards →
// combat), shield bash (heavy poise) → thrust. Slower than the sword hollow. The guard DROPS while it
// recovers from an attack: flank it, shoot head/legs, or punish the recover.
import type { HitShape } from '../combat/targets';
import { DEFAULT_AI_TUNING, type ArchetypeDef, type AiTuning, type Enemy } from './enemy';
import {
  clamp01,
  easeOut,
  ELL_X,
  ELR_X,
  HIPL_X,
  HIPR_X,
  HIPS_Y,
  HollowView,
  KNEEL_X,
  KNEER_X,
  lerp,
  SHD_X,
  SHD_Z,
  SHL_X,
  SHL_Z,
  SHR_X,
  SHR_Z,
  SPINE_X,
  SPINE_Y,
} from './hollow';
import { createSoldierRig } from './models';
import { createCommonStates } from './states';

export const SOLDIER_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 0.85,
  chaseSpeedMul: 0.85, // on top of the data moveSpeed (2.5): a deliberate advance
  turnRate: 3.4,
  windupTurnRate: 2,
  alertTime: 0.6,
  staggerTime: 1.1,
  staggerKnockback: 1.4,
  stopDist: 1.8,
  attackFacing: 0.45,
  lungeSpeed: 1.8,
  attackCooldown: [0.6, 1.4],
  capsuleRadius: 0.34,
};

export const SOLDIER_HIT: HitShape = { bodyRadius: 0.34, bodyHeight: 1.45, headRadius: 0.18, headY: 1.64 };

class SoldierView extends HollowView {
  constructor() {
    super(createSoldierRig());
  }

  protected override pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const state = e.state;
    if (state === 'windup' || state === 'attack' || state === 'recover') {
      const a = e.ctx.currentAttack;
      const t = e.ctx.stateTime;
      if (!a) return 8;
      this.idlePose();
      this.guardStance();
      const bash = e.extra(a)?.anim === 'bash';
      let w = 0; // windup progress 0..1
      let s = 0; // strike progress 0..1
      let hold = 0; // follow-through hold (recover) 0..1
      let rate = 10;
      if (state === 'windup') {
        w = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.75)));
      } else if (state === 'attack') {
        w = 1;
        s = easeOut(clamp01(t / Math.max(0.05, a.active)));
        rate = 38;
      } else {
        w = 1;
        s = 1;
        hold = t < a.recover * 0.45 ? 1 : 0;
        rate = hold ? 12 : 4;
      }
      if (bash) this.bash(w, s, hold);
      else this.thrust(w, s, hold);
      if (state === 'windup' && w >= 1) T[SHD_Z]! += Math.sin(this.time * 38) * 0.008;
      return rate;
    }
    const rate = super.pose(e, dt);
    if (state === 'chase' || state === 'alert' || state === 'hitReact' || state === 'idle' || state === 'patrol' || state === 'return') {
      this.guardStance();
      // heavier, upright gait than the hollow shamble
      T[SPINE_X] = state === 'chase' ? -0.12 : -0.05;
    }
    return rate;
  }

  /** Shield braced in front of the chest, sword arm low and ready. */
  private guardStance(): void {
    const T = this.tgt;
    T[SHL_X] = 0.9;
    T[SHL_Z] = 0.1;
    T[ELL_X] = 1.15;
    T[SHR_X] = 0.35;
    T[SHR_Z] = 0.18;
    T[ELR_X] = 0.8;
    T[SHD_Z] = 0;
    T[SHD_X] = -0.05;
  }

  /** Shield bash: pull the shield back and rock away (windup), then slam it forward (strike). */
  private bash(w: number, s: number, hold: number): void {
    const T = this.tgt;
    T[SHD_Z] = lerp(lerp(0, 0.2, w), -0.34, s);
    T[SHD_X] = lerp(lerp(-0.05, 0.25, w), -0.15, s);
    T[SPINE_X] = lerp(lerp(-0.05, 0.28, w), -0.55, s);
    T[SPINE_Y] = lerp(lerp(0, -0.2, w), 0.18, s);
    T[SHL_X] = lerp(lerp(0.9, 0.5, w), 1.35, s);
    T[ELL_X] = lerp(lerp(1.15, 1.5, w), 0.9, s);
    T[SHR_X] = lerp(0.35, 0.1, w);
    T[HIPL_X] = lerp(0.3 * w, 0.45, s);
    T[KNEEL_X] = lerp(-0.2 * w, -0.45, s);
    T[HIPR_X] = -0.25 * w;
    T[KNEER_X] = -0.25 * w;
    T[HIPS_Y] = lerp(-0.04 * w, -0.12, s);
    if (hold) T[SHD_Z] = -0.3;
  }

  /** Thrust: sword hand drawn back to the hip, shield tucked, then a straight lunge. */
  private thrust(w: number, s: number, hold: number): void {
    const T = this.tgt;
    // blade direction ≈ SHR_X + ELR_X + 0.52 (rad from straight down): 1.57 = level, point-forward
    T[SHR_X] = lerp(lerp(0.35, -0.3, w), 1.05, s);
    T[ELR_X] = lerp(lerp(0.8, 1.4, w), 0.05, s);
    T[SHR_Z] = lerp(0.18, 0.3, w);
    T[SPINE_X] = lerp(lerp(-0.05, 0.12, w), -0.32, s);
    T[SPINE_Y] = lerp(lerp(0, 0.3, w), -0.25, s);
    T[SHL_X] = 0.9;
    T[ELL_X] = 1.15;
    T[SHD_Z] = lerp(0, 0.06, w);
    T[HIPL_X] = lerp(0.35 * w, 0.5, s);
    T[KNEEL_X] = lerp(-0.25 * w, -0.2, s);
    T[HIPR_X] = lerp(-0.3 * w, -0.45, s);
    T[KNEER_X] = lerp(-0.2 * w, -0.1, s);
    T[HIPS_Y] = lerp(-0.05 * w, -0.1, s);
    if (hold) T[SHR_X] = 1.05;
  }
}

export const HOLLOW_SOLDIER: ArchetypeDef = {
  archetype: 'hollowSoldier',
  tuning: SOLDIER_TUNING,
  hit: SOLDIER_HIT,
  attackExtras: {
    // data: shield_bash (15 dmg, 30 poise) opens, 50% chain into thrust (30 dmg, arc 30, range 2.5)
    shield_bash: { anim: 'bash', followUp: 'thrust', followUpChance: 0.5, followUpDelay: 0.35 },
    thrust: { anim: 'thrust' },
  },
  /** Guard drops in the recover of any attack (and while staggered/dead via Enemy.guards). */
  guardOpen: (e) => e.state === 'recover' || e.state === 'attack',
  states: () => createCommonStates(),
  createView: () => new SoldierView(),
};

