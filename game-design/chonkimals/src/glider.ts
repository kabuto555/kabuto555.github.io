/**
 * Hang glider — from the launch ramp at the top of the steep branch climb
 * (chunk_glide_launch) down over camp, landing by the cabins at the River Log
 * Course finish. Slower than the zipline, with a little joystick control:
 * left/right steers, up dives (faster, sinks more), down flares (slower, floats).
 *
 * A soft pull toward the landing zone keeps every flight arriving near the
 * cabins: it's weak up high (you can wander) and firms up as you get low.
 * Launch geometry comes from the chunk's markers (glide_mount, glide_start,
 * glide_edge); the wing is built from primitives here.
 */
import type { AnimState } from './player';

type Vector3 = import('three').Vector3;
type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Group = import('three').Group;

/** Tuning (world units / seconds / radians). */
export const GLIDER_TUNING = {
  mountRadius: 3.4,
  /** Camp-local XZ (tools/build_camp.py) of the landing, on the grass by the log course
   * (world ≈ 52.2, 55.7 — picked in-game). */
  landingLocal: [38.7, 41.3] as [number, number],
  runTime: 0.9,
  /** Forward speed: cruise, full dive, full flare. */
  speed: 12, diveSpeed: 15.5, flareSpeed: 8.5,
  /** Sink rate at cruise / dive / flare (before the landing-zone guidance). */
  sink: 2.8, diveSink: 4.4, flareSink: 1.6,
  turnRate: 0.75,
  /** "Slight control": your steering fades out once you're this far (rad) off the bearing
   * to the landing, so you can weave and swing wide but not fly off somewhere else. */
  steerLeash: 0.6,
  /** Guidance toward the landing: heading pull (rad/s) + how much the sink is corrected. */
  homing: 0.9,
  glidePathBlend: 0.7,
  /** Visual bank per unit of turn rate, and the rider's prone tilt. */
  bank: 0.55,
  prone: 1.25,
  /** The rider hangs this far below the wing's keel. */
  hang: 1.05,
  landSlide: 0.6,
  wallHeight: 4.2,
};

export interface GliderPose {
  position: Vector3;
  facing: number;
  pitch: number;
  roll: number;
  anim: AnimState;
}

export interface GliderOptions {
  groundAt(x: number, z: number, fromY: number): number | null;
  riderHeight(): number;
  campToWorld(x: number, z: number, out: Vector3): Vector3;
  onStart?(): void;
  onEnd?(at: Vector3): void;
  dustBurst?(x: number, y: number, z: number, n: number): void;
}

type Phase = 'run' | 'glide' | 'land';

/** One pilot (the player or a bot). */
interface Pilot {
  pose: GliderPose;
  phase: Phase;
  t: number;
  yaw: number;
  v: number;
  turn: number;
  from: Vector3;
  height: () => number;
  wing: Group;
  /** Bots: a wobbly hand on the stick (null = the player's real input). */
  wobble: { a: number; b: number; age: number } | null;
  done: boolean;
  onEnd?: (at: Vector3) => void;
}

/** A bot's flight, as seen by the BotManager: follow `pose` until `done`. */
export interface GlideHandle {
  readonly pose: GliderPose;
  readonly done: boolean;
}

export class Glider {
  readonly colliders: Mesh[] = [];
  private ok = false;
  private readonly group = new THREE.Group();
  /** The wing on its stand at the top (the player's; bots get their own). */
  private wing: Group | null = null;
  private readonly mount = new THREE.Vector3();
  private readonly launch = new THREE.Vector3();
  private readonly landing = new THREE.Vector3();
  private launchYaw = 0;
  private player: Pilot | null = null;
  private readonly pilots: Pilot[] = [];
  private readonly idlePose: GliderPose = { position: new THREE.Vector3(), facing: 0, pitch: 0, roll: 0, anim: 'idle' };
  private stick = { x: 0, y: 0 };

  constructor(scene: import('three').Scene, stageRoot: Object3D, private readonly opts: GliderOptions) {
    this.group.name = 'hang_glider';
    scene.add(this.group);
    stageRoot.updateMatrixWorld(true);
    try {
      this.ok = this.build(stageRoot);
    } catch (e) {
      console.warn('[glider] setup failed:', e);
    }
  }

  /** The player is flying. */
  get active(): boolean { return this.player !== null; }
  get pose(): GliderPose { return this.player?.pose ?? this.idlePose; }
  get ready(): boolean { return this.ok; }

  canMount(p: Vector3): boolean {
    return this.ok && !this.player
      && Math.hypot(p.x - this.mount.x, p.z - this.mount.z) < GLIDER_TUNING.mountRadius
      && Math.abs(p.y - this.mount.y) < 3;
  }

  mountPoint(out: Vector3): Vector3 { return out.copy(this.mount); }
  landingPoint(out: Vector3): Vector3 { return out.copy(this.landing); }

  start(from: Vector3): void {
    if (!this.ok || this.player || !this.wing) return;
    this.player = this.addPilot(from, this.opts.riderHeight, this.wing, null, (at) => this.opts.onEnd?.(at));
    this.opts.onStart?.();
  }

  /** A bot takes a (fresh) glider off the ramp. */
  startBot(from: Vector3, height: () => number): GlideHandle | null {
    if (!this.ok) return null;
    const wing = buildWing();
    this.group.add(wing);
    return this.addPilot(from, height, wing, { a: Math.random() * 6.3, b: Math.random() * 6.3, age: 0 });
  }

  /** The player's stick this frame: x = steer (right +), y = up (dive) / down (flare). */
  setStick(stick: { x: number; y: number }): void { this.stick = stick; }

  /** Advance every pilot in the air. */
  update(dt: number): void {
    for (let i = this.pilots.length - 1; i >= 0; i--) {
      const pl = this.pilots[i];
      let stick = this.stick;
      if (pl.wobble) {
        const w = pl.wobble;
        w.age += dt;
        stick = { x: 0.55 * Math.sin(w.age * 0.55 + w.a), y: 0.35 * Math.sin(w.age * 0.37 + w.b) };
      }
      this.step(pl, dt, stick);
      if (!pl.done) continue;
      this.pilots.splice(i, 1);
      if (pl === this.player) { this.player = null; this.parkWing(); }
      else this.group.remove(pl.wing);
      pl.onEnd?.(pl.pose.position.clone());
    }
  }

  private addPilot(from: Vector3, height: () => number, wing: Group, wobble: Pilot['wobble'],
                   onEnd?: (at: Vector3) => void): Pilot {
    const pl: Pilot = {
      pose: { position: from.clone(), facing: this.launchYaw, pitch: 0, roll: 0, anim: 'running' },
      phase: 'run', t: 0, yaw: this.launchYaw, v: 0, turn: 0, from: from.clone(), height, wing, wobble, done: false, onEnd,
    };
    this.pilots.push(pl);
    return pl;
  }

  private step(pl: Pilot, dt: number, stick: { x: number; y: number }): void {
    const T = GLIDER_TUNING;
    const p = pl.pose;
    const rh = pl.height();
    const hang = rh * 0.35 + T.hang; // prone: the body lies along the keel

    if (pl.phase === 'run') {
      // Run down the ramp, wing overhead, and step off the lip.
      pl.t += dt;
      const k = Math.min(1, pl.t / T.runTime);
      p.position.lerpVectors(pl.from, this.launch, k * k);
      p.facing = this.launchYaw;
      p.pitch = -0.2 * k;
      p.roll = 0;
      p.anim = 'running';
      this.placeWing(pl, hang * k * 0.4 + rh * (1 - k * 0.5), 0);
      if (k >= 1) { pl.phase = 'glide'; pl.v = T.speed * 0.8; }
      return;
    }

    if (pl.phase === 'glide') {
      const pos = p.position;
      const toX = this.landing.x - pos.x, toZ = this.landing.z - pos.z;
      const dist = Math.max(0.01, Math.hypot(toX, toZ));
      const ground = this.opts.groundAt(pos.x, pos.z, pos.y + 2) ?? -Infinity;
      const height = Math.max(0, pos.y - Math.max(ground, this.landing.y));
      const low = 1 - Math.min(1, height / 30); // 0 up high → 1 near the ground

      // Steering: your input, plus a pull toward the landing that firms up as you get low.
      let err = Math.atan2(toX, toZ) - pl.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const assist = T.homing * (0.25 + 0.75 * low) * (1 - 0.6 * Math.min(1, Math.abs(stick.x)));
      // Steering away from the landing loses authority past the leash; steering back never does.
      const awayFromTarget = Math.sign(-stick.x) !== Math.sign(err) || err === 0;
      const leash = awayFromTarget ? THREE.MathUtils.clamp(1 - (Math.abs(err) - T.steerLeash * 0.5) / (T.steerLeash * 0.5), 0, 1) : 1;
      const wantTurn = -stick.x * T.turnRate * leash + THREE.MathUtils.clamp(err, -1, 1) * assist;
      pl.turn += (wantTurn - pl.turn) * (1 - Math.exp(-3 * dt));
      pl.yaw += pl.turn * dt;

      // Speed / sink from dive-flare input, then nudged onto a glide path that reaches the landing.
      const dive = THREE.MathUtils.clamp(stick.y, -1, 1);
      const wantV = dive >= 0 ? THREE.MathUtils.lerp(T.speed, T.diveSpeed, dive) : THREE.MathUtils.lerp(T.speed, T.flareSpeed, -dive);
      pl.v += (wantV - pl.v) * (1 - Math.exp(-1.5 * dt));
      let sink = dive >= 0 ? THREE.MathUtils.lerp(T.sink, T.diveSink, dive) : THREE.MathUtils.lerp(T.sink, T.flareSink, -dive);
      const glidePath = THREE.MathUtils.clamp((pos.y - this.landing.y) * pl.v / dist, 1.2, 7);
      sink = THREE.MathUtils.lerp(sink, glidePath, T.glidePathBlend * (0.4 + 0.6 * low));

      pos.x += Math.sin(pl.yaw) * pl.v * dt;
      pos.z += Math.cos(pl.yaw) * pl.v * dt;
      pos.y -= sink * dt;
      p.facing = pl.yaw;
      p.pitch = T.prone + (dive * 0.12);
      p.roll += (-pl.turn * T.bank - p.roll) * (1 - Math.exp(-4 * dt));
      p.anim = 'falling_idle';
      this.placeWing(pl, hang, p.roll);

      // Touchdown: feet reach the ground (camp grass or the valley floor, wherever you are).
      const g = this.opts.groundAt(pos.x, pos.z, pos.y + hang + 2);
      if (g !== null && pos.y <= g + 0.05) {
        pos.y = g;
        pl.phase = 'land';
        pl.t = 0;
        this.opts.dustBurst?.(pos.x, g, pos.z, 10);
      }
      return;
    }

    // Land: run it out, stand up, pack the wing away.
    pl.t += dt;
    const k = Math.min(1, pl.t / T.landSlide);
    const slow = pl.v * (1 - k) * dt;
    p.position.x += Math.sin(pl.yaw) * slow;
    p.position.z += Math.cos(pl.yaw) * slow;
    const g = this.opts.groundAt(p.position.x, p.position.z, p.position.y + 3);
    if (g !== null) p.position.y = g;
    p.pitch = T.prone * (1 - k) * 0.4;
    p.roll *= 1 - k;
    p.anim = 'running';
    this.placeWing(pl, rh * 0.9, 0);
    if (k >= 1) {
      p.pitch = 0; p.roll = 0;
      p.anim = 'idle';
      pl.done = true;
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────────
  private build(stageRoot: Object3D): boolean {
    const mountM = stageRoot.getObjectByName('glide_mount');
    const startM = stageRoot.getObjectByName('glide_start');
    if (!mountM || !startM) {
      console.warn('[glider] launch markers missing — glider disabled');
      return false;
    }
    mountM.getWorldPosition(this.mount);
    startM.getWorldPosition(this.launch);
    this.launchYaw = new THREE.Euler().setFromQuaternion(startM.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    const T = GLIDER_TUNING;
    this.opts.campToWorld(T.landingLocal[0], T.landingLocal[1], this.landing);
    this.landing.y = this.opts.groundAt(this.landing.x, this.landing.z, 40) ?? 0;

    // Un-jumpable blocker across the end of the ramp (you only leave it by gliding).
    const edgeM = stageRoot.getObjectByName('glide_edge');
    if (edgeM) {
      const scale = stageRoot.getWorldScale(new THREE.Vector3()).x;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, T.wallHeight, 7.2 * scale), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      wall.visible = false;
      edgeM.getWorldPosition(wall.position);
      wall.position.y += T.wallHeight / 2 - 0.6;
      wall.rotation.y = this.launchYaw;
      wall.name = 'Launch_edge_cliff';
      this.group.add(wall);
      wall.updateMatrixWorld(true);
      this.colliders.push(wall);
    }

    // Landing marker: a bright windsock-orange ring on the grass so the target reads from the air.
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.1, 40),
      new THREE.MeshStandardMaterial({ color: 0xff8520, roughness: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.landing).setY(this.landing.y + 0.06);
    ring.receiveShadow = true;
    this.group.add(ring);

    this.wing = buildWing();
    this.group.add(this.wing);
    this.parkWing();
    return true;
  }

  /** A pilot's wing over them (keel `above` over their middle), banked by `roll`. */
  private placeWing(pl: Pilot, above: number, roll: number): void {
    const w = pl.wing;
    const at = pl.pose.position;
    // Prone, the body lies forward of the feet (the pose origin): centre the wing over it.
    const fwd = pl.height() * 0.5 * Math.sin(pl.pose.pitch);
    w.position.set(at.x + Math.sin(pl.pose.facing) * fwd, at.y + above, at.z + Math.cos(pl.pose.facing) * fwd);
    w.rotation.set(0, pl.pose.facing, 0, 'YXZ');
    w.rotateZ(roll);
  }

  /** Resting on its stand at the top of the ramp, ready for the next pilot. */
  private parkWing(): void {
    const w = this.wing;
    if (!w) return;
    w.position.lerpVectors(this.mount, this.launch, 0.55).setY(this.mount.y + 2.6);
    w.rotation.set(-0.08, this.launchYaw, 0, 'YXZ');
  }
}

let sailTex: import('three').CanvasTexture | null = null;
/** Rainbow sail stripes (one shared texture for every wing). */
function sailTexture(): import('three').CanvasTexture {
  if (sailTex) return sailTex;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 32;
  const c = cv.getContext('2d')!;
  const cols = ['#ff5d73', '#ffb13b', '#ffe45c', '#5fd068', '#4eb3f5', '#9b7bff'];
  cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * (256 / cols.length), 0, 256 / cols.length + 1, 32); });
  sailTex = new THREE.CanvasTexture(cv);
  sailTex.colorSpace = THREE.SRGBColorSpace;
  return sailTex;
}

/** Delta wing (nose +z) with rainbow sail, keel, and an A-frame control bar hanging below. */
function buildWing(): Group {
  const g = new THREE.Group();
  g.name = 'hang_glider_wing';
  const span = 7.2, chord = 3.4;
  // Sail: two triangles meeting at the keel, a little dihedral.
  const tex = sailTexture();
  const geo = new THREE.BufferGeometry();
  const dh = 0.35;
  // nose, left tip, keel tail, right tip
  const v = new Float32Array([0, 0, chord * 0.6, -span / 2, dh, -chord * 0.4, 0, 0.05, -chord * 0.25, span / 2, dh, -chord * 0.4]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.5, 0, 0, 1, 0.5, 1, 1, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const sail = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  sail.castShadow = true;
  const tube = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.35, metalness: 0.6 });
  const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, chord * 0.9, 6), tube);
  keel.rotation.x = Math.PI / 2;
  keel.position.set(0, -0.02, chord * 0.15);
  // A-frame control bar under the keel.
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), tube);
  legL.position.set(-0.45, -0.7, 0.2); legL.rotation.z = -0.3;
  const legR = legL.clone(); legR.position.x = 0.45; legR.rotation.z = 0.3;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), tube);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, -1.4, 0.2);
  g.add(sail, keel, legL, legR, bar);
  return g;
}
