// §10 Hollow (sword): shamble/chase, 2-hit combo (overhead slash → horizontal sweep), easy stagger.
// Archetype definition + procedural box-rig animator.
import type { Material } from 'three';
import type { HitShape } from '../combat/targets';
import { DEFAULT_AI_TUNING, type ArchetypeDef, type AiTuning, type Enemy, type EnemyView } from './enemy';
import { createHollowRig, enemyMaterials, SHIELD_BASE, type HumanoidRig } from './models';
import { disposeSkeletons } from '../render';
import { createCommonStates } from './states';

/** AI tuning overrides for sword hollows (not in data/enemies; PLAN gives behaviour only). */
export const HOLLOW_TUNING: AiTuning = {
  ...DEFAULT_AI_TUNING,
  walkSpeed: 1.0,
  staggerTime: 0.9,
  alertTime: 0.55,
};

export const HOLLOW_HIT: HitShape = { bodyRadius: 0.3, bodyHeight: 1.42, headRadius: 0.17, headY: 1.63 };

// ------------------------------------------------------------------ animator

// pose channels
export const BODY_X = 0;
export const BODY_Z = 1;
export const HIPS_Y = 2;
export const SPINE_X = 3;
export const SPINE_Y = 4;
export const SPINE_Z = 5;
export const SHL_X = 6;
export const SHL_Z = 7;
export const ELL_X = 8;
export const SHR_X = 9;
export const SHR_Y = 10;
export const SHR_Z = 11;
export const ELR_X = 12;
export const HIPL_X = 13;
export const KNEEL_X = 14;
export const HIPR_X = 15;
export const KNEER_X = 16;
export const SHD_Z = 17; // shield push (m, forward is -z)
export const SHD_X = 18; // shield tilt (rad)
export const N = 19;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/**
 * Procedural animation for the box rig. Sim ticks write a damped pose (`cur`, with `prev` kept for
 * render interpolation); the flinch is additive at render so hits pop instantly without
 * interrupting the FSM pose. Sign conventions: spine/body +X leans back, arm +X raises forward,
 * hip +X swings the leg forward, knee −X bends, spine +Y twists left, shR +Z abducts outward.
 */
export class HollowView implements EnemyView {
  readonly rig: HumanoidRig;
  protected readonly tgt = new Float32Array(N);
  protected readonly cur = new Float32Array(N);
  protected readonly prev = new Float32Array(N);
  protected readonly out = new Float32Array(N);
  protected phase = 0;
  protected time = 0;
  private flashT = 0;
  private flashMat: Material;
  private shownMat: Material;
  private sink = 0;
  private prevSink = 0;

  constructor(rig: HumanoidRig = createHollowRig()) {
    this.rig = rig;
    const m = enemyMaterials();
    this.flashMat = m.flashHit;
    this.shownMat = m.body;
  }

  get root() {
    return this.rig.root;
  }

  flash(kind: 'hit' | 'block' | 'stagger'): void {
    const m = enemyMaterials();
    this.flashMat = kind === 'block' ? m.flashBlock : kind === 'stagger' ? m.flashStagger : m.flashHit;
    this.flashT = kind === 'stagger' ? 0.14 : 0.08;
  }

  sync(e: Enemy, dt: number): void {
    this.time += dt;
    this.prev.set(this.cur);
    this.prevSink = this.sink;
    const rate = this.pose(e, dt);
    const k = 1 - Math.exp(-rate * dt);
    for (let i = 0; i < N; i++) this.cur[i]! += (this.tgt[i]! - this.cur[i]!) * k;

    // hit flash (swap to the shared flash material; no per-enemy material clones)
    if (this.flashT > 0) this.flashT -= dt;
    const want = this.flashT > 0 ? this.flashMat : enemyMaterials().body;
    if (want !== this.shownMat) {
      this.shownMat = want;
      const ms = this.rig.meshes;
      for (let i = 0; i < ms.length; i++) ms[i]!.material = want;
    }
    this.rig.shadow.visible = e.alive;
  }

  render(e: Enemy, alpha: number): void {
    const r = this.rig;
    const p = e.capsule.position;
    const q = e.prevPos;
    const sink = lerp(this.prevSink, this.sink, alpha);
    r.root.position.set(lerp(q.x, p.x, alpha), lerp(q.y, p.y, alpha) - sink, lerp(q.z, p.z, alpha));
    let dy = e.transform.yaw - e.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    r.root.rotation.y = e.prevYaw + dy * alpha;

    const c = this.cur;
    const pv = this.prev;
    const o = this.out;
    for (let i = 0; i < N; i++) o[i] = pv[i]! + (c[i]! - pv[i]!) * alpha;
    const f = e.flinch * e.flinch;
    const side = e.flinchSide;
    r.body.rotation.set(o[BODY_X]!, 0, o[BODY_Z]!);
    r.hips.position.y = 0.92 + o[HIPS_Y]!;
    r.spine.rotation.set(o[SPINE_X]! + 0.32 * f, o[SPINE_Y]! + 0.15 * f * side, o[SPINE_Z]! + 0.14 * f * side);
    r.shL.rotation.set(o[SHL_X]!, 0, o[SHL_Z]! - 0.25 * f);
    r.elL.rotation.x = o[ELL_X]!;
    r.shR.rotation.set(o[SHR_X]!, o[SHR_Y]!, o[SHR_Z]! + 0.25 * f);
    r.elR.rotation.x = o[ELR_X]!;
    r.hipL.rotation.x = o[HIPL_X]!;
    r.kneeL.rotation.x = o[KNEEL_X]! - 0.2 * f;
    r.hipR.rotation.x = o[HIPR_X]!;
    r.kneeR.rotation.x = o[KNEER_X]! - 0.2 * f;
    if (r.shield) {
      const b = SHIELD_BASE;
      r.shield.position.set(b.x, b.y, b.z + o[SHD_Z]! + 0.04 * f);
      r.shield.rotation.set(o[SHD_X]!, 0.18, 0);
    }
  }

  dispose(): void {
    disposeSkeletons(this.rig.root);
    this.rig.root.removeFromParent();
  }

  /** Write the target pose for the current state; returns the damping rate (1/s). */
  protected pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const t = e.ctx.stateTime;
    const tu = e.tuning;
    this.idlePose();
    switch (e.state) {
      case 'idle':
        return 6;
      case 'patrol':
      case 'return':
      case 'chase': {
        const run = e.state === 'chase';
        const a = clamp01(e.speed / (run ? 3 : 1.6));
        this.phase += dt * (1.6 + e.speed * 2.6);
        if (run) {
          // lunging shamble: hunched, left hand reaching, sword raised to strike
          T[SPINE_X] = -0.34;
          T[SHL_X] = 0.85;
          T[SHL_Z] = -0.15;
          T[ELL_X] = 0.3;
          T[SHR_X] = 0.45;
          T[ELR_X] = 0.75;
        }
        this.walk(a, run ? 0.6 : 0.42);
        return 10;
      }
      case 'alert':
      case 'hitReact': {
        // straighten up, ready the sword: the "noticed you" beat
        T[SPINE_X] = 0.06;
        T[SHR_X] = 0.55;
        T[SHR_Z] = 0.2;
        T[ELR_X] = 1.15;
        T[SHL_X] = 0.3;
        T[SHL_Z] = -0.35;
        T[HIPL_X] = T[HIPR_X] = 0.15;
        T[KNEEL_X] = T[KNEER_X] = -0.32;
        T[HIPS_Y] = -0.04;
        return 12;
      }
      case 'windup': {
        const a = e.ctx.currentAttack;
        if (!a) return 10;
        // reach the full telegraph by 75% of the windup, then hold with a tremble
        const u = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.75)));
        const tremble = u >= 1 ? Math.sin(this.time * 38) * 0.025 : 0;
        if (e.extra(a)?.anim === 'horizontal') this.horizontal(u, 0);
        else this.overhead(u, 0);
        T[SHR_X]! += tremble;
        T[SPINE_Y]! += tremble * 0.5;
        return 10;
      }
      case 'attack': {
        const a = e.ctx.currentAttack;
        if (!a) return 30;
        const u = easeOut(clamp01(t / Math.max(0.05, a.active)));
        if (e.extra(a)?.anim === 'horizontal') this.horizontal(1, u);
        else this.overhead(1, u);
        return 38;
      }
      case 'recover': {
        const a = e.ctx.currentAttack;
        if (!a) return 5;
        // hold the follow-through briefly (punish window), then sag back to idle
        if (t < a.recover * 0.45) {
          if (e.extra(a)?.anim === 'horizontal') this.horizontal(1, 1);
          else this.overhead(1, 1);
          return 12;
        }
        return 4;
      }
      case 'stagger': {
        const u = clamp01(t / tu.staggerTime);
        const wob = Math.sin(t * 18) * 0.08 * (1 - u);
        T[BODY_X] = 0.2 * (1 - u) + wob;
        T[SPINE_X] = 0.4 * (1 - u * 0.6);
        T[SPINE_Z] = 0.16 * e.flinchSide * (1 - u);
        T[SHL_X] = 0.45;
        T[SHL_Z] = -1.05;
        T[ELL_X] = 0.9;
        T[SHR_X] = 0.65;
        T[SHR_Z] = 1.0;
        T[ELR_X] = 0.9;
        T[HIPL_X] = 0.35;
        T[KNEEL_X] = -0.55;
        T[HIPR_X] = -0.3;
        T[KNEER_X] = -0.35;
        T[HIPS_Y] = -0.1;
        return 18;
      }
      case 'dead': {
        const fall = tu.deathFall;
        const u = clamp01(t / fall);
        const g = u * u; // gravity ease-in
        let bodyX = 1.48 * g;
        if (t > fall) bodyX -= 0.07 * Math.sin(clamp01((t - fall) / 0.22) * Math.PI); // small bounce
        T[BODY_X] = bodyX;
        T[BODY_Z] = 0.12 * e.flinchSide * g;
        T[SPINE_X] = 0.3 * g;
        T[SPINE_Y] = 0;
        T[SHL_X] = 1.3 * g;
        T[SHL_Z] = -0.7 * g;
        T[ELL_X] = 0.25;
        T[SHR_X] = 1.1 * g;
        T[SHR_Y] = 0;
        T[SHR_Z] = 0.6 * g;
        T[ELR_X] = 0.3;
        T[HIPL_X] = 0.45 * g;
        T[KNEEL_X] = -0.9 * Math.sin(u * Math.PI) - 0.1;
        T[HIPR_X] = 0.25 * g;
        T[KNEER_X] = -0.7 * Math.sin(u * Math.PI) - 0.1;
        T[HIPS_Y] = -0.05 * g;
        const sinkStart = fall + tu.corpseTime;
        this.sink = t > sinkStart ? (clamp01((t - sinkStart) / tu.sinkTime) * 0.6) : 0;
        return 22;
      }
    }
    return 8;
  }

  protected idlePose(): void {
    const T = this.tgt;
    const tm = this.time;
    T[BODY_X] = 0;
    T[BODY_Z] = 0;
    T[HIPS_Y] = -0.015;
    T[SPINE_X] = -0.22 + Math.sin(tm * 1.6) * 0.03;
    T[SPINE_Y] = 0;
    T[SPINE_Z] = Math.sin(tm * 0.7) * 0.03;
    T[SHL_X] = 0.12;
    T[SHL_Z] = -0.12;
    T[ELL_X] = 0.35;
    T[SHR_X] = 0.25;
    T[SHR_Y] = 0;
    T[SHR_Z] = 0.12;
    T[ELR_X] = 0.55;
    T[HIPL_X] = 0.06;
    T[KNEEL_X] = -0.12;
    T[HIPR_X] = 0.06;
    T[KNEER_X] = -0.12;
    T[SHD_Z] = 0;
    T[SHD_X] = 0;
    this.sink = 0;
  }

  /** Additive walk/shamble cycle, amplitude a (0..1), leg swing `legAmp` rad. */
  protected walk(a: number, legAmp: number): void {
    const T = this.tgt;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    T[HIPL_X] = legAmp * a * s;
    T[KNEEL_X] = -0.15 - 0.8 * a * Math.max(0, c);
    T[HIPR_X] = -legAmp * a * s;
    T[KNEER_X] = -0.15 - 0.8 * a * Math.max(0, -c);
    T[HIPS_Y]! += -0.04 * a * Math.abs(s);
    T[SPINE_Z]! += 0.09 * a * s; // lurch side to side
    T[BODY_Z] = 0.03 * a * s;
    T[SHL_X]! -= 0.35 * a * s;
    T[SHR_X]! += 0.18 * a * s;
  }

  /** Overhead slash: windup progress w (0..1) raises the sword behind the head; strike s (0..1) chops down. */
  private overhead(w: number, s: number): void {
    const T = this.tgt;
    // windup end: upper arm up-back, forearm nearly straight → blade vertical over the head (tall silhouette)
    T[SHR_X] = lerp(lerp(0.3, 2.55, w), 0.85, s);
    T[SHR_Z] = lerp(0.15, 0.22, w);
    T[ELR_X] = lerp(lerp(0.5, 0.2, w), 0.05, s);
    T[SPINE_X] = lerp(lerp(-0.2, 0.2, w), -0.68, s);
    T[SPINE_Y] = lerp(lerp(0, -0.25, w), 0.1, s);
    T[SHL_X] = lerp(0.6 * w, 0.2, s);
    T[SHL_Z] = -0.35 * w;
    T[ELL_X] = 0.4;
    T[HIPL_X] = 0.35 * w;
    T[KNEEL_X] = lerp(-0.25 * w, -0.5, s);
    T[HIPR_X] = -0.22 * w;
    T[KNEER_X] = -0.3 * w;
    T[HIPS_Y] = lerp(-0.05 * w, -0.13, s);
  }

  /** Horizontal sweep: windup twists right with the sword drawn back; strike sweeps across to the left. */
  private horizontal(w: number, s: number): void {
    const T = this.tgt;
    T[SPINE_Y] = lerp(lerp(0, -0.85, w), 0.85, s);
    T[SPINE_X] = lerp(-0.25, -0.45, s);
    T[SHR_Z] = lerp(0.15, 1.35, w);
    T[SHR_Y] = lerp(lerp(0, -0.55, w), 2.1, s);
    T[SHR_X] = lerp(0.25, 0.1, w);
    T[ELR_X] = lerp(lerp(0.55, 0.35, w), 0.1, s);
    T[SHL_X] = 0.5 * w;
    T[SHL_Z] = -0.5 * w;
    T[HIPL_X] = 0.25 * w;
    T[KNEEL_X] = -0.2 * w - 0.2 * s;
    T[HIPR_X] = -0.15 * w;
    T[KNEER_X] = -0.3 * w;
    T[HIPS_Y] = -0.05 * w - 0.05 * s;
  }
}

// ------------------------------------------------------------------ archetype

export const HOLLOW_SWORD: ArchetypeDef = {
  archetype: 'hollowSword',
  tuning: HOLLOW_TUNING,
  hit: HOLLOW_HIT,
  attackExtras: {
    // data: combo_1 (windup 0.6) → combo_2 (windup 0.4). Both ≥ 0.4 s telegraphs.
    combo_1: { anim: 'overhead', followUp: 'combo_2', followUpChance: 0.65, followUpDelay: 0.3 },
    combo_2: { anim: 'horizontal' },
  },
  states: () => createCommonStates(),
  createView: () => new HollowView(),
};
