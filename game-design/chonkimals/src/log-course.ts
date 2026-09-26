/**
 * River log course — a Frogger-style run up the river.
 *
 * Logs lie lengthwise in LANES lanes, each lane drifting downstream at its own
 * slowly varying speed. They surface nose-first upstream of the north bridge,
 * dip under it, and dive nose-first under the south bridge, so the river looks
 * like an endless flow.
 * Each log has 2–6 hoppable nodes along its length. The frog starts on the
 * south bridge's upstream rail, hops forward (upriver) node to node and log to
 * log (straight ahead in its lane only), and wins by reaching the north
 * bridge's downstream rail. Left/right hops to the nearest node in the
 * neighbouring lane. No backward moves.
 *
 * Multiplayer bump-outs: hopping onto a node another frog is standing on
 * takes the node and shoves the occupant one move in the same direction
 * (forward or sideways), as if they'd pressed it themselves — chaining into
 * whoever is there next. With nowhere to land they splash; shoved sideways
 * past an edge lane they land on the bank and their attempt is over.
 *
 * Falling in: the player gets a Retry / Give Up prompt — Retry respawns them
 * at the start; Give Up has them swim to the nearest bank, climb the fence and
 * drop onto land, ending the run. Bots respawn until they've used up their
 * `attempts`, then take the same swim out.
 *
 * Play area: the river from where logs surface down to the start rail is
 * off-limits to anyone not playing (`inPlayArea`), so free-roaming players
 * and bots can't wander or jump in and disrupt runs. Bridge decks stay open.
 */
import { gameEvents, PLAYER_ACTOR, type Actor } from './events';
import { createFlatMaterial } from './materials';
import { GameBanner } from './ui/game-banner';
import { showChoiceModal, type ChoiceModal } from './ui/choice-modal';
import type { AnimState } from './player';

type Object3D = InstanceType<typeof THREE.Object3D>;
type Group = InstanceType<typeof THREE.Group>;
type Vector3 = import('three').Vector3;
type Box3 = import('three').Box3;

// ── Tuning ───────────────────────────────────────────────────────────────────
const LANES          = 5;
const LANE_SPEEDS    = [1.5, 2.3, 1.8, 2.6, 2.0]; // top speed per lane (world u/s), shuffled per course
const LANE_SLOWEST   = 0.4;   // lanes drift between this fraction of top speed and top speed
const SPEED_RETARGET = [3, 7] as const; // seconds between picking a new lane speed
const SPEED_EASE     = 1.5;   // time constant for easing toward the new speed (s)
const MIN_NODES      = 2;
const MAX_NODES      = 6;
const NODE_SPACING   = 1.4;   // along-log distance between nodes
const SMALL_GAP      = [0.6, 2.2] as const; // hoppable gap between logs in a lane
const BIG_GAP        = [4.5, 7.5] as const; // forces a lane change
const BIG_GAP_CHANCE = 0.35;
const MAX_HOP        = 4.0;   // forward reach from a log
const MAX_HOP_BRIDGE = 5.5;   // forward reach from a bridge (extra lenient)
const LATERAL_REACH  = 1.2;   // max along-river offset for a sideways hop
const INPUT_BUFFER   = 0.4;   // a press waits this long for a valid target (s)
const HOP_TIME       = 0.28;
const HOP_HEIGHT     = 0.9;
const SIDE_HEIGHT    = 0.45;
const FENCE_RAIL_MAX = 3.6;   // longest rail span; longer = jumped a bridge gap, skip it
const SPRING_CHANCE  = 0.03;  // chance a log node spawns with a spring pad
const SPRING_NODES   = 10;    // spring aims this many nodes ahead in the same lane
const SPRING_MIN     = 4;     // closest (in nodes) a spring may land you, else it stays idle
const SPRING_MAX     = 13;    // furthest (in nodes) a spring may land you
const SPRING_DELAY   = 0.15;  // beat on the pad before launching (s)
const SPRING_TIME    = 0.9;   // flight time (s)
const SPRING_ARC     = 4.5;   // flight apex above the straight line
const SPRING_HEIGHT  = 0.26;  // pad top above the log surface
const LAND_GRACE     = 0.25;  // target node must stay afloat this long after landing (s)
const LOG_RADIUS     = 0.36;
const LOG_FLOAT      = 0.1;   // log centre above the water surface
const SINK_DEPTH     = 1.4;
const EMERGE_LEN     = 3.0;   // along-river distance over which logs surface
const EMERGE_CLEAR   = 1.5;   // logs are fully surfaced this far upstream of the north bridge
const UNDER_DEPTH    = 0.3;   // dip while passing under the north bridge so logs clear the deck
const UNDER_EASE     = 0.8;   // along-river distance to dip in/out around that bridge
const DIVE_LEAD      = 0.6;   // logs start diving this far before the south rail
const DIVE_LEN       = 2.5;
const AFLOAT_DEPTH   = 0.05;  // node counts as afloat below this depth
const DROWN_DEPTH    = 0.2;   // frog splashes once its node is this deep
const SPLASH_TIME    = 0.9;
const WIN_HOLD       = 1.5;
const OUT_HOLD       = 1.4;   // beat on the bank after being bumped out
const BANK_CLEAR     = 1.4;   // how far past the river edge a bumped-out frog lands
const BUMP_ARC       = 1.6;   // a shoved frog's hop is this much higher than a normal one...
const BUMP_TIME      = 0.8;   // ...and this fraction of the duration, so it reads as a bonk
const BUMP_MSG_TIME  = 1.6;   // how long a bump message stays up (s)
const SURFACE_TIME   = 0.6;   // after a splash, the player bobs back up to tread water (s)
const SWIM_SINK      = 0.5;   // feet this far below the surface while treading water / swimming
const SWIM_BOB       = 0.06;  // treading-water bob amplitude
const SWIM_SPEED     = 2.4;   // give-up swim to the bank (world u/s)
const FENCE_INSET    = 0.35;  // swim ends this far inside the fence line
const FENCE_HEIGHT   = 1.5;   // fence rail height above the water line
const CLIMB_TIME     = 0.7;   // hauling up the fence (s)
const VAULT_TIME     = 0.5;   // dropping over the fence onto the bank (s)
const VAULT_ARC      = 0.5;
const MILESTONES     = [0.5, 0.8]; // progress fractions announced as course_progress events
const AREA_MARGIN    = 0.35;  // play area extends this far past the river edges
const DECK_MARGIN    = 0.35;  // bridge decks (incl. their rails) stay walkable this far out
const SWIPE_MIN_PX   = 30;
const TAP_MAX_PX     = 14;
const TAP_MAX_MS     = 350;

const SIGN_CLEARANCE = 3.4;  // banner bottom above the rail top
const SIGN_HEIGHT    = 1.3;
const SIGN_TEXT_W    = 5.0;  // text panel width, centred over the river
const START_SIGN     = 'River Log Course';
const START_SIGN_PLAY_OPACITY = 0.12; // start sign fades while playing so it doesn't hide logs
const FINISH_SIGN    = 'Finish Line!';

const DECK_RE  = /^prop_bridge_(.+)_deck$/;
const RIVER_RE = /^water_river_\d+$/;

// ── River centreline ─────────────────────────────────────────────────────────
/** Polyline down the river's centre, s = arc length increasing downstream. */
class RiverPath {
  private readonly cum: number[] = [0];

  constructor(private readonly pts: Vector3[]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }

  private seg(s: number): number {
    let i = 0;
    while (i < this.pts.length - 2 && this.cum[i + 1] < s) i++;
    return i;
  }

  pointAt(s: number, out: Vector3): Vector3 {
    const i = this.seg(s);
    const t = (s - this.cum[i]) / (this.cum[i + 1] - this.cum[i]);
    return out.lerpVectors(this.pts[i], this.pts[i + 1], t);
  }

  /** Unit downstream direction (XZ). */
  tangentAt(s: number, out: Vector3): Vector3 {
    const i = this.seg(s);
    return out.subVectors(this.pts[i + 1], this.pts[i]).setY(0).normalize();
  }

  /** Right-hand lateral axis for a frog facing upstream. */
  rightAt(s: number, out: Vector3): Vector3 {
    const t = this.tangentAt(s, out);
    return out.set(t.z, 0, -t.x);
  }

  project(p: Vector3): number {
    let best = 0, bestD = Infinity;
    const a = new THREE.Vector3(), ab = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < this.pts.length - 1; i++) {
      a.copy(this.pts[i]).setY(0);
      ab.copy(this.pts[i + 1]).setY(0).sub(a);
      q.copy(p).setY(0);
      const t = Math.max(0, Math.min(1, q.sub(a).dot(ab) / ab.lengthSq()));
      const d = a.addScaledVector(ab, t).distanceToSquared(p.clone().setY(0));
      if (d < bestD) { bestD = d; best = this.cum[i] + t * (this.cum[i + 1] - this.cum[i]); }
    }
    return best;
  }
}

function buildRiver(root: Object3D, fallPos: Vector3): { path: RiverPath; width: number; waterY: number } {
  const segs: { up: Vector3; down: Vector3; width: number }[] = [];
  let waterY = 0;
  root.traverse((node) => {
    if (!RIVER_RE.test(node.name) || !(node as import('three').Mesh).isMesh) return;
    const mesh = node as import('three').Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const verts: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (!verts.some((u) => u.distanceToSquared(v) < 1e-6)) verts.push(v);
    }
    if (verts.length !== 4) throw new Error(`log course: ${node.name} is not a quad strip`);
    verts.sort((a, b) => a.distanceTo(fallPos) - b.distanceTo(fallPos));
    waterY = verts[0].y;
    segs.push({
      up: verts[0].clone().add(verts[1]).multiplyScalar(0.5),
      down: verts[2].clone().add(verts[3]).multiplyScalar(0.5),
      width: verts[0].distanceTo(verts[1]),
    });
  });
  if (segs.length === 0) throw new Error('log course: no river segments');
  segs.sort((a, b) => a.up.distanceTo(fallPos) - b.up.distanceTo(fallPos));

  const pts = [segs[0].up];
  for (let i = 0; i < segs.length - 1; i++) pts.push(segs[i].down.clone().add(segs[i + 1].up).multiplyScalar(0.5));
  pts.push(segs[segs.length - 1].down);
  const width = Math.min(...segs.map((s) => s.width));
  return { path: new RiverPath(pts), width, waterY };
}


// ── Course state ─────────────────────────────────────────────────────────────
interface Lane {
  top: number;
  speed: number;
  target: number;
  retargetIn: number;
  /** Most upstream log in the lane (the one the next spawn queues behind). */
  last: Log | null;
  nextGap: number;
}

interface Log {
  lane: number;
  n: number;
  /** Along-river position of the downstream (head) end. */
  head: number;
  mesh: Group;
  /** Spring pad meshes by node index. */
  springs: Map<number, Group>;
}

type NodeRef =
  | { kind: 'bridge'; bridge: 'south' | 'north'; lane: number }
  | { kind: 'log'; log: Log; i: number };

/** `choice` / `swim` / `climb` / `vault`: treading water after a splash, then the give-up swim out. */
export type RunnerMode = 'idle' | 'hop' | 'spring' | 'splash' | 'won' | 'out' | 'choice' | 'swim' | 'climb' | 'vault';
export type Command = 'fwd' | 'left' | 'right';

export interface FrogPose {
  position: Vector3;
  facing: number;
  anim: AnimState;
}

/** One frog on the course — the player, or a bot pretending to be one. */
export class Runner {
  mode: RunnerMode = 'idle';
  at: NodeRef;
  hopFrom = new THREE.Vector3();
  hopTo: NodeRef | null = null;
  /** Take-off point relative to the target node when the hop began — hops are flown in the
   * target log's moving frame, so the frog drifts with the log it's landing on. */
  hopRel = new THREE.Vector3();
  hopWater = new THREE.Vector3();
  /** Give-up exit: where the swim meets the fence, and where the frog lands on the bank. */
  fenceAt = new THREE.Vector3();
  landAt = new THREE.Vector3();
  hopArc = HOP_HEIGHT;
  hopTime = HOP_TIME;
  /** Direction of the current hop; a landing bump shoves the occupant this way. */
  hopCmd: Command = 'fwd';
  /** Current hop ends on the bank (bumped out) rather than a node or the water. */
  hopToBank = false;
  timer = 0;
  pending: { cmd: Command; age: number } | null = null;
  readonly pose: FrogPose = { position: new THREE.Vector3(), facing: 0, anim: 'idle' };
  /** Times this runner has fallen in. */
  splashes = 0;
  /** Bot runners: set once the win/out hold is over (player runners stop the course instead). */
  finished = false;
  /** Bot runners: splashes allowed before they give up and swim out (the player is asked instead). */
  attempts = Infinity;
  /** On the give-up swim out (vs. bumped onto the bank). */
  quitting = false;
  /** How the attempt ended, once finished: won, bumped onto the bank, or swam out. */
  outcome: 'won' | 'out' | 'quit' | null = null;
  /** Who shoved this frog on its current hop (null for its own moves). */
  bumpedBy: Runner | null = null;
  /** Progress milestones already announced this attempt. */
  milestone = 0;

  constructor(readonly isPlayer: boolean, readonly startLane: number, readonly actor: Actor) {
    this.at = { kind: 'bridge', bridge: 'south', lane: startLane };
  }
}

export interface LogCourseCallbacks {
  onStart: () => void;
  onEnd: () => void;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const logLength = (n: number) => n * NODE_SPACING;
const sameNode = (a: NodeRef, b: NodeRef) =>
  a.kind === 'bridge'
    ? b.kind === 'bridge' && a.bridge === b.bridge && a.lane === b.lane
    : b.kind === 'log' && a.log === b.log && a.i === b.i;
/** The finish rail is safe: frogs there have already won and can't be bumped. */
const isFinish = (ref: NodeRef) => ref.kind === 'bridge' && ref.bridge === 'north';
/** Frogs occupying their node (mid-hop, splashing or done frogs don't). */
const standing = (r: { mode: RunnerMode }) => r.mode === 'idle' || r.mode === 'spring';
/** Along-river position of node i (0 = upstream tail). */
const nodeOnLog = (log: Log, i: number) => log.head - logLength(log.n) + (i + 0.5) * NODE_SPACING;

function textTexture(text: string, aspect: number): import('three').CanvasTexture {
  const h = 128, w = Math.round(h * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3e3ba';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6b4428';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#3d2412';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = h * 0.62;
  ctx.font = `700 ${size}px 'Fredoka', system-ui, sans-serif`;
  while (ctx.measureText(text).width > w * 0.9) { size -= 2; ctx.font = `700 ${size}px 'Fredoka', system-ui, sans-serif`; }
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class LogCourse {
  active = false;
  private readonly player = new Runner(true, Math.floor(LANES / 2), PLAYER_ACTOR);
  private readonly botRunners: Runner[] = [];

  /** The player frog's pose (valid while active). */
  get pose(): FrogPose {
    return this.player.pose;
  }

  private readonly path: RiverPath;
  private readonly laneWidth: number;
  private readonly waterY: number;
  private readonly bridgeNodes: Record<'south' | 'north', { pos: Vector3; s: number }[]>;
  /** Per-lane along-river positions of the rails logs interact with. */
  private readonly northUpS: number[];
  private readonly northDownS: number[];
  private readonly southUpS: number[];
  private readonly sSpawn: number;
  private readonly sDespawn: number;
  /** Walkable bridge footprints carved out of the play area (XZ). */
  private readonly decks: Box3[];
  private readonly areaHalfWidth: number;
  private readonly areaEnd: number;
  private readonly areaTmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  private readonly lanes: Lane[];
  private readonly logs: Log[] = [];
  private readonly logRoot = new THREE.Group();
  private readonly logGeoms = new Map<number, import('three').CylinderGeometry>();
  private readonly nodeGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12);
  private readonly barkMat = createFlatMaterial(0x7a4a2a);
  private readonly nodeMat = createFlatMaterial(0xe0b77a);
  private readonly springCoilGeom = new THREE.CylinderGeometry(0.2, 0.24, 0.16, 12);
  private readonly springPadGeom  = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16);
  private readonly springTopGeom  = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16);
  private readonly springCoilMat  = createFlatMaterial(0x8a8f98, { metalness: 0.4, roughness: 0.4 });
  private readonly springPadMat   = createFlatMaterial(0xe0342a);
  private readonly springTopMat   = createFlatMaterial(0xffd23f);

  private pointerStart: { x: number; y: number; t: number; id: number } | null = null;
  /** Player messages ("Splash!", "Made it!", bumps) in the UI kit's felt-plaque style. */
  private readonly banner: GameBanner;
  private readonly startSignMats: import('three').Material[] = [];
  /** Retry / Give Up prompt shown after the player falls in. */
  private choice: ChoiceModal | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    scene: import('three').Scene,
    root: Object3D,
    private readonly input: HTMLElement,
    private readonly container: HTMLElement,
    private readonly cb: LogCourseCallbacks,
  ) {
    const waterfall = root.getObjectByName('water_fall');
    if (!waterfall) throw new Error('log course: missing water_fall');
    const fallPos = new THREE.Box3().setFromObject(waterfall).getCenter(new THREE.Vector3());

    const river = buildRiver(root, fallPos);
    this.path = river.path;
    this.waterY = river.waterY;
    this.laneWidth = river.width / LANES;

    const decks: { name: string; box: Box3 }[] = [];
    root.traverse((node) => {
      const m = DECK_RE.exec(node.name);
      if (m) decks.push({ name: m[1], box: new THREE.Box3().setFromObject(node) });
    });
    if (decks.length < 2) throw new Error('log course: needs two bridges');
    const dist = (b: Box3) => b.getCenter(new THREE.Vector3()).distanceTo(fallPos);
    decks.sort((a, b) => dist(a.box) - dist(b.box));
    const north = decks[0], south = decks[decks.length - 1];

    const rail = (bridge: string, nearFall: boolean): Box3 => {
      const boxes = ['a', 'b']
        .map((s) => root.getObjectByName(`prop_bridge_${bridge}_rail_${s}`))
        .filter((r): r is Object3D => !!r)
        .map((r) => new THREE.Box3().setFromObject(r));
      if (boxes.length === 0) throw new Error(`log course: bridge ${bridge} has no rails`);
      boxes.sort((a, b) => dist(a) - dist(b));
      return nearFall ? boxes[0] : boxes[boxes.length - 1];
    };
    const startRail = rail(south.name, true);
    const finishRail = rail(north.name, false);
    this.bridgeNodes = {
      south: this.railNodes(startRail),
      north: this.railNodes(finishRail),
    };

    this.northUpS   = this.railNodes(rail(north.name, true)).map((n) => n.s);
    this.northDownS = this.bridgeNodes.north.map((n) => n.s);
    this.southUpS   = this.bridgeNodes.south.map((n) => n.s);
    this.sSpawn   = Math.min(...this.northUpS) - EMERGE_CLEAR - EMERGE_LEN;
    this.decks = decks.map((d) => d.box.clone().expandByVector(new THREE.Vector3(DECK_MARGIN, 0, DECK_MARGIN)));
    this.areaHalfWidth = river.width / 2 + AREA_MARGIN;
    this.areaEnd = Math.max(...this.southUpS);
    this.sDespawn = Math.max(...this.southUpS) - DIVE_LEAD + DIVE_LEN;

    const tops = [...LANE_SPEEDS].sort(() => Math.random() - 0.5);
    this.lanes = Array.from({ length: LANES }, (_, i) => {
      const top = tops[i % tops.length];
      const speed = rand(top * LANE_SLOWEST, top);
      return { top, speed, target: speed, retargetIn: rand(...SPEED_RETARGET), last: null, nextGap: 0 };
    });

    this.logRoot.name = 'log_course';
    scene.add(this.logRoot);
    const mid = Math.floor(LANES / 2);
    const startSign = this.buildArch(startRail, START_SIGN, this.bridgeNodes.south[mid].pos);
    startSign.traverse((o) => {
      const m = (o as import('three').Mesh).material;
      if (m) this.startSignMats.push(m as import('three').Material);
    });
    scene.add(startSign, this.buildArch(finishRail, FINISH_SIGN, this.bridgeNodes.north[mid].pos));
    this.buildFence(scene);
    this.prefill();

    this.banner = new GameBanner(container, { top: 0.2 });
  }

  /**
   * A simple wooden railing tracing the play-area boundary — the same corridor
   * `inPlayArea` blocks (path centreline ± areaHalfWidth, from sSpawn to
   * areaEnd), with gaps where the bridge decks cross so players can still step
   * onto them. Purely decorative: the invisible wall already does the blocking.
   */
  private buildFence(scene: import('three').Scene): void {
    const STEP = 2.2;              // spacing between posts (world units of arc)
    const POST_H = FENCE_HEIGHT;   // rail height above the water line
    const postGeom = new THREE.BoxGeometry(0.16, POST_H + 0.4, 0.16);
    const postMat = createFlatMaterial(0x8a5a34);
    const railMat = createFlatMaterial(0xb07a45);
    const fence = new THREE.Group();
    fence.name = 'river_fence';

    const c = new THREE.Vector3(), r = new THREE.Vector3();
    const inDeck = (x: number, z: number): boolean =>
      this.decks.some((b) => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z);

    for (const side of [-1, 1]) {
      let prev: Vector3 | null = null;
      for (let s = this.sSpawn; s <= this.areaEnd + 1e-3; s += STEP) {
        this.path.pointAt(s, c);
        this.path.rightAt(s, r);
        const px = c.x + r.x * side * this.areaHalfWidth;
        const pz = c.z + r.z * side * this.areaHalfWidth;
        if (inDeck(px, pz)) { prev = null; continue; } // gap at the bridge

        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(px, this.waterY + POST_H / 2, pz);
        post.castShadow = true;
        fence.add(post);

        const here = new THREE.Vector3(px, 0, pz);
        if (prev) {
          this.addRail(fence, prev, here, this.waterY + POST_H - 0.15, railMat);
          this.addRail(fence, prev, here, this.waterY + POST_H * 0.55, railMat);
        }
        prev = here;
      }
    }
    scene.add(fence);
  }

  /** One horizontal rail bar spanning two posts on the same bank. */
  private addRail(
    group: import('three').Group, a: Vector3, b: Vector3, y: number,
    mat: import('three').Material,
  ): void {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01 || len > FENCE_RAIL_MAX) return; // skip if the span jumped a gap
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.11, 0.11), mat);
    bar.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    bar.rotation.y = Math.atan2(-dz, dx); // align the box's +X with (dx,dz) in three's Y-up
    bar.castShadow = true;
    group.add(bar);
  }

  /** The "River Log Course" start arch (middle of the south bank rail) — the walk-up entry point. */
  startGatePoint(out: Vector3): Vector3 {
    const n = this.bridgeNodes.south;
    return out.copy(n[Math.floor(n.length / 2)].pos);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  start(): void {
    if (this.active) return;
    this.active = true;
    this.setStartSignOpacity(START_SIGN_PLAY_OPACITY);
    this.resetToStart(this.player);
    gameEvents.emit({ type: 'course_start', actor: PLAYER_ACTOR, pos: this.player.pose.position });
    window.addEventListener('keydown', this.onKeyDown);
    this.input.addEventListener('pointerdown', this.onPointerDown);
    this.input.addEventListener('pointerup', this.onPointerUp);
    this.cb.onStart();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.setStartSignOpacity(1);
    this.banner.hide();
    this.choice?.close();
    this.choice = null;
    window.removeEventListener('keydown', this.onKeyDown);
    this.input.removeEventListener('pointerdown', this.onPointerDown);
    this.input.removeEventListener('pointerup', this.onPointerUp);
    this.cb.onEnd();
  }

  /** Advance logs (always), the player frog (while active) and bot runners. */
  update(dt: number): void {
    this.updateLogs(dt);
    this.banner.update(dt);
    if (this.active) this.step(this.player, dt);
    for (const r of this.botRunners) this.step(r, dt);
  }

  status(): string {
    const at = this.player.at;
    const where = at.kind === 'bridge' ? `${at.bridge} bridge` : `log node ${at.i + 1}/${at.log.n}`;
    return `log course: ${this.player.mode}  lane ${this.laneOf(at)}  ${where}  logs ${this.logs.length}  bots ${this.botRunners.length}`;
  }

  // ── Bot runners ────────────────────────────────────────────────────────────
  /** Number of bot runners currently on the course. */
  get botRunnerCount(): number {
    return this.botRunners.length;
  }

  /** Least-crowded start lane (ties broken randomly). */
  pickStartLane(): number {
    const counts = Array.from({ length: LANES }, (_, lane) =>
      this.botRunners.filter((r) => this.laneOf(r.at) === lane).length + Math.random() * 0.5);
    return counts.indexOf(Math.min(...counts));
  }

  /** World position of a start-rail node — where a bot walks to before joining. */
  startPosition(lane: number, out: Vector3): Vector3 {
    return out.copy(this.bridgeNodes.south[lane].pos);
  }

  /** World position of a finish-rail node. */
  finishPosition(lane: number, out: Vector3): Vector3 {
    return out.copy(this.bridgeNodes.north[lane].pos);
  }

  addBotRunner(lane: number, actor: Actor, attempts = Infinity): Runner {
    const r = new Runner(false, lane, actor);
    r.attempts = attempts;
    this.botRunners.push(r);
    this.resetToStart(r);
    gameEvents.emit({ type: 'course_start', actor, pos: r.pose.position });
    return r;
  }

  removeBotRunner(r: Runner): void {
    const i = this.botRunners.indexOf(r);
    if (i >= 0) this.botRunners.splice(i, 1);
  }

  /** Queue a hop for a bot runner (same buffering as player input). */
  command(r: Runner, cmd: Command): void {
    r.pending = { cmd, age: 0 };
  }

  /**
   * What a command would do right now: 'ok' (safe landing), 'occupied'
   * (safe, but another frog is there or headed there), or 'none'.
   */
  probe(r: Runner, cmd: Command): 'ok' | 'occupied' | 'none' {
    if (r.mode !== 'idle') return 'none';
    const d = cmd === 'left' ? -1 : cmd === 'right' ? 1 : 0;
    const lane = this.laneOf(r.at) + d;
    if (lane < 0 || lane >= LANES) return 'none';
    const target = d === 0 ? this.forwardTarget(r) : this.lateralTarget(r, d);
    if (!target) return 'none';
    return this.isTaken(target, r) ? 'occupied' : 'ok';
  }

  /**
   * Whether (x, z) is inside the course's play area — the river from where
   * logs surface down to the start rail, minus the bridge decks. Only runners
   * belong there; free-roam movement treats it as a wall.
   */
  inPlayArea(x: number, z: number): boolean {
    for (const b of this.decks) {
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) return false;
    }
    const [p, c, r] = this.areaTmp;
    const s = this.path.project(p.set(x, 0, z));
    if (s < this.sSpawn || s > this.areaEnd) return false;
    this.path.pointAt(s, c);
    this.path.rightAt(s, r);
    return Math.abs((x - c.x) * r.x + (z - c.z) * r.z) < this.areaHalfWidth;
  }

  /** Nearest spot on the bank outside the play area (for anyone found inside it). */
  ejectPoint(x: number, z: number, out: Vector3): Vector3 {
    const [p, c, r] = this.areaTmp;
    const s = this.path.project(p.set(x, 0, z));
    this.path.pointAt(s, c);
    this.path.rightAt(s, r);
    const side = Math.sign((x - c.x) * r.x + (z - c.z) * r.z) || 1;
    return this.bankWorld(s, side, out);
  }

  /** True when a runner's log node will sink within `seconds`. */
  inDanger(r: Runner, seconds: number): boolean {
    return r.at.kind === 'log' && !this.afloat(r.at.log, r.at.i, seconds);
  }

  private isTaken(ref: NodeRef, self: Runner): boolean {
    if (isFinish(ref)) return false;
    return this.runners().some((o) => o !== self &&
      ((standing(o) && sameNode(o.at, ref)) || (o.mode === 'hop' && !!o.hopTo && sameNode(o.hopTo, ref))));
  }

  private runners(): Runner[] {
    return this.active ? [this.player, ...this.botRunners] : this.botRunners;
  }

  private step(r: Runner, dt: number): void {
    r.timer += dt;
    switch (r.mode) {
      case 'idle':
        if (r.at.kind === 'log' && this.depthAt(this.nodeS(r.at), r.at.log.lane) > DROWN_DEPTH) { this.splash(r); break; }
        if (r.pending) {
          r.pending.age += dt;
          this.tryCommand(r);
        }
        break;
      case 'hop':
        if (r.timer >= r.hopTime) this.land(r);
        break;
      case 'spring':
        if (r.timer >= SPRING_DELAY) this.launchSpring(r);
        break;
      case 'splash':
        if (r.timer >= SPLASH_TIME) {
          if (r.isPlayer) this.offerRetry(r);
          else if (++r.splashes >= r.attempts) this.treadWater(r); // out of attempts: swim for it
          else this.resetToStart(r);
        }
        break;
      case 'choice':
        // The player treads water until the prompt is answered; a bot just surfaces and goes.
        if (!r.isPlayer && r.timer >= SURFACE_TIME) this.giveUp(r);
        break;
      case 'swim':
        if (r.timer >= r.hopTime) { r.mode = 'climb'; r.timer = 0; }
        break;
      case 'climb':
        if (r.timer >= CLIMB_TIME) { r.mode = 'vault'; r.timer = 0; }
        break;
      case 'vault':
        if (r.timer >= VAULT_TIME) {
          // Reuse the bumped-out beat on the bank, which ends the run.
          r.hopWater.copy(r.landAt);
          r.mode = 'out';
          r.timer = 0;
        }
        break;
      case 'won':
      case 'out':
        if (r.timer >= (r.mode === 'won' ? WIN_HOLD : OUT_HOLD)) {
          // (A bot swimming out reports course_quit from the bot manager instead.)
          if (r.mode === 'out' && (r.isPlayer || !r.quitting)) {
            gameEvents.emit({ type: 'course_lose', actor: r.actor, pos: r.pose.position });
          }
          if (r.isPlayer) this.stop();
          else { r.finished = true; r.outcome = r.mode === 'won' ? 'won' : r.quitting ? 'quit' : 'out'; }
        }
        break;
    }
    this.updatePose(r);
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  private queue(cmd: Command): void {
    this.player.pending = { cmd, age: 0 };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') this.queue('fwd');
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.queue('left');
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.queue('right');
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const p = this.pointerStart;
    this.pointerStart = null;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      this.queue(dx < 0 ? 'left' : 'right');
    } else if (Math.hypot(dx, dy) <= TAP_MAX_PX && performance.now() - p.t <= TAP_MAX_MS) {
      this.queue('fwd');
    }
  };

  /** Run the buffered command once it has a target; give up after INPUT_BUFFER. */
  private tryCommand(r: Runner): void {
    const p = r.pending!;
    const d = p.cmd === 'left' ? -1 : p.cmd === 'right' ? 1 : 0;
    const lane = this.laneOf(r.at) + d;
    // The river banks are walls: sideways presses past the edge lanes do nothing.
    if (lane < 0 || lane >= LANES) { r.pending = null; return; }
    const target = d === 0 ? this.forwardTarget(r) : this.lateralTarget(r, d);
    if (target) {
      r.pending = null;
      this.beginHop(r, target, d === 0 ? HOP_HEIGHT : SIDE_HEIGHT, p.cmd);
    } else if (p.age >= INPUT_BUFFER) {
      r.pending = null;
      // From a log, a press with nothing to land on commits to the water;
      // bridges never do.
      if (r.at.kind !== 'log') return;
      const s = this.nodeS(r.at);
      if (d === 0) this.beginWaterHop(r, lane, s - NODE_SPACING * 2, HOP_HEIGHT);
      else this.beginWaterHop(r, lane, s, SIDE_HEIGHT);
    }
  }

  /**
   * Shove a standing frog one move in `cmd`'s direction, as if it had pressed
   * it: onto the next node (which may bump someone else in turn), into the
   * water if there's nothing to land on, or onto the bank past an edge lane.
   */
  private bump(r: Runner, cmd: Command, by: Runner): void {
    r.pending = null;
    if (by.isPlayer) this.banner.show('Bump!', `You bumped out ${r.actor.name}`, 'good', BUMP_MSG_TIME);
    else if (r.isPlayer) this.banner.show('Bumped!', `by ${by.actor.name}`, 'bad', BUMP_MSG_TIME);
    const d = cmd === 'left' ? -1 : cmd === 'right' ? 1 : 0;
    const arc = (d === 0 ? HOP_HEIGHT : SIDE_HEIGHT) * BUMP_ARC;
    const time = HOP_TIME * BUMP_TIME;
    const lane = this.laneOf(r.at) + d;
    if (lane < 0 || lane >= LANES) {
      this.nodeWorld(r.at, r.hopFrom);
      this.bankWorld(this.nodeS(r.at), d, r.hopWater);
      r.hopTo = null;
      r.hopToBank = true;
      r.hopArc = arc;
      r.hopTime = time;
      r.hopCmd = cmd;
      r.mode = 'hop';
      r.timer = 0;
    } else {
      const target = d === 0 ? this.forwardTarget(r) : this.lateralTarget(r, d);
      if (target) {
        this.beginHop(r, target, arc, cmd, time);
      } else {
        const s = this.nodeS(r.at);
        this.beginWaterHop(r, lane, d === 0 ? s - NODE_SPACING * 2 : s, arc);
        r.hopTime = time;
        r.hopCmd = cmd;
      }
    }
    r.bumpedBy = by;
    gameEvents.emit({
      type: 'course_bump', actor: by.actor, target: r.actor, pos: this.nodeWorld(r.at, this.tmp),
      result: r.hopToBank ? 'bank' : r.hopTo ? 'node' : 'water',
    });
  }

  // ── Frog ───────────────────────────────────────────────────────────────────
  private resetToStart(r: Runner): void {
    r.at = { kind: 'bridge', bridge: 'south', lane: r.startLane };
    r.mode = 'idle';
    r.timer = 0;
    r.pending = null;
    r.hopToBank = false;
    r.quitting = false;
    r.bumpedBy = null;
    r.milestone = 0;
    if (r.isPlayer) this.banner.hide();
    this.updatePose(r);
  }

  private laneOf(ref: NodeRef): number {
    return ref.kind === 'bridge' ? ref.lane : ref.log.lane;
  }

  private nodeS(ref: NodeRef): number {
    return ref.kind === 'bridge' ? this.bridgeNodes[ref.bridge][ref.lane].s : nodeOnLog(ref.log, ref.i);
  }

  /** Along-river speed of whatever the node rides on. */
  private nodeSpeed(ref: NodeRef): number {
    return ref.kind === 'bridge' ? 0 : this.lanes[ref.log.lane].speed;
  }

  private nodeWorld(ref: NodeRef, out: Vector3): Vector3 {
    if (ref.kind === 'bridge') return out.copy(this.bridgeNodes[ref.bridge][ref.lane].pos);
    const local = -logLength(ref.log.n) / 2 + (ref.i + 0.5) * NODE_SPACING;
    const lift = ref.log.springs.has(ref.i) ? SPRING_HEIGHT : 0;
    return ref.log.mesh.localToWorld(out.set(0, LOG_RADIUS + lift, local));
  }

  /** Whether a log node is afloat now and will be until shortly after a landing `flight` seconds away. */
  private afloat(log: Log, i: number, flight = HOP_TIME): boolean {
    const s = nodeOnLog(log, i);
    const later = s + this.lanes[log.lane].speed * (flight + LAND_GRACE);
    return this.depthAt(s, log.lane) < AFLOAT_DEPTH && this.depthAt(later, log.lane) < AFLOAT_DEPTH;
  }

  /** Nearest node straight ahead in the frog's lane, compared where both will be at landing. */
  private forwardTarget(r: Runner): NodeRef | null {
    const lane = this.laneOf(r.at);
    const reach = r.at.kind === 'bridge' ? MAX_HOP_BRIDGE : MAX_HOP;
    const curS = this.nodeS(r.at) + this.nodeSpeed(r.at) * HOP_TIME;
    let best: NodeRef | null = null, bestD = reach;
    const consider = (ref: NodeRef, s: number) => {
      const d = curS - s;
      if (d > 0.3 && d <= bestD) { bestD = d; best = ref; }
    };
    const land = this.lanes[lane].speed * HOP_TIME;
    for (const log of this.logs) {
      if (log.lane !== lane) continue;
      for (let i = 0; i < log.n; i++) {
        if (this.afloat(log, i)) consider({ kind: 'log', log, i }, nodeOnLog(log, i) + land);
      }
    }
    consider({ kind: 'bridge', bridge: 'north', lane }, this.bridgeNodes.north[lane].s);
    return best;
  }

  /** Nearest node in the neighbouring lane, compared where both will be at landing. */
  private lateralTarget(r: Runner, d: number): NodeRef | null {
    const lane = this.laneOf(r.at) + d;
    if (lane < 0 || lane >= LANES) return null;
    if (r.at.kind === 'bridge') return { kind: 'bridge', bridge: r.at.bridge, lane };
    const curS = this.nodeS(r.at) + this.nodeSpeed(r.at) * HOP_TIME;
    let best: NodeRef | null = null, bestD = LATERAL_REACH;
    for (const log of this.logs) {
      if (log.lane !== lane) continue;
      const land = this.lanes[lane].speed * HOP_TIME;
      for (let i = 0; i < log.n; i++) {
        const off = Math.abs(nodeOnLog(log, i) + land - curS);
        if (off <= bestD && this.afloat(log, i)) { bestD = off; best = { kind: 'log', log, i }; }
      }
    }
    return best;
  }

  private beginHop(r: Runner, target: NodeRef, arc: number, cmd: Command, time = HOP_TIME): void {
    this.nodeWorld(r.at, r.hopFrom);
    r.hopRel.subVectors(r.hopFrom, this.nodeWorld(target, this.tmp));
    r.hopTo = target;
    r.hopCmd = cmd;
    r.hopToBank = false;
    r.bumpedBy = null;
    r.hopArc = arc;
    r.hopTime = time;
    r.mode = 'hop';
    r.timer = 0;
  }

  /**
   * Afloat node about SPRING_NODES ahead in the same lane at landing time, or
   * the finish rail if it's within range. Null when nothing safe is in range.
   */
  private springTarget(r: Runner): NodeRef | null {
    if (r.at.kind !== 'log') return null;
    const lane = r.at.log.lane;
    const fromS = this.nodeS(r.at);
    const lo = SPRING_MIN * NODE_SPACING, hi = SPRING_MAX * NODE_SPACING, ideal = SPRING_NODES * NODE_SPACING;
    const finishD = fromS - this.bridgeNodes.north[lane].s;
    if (finishD > 0 && finishD <= hi) return { kind: 'bridge', bridge: 'north', lane };
    const drift = this.lanes[lane].speed * SPRING_TIME;
    let best: NodeRef | null = null, bestErr = Infinity;
    for (const log of this.logs) {
      if (log.lane !== lane) continue;
      for (let i = 0; i < log.n; i++) {
        const d = fromS - (nodeOnLog(log, i) + drift);
        if (d < lo || d > hi || !this.afloat(log, i, SPRING_TIME)) continue;
        const err = Math.abs(d - ideal);
        if (err < bestErr) { bestErr = err; best = { kind: 'log', log, i }; }
      }
    }
    return best;
  }

  private launchSpring(r: Runner): void {
    const target = this.springTarget(r);
    if (!target) { r.mode = 'idle'; return; } // nothing safe ahead: the pad stays inert
    if (r.at.kind === 'log') r.at.log.springs.get(r.at.i)?.scale.set(1, 0.35, 1);
    this.beginHop(r, target, SPRING_ARC, 'fwd', SPRING_TIME);
    gameEvents.emit({ type: 'course_spring', actor: r.actor, pos: r.hopFrom });
  }

  private beginWaterHop(r: Runner, lane: number, s: number, arc: number): void {
    this.nodeWorld(r.at, r.hopFrom);
    this.laneWorld(s, lane, r.hopWater).setY(this.waterY);
    r.hopTo = null;
    r.hopToBank = false;
    r.bumpedBy = null;
    r.hopArc = arc;
    r.hopTime = HOP_TIME;
    r.mode = 'hop';
    r.timer = 0;
  }

  private land(r: Runner): void {
    const target = r.hopTo;
    if (r.hopToBank) {
      r.mode = 'out';
      r.timer = 0;
      if (r.isPlayer) this.banner.show('Bumped out!', r.bumpedBy ? `by ${r.bumpedBy.actor.name}` : '', 'bad');
      gameEvents.emit({ type: 'course_bumped_out', actor: r.actor, pos: r.hopWater, by: r.bumpedBy?.actor ?? null });
      return;
    }
    if (!target) { this.splash(r); return; }
    r.at = target;
    gameEvents.emit({ type: 'course_hop', actor: r.actor, pos: this.nodeWorld(target, this.tmp) });
    r.mode = 'idle';
    r.timer = 0;
    r.bumpedBy = null; // landed safely: later falls are on them
    // Bump-out: anyone standing here gets shoved the way we just moved.
    if (!isFinish(target)) {
      for (const o of this.runners()) {
        if (o !== r && standing(o) && sameNode(o.at, target)) this.bump(o, r.hopCmd, r);
      }
    }
    if (target.kind === 'log' && target.log.springs.has(target.i)) {
      r.mode = 'spring';
      r.pending = null;
    }
    if (target.kind === 'bridge' && target.bridge === 'north') {
      r.mode = 'won';
      r.pending = null;
      if (r.isPlayer) this.banner.show('Made it!', 'You crossed the river!', 'good');
      gameEvents.emit({ type: 'course_win', actor: r.actor, pos: this.nodeWorld(target, this.tmp), splashes: r.splashes });
    } else if (target.kind === 'log') {
      const lane = target.log.lane;
      const from = this.bridgeNodes.south[lane].s, to = this.bridgeNodes.north[lane].s;
      const progress = (from - this.nodeS(target)) / (from - to);
      if (r.milestone < MILESTONES.length && progress >= MILESTONES[r.milestone]) {
        gameEvents.emit({
          type: 'course_progress', actor: r.actor, pos: this.nodeWorld(target, this.tmp), progress: MILESTONES[r.milestone],
        });
        while (r.milestone < MILESTONES.length && progress >= MILESTONES[r.milestone]) r.milestone++;
      }
    }
  }

  private splash(r: Runner): void {
    if (r.hopTo === null && r.mode === 'hop') r.hopFrom.copy(r.hopWater);
    else this.nodeWorld(r.at, r.hopFrom);
    r.mode = 'splash';
    r.timer = 0;
    r.pending = null;
    if (r.isPlayer) this.banner.show('Splash!', r.bumpedBy ? `Bumped out by ${r.bumpedBy.actor.name}` : '', 'bad');
    gameEvents.emit({
      type: 'course_splash', actor: r.actor, pos: r.hopFrom, bumpedBy: r.bumpedBy?.actor ?? null, splashes: r.splashes,
    });
  }

  /** After a splash: bob back up and tread water (`choice` mode) where the frog fell in. */
  private treadWater(r: Runner): void {
    r.mode = 'choice';
    r.timer = 0;
    r.pending = null;
    // Let go of the log so it can drift off; the pose now comes from hopFrom.
    r.at = { kind: 'bridge', bridge: 'south', lane: r.startLane };
  }

  /** After the player's splash: tread water and ask whether to retry or give up. */
  private offerRetry(r: Runner): void {
    this.treadWater(r);
    this.banner.hide();
    this.choice = showChoiceModal(this.container, {
      title: 'Splash!',
      message: 'Hop back on the logs, or swim for the bank?',
      secondary: 'Give Up',
      primary: 'Retry',
    }, {
      onPrimary: () => {
        this.choice = null;
        if (!this.active || r.mode !== 'choice') return;
        r.splashes++;
        this.resetToStart(r);
      },
      onSecondary: () => {
        this.choice = null;
        if (!this.active || r.mode !== 'choice') return;
        this.giveUp(r);
      },
    });
  }

  /** Swim to the nearest bank (skipping bridge gaps in the fence), then climb over onto land. */
  private giveUp(r: Runner): void {
    r.quitting = true;
    const start = this.tmp.copy(r.hopFrom).setY(this.waterY - SWIM_SINK);
    const [c, rt] = this.areaTmp;
    const s0 = this.path.project(start);
    this.path.pointAt(s0, c);
    this.path.rightAt(s0, rt);
    const side = Math.sign((start.x - c.x) * rt.x + (start.z - c.z) * rt.z) || 1;
    const inDeck = (p: Vector3) =>
      this.decks.some((b) => p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z);
    // Nearest along-river spot whose fence and bank are clear of the bridges.
    let s = s0;
    for (let k = 0; k <= 40; k++) {
      const cand = s0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
      if (cand < this.sSpawn || cand > this.areaEnd) continue;
      this.fencePoint(cand, side, r.fenceAt);
      this.bankWorld(cand, side, r.landAt);
      if (!inDeck(r.fenceAt) && !inDeck(r.landAt)) { s = cand; break; }
    }
    this.fencePoint(s, side, r.fenceAt);
    this.bankWorld(s, side, r.landAt);
    r.hopFrom.copy(start);
    r.hopTime = Math.max(0.3, start.distanceTo(r.fenceAt) / SWIM_SPEED);
    r.mode = 'swim';
    r.timer = 0;
  }

  /** Just inside the fence on side `d`, at swimming depth. */
  private fencePoint(s: number, d: number, out: Vector3): Vector3 {
    const r = this.path.rightAt(s, new THREE.Vector3());
    return this.path.pointAt(s, out).addScaledVector(r, d * (this.areaHalfWidth - FENCE_INSET)).setY(this.waterY - SWIM_SINK);
  }

  private updatePose(r: Runner): void {
    const p = r.pose.position;
    let s: number;
    if (r.mode === 'hop') {
      const t = Math.min(1, r.timer / r.hopTime);
      if (r.hopTo) {
        // Fly in the target log's frame: start at the take-off offset, close it to zero, so the
        // frog rides the log's drift the whole way and lands exactly on the node.
        this.nodeWorld(r.hopTo, p).addScaledVector(r.hopRel, 1 - t);
      } else {
        p.lerpVectors(r.hopFrom, r.hopWater, t);
      }
      p.y += 4 * r.hopArc * t * (1 - t);
      s = r.hopTo ? this.nodeS(r.hopTo) : this.nodeS(r.at);
      r.pose.anim = t < 0.5 ? 'jumping_up' : 'falling_idle';
    } else if (r.mode === 'out') {
      p.copy(r.hopWater);
      s = this.path.project(p);
      r.pose.anim = r.timer < 0.5 ? 'hard_landing' : 'idle';
    } else if (r.mode === 'splash') {
      p.copy(r.hopFrom);
      p.y = Math.min(r.hopFrom.y, this.waterY) - 2 * (r.timer / SPLASH_TIME);
      s = this.path.project(p);
      r.pose.anim = 'falling_idle';
    } else if (r.mode === 'choice') {
      // Bob back up from the splash and tread water.
      const under = Math.min(r.hopFrom.y, this.waterY) - 2;
      const surface = this.waterY - SWIM_SINK + SWIM_BOB * Math.sin(r.timer * 3);
      p.copy(r.hopFrom);
      p.y = under + (surface - under) * smoothstep(0, SURFACE_TIME, r.timer);
      s = this.path.project(p);
      r.pose.anim = 'idle';
    } else if (r.mode === 'swim' || r.mode === 'climb' || r.mode === 'vault') {
      const dir = this.tmp;
      if (r.mode === 'swim') {
        p.lerpVectors(r.hopFrom, r.fenceAt, Math.min(1, r.timer / r.hopTime));
        p.y += SWIM_BOB * Math.sin(r.timer * 6);
        dir.subVectors(r.fenceAt, r.hopFrom);
        r.pose.anim = 'walking';
      } else if (r.mode === 'climb') {
        const t = smoothstep(0, 1, r.timer / CLIMB_TIME);
        p.copy(r.fenceAt);
        p.y += (this.waterY + FENCE_HEIGHT - r.fenceAt.y) * t; // up to the rail top
        dir.subVectors(r.landAt, r.fenceAt);
        r.pose.anim = 'jumping_up';
      } else {
        const t = Math.min(1, r.timer / VAULT_TIME);
        const top = this.waterY + FENCE_HEIGHT;
        p.lerpVectors(r.fenceAt, r.landAt, t);
        p.y = top + (r.landAt.y - top) * t + 4 * VAULT_ARC * t * (1 - t);
        dir.subVectors(r.landAt, r.fenceAt);
        r.pose.anim = 'falling_idle';
      }
      r.pose.facing = Math.atan2(dir.x, dir.z);
      return;
    } else {
      this.nodeWorld(r.at, p);
      s = this.nodeS(r.at);
      r.pose.anim = 'idle';
    }
    const t = this.path.tangentAt(s, this.tmp);
    r.pose.facing = Math.atan2(-t.x, -t.z);
  }

  // ── River geometry helpers ─────────────────────────────────────────────────
  private laneOffset(lane: number): number {
    return (lane - (LANES - 1) / 2) * this.laneWidth;
  }

  private laneWorld(s: number, lane: number, out: Vector3): Vector3 {
    const r = this.path.rightAt(s, new THREE.Vector3());
    return this.path.pointAt(s, out).addScaledVector(r, this.laneOffset(lane));
  }

  /** A point on the bank just past the river edge on side `d` (-1 left, +1 right). */
  private bankWorld(s: number, d: number, out: Vector3): Vector3 {
    const r = this.path.rightAt(s, new THREE.Vector3());
    const offset = d * ((LANES / 2) * this.laneWidth + BANK_CLEAR);
    return this.path.pointAt(s, out).addScaledVector(r, offset).setY(this.waterY);
  }

  /** How far below the surface the river pulls a log at `s` (0 = floating). */
  private depthAt(s: number, lane: number): number {
    const up = this.northUpS[lane], down = this.northDownS[lane];
    const emergeStart = up - EMERGE_CLEAR - EMERGE_LEN;
    const emerge = 1 - smoothstep(emergeStart, emergeStart + EMERGE_LEN, s);
    const under = smoothstep(up - UNDER_EASE, up, s) * (1 - smoothstep(down, down + UNDER_EASE, s));
    const diveStart = this.southUpS[lane] - DIVE_LEAD;
    const dive = smoothstep(diveStart, diveStart + DIVE_LEN, s);
    return Math.max(SINK_DEPTH * emerge, UNDER_DEPTH * under, SINK_DEPTH * dive);
  }

  /** Nodes on a rail where each lane's flow line crosses the rail's long axis. */
  private railNodes(rail: Box3): { pos: Vector3; s: number }[] {
    const rc = rail.getCenter(new THREE.Vector3());
    const size = rail.getSize(new THREE.Vector3());
    const ax = size.x > size.z ? 1 : 0, az = 1 - ax;
    const s0 = this.path.project(rc);
    const t = this.path.tangentAt(s0, new THREE.Vector3());
    const nodes: { pos: Vector3; s: number }[] = [];
    for (let lane = 0; lane < LANES; lane++) {
      const lp = this.laneWorld(s0, lane, new THREE.Vector3());
      // Solve rc + k*axis = lp + m*t in XZ.
      const denom = ax * t.z - az * t.x;
      const k = Math.abs(denom) > 1e-6 ? ((lp.x - rc.x) * t.z - (lp.z - rc.z) * t.x) / denom : 0;
      const pos = new THREE.Vector3(rc.x + ax * k, rail.max.y, rc.z + az * k);
      nodes.push({ pos, s: this.path.project(pos) });
    }
    return nodes;
  }

  // ── Signage ────────────────────────────────────────────────────────────────
  private setStartSignOpacity(opacity: number): void {
    for (const m of new Set(this.startSignMats)) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      m.needsUpdate = true;
    }
  }

  /** Banner on two posts spanning a rail, text on both faces, centred on `over`. */
  private buildArch(rail: Box3, text: string, over: Vector3): Group {
    const rc = rail.getCenter(new THREE.Vector3());
    const size = rail.getSize(new THREE.Vector3());
    const alongX = size.x > size.z;
    const width = alongX ? size.x : size.z;
    const t = this.path.tangentAt(this.path.project(rc), new THREE.Vector3());
    // Banner normal: perpendicular to the rail, on the downstream side.
    const nx = alongX ? 0 : Math.sign(t.x) || 1;
    const nz = alongX ? Math.sign(t.z) || 1 : 0;

    const arch = new THREE.Group();
    arch.name = `sign_${text}`;
    arch.position.set(rc.x, rail.max.y, rc.z);
    arch.rotation.y = Math.atan2(nx, nz);

    const wood = createFlatMaterial(0x6b4428);
    const top = SIGN_CLEARANCE + SIGN_HEIGHT;
    const postH = top + (rail.max.y - rail.min.y) + 0.2;
    const postGeom = new THREE.BoxGeometry(0.22, postH, 0.22);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, wood);
      post.position.set(side * (width / 2 + 0.15), top - postH / 2 + 0.1, 0);
      post.castShadow = true;
      arch.add(post);
    }

    const board = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, SIGN_HEIGHT, 0.12), wood);
    board.position.y = SIGN_CLEARANCE + SIGN_HEIGHT / 2;
    board.castShadow = true;
    arch.add(board);

    const faceW = Math.min(width, SIGN_TEXT_W);
    const faceH = SIGN_HEIGHT * 0.84;
    const faceGeom = new THREE.PlaneGeometry(faceW, faceH);
    const faceMat = new THREE.MeshBasicMaterial({ map: textTexture(text, faceW / faceH) });
    const offset = alongX ? over.x - rc.x : over.z - rc.z;
    const localX = Math.max(-(width - faceW) / 2, Math.min((width - faceW) / 2, offset * (alongX ? Math.cos(arch.rotation.y) : -Math.sin(arch.rotation.y))));
    // Text on both sides of the board, each reading left-to-right from its side.
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(faceGeom, faceMat);
      face.position.set(localX, board.position.y, 0.065 * side);
      if (side < 0) face.rotation.y = Math.PI;
      arch.add(face);
    }
    return arch;
  }

  // ── Logs ───────────────────────────────────────────────────────────────────
  private prefill(): void {
    // Walk each lane upstream from the despawn point, laying logs with gaps.
    this.lanes.forEach((lane, idx) => {
      let head = this.sDespawn + rand(0, NODE_SPACING * 3);
      while (head > this.sSpawn) {
        const log = this.spawnLog(idx, head);
        head = head - logLength(log.n) - this.pickGap();
      }
      lane.nextGap = this.pickGap();
    });
  }

  private pickGap(): number {
    const [lo, hi] = Math.random() < BIG_GAP_CHANCE ? BIG_GAP : SMALL_GAP;
    return rand(lo, hi);
  }

  private spawnLog(lane: number, head: number): Log {
    const n = MIN_NODES + Math.floor(Math.random() * (MAX_NODES - MIN_NODES + 1));
    const springAt = new Set<number>();
    for (let i = 0; i < n; i++) if (Math.random() < SPRING_CHANCE) springAt.add(i);
    const { mesh, springs } = this.buildLogMesh(n, springAt);
    const log: Log = { lane, n, head, mesh, springs };
    this.logRoot.add(log.mesh);
    this.logs.push(log);
    this.lanes[lane].last = log;
    this.placeLog(log);
    return log;
  }

  private updateLogs(dt: number): void {
    for (const lane of this.lanes) {
      lane.retargetIn -= dt;
      if (lane.retargetIn <= 0) {
        lane.target = rand(lane.top * LANE_SLOWEST, lane.top);
        lane.retargetIn = rand(...SPEED_RETARGET);
      }
      lane.speed += (lane.target - lane.speed) * (1 - Math.exp(-dt / SPEED_EASE));
    }
    const rebound = 1 - Math.exp(-dt * 10);
    for (const log of this.logs) {
      log.head += this.lanes[log.lane].speed * dt;
      for (const spring of log.springs.values()) spring.scale.y += (1 - spring.scale.y) * rebound;
    }

    this.lanes.forEach((lane, idx) => {
      const last = lane.last;
      const tail = last ? last.head - logLength(last.n) : Infinity;
      if (tail - lane.nextGap >= this.sSpawn) {
        this.spawnLog(idx, last ? tail - lane.nextGap : this.sSpawn);
        lane.nextGap = this.pickGap();
      }
    });

    for (let i = this.logs.length - 1; i >= 0; i--) {
      const log = this.logs[i];
      const onIt = this.runners().some((r) => r.at.kind === 'log' && r.at.log === log);
      if (log.head - logLength(log.n) >= this.sDespawn && !onIt) {
        this.logRoot.remove(log.mesh);
        this.logs.splice(i, 1);
        if (this.lanes[log.lane].last === log) this.lanes[log.lane].last = null;
        continue;
      }
      this.placeLog(log);
    }
  }

  private buildLogMesh(n: number, springAt: Set<number>): { mesh: Group; springs: Map<number, Group> } {
    let geom = this.logGeoms.get(n);
    if (!geom) {
      geom = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, logLength(n) - 0.1, 10);
      geom.rotateX(Math.PI / 2);
      this.logGeoms.set(n, geom);
    }
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const body = new THREE.Mesh(geom, this.barkMat);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const springs = new Map<number, Group>();
    for (let i = 0; i < n; i++) {
      const z = -logLength(n) / 2 + (i + 0.5) * NODE_SPACING;
      if (springAt.has(i)) {
        const spring = this.buildSpring();
        spring.position.set(0, LOG_RADIUS, z);
        springs.set(i, spring);
        g.add(spring);
      } else {
        const node = new THREE.Mesh(this.nodeGeom, this.nodeMat);
        node.position.set(0, LOG_RADIUS, z);
        g.add(node);
      }
    }
    return { mesh: g, springs };
  }

  /** Sonic-style spring: grey coil under a red pad with a yellow top. Origin at its base. */
  private buildSpring(): Group {
    const g = new THREE.Group();
    const coil = new THREE.Mesh(this.springCoilGeom, this.springCoilMat);
    coil.position.y = 0.08;
    const pad = new THREE.Mesh(this.springPadGeom, this.springPadMat);
    pad.position.y = 0.19;
    const top = new THREE.Mesh(this.springTopGeom, this.springTopMat);
    top.position.y = SPRING_HEIGHT - 0.01;
    for (const m of [coil, pad, top]) { m.castShadow = true; g.add(m); }
    return g;
  }

  /** Rigid log along the lane; pitched so its ends follow the emerge/dive depth. */
  private placeLog(log: Log): void {
    const len = logLength(log.n);
    const tail = log.head - len;
    const centre = log.head - len / 2;
    this.laneWorld(centre, log.lane, log.mesh.position);
    const t = this.path.tangentAt(centre, this.tmp);
    const dHead = this.depthAt(log.head, log.lane), dTail = this.depthAt(tail, log.lane);
    log.mesh.position.y = this.waterY + LOG_FLOAT - (dHead + dTail) / 2;
    // Local +z points downstream (head); positive pitch dips the head.
    const pitch = Math.asin(Math.max(-1, Math.min(1, (dHead - dTail) / len)));
    log.mesh.rotation.set(pitch, Math.atan2(t.x, t.z), 0);
    log.mesh.updateMatrixWorld();
  }
}
