// §7 Mimic model: the SAME box chest the Burg uses (wood + steel bands, same textures/dims) with the tells
// (a gold chain draped OFF-AXIS across the front, and a slow breath: the lid cracks and the box swells), that
// stands up on stubby legs with long dragging arms and a lid-for-a-jaw (teeth hidden inside the closed chest).
// Conventions: root = feet + yaw (enemy forward = -z), so the mouth faces -z; the lid hinges at the back (+z).
// Procedural pose channels (damped on the sim tick, interpolated at render) drive every bone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeSkeletons, createBlobShadow, BLOB_LIFT, getTexture, makePs1Material, skinMeshes } from '../render';
import type { Enemy, EnemyView } from './enemy';

// ------------------------------------------------------------------ shared constants

export const MIMIC_TIMING = {
  /** Chomp: seconds after the E press the bite lands (lid slams shut). */
  biteAt: 0.3,
  /** Control lock for the grab (s, from the E press). */
  grabLock: 1.2,
  /** Total "rise" state length (s): chomp then stands up / shot-woken stands up. */
  chompRise: 1.7,
  shotRise: 1.2,
} as const;

/** Per-enemy runtime the view (and states) read. Owned by mimic.ts. */
export interface MimicRuntime {
  mode: 'chomp' | 'shot';
  /** The rise sequence finished (later alert beats use the plain pose). */
  risen: boolean;
}

// chest dims == world/chests.ts
const W = 0.9;
const BASE_H = 0.3;
const LID_H = 0.2;
const D = 0.55;
/** Open lid angle of a plain (dead) chest, rad. */
export const MIMIC_LID_OPEN = 1.9;
const LEG_LEN = 0.7;
const SCALE_UP = 0.35; // chest swells while standing

// ------------------------------------------------------------------ pose channels

export const LID = 0; // jaw angle (rad, + opens)
export const RISE = 1; // 0 = a plain chest on the floor, 1 = standing
export const LEAN_X = 2; // body pitch about the feet (+ back)
export const TWIST_Y = 3; // chest yaw twist (+ toward -x)
export const HOP_Y = 4; // body lift (m)
export const LUNGE_Z = 5; // body offset along forward (m, - forward)
export const SHL_X = 6;
export const SHL_Z = 7;
export const ELL_X = 8;
export const SHR_X = 9;
export const SHR_Z = 10;
export const ELR_X = 11;
export const HIPL_X = 12;
export const KNEEL_X = 13;
export const HIPR_X = 14;
export const KNEER_X = 15;
export const BREATH = 16; // chest scale bob (fraction)
export const SHAKE = 17; // lateral tremble (m)
export const CROUCH = 18; // chest lowered on its legs (m)
export const N = 19;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

// ------------------------------------------------------------------ rig

type Part = readonly [w: number, h: number, d: number, x: number, y: number, z: number, color?: number, rotZ?: number];

function merge(parts: readonly Part[], tinted: boolean): THREE.BufferGeometry {
  const geos = parts.map(([w, h, d, x, y, z, color, rotZ]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.clearGroups();
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    if (tinted) {
      const c = new THREE.Color(color ?? 0xffffff);
      const nrm = g.getAttribute('normal');
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const shade = nrm.getY(i) < -0.5 ? 0.7 : nrm.getY(i) > 0.5 ? 1.08 : 1;
        col[i * 3] = Math.min(1, c.r * shade);
        col[i * 3 + 1] = Math.min(1, c.g * shade);
        col[i * 3 + 2] = Math.min(1, c.b * shade);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

const SKIN = 0x4a3426;
const SKIN_D = 0x3a281e;
const TOOTH = 0xe8e0c8;
const GOLD = 0xc8a030; // the wrong-colored chain (a normal chest has none, only grey steel bands)

/** Scale that collapses a skinned limb group to a point (Object3D.visible does not hide skinned geometry). */
const HIDDEN_SCALE = 1e-4;

export interface MimicRig {
  root: THREE.Group;
  body: THREE.Group;
  chest: THREE.Group;
  lid: THREE.Group;
  chain: THREE.Group;
  legs: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  arms: THREE.Group;
  shL: THREE.Group;
  elL: THREE.Group;
  shR: THREE.Group;
  elR: THREE.Group;
  shadow: THREE.Mesh;
  mats: THREE.Material[];
  geos: THREE.BufferGeometry[];
  meshes: THREE.Mesh[];
  dispose(): void;
}

/** Builds one mimic (own geometry + materials, ~14 draw calls; there is one per level, so no sharing needed). */
export function createMimicRig(): MimicRig {
  const geos: THREE.BufferGeometry[] = [];
  const meshes: THREE.Mesh[] = [];
  const wood = makePs1Material({ map: getTexture('wood', 32, 5), color: 0xc8a070 }); // == chests.ts
  const metal = makePs1Material({ map: getTexture('metal', 32, 9), color: 0x9098a0 });
  const flat = makePs1Material({ vertexColors: true });
  const mats: THREE.Material[] = [wood, metal, flat];
  const mk = (parent: THREE.Object3D, parts: readonly Part[], mat: THREE.Material, tinted = false): THREE.Mesh => {
    const g = merge(parts, tinted);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    meshes.push(m);
    parent.add(m);
    return m;
  };
  const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'mimic';
  const shadow = createBlobShadow(0.55);
  shadow.position.y = BLOB_LIFT;
  root.add(shadow);
  const body = group(root);
  const chest = group(body);

  // --- chest body (matches ChestSystem.addChest)
  mk(chest, [[W, BASE_H, D, 0, BASE_H / 2, 0]], wood);
  mk(chest, [[W + 0.02, BASE_H, 0.08, 0, BASE_H / 2, 0]], metal);
  const lowerTeeth: Part[] = [];
  const upperTeeth: Part[] = [];
  for (let i = 0; i < 5; i++) {
    const x = -0.32 + i * 0.16;
    lowerTeeth.push([0.07, 0.08, 0.05, x, BASE_H + 0.03, -D / 2 + 0.06, TOOTH]);
    upperTeeth.push([0.07, 0.08, 0.05, x + 0.08, -0.04, -D + 0.06, TOOTH]);
  }
  mk(chest, [[W - 0.12, 0.02, D - 0.12, 0, BASE_H - 0.005, 0, 0x5a1414], ...lowerTeeth], flat, true);

  // lid pivots on the back edge (+z here: the mouth is -z)
  const lid = group(chest, 0, BASE_H, D / 2);
  mk(lid, [[W, LID_H, D, 0, LID_H / 2, -D / 2]], wood);
  mk(lid, [[W + 0.02, LID_H, 0.08, 0, LID_H / 2, -D / 2], [0.1, 0.12, 0.05, 0, -0.02, -D - 0.02]], metal);
  mk(lid, upperTeeth, flat, true);

  // THE TELL: a gold chain slung diagonally across the front, off-axis and the wrong color for steel.
  const chain = group(chest, -0.3, BASE_H + 0.16, -D / 2 - 0.03);
  const links: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const x = 0.6 * u;
    const y = -0.3 * u - 0.02 * Math.sin(u * Math.PI) * 3; // slight sag
    links.push(i % 2 === 0 ? [0.09, 0.05, 0.03, x, y, 0, GOLD, -0.45] : [0.045, 0.085, 0.03, x, y, 0, GOLD, -0.45]);
  }
  links.push([0.06, 0.1, 0.03, 0.62, -0.38, 0, GOLD]); // dangling end
  mk(chain, links, flat, true);

  // --- legs (hidden until it stands)
  const legs = group(body);
  const mkLeg = (x: number): { hip: THREE.Group; knee: THREE.Group } => {
    const hip = group(legs, x, 0, 0);
    mk(hip, [[0.18, LEG_LEN / 2, 0.2, 0, -LEG_LEN / 4, 0, SKIN]], flat, true);
    const knee = group(hip, 0, -LEG_LEN / 2, 0);
    mk(knee, [[0.16, LEG_LEN / 2 - 0.03, 0.18, 0, -LEG_LEN / 4 + 0.015, 0, SKIN_D], [0.22, 0.08, 0.36, 0, -LEG_LEN / 2 + 0.04, -0.08, SKIN_D]], flat, true);
    return { hip, knee };
  };
  const lL = mkLeg(-0.3);
  const lR = mkLeg(0.3);

  // --- long arms (hang from the sides; knuckles near the ground), hidden until it stands
  const arms = group(body);
  const mkArm = (x: number): { sh: THREE.Group; el: THREE.Group } => {
    const sh = group(arms, x, 0, 0);
    mk(sh, [[0.13, 0.45, 0.13, 0, -0.225, 0, SKIN]], flat, true);
    const el = group(sh, 0, -0.45, 0);
    mk(
      el,
      [
        [0.11, 0.45, 0.11, 0, -0.225, 0, SKIN_D],
        [0.2, 0.1, 0.16, 0, -0.5, 0, SKIN],
        [0.04, 0.1, 0.04, -0.07, -0.58, -0.05, TOOTH],
        [0.04, 0.1, 0.04, 0, -0.58, -0.07, TOOTH],
        [0.04, 0.1, 0.04, 0.07, -0.58, -0.05, TOOTH],
      ],
      flat,
      true,
    );
    return { sh, el };
  };
  const aL = mkArm(-0.62);
  const aR = mkArm(0.62);

  // ~15 per-part meshes -> one skinned mesh per material (wood / metal / flat). Hidden legs/arms collapse via scale.
  const skinned = skinMeshes(root, meshes, 'mimic');
  if (skinned.length) {
    meshes.length = 0;
    for (const s of skinned) meshes.push(s.mesh);
  }
  const rig: MimicRig = {
    root,
    body,
    chest,
    lid,
    chain,
    legs,
    hipL: lL.hip,
    kneeL: lL.knee,
    hipR: lR.hip,
    kneeR: lR.knee,
    arms,
    shL: aL.sh,
    elL: aL.el,
    shR: aR.sh,
    elR: aR.el,
    shadow,
    mats,
    geos,
    meshes,
    dispose() {
      disposeSkeletons(root);
      root.removeFromParent();
      for (const m of mats) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
  return rig;
}

/** Write a pose (channels `o`) onto the rig. `time` drives the chain sway. */
export function applyMimicPose(r: MimicRig, o: ArrayLike<number>, time: number): void {
  const rise = clamp01(o[RISE]!);
  const s = 1 + SCALE_UP * rise;
  const bob = 1 + o[BREATH]!;
  const chestY = Math.max(0.0, LEG_LEN * rise - o[CROUCH]!);
  r.body.rotation.x = o[LEAN_X]!;
  r.body.position.set(o[SHAKE]!, o[HOP_Y]!, o[LUNGE_Z]!);
  r.chest.scale.set(s, s * bob, s);
  r.chest.position.y = chestY;
  r.chest.rotation.y = o[TWIST_Y]!;
  r.lid.rotation.x = o[LID]!;
  r.chain.rotation.z = Math.sin(time * 1.7) * 0.03 * rise + (rise > 0.05 ? Math.sin(time * 9) * 0.06 * rise : 0);

  // legs
  const showLegs = rise > 0.03;
  r.legs.visible = showLegs;
  if (!showLegs) r.legs.scale.setScalar(HIDDEN_SCALE); // skinned: visibility doesn't hide bone-driven geometry
  else {
    r.legs.position.y = chestY;
    r.legs.scale.set(1, Math.max(0.05, chestY / LEG_LEN), 1);
    r.hipL.position.x = -0.3 * s;
    r.hipR.position.x = 0.3 * s;
    r.hipL.rotation.x = o[HIPL_X]!;
    r.kneeL.rotation.x = o[KNEEL_X]!;
    r.hipR.rotation.x = o[HIPR_X]!;
    r.kneeR.rotation.x = o[KNEER_X]!;
  }
  // arms
  const armK = clamp01((rise - 0.2) / 0.5);
  r.arms.visible = armK > 0.02;
  if (!r.arms.visible) r.arms.scale.setScalar(HIDDEN_SCALE);
  else {
    r.arms.scale.setScalar(armK);
    r.arms.position.y = chestY + 0.22 * s;
    r.shL.position.x = -(0.45 * s + 0.1);
    r.shR.position.x = 0.45 * s + 0.1;
    r.shL.rotation.set(o[SHL_X]!, 0, o[SHL_Z]!);
    r.elL.rotation.x = o[ELL_X]!;
    r.shR.rotation.set(o[SHR_X]!, 0, o[SHR_Z]!);
    r.elR.rotation.x = o[ELR_X]!;
  }
  r.shadow.scale.set(0.55 * (0.8 + 0.4 * rise), 1, 0.55 * (0.8 + 0.4 * rise));
}

/** Dormant/dead chest idle pose (breathing tell); writes into `out` (length N). */
export function dormantPose(out: Float32Array, time: number): void {
  out.fill(0);
  const b = Math.sin(time * 1.9) * 0.5 + 0.5;
  out[BREATH] = 0.03 * b; // box swells
  out[LID] = 0.035 * b; // lid cracks a hair
}

/** Dead (plain, open) chest pose. */
export function deadPose(out: Float32Array): void {
  out.fill(0);
  out[LID] = MIMIC_LID_OPEN;
}

// ------------------------------------------------------------------ enemy view

/** Animated view of the awake mimic. `dataOf` supplies the per-enemy rise runtime. */
export class MimicView implements EnemyView {
  readonly rig: MimicRig;
  private readonly tgt = new Float32Array(N);
  private readonly cur = new Float32Array(N);
  private readonly prev = new Float32Array(N);
  private readonly out = new Float32Array(N);
  private time = 0;
  private phase = 0;
  private flashT = 0;
  private flashColor = 0x902010;

  constructor(private readonly dataOf: (e: Enemy) => MimicRuntime | undefined) {
    this.rig = createMimicRig();
    // start as the dormant chest so the wake-up has no pop
    dormantPose(this.cur, 0);
    this.prev.set(this.cur);
    this.out.set(this.cur);
    applyMimicPose(this.rig, this.cur, 0);
  }

  get root(): THREE.Group {
    return this.rig.root;
  }

  flash(kind: 'hit' | 'block' | 'stagger'): void {
    this.flashColor = kind === 'block' ? 0x2050a0 : kind === 'stagger' ? 0xb0a070 : 0x902010;
    this.flashT = kind === 'stagger' ? 0.14 : 0.08;
  }

  sync(e: Enemy, dt: number): void {
    this.time += dt;
    this.prev.set(this.cur);
    const rate = this.pose(e, dt);
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    const t = this.tgt;
    for (let i = 0; i < N; i++) c[i]! += (t[i]! - c[i]!) * k;
    if (this.flashT > 0) this.flashT -= dt;
    const em = this.flashT > 0 ? this.flashColor : 0;
    for (const m of this.rig.mats) (m as THREE.MeshLambertMaterial).emissive?.setHex(em);
    this.rig.shadow.visible = e.alive;
  }

  render(e: Enemy, alpha: number): void {
    const r = this.rig;
    const p = e.capsule.position;
    const q = e.prevPos;
    r.root.position.set(lerp(q.x, p.x, alpha), lerp(q.y, p.y, alpha), lerp(q.z, p.z, alpha));
    let dy = e.transform.yaw - e.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    r.root.rotation.y = e.prevYaw + dy * alpha;
    const o = this.out;
    const c = this.cur;
    const pv = this.prev;
    for (let i = 0; i < N; i++) o[i] = pv[i]! + (c[i]! - pv[i]!) * alpha;
    // flinch is additive so hits pop without disturbing the FSM pose
    const f = e.flinch * e.flinch;
    o[LEAN_X] = o[LEAN_X]! + 0.18 * f;
    o[LID] = o[LID]! + 0.3 * f;
    applyMimicPose(r, o, this.time);
  }

  dispose(): void {
    this.rig.dispose();
  }

  private idle(): void {
    const T = this.tgt;
    T.fill(0);
    T[RISE] = 1;
    T[LID] = 0.12;
    T[SHL_X] = 0.12;
    T[SHR_X] = 0.12;
    T[SHL_Z] = -0.1;
    T[SHR_Z] = 0.1;
    T[ELL_X] = 0.2;
    T[ELR_X] = 0.2;
    T[HIPL_X] = 0.05;
    T[HIPR_X] = -0.05;
    T[BREATH] = 0.015 * (Math.sin(this.time * 2.2) * 0.5 + 0.5);
  }

  /** Writes the target pose for the state; returns the damping rate (1/s). */
  private pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const t = e.ctx.stateTime;
    const a = e.ctx.currentAttack;
    this.idle();
    switch (e.state) {
      case 'idle':
      case 'patrol':
        return 6;
      case 'alert':
      case 'hitReact': {
        const rt = this.dataOf(e);
        if (rt && !rt.risen) return this.rise(rt, t);
        T[LID] = 0.7;
        T[SHL_X] = 0.5;
        T[SHR_X] = 0.5;
        T[SHL_Z] = -0.5;
        T[SHR_Z] = 0.5;
        return 10;
      }
      case 'chase':
      case 'return': {
        const run = e.state === 'chase';
        const k = clamp01(e.speed / 3);
        this.phase += dt * (2 + e.speed * 2.4);
        const s = Math.sin(this.phase);
        T[HIPL_X] = s * 0.55 * k;
        T[HIPR_X] = -s * 0.55 * k;
        T[KNEEL_X] = -Math.max(0, -s) * 0.8 * k;
        T[KNEER_X] = -Math.max(0, s) * 0.8 * k;
        T[CROUCH] = 0.05 * Math.abs(Math.cos(this.phase)) * k + (run ? 0.06 : 0);
        T[SHL_X] = 0.3 - s * 0.5 * k;
        T[SHR_X] = 0.3 + s * 0.5 * k;
        T[SHL_Z] = -0.25;
        T[SHR_Z] = 0.25;
        T[ELL_X] = 0.35;
        T[ELR_X] = 0.35;
        T[LEAN_X] = run ? -0.22 : -0.05;
        T[LID] = run ? Math.max(0, Math.sin(this.time * 8)) * 0.55 : 0.12; // clacking jaw
        T[SHAKE] = 0;
        return 10;
      }
      case 'windup': {
        if (!a) return 10;
        const u = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.8)));
        const anim = e.extra(a)?.anim;
        if (anim === 'hop') this.hopPose(u, 0);
        else if (anim === 'sweep') this.sweepPose(u, 0);
        else this.lungePose(u, 0);
        if (u >= 1) T[SHAKE] = Math.sin(this.time * 40) * 0.012; // tremble: the telegraph "go" tell
        return 10;
      }
      case 'attack': {
        if (!a) return 30;
        const u = easeOut(clamp01(t / Math.max(0.05, a.active)));
        const anim = e.extra(a)?.anim;
        if (anim === 'hop') this.hopPose(1, u);
        else if (anim === 'sweep') this.sweepPose(1, u);
        else this.lungePose(1, u);
        return 36;
      }
      case 'recover': {
        if (!a) return 5;
        const hold = t < a.recover * 0.45;
        const anim = e.extra(a)?.anim;
        if (hold) {
          if (anim === 'hop') this.hopPose(1, 1);
          else if (anim === 'sweep') this.sweepPose(1, 1);
          else this.lungePose(1, 1);
          if (anim === 'hop') T[HOP_Y] = 0;
          return 12;
        }
        T[LID] = 0.5; // panting
        T[LEAN_X] = -0.12;
        return 4;
      }
      case 'stagger': {
        const u = clamp01(t / e.tuning.staggerTime);
        T[LEAN_X] = 0.35 * (1 - u);
        T[LID] = 1.0 * (1 - u * 0.5);
        T[SHL_X] = 0.5;
        T[SHL_Z] = -1.0;
        T[SHR_X] = 0.5;
        T[SHR_Z] = 1.0;
        T[ELL_X] = 0.5;
        T[ELR_X] = 0.5;
        T[CROUCH] = 0.12;
        T[HIPL_X] = 0.3;
        T[KNEEL_X] = -0.5;
        T[HIPR_X] = -0.2;
        T[KNEER_X] = -0.4;
        T[SHAKE] = Math.sin(t * 36) * 0.02 * (1 - u);
        return 18;
      }
      case 'dead': {
        const fall = e.tuning.deathFall;
        const u = clamp01(t / fall);
        // collapse back into a plain open chest (same pose as the dead-chest visual that replaces it)
        T.fill(0);
        T[RISE] = 1 - easeOut(u);
        T[LID] = MIMIC_LID_OPEN * easeOut(clamp01(t / (fall * 0.8)));
        T[LEAN_X] = 0.3 * (1 - u);
        T[SHL_X] = 0.6;
        T[SHR_X] = 0.6;
        T[SHL_Z] = -0.7;
        T[SHR_Z] = 0.7;
        T[CROUCH] = 0.25 * u;
        T[KNEEL_X] = -0.7 * u;
        T[KNEER_X] = -0.7 * u;
        return 14;
      }
    }
    return 8;
  }

  /** The wake-up: a chest bite then stand-up (chomp), or just a lurch to its feet (shot). */
  private rise(rt: MimicRuntime, t: number): number {
    const T = this.tgt;
    T[RISE] = 0;
    T[LID] = 0;
    T[BREATH] = 0;
    T[SHL_X] = T[SHR_X] = T[SHL_Z] = T[SHR_Z] = T[ELL_X] = T[ELR_X] = 0;
    if (rt.mode === 'chomp') {
      const bite = MIMIC_TIMING.biteAt;
      if (t < bite - 0.12) {
        // lid kicks up: a growing gape
        T[LID] = 1.6 * easeOut(clamp01(t / (bite - 0.12)));
        T[LEAN_X] = 0.12 * clamp01(t / bite);
        return 22;
      }
      if (t < bite) {
        T[LID] = 1.6;
        T[LEAN_X] = -0.2; // lunge into the player
        T[LUNGE_Z] = -0.12;
        return 30;
      }
      const c = t - bite;
      // chew while it stands up: jaw clacks, body shudders
      T[LID] = c < 0.9 ? Math.max(0, Math.sin(c * 16)) * 0.55 : 1.0;
      T[SHAKE] = c < 0.9 ? Math.sin(c * 50) * 0.02 : 0;
      T[LEAN_X] = -0.12;
      const up = easeOut(clamp01((c - 0.3) / 1.0));
      T[RISE] = up;
      const k = clamp01((up - 0.2) / 0.8);
      T[SHL_X] = 0.5 * k;
      T[SHR_X] = 0.5 * k;
      T[SHL_Z] = -0.45 * k;
      T[SHR_Z] = 0.45 * k;
      return 14;
    }
    // shot: the lid flies open, it shudders and heaves up onto its legs
    T[LID] = 1.2 * easeOut(clamp01(t / 0.2));
    T[SHAKE] = t < 0.3 ? Math.sin(t * 60) * 0.02 : 0;
    const up = easeOut(clamp01((t - 0.15) / 0.85));
    T[RISE] = up;
    T[SHL_X] = T[SHR_X] = 0.4 * up;
    T[SHL_Z] = -0.5 * up;
    T[SHR_Z] = 0.5 * up;
    return 14;
  }

  private lungePose(w: number, s: number): void {
    const T = this.tgt;
    // windup: rear back, jaw wide, arms drawn back; strike: lunge forward, jaw slams shut
    T[CROUCH] = lerp(0.15 * w, 0.05, s);
    T[LEAN_X] = lerp(0.35 * w, -0.5, s);
    T[LUNGE_Z] = lerp(0, -0.28, s);
    T[LID] = lerp(1.35 * w, 0, s > 0.55 ? 1 : s / 0.55);
    T[SHL_X] = lerp(-0.7 * w, 1.3, s);
    T[SHR_X] = lerp(-0.7 * w, 1.3, s);
    T[SHL_Z] = lerp(-0.2, -0.15, s);
    T[SHR_Z] = lerp(0.2, 0.15, s);
    T[ELL_X] = lerp(0.5, 0.2, s);
    T[ELR_X] = lerp(0.5, 0.2, s);
    T[HIPL_X] = lerp(0.4 * w, 0.55, s);
    T[KNEEL_X] = lerp(-0.5 * w, -0.2, s);
    T[HIPR_X] = lerp(-0.2 * w, -0.45, s);
    T[KNEER_X] = lerp(-0.3 * w, -0.1, s);
  }

  private sweepPose(w: number, s: number): void {
    const T = this.tgt;
    // windup: chest twists back, one long arm cocked high and wide; strike: whips across
    T[TWIST_Y] = lerp(lerp(0, 1.0, w), -0.9, s);
    T[LEAN_X] = lerp(0.1 * w, -0.25, s);
    T[CROUCH] = 0.08 * w;
    T[LID] = lerp(0.9 * w, 0.2, s);
    T[SHR_X] = lerp(lerp(0.3, -0.2, w), 0.4, s);
    T[SHR_Z] = lerp(lerp(0.25, 1.5, w), 1.1, s);
    T[ELR_X] = lerp(0.9 * w, 0.1, s);
    T[SHL_X] = lerp(0.3, 0.8, w);
    T[SHL_Z] = lerp(-0.25, -1.0, w);
    T[ELL_X] = 0.3;
    T[HIPL_X] = 0.3 * w;
    T[KNEEL_X] = -0.3 * w;
    T[HIPR_X] = -0.3 * w;
    T[KNEER_X] = -0.2 * w;
  }

  private hopPose(w: number, s: number): void {
    const T = this.tgt;
    // windup: deep crouch; strike: spring up and back, legs tucked
    T[CROUCH] = lerp(0.3 * w, 0, s);
    T[HOP_Y] = s < 1 ? Math.sin(s * Math.PI) * 0.85 : 0;
    T[LEAN_X] = lerp(-0.1 * w, 0.3, s);
    T[LID] = lerp(0.6 * w, 0.2, s);
    T[HIPL_X] = lerp(0.8 * w, 0.6, s);
    T[KNEEL_X] = lerp(-1.3 * w, -1.1, s);
    T[HIPR_X] = lerp(0.8 * w, 0.6, s);
    T[KNEER_X] = lerp(-1.3 * w, -1.1, s);
    T[SHL_X] = lerp(0.3, 1.0, s);
    T[SHR_X] = lerp(0.3, 1.0, s);
    T[SHL_Z] = -0.4 * w;
    T[SHR_Z] = 0.4 * w;
  }
}
