// "Use your toy": an overly dramatic, whole-body performance layered on top of whatever
// animation is playing (the character clips have no such move) — via a pose overlay that
// runs right after the mixer each frame (player.ts setPoseOverlay), so it works on every
// body, mid-walk, for the player and bots alike.
//
//   wind-up   a quick crouch and lean in (squash), the toy arm starts to rise
//   perform   thrown back into it: spine arched, head back and bopping, hips swaying and
//             bouncing (stretch), the free arm pumping the air, the toy held high and shaken
//   flourish  a big bow (squash)… then it all eases back
//
// Toys are held in the LEFT hand (attire.ts). Chonk arms are stubby (a raised hand barely
// clears the belly), so the toy itself also lifts from the hand to a show-off spot beside the
// head, stands upright, pops bigger and shakes — then settles back into the hand. Axes below
// are character-root space: +X = the toy side, +Y = up, +Z = forward.

import { setPoseOverlay } from '../player';
import { TOY_PROP } from './attire';

type Object3D = import('three').Object3D;
type Vector3 = import('three').Vector3;
type Quaternion = InstanceType<typeof THREE.Quaternion>;

/** Seconds. */
const WINDUP = 0.18, PERFORM = 1.3, BOW = 0.2, SETTLE = 0.4;
const T_PERF = WINDUP, T_BOW = WINDUP + PERFORM, T_SETTLE = T_BOW + BOW, T_END = T_SETTLE + SETTLE;
/** Where the upper arm points at full raise: up, a little out and forward. */
const RAISE_DIR = new THREE.Vector3(0.3, 0.92, 0.3).normalize();
/** The free arm's pump: from out-to-the-side up to straight overhead. */
const PUMP_LOW = new THREE.Vector3(-0.85, 0.35, 0.3).normalize();
const PUMP_HIGH = new THREE.Vector3(-0.3, 0.95, 0.1).normalize();
/** Toy size at full raise (× its worn size). */
const POP = 1.7;
const BEAT = 9; // rad/s: the bop / bounce / pump tempo

interface Rig {
  hips: Object3D | null;
  /** The model node (the GLB scene clone under the character root — nothing else moves it after
   * creation): squash / stretch / bounce go on it, around the feet. Rest transform captured once
   * (a performance restarted mid-squash mustn't keep the squash). */
  model: Object3D | null;
  modelPos: Vector3 | null;
  modelScale: Vector3 | null;
  /** Spine bones hips → chest (the lean is shared out along them). */
  spine: Object3D[];
  head: Object3D | null;
  toy: { upper: Object3D; fore: Object3D; hand: Object3D };
  free: { upper: Object3D; fore: Object3D; hand: Object3D } | null;
}
const rigs = new WeakMap<Object3D, Rig | null>();

function findRig(root: Object3D): Rig | null {
  if (rigs.has(root)) return rigs.get(root)!;
  const bones: Object3D[] = [];
  root.traverse((o) => { if ((o as import('three').Bone).isBone) bones.push(o); });
  const find = (re: RegExp) => bones.find((b) => re.test(b.name)) ?? null;
  const upper = find(/LeftArm$/i), fore = find(/LeftForeArm$/i), hand = find(/LeftHand$/i);
  if (!upper || !fore || !hand) { rigs.set(root, null); return null; }
  const rU = find(/RightArm$/i), rF = find(/RightForeArm$/i), rH = find(/RightHand$/i);
  const hips = find(/Hips$/i), head = find(/Head$/i);
  // Spine: the head's ancestors below the neck, down to (not including) the hips.
  const spine: Object3D[] = [];
  for (let o = head?.parent ?? null; o && o !== hips && (o as import('three').Bone).isBone; o = o.parent) {
    if (/spine/i.test(o.name)) spine.unshift(o);
  }
  let model: Object3D | null = hips;
  while (model && model.parent && model.parent !== root) model = model.parent;
  if (model?.parent !== root) model = null;
  const rig: Rig = { hips, model, modelPos: model ? model.position.clone() : null, modelScale: model ? model.scale.clone() : null, spine, head, toy: { upper, fore, hand }, free: rU && rF && rH ? { upper: rU, fore: rF, hand: rH } : null };
  rigs.set(root, rig);
  return rig;
}

// ── Pose helpers (world-space rotations written back as local ones) ───────────

const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), target = new THREE.Vector3();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qRoot = new THREE.Quaternion();
const qd = new THREE.Quaternion();
const ID = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const axis = new THREE.Vector3(), show = new THREE.Vector3();

/** Pre-multiply `bone`'s world rotation by `q` (world space). */
function applyWorld(bone: Object3D, q: Quaternion): void {
  if (!bone.parent) return;
  bone.getWorldQuaternion(qc);
  qc.premultiply(q);
  bone.parent.getWorldQuaternion(qa);
  bone.quaternion.copy(qa.invert().multiply(qc));
  bone.updateMatrixWorld(true);
}

/** Turn `bone` by `angle` about a character-root axis. */
function turn(bone: Object3D | null, rootAxis: Vector3, angle: number): void {
  if (!bone || Math.abs(angle) < 1e-4) return;
  axis.copy(rootAxis).applyQuaternion(qRoot);
  applyWorld(bone, qb.setFromAxisAngle(axis, angle));
}

/** Turn `bone` so its direction towards `child` moves `w` of the way to world `dir`. */
function aim(bone: Object3D, child: Object3D, dir: Vector3, w: number): void {
  if (w < 1e-3) return;
  bone.getWorldPosition(va);
  child.getWorldPosition(vb);
  const cur = vb.sub(va);
  if (cur.lengthSq() < 1e-10) return;
  qd.setFromUnitVectors(cur.normalize(), dir);
  applyWorld(bone, qb.copy(ID).slerp(qd, w));
}

const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
/** Piecewise-smooth curve through [time, value] keys. */
function curve(keys: readonly (readonly [number, number])[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0)); }
  }
  return keys[keys.length - 1][1];
}

// The choreography (radians / scale), keyed on time.
/** Lean: + forward (crouch in, the bow), − thrown back. */
const LEAN = [[0, 0], [T_PERF, 0.3], [T_PERF + 0.2, -0.5], [T_BOW, -0.42], [T_SETTLE, 0.6], [T_END, 0]] as const;
/** Head on top of the lean: back, then down into the bow. */
const HEAD = [[0, 0], [T_PERF, 0.15], [T_PERF + 0.2, -0.35], [T_BOW, -0.3], [T_SETTLE, 0.35], [T_END, 0]] as const;
/** Body height squash (<1) / stretch (>1) — kept standing on its feet. */
const SQUASH = [[0, 1], [T_PERF, 0.86], [T_PERF + 0.14, 1.1], [T_PERF + 0.35, 1], [T_BOW, 1], [T_SETTLE, 0.88], [T_END, 1]] as const;
/** How much of the rhythmic stuff (bops, sway, bounce, pump) is on. */
const GROOVE = [[0, 0], [T_PERF, 0], [T_PERF + 0.2, 1], [T_BOW - 0.05, 1], [T_SETTLE - 0.05, 0], [T_END, 0]] as const;
/** The toy arm up / toy out at the show-off spot. */
const RAISE = [[0, 0], [T_PERF + 0.1, 1], [T_SETTLE, 1], [T_END, 0]] as const;

/** World-space show-off spot for the toy (into `show`): beside the head on the toy side, a little forward. */
function showSpot(root: Object3D, rig: Rig): void {
  const inv = root.matrixWorld.clone().invert();
  const shoulder = rig.toy.upper.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const head = (rig.head ?? rig.toy.upper).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const hips = (rig.hips ?? rig.toy.upper).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const tall = Math.max(0.05, head.y - hips.y);
  show.set(shoulder.x * 1.6 + Math.sign(shoulder.x || 1) * tall * 0.25, head.y + tall * 0.25, head.z + tall * 0.5);
  root.localToWorld(show);
}

/** Plays the toy performance on a character made by createCharacter (restarts if already going). */
export function useToy(root: Object3D): void {
  const rig = findRig(root);
  if (!rig) return;
  const toy = rig.toy.hand.getObjectByName(TOY_PROP);
  if (toy && toy.userData.rest === undefined) {
    toy.userData.rest = { scale: toy.scale.x, pos: toy.position.clone(), quat: toy.quaternion.clone() };
  }
  const rest = toy?.userData.rest as { scale: number; pos: Vector3; quat: Quaternion } | undefined;
  let t = 0;
  setPoseOverlay(root, (dt) => {
    t += dt;
    if (t >= T_END) {
      if (toy && rest) { toy.scale.setScalar(rest.scale); toy.position.copy(rest.pos); toy.quaternion.copy(rest.quat); }
      if (rig.model && rig.modelPos && rig.modelScale) { rig.model.position.copy(rig.modelPos); rig.model.scale.copy(rig.modelScale); }
      setPoseOverlay(root, null);
      return;
    }
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(qRoot);
    const groove = curve(GROOVE, t), raise = curve(RAISE, t);
    const beat = Math.sin(t * BEAT), bounce = Math.abs(beat);

    // Whole body: squash & stretch around the feet (feet sit at root y = 0) and a hop on the beat.
    if (rig.model && rig.modelPos && rig.modelScale) {
      const sy = curve(SQUASH, t) * (1 + 0.06 * bounce * groove);
      const sxz = 1 / Math.sqrt(sy);
      rig.model.scale.set(rig.modelScale.x * sxz, rig.modelScale.y * sy, rig.modelScale.z * sxz);
      const hop = 0.05 * bounce * groove * (rig.modelPos.y > 0 ? rig.modelPos.y : 0.3);
      rig.model.position.set(rig.modelPos.x, rig.modelPos.y * sy + hop, rig.modelPos.z);
      rig.model.updateMatrixWorld(true);
    }
    turn(rig.hips, AZ, Math.sin(t * BEAT * 0.5) * 0.14 * groove); // side-to-side sway
    // Spine: lean in / thrown back (shared along it) and a twist into the pump.
    const lean = curve(LEAN, t), n = Math.max(1, rig.spine.length);
    for (const b of rig.spine) {
      turn(b, AX, lean / n);
      turn(b, AY, (Math.sin(t * BEAT * 0.5 + 1) * 0.3 * groove) / n);
    }
    // Head: back into it, bopping on the beat.
    turn(rig.head, AX, curve(HEAD, t) + beat * 0.16 * groove);
    turn(rig.head, AZ, Math.sin(t * BEAT * 0.5 + 2) * 0.12 * groove);

    // Toy arm: reach for the show-off spot (as far as a stubby arm goes).
    showSpot(root, rig);
    rig.toy.upper.getWorldPosition(vc);
    target.copy(show).sub(vc);
    if (target.lengthSq() > 1e-10) target.normalize(); else target.copy(RAISE_DIR).applyQuaternion(qRoot);
    target.lerp(vc.copy(RAISE_DIR).applyQuaternion(qRoot), 0.3).normalize();
    aim(rig.toy.upper, rig.toy.fore, target, raise);
    aim(rig.toy.fore, rig.toy.hand, target, raise * 0.85);
    // Free arm: pumping the air on the beat.
    if (rig.free) {
      target.lerpVectors(PUMP_LOW, PUMP_HIGH, 0.5 + 0.5 * beat).normalize().applyQuaternion(qRoot);
      aim(rig.free.upper, rig.free.fore, target, groove * 0.9);
      aim(rig.free.fore, rig.free.hand, target, groove * 0.7);
    }
    // The toy: up at the spot, upright, popped bigger, shaken like it owes you money.
    if (toy && rest) {
      const at = rig.toy.hand.worldToLocal(vc.copy(show));
      toy.position.lerpVectors(rest.pos, at, raise);
      rig.toy.hand.getWorldQuaternion(qd).invert().multiply(qRoot);
      toy.quaternion.slerpQuaternions(rest.quat, qd, raise);
      toy.rotateZ(Math.sin(t * 26) * (0.25 + 0.2 * groove) * raise);
      toy.scale.setScalar(rest.scale * (1 + (POP - 1) * raise * (1 + 0.08 * bounce * groove)));
      toy.updateMatrixWorld(true);
    }
  });
}
