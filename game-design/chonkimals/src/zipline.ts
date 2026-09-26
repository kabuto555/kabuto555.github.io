/**
 * Zipline — from the fork at the top of the climb (chunk_fork's deck) down to
 * the beach, landing right where the sand starts. Plus the "Under Construction"
 * dressing that goes with it:
 *   - an invisible, un-jumpable blocker behind the barricade on the way up;
 *   - a construction hoarding across the beach's open north edge (plateau
 *     cliff → first boundary hill), so nobody wanders under the zipline or out
 *     onto the unfinished valley floor.
 *
 * The fork's geometry (deck, launch tower, barricade) is authored in
 * tools/build_chunks.py; this file reads its markers (zip_mount, zip_anchor,
 * barrier, sign_construction) and builds the rest from primitives at runtime.
 * The beach end is derived from the baked camp (Beach_ground disc + the
 * Bound_hill cones), so it follows the terrain if the camp is re-baked.
 */
import type { AnimState } from './player';
import { buildSign } from './lunch/models';

type Vector3 = import('three').Vector3;
type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Group = import('three').Group;

/** Tuning (world units / seconds). */
export const ZIPLINE_TUNING = {
  /** Walk this close to the deck's mount point for the "Ride" prompt. */
  mountRadius: 3.4,
  /** Landing tower sits this far inside the sand edge; the fence this far. */
  landingInset: 9,
  fenceInset: 2.5,
  towerHeight: 8.6,
  /** Cable sag at mid-span, as a fraction of its length. */
  sag: 0.035,
  accel: 13,
  maxSpeed: 25,
  /** Ease off to this speed over the last `brakeDistance` before the landing tower. */
  landSpeed: 7,
  brakeDistance: 14,
  /** How long the grab-and-launch takes at the top. */
  mountTime: 0.45,
  /** The rider hangs with their head just under the trolley's handle (this far below the cable). */
  handleDrop: 1.25,
  /** Blockers: taller than a jump apex (+ step) but under the grounding ray start (5). */
  wallHeight: 4.2,
  fenceHeight: 3.6,
  fencePostSpacing: 3.2,
};

/** Camp-local x of the plateau's west cliff (tools/build_camp.py HX = 60). */
const PLATEAU_WEST_LOCAL = -60;

export interface ZiplinePose {
  position: Vector3;
  facing: number;
  /** Forward/back swing of the hanging rider (radians). */
  pitch: number;
  anim: AnimState;
}

export interface ZiplineOptions {
  /** Ground under (x, z) in world units (the game's grounding raycast). */
  groundAt(x: number, z: number, fromY: number): number | null;
  /** Rider body height (world) — the current species at the current scale. */
  riderHeight(): number;
  onStart?(): void;
  /** Rider let go at the bottom and touched down at `landing`. */
  onEnd?(landing: Vector3): void;
  dustBurst?(x: number, y: number, z: number, n: number): void;
}

type Phase = 'mount' | 'ride' | 'drop';

/** One person on the line (the player or a bot). */
interface ZipRider {
  pose: ZiplinePose;
  phase: Phase;
  s: number;
  v: number;
  t: number;
  dropVel: number;
  from: Vector3;
  height: () => number;
  trolley: Group;
  done: boolean;
  onEnd?: (landing: Vector3) => void;
}

/** A bot's ride, as seen by the BotManager: follow `pose` until `done`. */
export interface RideHandle {
  readonly pose: ZiplinePose;
  readonly done: boolean;
}

export class Zipline {
  /** Invisible blockers to add to the walkable collision list. */
  readonly colliders: Mesh[] = [];
  private ok = false;
  private readonly group = new THREE.Group();
  private curve: import('three').QuadraticBezierCurve3 | null = null;
  private length = 0;
  private readonly mount = new THREE.Vector3();
  private readonly landing = new THREE.Vector3();
  /** The handle hanging at the top (the player's; bots get their own while they ride). */
  private trolley: Group | null = null;
  private trolleyWood: import('three').Material | null = null;
  private player: ZipRider | null = null;
  private readonly riders: ZipRider[] = [];
  private readonly idlePose: ZiplinePose = { position: new THREE.Vector3(), facing: 0, pitch: 0, anim: 'idle' };
  /** The fenced-off valley (beach disc centre, fence radius, plateau cliff x, sand height). */
  private valley: { cx: number; cz: number; rf: number; cliffX: number; sandY: number } | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private readonly scene: import('three').Scene, stageRoot: Object3D, private readonly opts: ZiplineOptions) {
    this.group.name = 'zipline';
    scene.add(this.group);
    stageRoot.updateMatrixWorld(true);
    try {
      this.ok = this.build(stageRoot);
    } catch (e) {
      console.warn('[zipline] setup failed:', e);
    }
  }

  /** The player is riding. */
  get active(): boolean { return this.player !== null; }
  /** The player's ride pose (last one, once they've landed). */
  get pose(): ZiplinePose { return this.player?.pose ?? this.idlePose; }
  get ready(): boolean { return this.ok; }

  /** Near the deck's mount point and free to ride. */
  canMount(p: Vector3): boolean {
    return this.ok && !this.player
      && Math.hypot(p.x - this.mount.x, p.z - this.mount.z) < ZIPLINE_TUNING.mountRadius
      && Math.abs(p.y - this.mount.y) < 3;
  }

  /** Where you stand to ride (debug teleport). */
  mountPoint(out: Vector3): Vector3 { return out.copy(this.mount); }
  /**
   * Safety net: if the player ended up on the fenced-off valley floor (hopped off the
   * deck or fell off the climb), returns the beach landing to put them back; else null.
   */
  rescuePoint(p: Vector3, out: Vector3): Vector3 | null {
    const v = this.valley;
    if (!v || this.player) return null;
    const outside = Math.hypot(p.x - v.cx, p.z - v.cz) > v.rf + 0.5 && p.x < v.cliffX + 0.3;
    return outside && p.y < v.sandY + 6 ? out.copy(this.landing) : null;
  }

  /** On the beach sand, inside the construction fence. */
  onBeach(p: Vector3): boolean {
    const v = this.valley;
    return !!v && Math.hypot(p.x - v.cx, p.z - v.cz) <= v.rf + 0.5;
  }

  /** Where the ride drops you on the beach (debug teleport). */
  landingPoint(out: Vector3): Vector3 { return out.copy(this.landing); }

  /** The player grabs the handle from `from` (their current position) and goes. */
  start(from: Vector3): void {
    if (!this.ok || this.player || !this.trolley) return;
    this.player = this.addRider(from, this.opts.riderHeight, this.trolley, (at) => this.opts.onEnd?.(at));
    this.opts.onStart?.();
  }

  /** A bot rides (with its own handle). Returns null if the line isn't set up. */
  startBot(from: Vector3, height: () => number): RideHandle | null {
    if (!this.ok || !this.trolleyWood) return null;
    const trolley = buildTrolley(this.trolleyWood);
    this.group.add(trolley);
    return this.addRider(from, height, trolley);
  }

  /** Advance everyone on the line. */
  update(dt: number): void {
    if (!this.curve) return;
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      this.step(r, dt);
      if (!r.done) continue;
      this.riders.splice(i, 1);
      if (r === this.player) {
        this.player = null;
        this.placeTrolley(r.trolley, 0); // the handle zips back up for the next rider
      } else {
        this.group.remove(r.trolley);
      }
      r.onEnd?.(r.pose.position.clone());
    }
  }

  private addRider(from: Vector3, height: () => number, trolley: Group, onEnd?: (at: Vector3) => void): ZipRider {
    const r: ZipRider = {
      pose: { position: from.clone(), facing: this.heading(0), pitch: 0, anim: 'jumping_up' },
      phase: 'mount', s: 0, v: 0, t: 0, dropVel: 0, from: from.clone(), height, trolley, done: false, onEnd,
    };
    this.riders.push(r);
    return r;
  }

  private step(r: ZipRider, dt: number): void {
    const T = ZIPLINE_TUNING;
    const hangY = r.height() + T.handleDrop;
    const p = r.pose;

    if (r.phase === 'mount') {
      // Hop up from the deck to hang under the trolley.
      r.t += dt;
      const k = Math.min(1, r.t / T.mountTime);
      const e = k * k * (3 - 2 * k);
      const grab = this.hangPoint(0, hangY, this.tmp);
      p.position.lerpVectors(r.from, grab, e);
      p.position.y += Math.sin(k * Math.PI) * 1.2;
      p.anim = 'jumping_up';
      p.pitch = 0;
      p.facing = this.heading(0);
      if (k >= 1) r.phase = 'ride';
      this.placeTrolley(r.trolley, 0);
      return;
    }

    if (r.phase === 'ride') {
      const left = this.length - r.s;
      if (left < T.brakeDistance) {
        r.v += (T.landSpeed - r.v) * (1 - Math.exp(-3 * dt)); // ease off for the landing
      } else {
        r.v = Math.min(T.maxSpeed, r.v + T.accel * dt);
      }
      r.s = Math.min(this.length, r.s + r.v * dt);
      const u = r.s / this.length;
      this.hangPoint(u, hangY, p.position);
      p.facing = this.heading(u);
      // The rider swings back as they pick up speed and forward as they brake.
      const accelLean = left < T.brakeDistance ? 0.28 : -0.22 * (1 - r.v / T.maxSpeed) - 0.06;
      p.pitch += (accelLean - p.pitch) * (1 - Math.exp(-4 * dt));
      p.anim = 'jumping_up';
      this.placeTrolley(r.trolley, u);
      if (r.s >= this.length - 0.01) {
        r.phase = 'drop';
        r.dropVel = 0;
      }
      return;
    }

    // Drop: let go and fall to the sand.
    r.dropVel -= 18 * dt;
    p.position.y += r.dropVel * dt;
    p.position.addScaledVector(this.tmp.set(Math.sin(p.facing), 0, Math.cos(p.facing)), 2.5 * dt);
    p.pitch *= Math.exp(-6 * dt);
    p.anim = 'falling_idle';
    const g = this.opts.groundAt(p.position.x, p.position.z, p.position.y + 3);
    if (g !== null && p.position.y <= g) {
      p.position.y = g;
      p.pitch = 0;
      p.anim = 'idle';
      r.done = true;
      this.opts.dustBurst?.(p.position.x, g, p.position.z, 8);
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────────
  private build(stageRoot: Object3D): boolean {
    const mountM = stageRoot.getObjectByName('zip_mount');
    const anchorM = stageRoot.getObjectByName('zip_anchor');
    const beach = stageRoot.getObjectByName('Beach_ground') as Mesh | undefined;
    const camp = stageRoot.getObjectByName('chunk_0_camp');
    if (!mountM || !anchorM || !beach || !camp) {
      console.warn('[zipline] fork / beach markers missing — zipline disabled');
      return false;
    }
    const woodMat = findMaterial(stageRoot, 'clay_wood') ?? new THREE.MeshStandardMaterial({ color: 0xad784f, roughness: 0.8 });
    mountM.getWorldPosition(this.mount);
    const start = anchorM.getWorldPosition(new THREE.Vector3());

    // Beach disc (centre + radius) in world XZ.
    const bb = new THREE.Box3().setFromObject(beach);
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const r = (bb.max.x - bb.min.x) / 2;
    const beachY = bb.max.y;

    // Landing: the sand edge nearest the launch tower, pulled a little inside.
    const dir = this.tmp.set(start.x - cx, 0, start.z - cz).normalize();
    const T = ZIPLINE_TUNING;
    this.landing.set(cx + dir.x * (r - T.landingInset), beachY, cz + dir.z * (r - T.landingInset));
    this.landing.y = this.opts.groundAt(this.landing.x, this.landing.z, beachY + 30) ?? beachY;

    // Landing tower (two posts + beam, facing up the line) and the cable end on its beam.
    const toStart = new THREE.Vector3(start.x - this.landing.x, 0, start.z - this.landing.z).normalize();
    const side = new THREE.Vector3(toStart.z, 0, -toStart.x);
    const tower = new THREE.Group();
    tower.name = 'zipline_landing_tower';
    const H = T.towerHeight;
    for (const sd of [-1, 1]) {
      const post = box(0.95, H, 0.95, woodMat);
      post.position.copy(this.landing).addScaledVector(side, sd * 3.6).addScaledVector(toStart, 1.2);
      post.position.y += H / 2;
      tower.add(post);
    }
    const beam = box(8.2, 0.9, 1.3, woodMat);
    beam.position.copy(this.landing).addScaledVector(toStart, 1.2);
    beam.position.y += H - 0.3;
    beam.rotation.y = Math.atan2(side.x, side.z) - Math.PI / 2;
    tower.add(beam);
    // Landing pad: a sandy-wood mat so the drop spot reads.
    const pad = box(6, 0.12, 5, woodMat);
    pad.position.copy(this.landing).addScaledVector(toStart, -1.5);
    pad.position.y += 0.06;
    pad.rotation.y = beam.rotation.y;
    tower.add(pad);
    this.group.add(tower);
    const end = this.landing.clone().addScaledVector(toStart, 1.2).setY(this.landing.y + H - 1.1);

    // Cable (with a little sag) + the trolley that carries the rider.
    const len = start.distanceTo(end);
    const mid = start.clone().lerp(end, 0.5);
    mid.y -= len * T.sag * 2; // a quadratic's control point sits 2× below the mid-sag
    this.curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    this.length = this.curve.getLength();
    const cable = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 96, 0.09, 6, false),
      new THREE.MeshStandardMaterial({ color: 0x3b3a3f, roughness: 0.5, metalness: 0.3 }));
    cable.name = 'zipline_cable';
    cable.castShadow = true;
    this.group.add(cable);
    this.trolleyWood = woodMat;
    this.trolley = buildTrolley(woodMat);
    this.group.add(this.trolley);
    this.placeTrolley(this.trolley, 0);

    // Construction sign + un-jumpable blocker at the barricade on the way up.
    const barrierM = stageRoot.getObjectByName('barrier');
    const signM = stageRoot.getObjectByName('sign_construction');
    const scale = stageRoot.getWorldScale(new THREE.Vector3()).x;
    if (barrierM) {
      const q = barrierM.getWorldQuaternion(new THREE.Quaternion());
      const wall = this.blocker(24 * scale, 0.9);
      barrierM.getWorldPosition(wall.position);
      wall.position.y += T.wallHeight / 2 - 0.2;
      wall.quaternion.copy(q);
      wall.name = 'Fork_barrier_cliff';
    }
    if (signM) {
      const sign = buildSign('UNDER CONSTRUCTION', 5.2, HAZARD_SIGN);
      signM.getWorldPosition(sign.position);
      const yaw = new THREE.Euler().setFromQuaternion(signM.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      sign.rotation.y = yaw + Math.PI; // face back down the path, at whoever walks up
      this.group.add(sign);
    }

    // Construction hoarding across the beach's open north edge.
    this.buildBeachFence(stageRoot, camp, { cx, cz, r }, woodMat);
    return true;
  }

  /** Hoarding along the sand edge from the plateau cliff to the first boundary hill. */
  private buildBeachFence(stageRoot: Object3D, camp: Object3D, disc: { cx: number; cz: number; r: number },
                          woodMat: import('three').Material): void {
    const T = ZIPLINE_TUNING;
    const { cx, cz } = disc;
    const rf = disc.r - T.fenceInset;
    // East end: where the fence circle meets the plateau's west cliff (just off its face;
    // the end collider overlaps into the cliff so there's no gap to squeeze through).
    const cliffX = new THREE.Vector3(PLATEAU_WEST_LOCAL, 0, 0).applyMatrix4(camp.matrixWorld).x - 0.3;
    const aEast = Math.acos(THREE.MathUtils.clamp((cliffX - cx) / rf, -1, 1)); // north side (sin > 0)
    // West end: into the nearest boundary hill on that side of the landing.
    const hills: { x: number; z: number; r: number; a: number }[] = [];
    stageRoot.traverse((o) => {
      if (!/^Bound_hill_cliff_\d+$/.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o);
      const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
      let a = Math.atan2(z - cz, x - cx);
      if (a < aEast) a += Math.PI * 2;
      hills.push({ x, z, r: (b.max.x - b.min.x) / 2, a });
    });
    hills.sort((p, q) => p.a - q.a);
    const hill = hills[0];
    const aStop = hill ? hill.a : aEast + 0.6;

    // Walk the arc on the sand; stop at the foot of the hill (its steep cone walls off the rest).
    const pts: Vector3[] = [];
    const step = T.fencePostSpacing / rf;
    const sandY = this.opts.groundAt(this.landing.x, this.landing.z, this.landing.y + 20) ?? this.landing.y;
    for (let a = aEast; a <= aStop + 1e-6; a += step) {
      const x = cx + Math.cos(a) * rf, z = cz + Math.sin(a) * rf;
      const y = this.opts.groundAt(x, z, sandY + 60);
      if (y === null) continue;
      if (y > sandY + 1.2) { // climbing the hill: finish with one post tucked into its foot
        pts.push(new THREE.Vector3(x, sandY, z));
        break;
      }
      pts.push(new THREE.Vector3(x, y, z));
    }
    if (pts.length < 2) return;
    this.valley = { cx, cz, rf, cliffX, sandY };

    const fence = new THREE.Group();
    fence.name = 'beach_construction_fence';
    const panelA = new THREE.MeshStandardMaterial({ color: 0xe9dcc2, roughness: 0.85 });
    const stripeO = new THREE.MeshStandardMaterial({ color: 0xff8520, roughness: 0.7 });
    const stripeW = new THREE.MeshStandardMaterial({ color: 0xf7f5ee, roughness: 0.7 });
    const H = T.fenceHeight;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const post = box(0.5, H + 0.5, 0.5, woodMat);
      post.position.set(p.x, p.y + (H + 0.5) / 2 - 0.3, p.z);
      fence.add(post);
      if (i === 0) continue;
      const a = pts[i - 1];
      const len = Math.hypot(p.x - a.x, p.z - a.z);
      const yaw = Math.atan2(p.x - a.x, p.z - a.z) + Math.PI / 2;
      const midX = (a.x + p.x) / 2, midZ = (a.z + p.z) / 2, baseY = Math.min(a.y, p.y);
      const panel = box(len, H - 0.9, 0.18, panelA);
      panel.position.set(midX, baseY + 0.35 + (H - 0.9) / 2, midZ);
      panel.rotation.y = yaw;
      fence.add(panel);
      // Hazard stripe along the top.
      const n = 3;
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n - 0.5;
        const seg = box(len / n, 0.55, 0.24, (i + k) % 2 ? stripeO : stripeW);
        seg.position.set(midX + (p.x - a.x) * f, baseY + H - 0.3, midZ + (p.z - a.z) * f);
        seg.rotation.y = yaw;
        fence.add(seg);
      }
      const wall = this.blocker(len + 0.5, 0.6);
      wall.position.set(midX, baseY + T.wallHeight / 2 - 0.2, midZ);
      wall.rotation.y = yaw;
      wall.name = `Beach_fence_cliff_${i}`;
    }
    // A sign on the fence, facing the beach, over the landing.
    const signAt = pts.reduce((best, q) => (q.distanceToSquared(this.landing) < best.distanceToSquared(this.landing) ? q : best));
    const inward = new THREE.Vector3(cx - signAt.x, 0, cz - signAt.z).normalize();
    const sign = buildSign('UNDER CONSTRUCTION', 5.2, HAZARD_SIGN);
    sign.position.copy(signAt).addScaledVector(inward, 0.5);
    sign.position.y -= 0.4;
    sign.rotation.y = Math.atan2(inward.x, inward.z);
    // Offset sideways so it doesn't sit right under the cable.
    sign.position.addScaledVector(new THREE.Vector3(inward.z, 0, -inward.x), 7);
    fence.add(sign);
    this.group.add(fence);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private blocker(width: number, thick: number): Mesh {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, ZIPLINE_TUNING.wallHeight, thick),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    wall.visible = false; // collision only (raycasts still hit invisible meshes)
    this.group.add(wall);
    wall.updateMatrixWorld(true);
    this.colliders.push(wall);
    return wall;
  }

  /** Point `hangY` below the cable at parameter u (0 = top). */
  private hangPoint(u: number, hangY: number, out: Vector3): Vector3 {
    this.curve!.getPointAt(u, out);
    out.y -= hangY;
    return out;
  }

  private heading(u: number): number {
    if (!this.curve) return 0;
    const tan = this.curve.getTangentAt(Math.min(0.999, u), this.tmp2);
    return Math.atan2(tan.x, tan.z);
  }

  private placeTrolley(trolley: Group, u: number): void {
    if (!this.curve) return;
    this.curve.getPointAt(u, trolley.position);
    trolley.rotation.set(0, this.heading(u), 0);
  }
}

/** Yellow/black hazard styling for buildSign. */
const HAZARD_SIGN = { frame: '#2b2118', fill: '#ffc93c', ink: '#2b2118' };

function box(w: number, h: number, d: number, m: import('three').Material): Mesh {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** Pulley on the cable + a T-handle hanging under it. Origin = on the cable. */
function buildTrolley(wood: import('three').Material): Group {
  const g = new THREE.Group();
  g.name = 'zipline_trolley';
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.35, metalness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe8483a, roughness: 0.6 });
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), metal);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.y = 0.1;
  const housing = box(0.28, 0.55, 0.9, red);
  housing.position.y = -0.05;
  const strap = box(0.08, 1.0, 0.08, metal);
  strap.scale.y = ZIPLINE_TUNING.handleDrop / 1.25;
  strap.position.y = -ZIPLINE_TUNING.handleDrop * 0.62;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), wood);
  handle.rotation.z = Math.PI / 2;
  handle.position.y = -ZIPLINE_TUNING.handleDrop;
  g.add(wheel, housing, strap, handle);
  return g;
}

function findMaterial(root: Object3D, name: string): import('three').Material | null {
  let found: import('three').Material | null = null;
  root.traverse((o) => {
    if (found) return;
    const m = (o as Mesh).material as import('three').Material | undefined;
    if (m && !Array.isArray(m) && m.name === name) found = m;
  });
  return found;
}
