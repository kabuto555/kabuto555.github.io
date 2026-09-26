/**
 * Lunch Delivery — a 4-player co-op escort minigame: push the camp's lunch
 * cart from the Camp Hub down the cliff ramp to the beach picnic while bugs
 * try to eat the lunch.
 *
 * Faked multiplayer like the other modes: the human plus 3 AI campers. Unlike
 * dodgeball / the log course, the human keeps the normal free-roam controls
 * and camera (main.ts still moves the frog); this class reads the frog's
 * position, adds the ATTACK button + tool, and only takes over the pose while
 * the human is knocked out (`humanDown` / `downPose`).
 *
 * Rules (see the design brief):
 *  - The cart only rolls while at least one living player is near it, and
 *    stops for debris (cleared by standing near it — more players = faster)
 *    and for maggots on the path.
 *  - Bugs spawn in waves along the route: ant swarms (flock), wasps (hunt
 *    players), flies (go for the lunch) and maggots (block the cart).
 *  - Lunch % is the cart's health — 0% and the team fails.
 *  - Players and bugs have HP. A knocked-out player respawns after a short
 *    timer near the last checkpoint the cart reached.
 *  - Everyone starts with a swatter (weak, melee); bug spray (cone) and the
 *    water gun (auto-aimed shots) drop as limited-ammo power-ups.
 *
 * Bugs and AI teammates move with steering behaviours (seek/arrive,
 * separation, and flocking cohesion/alignment for ant swarms) inside the
 * route corridor navmesh (route.ts).
 */
import { loadSpeciesGltf, createCharacter, type AnimState } from '../player';
import type { FrogPose } from '../log-course';
import { createBotProfile, LUNCH_BOT_NAMES, LUNCH_BOT_ID_BASE, type BotProfile } from '../bots/roster';
import { applyAppearance, SPECIES } from '../bots/appearance';
import { Nameplates } from '../bots/nameplates';
import { formatTroopTag } from '../troops';
import { RouteNav, ROUTE_LOCAL, PICNIC_LOCAL } from './route';
import {
  buildCart, buildBug, buildTool, buildDebris, buildPowerup, buildFlag, buildSign, buildPicnic, ProgressRing,
  type CartModel, type BugModel, type BugKind, type ToolKind, type DebrisKind, type PicnicModel,
} from './models';
import { LunchHud, JoinFeed } from './hud';
import { LunchSfx } from './sfx';
import { distanceFalloff } from '../sfx-falloff';
import { LunchGhosts } from './ghosts';
import { asDecal } from '../materials';

type Vec3 = InstanceType<typeof THREE.Vector3>;
type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Camera = InstanceType<typeof THREE.PerspectiveCamera>;
type Scene = InstanceType<typeof THREE.Scene>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Quat = InstanceType<typeof THREE.Quaternion>;

export type LunchDifficulty = 'easy' | 'normal' | 'hard';

// ── Tuning ───────────────────────────────────────────────────────────────────
interface DifficultyDef {
  waveEvery: [number, number];   // seconds between bug waves
  swarm: [number, number];       // ants per swarm
  hpMul: number;                 // bug HP
  eatMul: number;                // how fast bugs eat the lunch
  dmgMul: number;                // bug damage to players
  debrisEvery: [number, number]; // seconds between spontaneous debris
  staticDebris: number[];        // pre-placed debris (fractions of the route)
  powerEvery: [number, number];  // seconds between power-up drops
  maxBugs: number;
  doubleWave: number;             // chance (scaled up with progress) a wave brings a second group
  respawn: number;               // knocked-out seconds
}

const DIFFICULTY: Record<LunchDifficulty, DifficultyDef> = {
  easy: {
    waveEvery: [9, 12], swarm: [5, 7], hpMul: 0.8, eatMul: 0.65, dmgMul: 0.7,
    debrisEvery: [40, 55], staticDebris: [0.34, 0.7], powerEvery: [10, 14], maxBugs: 26, doubleWave: 0.1, respawn: 3,
  },
  normal: {
    waveEvery: [5.5, 8], swarm: [7, 10], hpMul: 1, eatMul: 1, dmgMul: 1,
    debrisEvery: [26, 36], staticDebris: [0.27, 0.52, 0.76], powerEvery: [13, 18], maxBugs: 38, doubleWave: 0.35, respawn: 4,
  },
  hard: {
    waveEvery: [4.5, 6.5], swarm: [8, 11], hpMul: 1.25, eatMul: 1.3, dmgMul: 1.3,
    debrisEvery: [15, 22], staticDebris: [0.22, 0.42, 0.62, 0.84], powerEvery: [16, 22], maxBugs: 50, doubleWave: 0.6, respawn: 5,
  },
};

interface BugDef {
  hp: number; speed: number; fly: number; dmg: number; eat: number;
  radius: number; reach: number; atkEvery: number; drop: number;
}
const BUGS: Record<BugKind, BugDef> = {
  //         hp  speed  fly  dmg  eat(%/s) radius reach atk  drop chance
  ant:    { hp: 12, speed: 3.8, fly: 0, dmg: 4, eat: 0.75, radius: 0.5, reach: 1.4, atkEvery: 1.0, drop: 0.03 },
  wasp:   { hp: 30, speed: 7.0, fly: 2.6, dmg: 13, eat: 1.0, radius: 0.65, reach: 1.7, atkEvery: 1.1, drop: 0.28 },
  fly:    { hp: 18, speed: 5.6, fly: 2.0, dmg: 6, eat: 1.6, radius: 0.6, reach: 1.5, atkEvery: 1.0, drop: 0.1 },
  maggot: { hp: 40, speed: 0, fly: 0, dmg: 0, eat: 0, radius: 0.9, reach: 0, atkEvery: 99, drop: 0.15 },
};

interface ToolDef { range: number; cooldown: number; damage: number; ammo: number }
const TOOLS: Record<ToolKind, ToolDef> = {
  swatter:  { range: 3.3, cooldown: 0.45, damage: 7, ammo: Infinity }, // weakest: short, single swing
  spray:    { range: 7.5, cooldown: 0.15, damage: 5, ammo: 20 },        // cone, hits everything in it
  watergun: { range: 15, cooldown: 0.26, damage: 15, ammo: 12 },        // auto-aimed shots
};
const AIM_RANGE: Record<ToolKind, number> = { swatter: 5, spray: 8, watergun: 15 };
const SWAT_MAX_HITS = 1;

const PLAYER_HP = 100;
const TEAM_SIZE = 4;                // human + 3 AI campers
const CART_TRAVEL_SECONDS = 118;    // pure rolling time start → beach (≈2.5 min matches with stops)
const ESCORT_RADIUS = 8;            // a living player this close keeps the cart rolling
const BUG_STOP_RADIUS = 7;          // any live bug (not a maggot) this close halts the cart until it's dealt with
const CART_SCALE = 1.3;             // the cart model is built at 1×; drawn a bit bigger so it reads at a distance
const CART_HALF_W = 1.45 * CART_SCALE, CART_HALF_L = 2.3 * CART_SCALE; // footprint (incl. handle)
const STOP_GAP = 3.2;               // cart front stops this far (arc) before debris/maggots
const CHECKPOINTS = [0.2, 0.4, 0.6, 0.8];
const RESPAWN_INVULN = 1.6;
const CLEAR_RADIUS = 3.2;           // + half the debris width — you have to be right up against it
const DEBRIS_WORK: Record<DebrisKind, number> = { log: 12, rocks: 10, leaves: 7 }; // one-player seconds (4 players ≈ ¼)
const POWERUP_LIFE = 30;
const AI_SPEED = 7.5;
// AI teammates are a little slower on the draw than a human, so you're never a passenger.
const AI_COOLDOWN_MUL = 2.2;
const AI_DAMAGE_MUL = 0.6;
const AI_ENGAGE_RADIUS = 7;         // AI only chase bugs this close to the cart (or on them)
const RESULT_SECONDS = 5;
const SWING_RATE = 4;                // a swing plays over 1 / SWING_RATE s (swingT 1 → 0)…
const SWAT_PEAK = 1 / SWING_RATE;    // …and the swatter's chop is fully extended at the very end
const TOOL_REST = 0.35;              // held tool leans forward (rad about the character's x)
/** Where each tool is gripped, up its local y (the holder pivots there, on the hand). */
const TOOL_GRIP: Record<ToolKind, number> = { swatter: 0.15, spray: 0.28, watergun: 0.05 };
const TOOL_ROLL = 0.4;               // held tool rolls its top out to the character's right (rad about z)…
const TOOL_SIDE = 0.06;              // …and sits this far right of the hand (natural units), so it clips the body less
const HAND_RE = /RightHand$/;       // mixamorig:RightHand (colon stripped on load) / RightHand
const FEAST_SECONDS = 120;          // the delivered lunch stays out on the picnic tables this long
const MAX_TEAM = 6;                 // human + 3 crew + campers who join along the way
const JOIN_RADIUS = 9;              // near the cart mid-run: you (or a camper) can join
const JOIN_ITEM_RADIUS = 3;         // this close to a run's debris (edge) or power-ups: the human can join too
const AUTO_START_FIRST: [number, number] = [20, 30]; // seconds after load before the crew starts a run on their own
const AUTO_START_EVERY: [number, number] = [45, 75]; // …and between runs after that
const RECRUIT_EVERY: [number, number] = [1.2, 2.2];  // seconds between checks for campers near the cart
const RECRUIT_CHANCE = 0.55;        // per check, that a camper near the cart hops in

// ── Runtime types ────────────────────────────────────────────────────────────
interface Member {
  name: string;
  human: boolean;
  root: Group | null;                   // AI: its character; human: set on start (main's playerRoot)
  anim: ((dt: number, s: AnimState) => void) | null;
  height: number;
  profile: BotProfile | null;
  pos: Vec3;
  vel: Vec3;
  facing: number;
  s: number;                            // arc length along the route
  hp: number;
  alive: boolean;
  downT: number;
  invulnT: number;
  tool: ToolKind;
  ammo: number;
  cd: number;
  swingT: number;                       // 1 → 0 while a swing plays
  toolMesh: Group | null;
  /** Right-hand bone the tool follows, and the root it was found under (re-looked-up if the root changes). */
  hand: Object3D | null;
  handOf: Group | null;
  aiT: number;
  goal: Vec3;
  aimYaw: number | null;
  hurtT: number;
  /** In the current run. The human's slot always exists but is only in when they've joined. */
  joined: boolean;
  /** A camp bot borrowed from the BotManager: moved through its external pose, not directly. */
  ext: { pose: FrogPose; release: () => void } | null;
}

/** A camp bot offered to the run by main (from the BotManager). */
export interface Recruit {
  name: string;
  profile: BotProfile;
  root: Group;
  height: number;
  /** Take control of the bot through `pose`; returns the function that gives it back. */
  borrow(pose: FrogPose): () => void;
}

interface Bug {
  kind: BugKind;
  model: BugModel;
  pos: Vec3;
  vel: Vec3;
  hp: number;
  maxHp: number;
  s: number;
  swarm: number;
  target: Member | null;
  aggroT: number;
  atkCd: number;
  hitT: number;
  dieT: number;                          // >0 while squishing
  spawnT: number;
  eating: boolean;
  slot: number;                          // angle around the cart it eats from
  t: number;
}

interface Debris {
  kind: DebrisKind;
  root: Group;
  ring: ProgressRing;
  s: number;
  pos: Vec3;
  width: number;
  work: number;                          // seconds of one-player clearing left
  total: number;
  falling: number;                       // >0 while the spontaneous entrance plays
  fromY: number;
  fromLat: number;
  clearT: number;                        // >0 while the cleared pop plays
}

interface Powerup {
  kind: Exclude<ToolKind, 'swatter'>;
  root: Group;
  pos: Vec3;
  life: number;
}

interface Particle { obj: Mesh | InstanceType<typeof THREE.Sprite>; vel: Vec3; life: number; max: number; kind: 'mist' | 'drop' | 'splat'; owner: Member | null }

export interface LunchCallbacks {
  /** The human joined a run (fresh or mid-way). */
  onStart: () => void;
  /** The run the human was in ended. */
  onEnd: (won: boolean) => void;
  /** A run began / ended (whoever is in it — the crew can run it on their own). */
  onRun?: (on: boolean) => void;
  onPlayerWin?: () => void;
  onPlayerLose?: () => void;
  /** The human was knocked out by bugs. */
  onPlayerDown?: () => void;
  /** The human squashed a bug. */
  onPlayerSquash?: (kind: BugKind) => void;
  /** Put the human back in play at `pos`, facing `yaw`. */
  onRespawn?: (pos: Vec3, yaw: number) => void;
  /** The feast on the picnic tables appeared / was cleared away. */
  onFeast?: (on: boolean) => void;
  dustBurst?: (x: number, y: number, z: number, scale: number, n: number) => void;
}

export interface LunchOptions {
  scene: Scene;
  stageRoot: Object3D;
  container: HTMLElement;
  collisionMeshes: Mesh[];
  /** Live character scale / foot offset (params.frogScale / footOffset). */
  charScale: () => number;
  footOffset: () => number;
  /** A free camper within `radius` of `near`, to join mid-run (only asked while the human plays). */
  recruit?: (near: Vec3, radius: number) => Recruit | null;
  /** The human's display name, for join announcements. */
  playerName?: () => string;
  /** While true, the camp-wide announcements ("… started a Lunch Delivery!") are held back. */
  quiet?: () => boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function softTexture(): InstanceType<typeof THREE.Texture> {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LunchDelivery {
  /** A delivery is under way (with or without the human). */
  running = false;
  difficulty: LunchDifficulty = 'normal';
  /** The human is playing (in the current run). */
  get active(): boolean { return this.running && this.members[0].joined; }

  private readonly scene: Scene;
  private readonly cb: LunchCallbacks;
  private readonly opts: LunchOptions;
  private readonly route: RouteNav;
  private readonly hud: LunchHud;
  private readonly sfx = new LunchSfx();
  private readonly ghosts: LunchGhosts;
  /** Last camera from updateOverlay (ghosts turn their sad faces toward it). */
  private camera: Camera | null = null;
  private readonly nameplates: Nameplates;
  private readonly raycaster = new THREE.Raycaster();
  private readonly world = new THREE.Group();   // everything spawned during a match
  private readonly cart: CartModel;
  private readonly picnic: PicnicModel;
  private readonly flags: { root: Group; cloth: Mesh; s: number }[] = [];
  private readonly members: Member[] = [];
  private ready = false;

  private cartS = 0;
  private cartSpeed = 0;
  private cartYaw = 0;
  private cartPitch = 0;
  private wheelSpin = 0;
  private lunch = 1;
  private reached = 0;                 // checkpoints passed
  private matchTime = 0;
  private matchId = 0;
  private ending: 'won' | 'lost' | null = null;
  private waveIn = 0;
  private debrisIn = 0;
  private powerIn = 0;
  private swarmId = 0;
  private stallFor = 0;
  private stallReason: 'escort' | 'debris' | 'maggot' | 'bugs' | null = null;
  private feastT = 0;
  private humanDownT = 0;
  private autoIn = rand(...AUTO_START_FIRST);
  private recruitIn = 0;
  private readonly listener = new THREE.Vector3(); // the player (for what's close enough to hear)
  private readonly feed: JoinFeed;

  private readonly bugs: Bug[] = [];
  private readonly bugPool: Record<BugKind, BugModel[]> = { ant: [], wasp: [], fly: [], maggot: [] };
  private readonly debris: Debris[] = [];
  private readonly powerups: Powerup[] = [];
  private readonly particles: Particle[] = [];
  private readonly soft = softTexture();

  private readonly _downPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly cartPos = new THREE.Vector3();
  private readonly cartFwd = new THREE.Vector3(0, 0, 1);
  private readonly anchors: (Vec3 | undefined)[] = [];
  private readonly anchorPool: Vec3[] = [];
  private readonly campMatrix = new THREE.Matrix4();
  private readonly campScale: number;

  constructor(opts: LunchOptions, cb: LunchCallbacks) {
    this.opts = opts;
    this.scene = opts.scene;
    this.cb = cb;
    const camp = opts.stageRoot.getObjectByName('chunk_0_camp');
    if (camp) { camp.updateMatrixWorld(true); this.campMatrix.copy(camp.matrixWorld); }
    this.campScale = new THREE.Vector3().setFromMatrixScale(this.campMatrix).x || 1;

    const toWorld = (x: number, z: number, out: Vec3) => out.set(x, 0, z).applyMatrix4(this.campMatrix);
    this.route = new RouteNav(ROUTE_LOCAL, toWorld, this.campScale);
    this.route.sampleGround((x, z) => this.groundAt(x, z));

    this.world.name = 'lunch_delivery';
    this.scene.add(this.world);
    this.ghosts = new LunchGhosts(this.scene);

    // Cart, parked at the hub.
    this.cart = buildCart();
    this.cart.root.scale.setScalar(CART_SCALE);
    this.scene.add(this.cart.root);
    this.placeCart(0, 0);

    // Checkpoint flags beside the route, on the OPEN side: along the ramp one side is the
    // cliff wall (a flag there floated on an invisible rail slab, or hid against the rock), so
    // a side only counts if the ground stays level with the path a few steps further out too.
    // Just outside the edge, so they read from the path against the open sky / sand.
    for (const f of CHECKPOINTS) {
      const s = f * this.route.length;
      const flag = buildFlag();
      const hw = this.route.halfWidthAt(s);
      const pathY = this.route.heightAt(s);
      const spot = new THREE.Vector3();
      const levelAt = (lateral: number): number | null => {
        this.route.offsetPoint(s, lateral, spot);
        const y = this.visibleGroundAt(spot.x, spot.z, pathY + 60); // from above any cliff top
        return y !== null && Math.abs(y - pathY) < 0.8 ? y : null;
      };
      const open = (side: number) => levelAt(side * (hw + 3)) !== null;
      const sides = open(1) || !open(-1) ? [1, -1] : [-1, 1];
      let placed = false;
      for (const lateral of [hw + 0.3, hw - 0.4].flatMap((d) => sides.map((side) => side * d))) {
        const y = levelAt(lateral);
        if (y !== null) { flag.root.position.set(spot.x, y, spot.z); placed = true; break; }
      }
      if (!placed) this.route.offsetPoint(s, hw - 0.4, flag.root.position).setY(pathY);
      this.scene.add(flag.root);
      this.flags.push({ ...flag, s });
    }

    // Start sign at the hub, picnic + sign at the beach.
    const start = this.route.pointAt(0, new THREE.Vector3());
    const sign = buildSign('LUNCH DELIVERY');
    const t0 = this.route.tangentAt(0, new THREE.Vector3());
    this.route.offsetPoint(1.5, -(this.route.halfWidthAt(0) + 1.2), sign.position);
    sign.position.y = this.groundAt(sign.position.x, sign.position.z) ?? start.y;
    sign.rotation.y = Math.atan2(t0.x, t0.z); // faces campers walking up the path
    this.scene.add(sign);

    this.picnic = buildPicnic();
    toWorld(PICNIC_LOCAL[0], PICNIC_LOCAL[1], this.picnic.root.position);
    this.picnic.root.position.y = this.groundAt(this.picnic.root.position.x, this.picnic.root.position.z) ?? 0;
    this.picnic.root.rotation.y = Math.PI; // blanket + parasol away from the cart's approach
    this.scene.add(this.picnic.root);
    // Beside the last stretch of the route, facing the cart as it arrives.
    const beachSign = buildSign('BEACH PICNIC', 3.6);
    const endS = this.route.length - 9;
    this.route.offsetPoint(endS, -(this.route.halfWidthAt(endS) + 1.6), beachSign.position);
    beachSign.position.y = this.groundAt(beachSign.position.x, beachSign.position.z) ?? this.route.heightAt(endS);
    const tEnd = this.route.tangentAt(endS, new THREE.Vector3());
    beachSign.rotation.y = Math.atan2(tEnd.x, tEnd.z) + Math.PI;
    this.scene.add(beachSign);

    this.hud = new LunchHud(opts.container, CHECKPOINTS);
    this.feed = new JoinFeed(opts.container, () => !!opts.quiet?.());
    this.nameplates = new Nameplates(opts.container);
    this.nameplates.visible = false;

    // Team: slot 0 is the human, the rest are AI campers (loaded like the dodgeball regulars).
    this.members.push(this.newMember('You', true, null));
    const profiles = LUNCH_BOT_NAMES.slice(0, TEAM_SIZE - 1).map((n, i) => createBotProfile(LUNCH_BOT_ID_BASE + i, n));
    void Promise.all(profiles.map((p) => loadSpeciesGltf(SPECIES[p.appearance.species]).then((gltf) => {
      const c = createCharacter(gltf);
      applyAppearance(c.root, p.appearance);
      c.root.visible = false;
      this.scene.add(c.root);
      const m = this.newMember(p.name, false, p);
      m.root = c.root; m.anim = c.update; m.height = c.height;
      return m;
    }))).then((ms) => {
      for (const m of ms) {
        this.members.push(m);
        this.nameplates.add(m.name, m.profile?.troop ? formatTroopTag(m.profile.troop) : null);
        this.anchors.push(undefined);
      }
      this.ready = true;
    }).catch((e) => console.warn('[lunch] AI load failed', e));

    console.log(`[lunch] route ${this.route.length.toFixed(0)}u, cart ${(this.route.length / CART_TRAVEL_SECONDS).toFixed(2)}u/s`);
  }

  private newMember(name: string, human: boolean, profile: BotProfile | null): Member {
    return {
      name, human, root: null, anim: null, height: 2, profile,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, s: 0,
      hp: PLAYER_HP, alive: true, downT: 0, invulnT: 0,
      tool: 'swatter', ammo: Infinity, cd: 0, swingT: 0, toolMesh: null, hand: null, handOf: null,
      aiT: 0, goal: new THREE.Vector3(), aimYaw: null, hurtT: 0,
      joined: !human, ext: null,
    };
  }

  // ── Public API (main.ts) ───────────────────────────────────────────────────
  get humanDown(): boolean { return this.active && !this.members[0].alive; }
  get feastOn(): boolean { return this.feastT > 0; }
  get downPose(): { position: Vec3; quaternion: Quat } { return this._downPose; }
  get attackHeld(): boolean { return this.hud.attackHeld; }

  /** Walk-up point in front of the parked cart that opens the tutorial. */
  gatePoint(out: Vec3): Vec3 {
    return this.route.offsetPoint(5, this.route.halfWidthAt(5) * 0.7, out);
  }

  /** Free-roam collision: the cart is solid (unless you're already overlapping it). */
  blocks(x: number, z: number, fromX: number, fromZ: number): boolean {
    return this.inCart(x, z, 0.35) && !this.inCart(fromX, fromZ, 0.35);
  }

  /** The human starts a fresh run (or joins the one under way, at the last checkpoint). */
  start(difficulty: LunchDifficulty = this.difficulty): void {
    if (this.active) return;
    if (!this.ready) { console.warn('[lunch] not ready yet'); return; }
    if (this.running) { this.join(true); return; }
    this.beginRun(difficulty);
    this.joinHuman(false);
    this.hud.showBanner(`LUNCH DELIVERY!\nGet the lunch to the beach!`, 2.6);
  }

  /** The human joins the run under way; `teleport` puts them at the last checkpoint the cart reached. */
  join(teleport: boolean): void {
    if (!this.running) { this.start(); return; }
    if (this.active || this.ending) return;
    this.joinHuman(teleport);
    this.hud.showBanner('You joined the Lunch Delivery!\nKeep the bugs off the lunch!', 2.4);
  }

  /** Mid-run with the human not in it, and they're close enough to the cart to hop in. */
  canJoinAtCart(p: Vec3): boolean {
    return this.running && !this.active && !this.ending &&
      Math.hypot(p.x - this.cartPos.x, p.z - this.cartPos.z) < JOIN_RADIUS;
  }

  /** Mid-run with the human not in it, and they're standing by the run's debris or a power-up. */
  canJoinAtItem(p: Vec3): boolean {
    if (!this.running || this.active || this.ending) return false;
    const dist = (q: Vec3) => Math.hypot(p.x - q.x, p.z - q.z);
    return this.debris.some((d) => dist(d.pos) < d.width / 2 + JOIN_ITEM_RADIUS) ||
      this.powerups.some((u) => dist(u.pos) < JOIN_ITEM_RADIUS);
  }

  /** The crew start a delivery on their own (the human can join along the way). */
  startAmbient(): void {
    if (this.running || !this.ready) return;
    this.beginRun('normal');
    const crew = this.members.filter((m) => !m.human);
    this.feed.push(`🍱 ${crew[0]?.name ?? 'The lunch crew'} started a Lunch Delivery! Join them at the Camp Hub.`, 4.5);
  }

  /** Reset the route and put the crew in formation around the cart. */
  private beginRun(difficulty: LunchDifficulty): void {
    this.difficulty = difficulty;
    this.running = true;
    this.matchId++;
    this.sfx.resume();
    this.clearMatch();
    const d = DIFFICULTY[difficulty];
    this.cartS = 0; this.cartSpeed = 0; this.lunch = 1; this.reached = 0; this.matchTime = 0;
    this.ending = null; this.stallFor = 0; this.stallReason = null;
    this.waveIn = 3.5; this.debrisIn = rand(...d.debrisEvery); this.powerIn = rand(5, 8);
    this.recruitIn = rand(...RECRUIT_EVERY);
    this.placeCart(0, 0);
    this.cart.food.forEach((f) => { f.visible = true; });
    this.setFeast(false);
    for (const f of this.flags) (f.cloth.material as InstanceType<typeof THREE.MeshStandardMaterial>).color.setHex(0xbfbfbf);

    // Pre-placed debris (nudged off the bridge deck).
    for (const f of d.staticDebris) this.spawnDebris(this.avoidBridge(f * this.route.length), false);

    const human = this.members[0];
    human.joined = false; human.alive = false; human.root = null;
    for (let i = 1; i < this.members.length; i++) {
      const m = this.members[i];
      this.resetMember(m);
      if (m.root) {
        this.route.offsetPoint(rand(2, 5), (i - 2) * 2.2, m.pos);
        m.s = this.route.clamp(m.pos, 0.5);
        m.pos.y = this.route.heightAt(m.s);
        m.facing = this.cartYaw;
        m.root.visible = true;
      }
    }
    this.nameplates.visible = true;
    this.sfx.whistle(this.earVol(this.cartPos));
    this.cb.onRun?.(true);
  }

  private resetMember(m: Member): void {
    m.hp = PLAYER_HP; m.alive = true; m.downT = 0; m.invulnT = 0; m.cd = 0; m.swingT = 0; m.hurtT = 0;
    m.joined = true;
    this.setTool(m, 'swatter');
  }

  private joinHuman(teleport: boolean): void {
    const human = this.members[0];
    this.resetMember(human);
    human.invulnT = RESPAWN_INVULN;
    if (teleport) {
      // In at the last checkpoint the cart reached (the hub if it hasn't reached one yet).
      const s = this.reached > 0 ? CHECKPOINTS[this.reached - 1] * this.route.length : 1.5;
      this.route.offsetPoint(s, rand(-1, 1) * this.route.halfWidthAt(s) * 0.6, human.pos);
      const t = this.route.tangentAt(s, this.tmp);
      human.facing = Math.atan2(t.x, t.z);
      human.s = s;
      this.cb.onRespawn?.(human.pos.clone(), human.facing);
    }
    this.hud.show();
    this.hud.setLunch(this.lunch); this.hud.setHp(1); this.hud.setTool('swatter', Infinity);
    this.hud.setProgress(this.cartS / this.route.length, this.reached); this.hud.setTime(this.matchTime);
    this.sfx.whistle();
    this.announceJoin(this.opts.playerName?.() || 'You');
    this.cb.onStart();
  }

  /** The human drops out early; the crew carries on with the delivery. */
  leave(): void {
    if (!this.active) return;
    const human = this.members[0];
    if (human.toolMesh) { human.toolMesh.removeFromParent(); human.toolMesh = null; }
    human.joined = false; human.alive = false; human.root = null; human.hand = null; human.handOf = null;
    this.hud.hide();
    this.feed.push(`${this.opts.playerName?.() || 'You'} left the Lunch Delivery.`);
    this.cb.onEnd(false);
  }

  private announceJoin(name: string): void {
    this.feed.push(`${name} joined the Lunch Delivery!`);
  }

  stop(): void {
    if (!this.running) return;
    const won = this.ending === 'won';
    const humanWasIn = this.active;
    this.running = false;
    this.hud.hide();
    this.nameplates.visible = false;
    for (const m of this.members) {
      if (m.toolMesh) { m.toolMesh.removeFromParent(); m.toolMesh = null; }
      if (m.ext) {
        // Campers who joined go back to hanging around camp.
        if (m.root) { m.root.rotation.x = 0; m.root.rotation.order = 'XYZ'; }
        m.ext.release();
      } else if (!m.human && m.root) {
        if (m.root.visible) this.cb.dustBurst?.(m.pos.x, m.pos.y, m.pos.z, 1.5, 6);
        m.root.visible = false;
      }
    }
    for (let i = this.members.length - 1; i >= 0; i--) if (this.members[i].ext) this.members.splice(i, 1);
    const human = this.members[0];
    human.root = null; human.joined = false;
    this.clearMatch();
    // The cart heads back to the kitchen for next time (you're at the beach and won't see it go).
    this.placeCart(0, 0);
    this.cart.food.forEach((f) => { f.visible = true; });
    this.autoIn = rand(...AUTO_START_EVERY);
    if (humanWasIn) this.cb.onEnd(won);
    this.cb.onRun?.(false);
  }

  /** Per frame. `player` is main's playerRoot (moved by the free-roam controls). */
  /** Per frame. `player` is main's playerRoot when free-roaming (moved by its controls), or
   * null while it's busy elsewhere (another minigame) — a run still carries on without it. */
  update(dt: number, player: Group | null, attack: boolean): void {
    this.animateIdle(dt);
    this.ghosts.update(dt, this.camera); // keep floating up even after the run ends
    if (player) this.listener.copy(player.position);
    if (!this.running) {
      if ((this.autoIn -= dt) <= 0) { this.autoIn = rand(...AUTO_START_EVERY); this.startAmbient(); }
      return;
    }
    this.matchTime += dt;
    // The rolling cart shoves you aside rather than driving through you (playing or not).
    if (player) this.pushOutOfCart(player.position, 0.5);
    const human = this.members[0];
    if (human.joined && player && human.root !== player) {
      human.root = player;
      this.setTool(human, human.tool);
    }
    if (human.joined && !player) { human.joined = false; human.alive = false; } // left for another mode
    if (human.alive && player) {
      human.pos.copy(player.position);
      human.facing = player.rotation.y;
      human.s = this.route.project(human.pos.x, human.pos.z).s;
    }

    if (!this.ending) {
      this.updateSpawns(dt);
      this.updateCart(dt);
    } else {
      this.cartSpeed = 0;
    }
    this.updateDebris(dt);
    this.updatePowerups(dt);
    for (const m of this.members) this.updateMember(m, dt, m.human ? attack : false);
    this.updateBugs(dt);
    this.updateParticles(dt);
    this.updateCartVisual(dt);
    if (this.active) {
      this.updateHud(dt);
      if (!this.ending) this.updateRecruits(dt);
    }
    if (!this.ending) this.checkEnd();
  }

  /** Debug: a ghost (and its cry) pops out a few units in front of `at`, facing `yaw`. */
  debugGhost(at: Vec3, yaw: number): void {
    this.sfx.resume();
    this.ghosts.spawn(this.tmp.set(at.x + Math.sin(yaw) * 3, at.y, at.z + Math.cos(yaw) * 3), 1.5, this.camera);
    this.sfx.ghostCry(1);
  }

  /** Overlay tracking (nameplates, cart tag / edge arrow). Call after the camera is placed. */
  updateOverlay(camera: Camera, showNames: boolean): void {
    this.camera = camera;
    if (!this.running) return;
    this.nameplates.visible = showNames;
    const scale = this.opts.charScale();
    for (let i = 1; i < this.members.length; i++) {
      const m = this.members[i];
      if (m.ext) continue; // campers keep their own camp nameplate
      if (!m.root?.visible) { this.anchors[i - 1] = undefined; continue; }
      const a = (this.anchors[i - 1] = this.anchorPool[i - 1] ??= new THREE.Vector3());
      a.copy(m.pos).setY(m.pos.y + m.height * scale + 0.35 - (m.alive ? 0 : m.height * scale * 0.6));
    }
    this.nameplates.update(camera, this.anchors as Vec3[]);
    if (this.active) this.hud.trackCart(camera, this.tmp.copy(this.cartPos).setY(this.cartPos.y + 1.4 * CART_SCALE),
      this.tmp2.copy(this.cartPos).setY(this.cartPos.y + 3.6 * CART_SCALE));
  }

  status(): string {
    if (!this.running) return `LUNCH idle  auto in ${this.autoIn.toFixed(0)}s${this.feastT > 0 ? `  feast ${this.feastT.toFixed(0)}s` : ''}`;
    return `LUNCH ${this.difficulty}${this.active ? '' : ' (crew)'}  team ${this.members.filter((m) => m.joined).length}  cart ${(this.cartS / this.route.length * 100).toFixed(0)}%  lunch ${(this.lunch * 100).toFixed(0)}%  ` +
      `bugs ${this.bugs.length}  debris ${this.debris.length}  t ${this.matchTime.toFixed(0)}s${this.stallReason ? `  stalled:${this.stallReason}` : ''}`;
  }

  /** While the human plays, campers wandering near the cart hop in now and then. */
  private updateRecruits(dt: number): void {
    if ((this.recruitIn -= dt) > 0) return;
    this.recruitIn = rand(...RECRUIT_EVERY);
    if (!this.opts.recruit || this.members.filter((m) => m.joined).length >= MAX_TEAM) return;
    if (Math.random() > RECRUIT_CHANCE) return;
    const r = this.opts.recruit(this.cartPos, JOIN_RADIUS);
    if (!r) return;
    const m = this.newMember(r.name, false, r.profile);
    m.root = r.root; m.height = r.height;
    m.pos.copy(r.root.position);
    m.s = this.route.clamp(m.pos, 0.6);
    m.pos.y = this.route.heightAt(m.s);
    m.facing = r.root.rotation.y;
    const pose: FrogPose = { position: r.root.position.clone(), facing: m.facing, anim: 'idle' };
    m.ext = { pose, release: r.borrow(pose) };
    r.root.rotation.order = 'YXZ'; // so a knocked-out camper lies back along its facing
    this.resetMember(m);
    this.members.push(m);
    this.announceJoin(m.name);
  }

  /** Volume for a sound at `p`: full within `near` of the player, silent past `far`. */
  private earVol(p: Vec3, near = 10, far = 30): number {
    return distanceFalloff(this.listener.distanceTo(p), near, far);
  }

  // ── Setup helpers ──────────────────────────────────────────────────────────
  private groundAt(x: number, z: number, fromY = 80, far = 200): number | null {
    this.raycaster.set(this.tmp3.set(x, fromY, z), this.tmp2.set(0, -1, 0));
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.opts.collisionMeshes, false);
    return hits.length > 0 ? hits[0].point.y : null;
  }

  /** Like groundAt, but only real (visible) ground — not the invisible collision walls / rail slabs. */
  private visibleGroundAt(x: number, z: number, fromY: number): number | null {
    this.raycaster.set(this.tmp3.set(x, fromY, z), this.tmp2.set(0, -1, 0));
    this.raycaster.far = 200;
    const hit = this.raycaster.intersectObjects(this.opts.collisionMeshes, false).find((h) => h.object.visible);
    return hit ? hit.point.y : null;
  }

  private clearMatch(): void {
    for (const b of this.bugs) this.releaseBug(b);
    this.bugs.length = 0;
    for (const d of this.debris) { d.root.removeFromParent(); d.ring.root.removeFromParent(); }
    this.debris.length = 0;
    for (const p of this.powerups) p.root.removeFromParent();
    this.powerups.length = 0;
    for (const p of this.particles) p.obj.visible = false;
  }

  /** The bridge deck is narrow and part of the log course start — keep debris off it. */
  private avoidBridge(s: number): number {
    const a = this.route.cum[7] - 3, b = this.route.cum[8] + 3;
    if (s > a && s < b) return s - a < b - s ? a : b;
    return s;
  }

  private setTool(m: Member, tool: ToolKind, ammo = TOOLS[tool].ammo): void {
    m.tool = tool;
    m.ammo = ammo;
    if (m.toolMesh) m.toolMesh.removeFromParent();
    m.toolMesh = null;
    if (!m.root) return;
    const g = buildTool(tool);
    const holder = new THREE.Group();
    holder.add(g);
    holder.position.set(-0.55, 0.7, 0.25); // the character's right side, natural (unscaled) units; animateTool snaps it to the hand
    holder.rotation.x = TOOL_REST;
    holder.rotation.z = TOOL_ROLL; // +z roll tips +y toward −x, the character's right (it faces +z)
    g.scale.setScalar(0.8);
    g.position.y = -TOOL_GRIP[tool] * 0.8; // grip on the holder's pivot
    m.root.add(holder);
    m.toolMesh = holder;
    if (m.human) this.hud.setTool(tool, ammo);
  }

  // ── Cart ───────────────────────────────────────────────────────────────────
  private placeCart(s: number, dt: number): void {
    const r = this.route;
    r.pointAt(s, this.cartPos);
    r.tangentAt(s, this.cartFwd);
    const yaw = Math.atan2(this.cartFwd.x, this.cartFwd.z);
    const back = r.heightAt(s - 1.4), front = r.heightAt(s + 1.4);
    const pitch = -Math.atan2(front - back, 2.8);
    if (dt <= 0) { this.cartYaw = yaw; this.cartPitch = pitch; }
    else {
      let d = yaw - this.cartYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.cartYaw += d * (1 - Math.exp(-5 * dt));
      this.cartPitch += (pitch - this.cartPitch) * (1 - Math.exp(-6 * dt));
    }
    this.cart.root.position.copy(this.cartPos);
    this.cart.root.rotation.set(0, this.cartYaw, 0);
    this.cart.body.rotation.x = this.cartPitch;
    this.cartS = s;
  }

  /** Point inside the cart's footprint (+ margin)? */
  private inCart(x: number, z: number, margin: number): boolean {
    const dx = x - this.cartPos.x, dz = z - this.cartPos.z;
    const c = Math.cos(this.cartYaw), s = Math.sin(this.cartYaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < CART_HALF_W + margin && Math.abs(lz) < CART_HALF_L + margin;
  }

  /** Push a point out of the cart footprint (for AI + bugs). */
  private pushOutOfCart(p: Vec3, margin: number): void {
    if (!this.inCart(p.x, p.z, margin)) return;
    const dx = p.x - this.cartPos.x, dz = p.z - this.cartPos.z;
    const c = Math.cos(this.cartYaw), s = Math.sin(this.cartYaw);
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ox = CART_HALF_W + margin - Math.abs(lx), oz = CART_HALF_L + margin - Math.abs(lz);
    if (ox < oz) lx = Math.sign(lx || 1) * (CART_HALF_W + margin);
    else lz = Math.sign(lz || 1) * (CART_HALF_L + margin);
    p.x = this.cartPos.x + lx * c + lz * s;
    p.z = this.cartPos.z - lx * s + lz * c;
  }

  private updateCart(dt: number): void {
    const len = this.route.length;
    const escorted = this.members.some((m) => m.alive && Math.hypot(m.pos.x - this.cartPos.x, m.pos.z - this.cartPos.z) < ESCORT_RADIUS);
    // Nearest blocker ahead: debris, or a maggot sitting on the path.
    let limit = len;
    let limitBy: 'debris' | 'maggot' | null = null;
    for (const d of this.debris) {
      if (d.clearT > 0 || d.s < this.cartS - 1) continue; // still falling counts: it's landing on the path
      if (d.s - STOP_GAP < limit) { limit = d.s - STOP_GAP; limitBy = 'debris'; }
    }
    for (const b of this.bugs) {
      if (b.kind !== 'maggot' || b.dieT > 0 || b.s < this.cartS - 0.5) continue;
      const lat = Math.abs(this.route.project(b.pos.x, b.pos.z).lateral);
      if (lat > CART_HALF_W + 1.2) continue;
      if (b.s - STOP_GAP < limit) { limit = b.s - STOP_GAP; limitBy = 'maggot'; }
    }
    const blocked = this.cartS >= limit - 0.05;
    // Bugs nearby: the cart halts until they're swatted (fresh spawns still popping in don't count).
    const bugsNear = this.bugs.some((b) => b.kind !== 'maggot' && b.dieT <= 0 && b.spawnT <= 0 &&
      Math.hypot(b.pos.x - this.cartPos.x, b.pos.z - this.cartPos.z) < BUG_STOP_RADIUS);
    const want = escorted && !blocked && !bugsNear ? len / CART_TRAVEL_SECONDS : 0;
    this.cartSpeed += (want - this.cartSpeed) * (1 - Math.exp(-(want > this.cartSpeed ? 2.5 : 6) * dt));
    let s = Math.min(this.cartS + this.cartSpeed * dt, Math.max(this.cartS, limit), len);
    if (this.cartSpeed < 0.01) s = this.cartS;
    this.wheelSpin += (s - this.cartS) / (this.cart.wheelRadius * CART_SCALE);
    this.placeCart(s, dt);

    this.stallReason = blocked ? limitBy : bugsNear ? 'bugs' : !escorted ? 'escort' : null;
    this.stallFor = this.stallReason ? this.stallFor + dt : 0;

    // Checkpoints.
    while (this.reached < CHECKPOINTS.length && this.cartS >= CHECKPOINTS[this.reached] * len) {
      const f = this.flags[this.reached];
      (f.cloth.material as InstanceType<typeof THREE.MeshStandardMaterial>).color.setHex(0x6ccf4a);
      this.reached++;
      this.sfx.checkpoint(this.active ? 1 : this.earVol(this.cartPos));
      this.hud.showBanner(`Checkpoint ${this.reached}/${CHECKPOINTS.length}!`, 1.4);
    }
  }

  private updateCartVisual(dt: number): void {
    for (const w of this.cart.wheels) w.rotation.x = this.wheelSpin;
    // A little rattle while rolling.
    const roll = this.cartSpeed > 0.1 ? Math.sin(this.matchTime * 18) * 0.012 : 0;
    this.cart.body.rotation.z = roll;
    // Food disappears as the lunch meter drops.
    const n = this.cart.food.length;
    const keep = Math.ceil(this.lunch * n);
    for (let i = 0; i < n; i++) this.cart.food[i].visible = i < keep;
    void dt;
  }

  // ── Spawning ───────────────────────────────────────────────────────────────
  private updateSpawns(dt: number): void {
    const d = DIFFICULTY[this.difficulty];
    const prog = this.cartS / this.route.length;
    if ((this.waveIn -= dt) <= 0) {
      // Waves come a little faster the further along the cart is.
      this.waveIn = rand(...d.waveEvery) * (1 - 0.25 * prog);
      this.spawnWave(prog);
      // Later on, bugs come from two directions at once.
      if (Math.random() < d.doubleWave * (0.4 + prog)) this.spawnWave(prog);
    }
    if ((this.debrisIn -= dt) <= 0) {
      this.debrisIn = rand(...d.debrisEvery);
      const s = this.cartS + rand(11, 20);
      if (s < this.route.length - 10 && !this.debris.some((x) => Math.abs(x.s - s) < 8)) this.spawnDebris(this.avoidBridge(s), true);
    }
    if ((this.powerIn -= dt) <= 0) {
      this.powerIn = rand(...d.powerEvery);
      const s = Math.min(this.route.length - 4, this.cartS + rand(5, 13));
      this.spawnPowerup(Math.random() < 0.5 ? 'spray' : 'watergun', this.route.offsetPoint(s, rand(-1, 1) * this.route.halfWidthAt(s) * 0.6, this.tmp));
    }
  }

  private spawnWave(prog: number): void {
    const d = DIFFICULTY[this.difficulty];
    const room = d.maxBugs - this.bugs.length;
    if (room <= 2) return;
    // Early on it's mostly ants and flies; wasps and maggots join as the trip goes on.
    const kinds: [BugKind | 'swarm', number][] = [
      ['swarm', 4], ['fly', 3], ['wasp', 1 + 2 * prog], ['maggot', prog > 0.08 ? 1.6 : 0],
    ];
    let total = 0;
    for (const [, w] of kinds) total += w;
    let r = Math.random() * total;
    let kind: BugKind | 'swarm' = 'swarm';
    for (const [k, w] of kinds) { if ((r -= w) <= 0) { kind = k; break; } }

    const len = this.route.length;
    if (kind === 'swarm') {
      const n = Math.min(room, Math.round(rand(...d.swarm)));
      const ahead = Math.random() < 0.72;
      const s = THREE.MathUtils.clamp(this.cartS + (ahead ? rand(14, 24) : -rand(10, 16)), 2, len - 2);
      const side = Math.random() < 0.5 ? -1 : 1;
      const c = this.route.offsetPoint(s, side * (this.route.halfWidthAt(s) - 0.6), this.tmp2);
      const id = ++this.swarmId;
      for (let i = 0; i < n; i++) {
        const p = this.tmp3.set(c.x + rand(-1.6, 1.6), c.y, c.z + rand(-1.6, 1.6));
        this.spawnBug('ant', p, id);
      }
    } else if (kind === 'maggot') {
      const n = Math.min(room, Math.random() < 0.4 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const s = this.cartS + rand(9, 17) + i * 1.8;
        if (s > len - 6 || this.debris.some((x) => Math.abs(x.s - s) < 4)) continue;
        const p = this.route.offsetPoint(s, rand(-1.2, 1.2), this.tmp3);
        this.spawnBug('maggot', p, 0);
        this.cb.dustBurst?.(p.x, p.y, p.z, 1.6, 6);
      }
    } else {
      // Fliers come in from the side of the route, out of the trees.
      const n = Math.min(room, kind === 'fly' ? Math.round(rand(3, 4)) : (Math.random() < 0.35 + 0.3 * prog ? 2 : 1));
      const a = rand(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const dist = rand(13, 18);
        const p = this.tmp3.set(this.cartPos.x + Math.cos(a + i * 0.4) * dist, this.cartPos.y + 3, this.cartPos.z + Math.sin(a + i * 0.4) * dist);
        this.spawnBug(kind, p, 0);
      }
      if (kind === 'wasp') this.hud.showBanner('Wasps incoming! 🐝', 1.3);
      else this.sfx.buzz(this.earVol(this.cartPos));
    }
  }

  private spawnBug(kind: BugKind, p: Vec3, swarm: number): void {
    const def = BUGS[kind];
    const model = this.bugPool[kind].pop() ?? buildBug(kind);
    model.root.visible = true;
    model.body.scale.setScalar(1);
    model.body.rotation.set(0, 0, 0);
    this.world.add(model.root);
    const hp = def.hp * DIFFICULTY[this.difficulty].hpMul;
    const b: Bug = {
      kind, model, pos: p.clone(), vel: new THREE.Vector3(), hp, maxHp: hp, s: 0, swarm,
      target: null, aggroT: 0, atkCd: rand(0.3, 1), hitT: 0, dieT: 0, spawnT: 0.35,
      eating: false, slot: rand(0, Math.PI * 2), t: rand(0, 10),
    };
    b.s = def.fly > 0 ? this.route.project(p.x, p.z).s : this.route.clamp(b.pos, 0.3);
    if (def.fly === 0) b.pos.y = this.route.heightAt(b.s);
    this.bugs.push(b);
  }

  private releaseBug(b: Bug): void {
    b.model.root.removeFromParent();
    for (const m of b.model.flash) m.emissive.setHex(0x000000);
    this.bugPool[b.kind].push(b.model);
  }

  private spawnDebris(s: number, spontaneous: boolean): void {
    // Rocks tumble down on the cliff ramp; logs and leaves fall from camp trees.
    const onRamp = this.route.heightAt(s) < -3;
    const kind: DebrisKind = onRamp ? (Math.random() < 0.7 ? 'rocks' : 'log') : (Math.random() < 0.5 ? 'log' : 'leaves');
    const hw = this.route.halfWidthAt(s);
    const width = Math.min(hw * 2 + 0.8, 7.5);
    const root = buildDebris(kind, width);
    const pos = this.route.pointAt(s, new THREE.Vector3());
    const t = this.route.tangentAt(s, this.tmp);
    root.rotation.y = Math.atan2(t.x, t.z);
    root.position.copy(pos);
    this.world.add(root);
    const ring = new ProgressRing(width / 2 + 1.2);
    ring.root.position.copy(pos).setY(pos.y + 0.08);
    ring.root.visible = false;
    this.world.add(ring.root);
    const work = DEBRIS_WORK[kind] * (this.difficulty === 'hard' ? 1.2 : this.difficulty === 'easy' ? 0.8 : 1);
    const dbr: Debris = {
      kind, root, ring, s, pos, width, work, total: work,
      falling: spontaneous ? 1 : 0, fromY: kind === 'rocks' ? 3 : 14, fromLat: kind === 'rocks' ? 9 : 0, clearT: 0,
    };
    this.debris.push(dbr);
    if (spontaneous) {
      const what = kind === 'log' ? 'A tree log fell on the path!' : kind === 'rocks' ? 'Rocks tumbling down!' : 'Leaves are piling up!';
      this.hud.showBanner(`${what}\nStand near it to clear it`, 2);
    }
  }

  private spawnPowerup(kind: Exclude<ToolKind, 'swatter'>, p: Vec3): void {
    const root = buildPowerup(kind);
    const y = this.route.heightAt(this.route.project(p.x, p.z).s);
    root.position.set(p.x, y, p.z);
    this.world.add(root);
    this.powerups.push({ kind, root, pos: root.position, life: POWERUP_LIFE });
  }

  // ── Debris ─────────────────────────────────────────────────────────────────
  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (d.falling > 0) {
        // Entrance: logs/leaves drop from above, rocks roll in from the uphill side.
        d.falling = Math.max(0, d.falling - dt * (d.kind === 'leaves' ? 0.7 : 1.3));
        const u = d.falling;
        const t = this.route.tangentAt(d.s, this.tmp);
        d.root.position.set(d.pos.x + t.z * d.fromLat * u, d.pos.y + d.fromY * u * u, d.pos.z - t.x * d.fromLat * u);
        if (d.kind === 'leaves') d.root.rotation.z = Math.sin(u * 12) * 0.3 * u;
        else if (d.kind === 'log') d.root.rotation.z = u * 1.2;
        else for (const c of d.root.children) c.rotation.x += dt * 9 * u;
        if (d.falling === 0) {
          d.root.rotation.z = 0;
          this.sfx.crash(this.earVol(d.pos, 15, 45));
          this.cb.dustBurst?.(d.pos.x, d.pos.y, d.pos.z, 2.2, 12);
        }
        continue;
      }
      if (d.clearT > 0) {
        d.clearT -= dt;
        const k = Math.max(0, d.clearT / 0.35);
        d.root.scale.set(1 + (1 - k) * 0.3, k, 1 + (1 - k) * 0.3);
        if (d.clearT <= 0) { d.root.removeFromParent(); d.ring.root.removeFromParent(); this.debris.splice(i, 1); }
        continue;
      }
      const r = d.width / 2 + CLEAR_RADIUS;
      let n = 0;
      for (const m of this.members) if (m.alive && Math.hypot(m.pos.x - d.pos.x, m.pos.z - d.pos.z) < r) n++;
      d.ring.root.visible = true;
      if (n > 0) {
        d.work -= dt * n; // more players → faster
        d.root.position.x = d.pos.x + Math.sin(this.matchTime * 40) * 0.04;
      }
      d.ring.setFill(1 - d.work / d.total);
      if (d.work <= 0) {
        d.clearT = 0.35;
        d.ring.root.visible = false;
        this.sfx.cleared(this.earVol(d.pos));
        this.cb.dustBurst?.(d.pos.x, d.pos.y, d.pos.z, 2.2, 10);
        if (Math.hypot(this.members[0].pos.x - d.pos.x, this.members[0].pos.z - d.pos.z) < r + 4) this.hud.showBanner('Path cleared!', 1.1);
      }
    }
  }

  // ── Power-ups ──────────────────────────────────────────────────────────────
  private updatePowerups(dt: number): void {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.life -= dt;
      const item = p.root.getObjectByName('item')!;
      item.rotation.y += dt * 2.2;
      item.position.y = 1.0 + Math.sin(this.matchTime * 3 + i) * 0.25;
      p.root.visible = p.life > 5 || Math.sin(p.life * 18) > 0;
      if (p.life <= 0) { p.root.removeFromParent(); this.powerups.splice(i, 1); continue; }
      for (const m of this.members) {
        if (!m.alive || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) > 2.2) continue;
        this.setTool(m, p.kind); // a repeat pickup refills to full, no stacking
        if (m.human) {
          this.sfx.pickup();
          this.hud.showBanner(p.kind === 'spray' ? 'Bug Spray! 🌿' : 'Water Gun! 💦', 1.3);
        }
        p.root.removeFromParent();
        this.powerups.splice(i, 1);
        break;
      }
    }
  }

  // ── Players ────────────────────────────────────────────────────────────────
  private updateMember(m: Member, dt: number, attackHeld: boolean): void {
    if (!m.joined) return;
    m.cd = Math.max(0, m.cd - dt);
    m.swingT = Math.max(0, m.swingT - dt * SWING_RATE);
    m.invulnT = Math.max(0, m.invulnT - dt);
    m.hurtT = Math.max(0, m.hurtT - dt);

    if (!m.alive) {
      m.downT -= dt;
      if (m.toolMesh) m.toolMesh.visible = false;
      if (m.human) {
        this.humanDownT += dt;
        this.hud.setRespawn(Math.max(0, m.downT));
        this.downPoseFor(m, this._downPose.position, this._downPose.quaternion);
      } else if (m.ext && m.root) {
        // Lying flat: the bot takes position/facing from the pose; the tip-over is ours.
        this.downPoseFor(m, m.ext.pose.position, this.tmpQ);
        m.ext.pose.facing = m.facing;
        m.ext.pose.anim = 'falling_idle';
        m.root.rotation.x = -Math.PI / 2 + 0.15;
      } else if (m.root) {
        this.downPoseFor(m, m.root.position, m.root.quaternion);
        m.anim?.(dt, 'falling_idle');
      }
      if (m.downT <= 0 && !this.ending) this.respawn(m);
      return;
    }
    if (m.toolMesh) m.toolMesh.visible = true;

    if (m.human) {
      // Auto-aim: face the target while attacking (overrides main's facing for the frame).
      if (attackHeld && m.cd <= 0) {
        const target = this.aimTarget(m);
        this.attackWith(m, target);
      }
      if (m.aimYaw !== null && (m.swingT > 0 || attackHeld) && m.root) {
        let d = m.aimYaw - m.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        m.root.rotation.y += d * (1 - Math.exp(-18 * dt));
      }
    } else {
      this.updateAI(m, dt);
    }
    this.animateTool(m);
  }

  private downPoseFor(m: Member, outPos: Vec3, outQ: Quat): void {
    // Flat on its back, a gentle dazed wobble.
    const wob = Math.sin(this.matchTime * 6) * 0.08;
    this.tmpE.set(-Math.PI / 2 + 0.15, m.facing, wob, 'YXZ');
    outQ.setFromEuler(this.tmpE);
    const off = this.tmp.set(0, 0.75, 0).applyQuaternion(outQ);
    outPos.set(m.pos.x - off.x, m.pos.y + 0.35 - off.y, m.pos.z - off.z);
  }

  private animateTool(m: Member): void {
    const h = m.toolMesh;
    if (!h) return;
    this.followHand(m, h);
    const u = m.swingT; // 1 → 0
    if (m.tool === 'swatter') {
      // Wind back, then chop forward.
      const a = u > 0.6 ? THREE.MathUtils.lerp(TOOL_REST, -1.1, (1 - u) / 0.4) : THREE.MathUtils.lerp(1.7, -1.1, u / 0.6);
      h.rotation.x = u > 0 ? a : TOOL_REST;
    } else {
      // Point it forward while firing: the spray can's nozzle is on top, the water gun's barrel is along +z.
      const fire = m.tool === 'spray' ? 1.45 - u * 0.2 : -0.05 - u * 0.25;
      h.rotation.x = u > 0 ? fire : TOOL_REST;
    }
  }

  /** Keep the held tool in the character's right hand as the animation moves it. */
  private followHand(m: Member, h: Group): void {
    const root = m.root;
    if (!root) return;
    let attached = false;
    for (let o = m.hand; o; o = o.parent) if (o === root) { attached = true; break; }
    if (m.handOf !== root || (m.hand && !attached)) { // new character (or the model was swapped)
      m.handOf = root;
      m.hand = null;
      root.traverse((o) => { if (!m.hand && (o as import('three').Bone).isBone && HAND_RE.test(o.name)) m.hand = o; });
    }
    if (!m.hand) return; // no rig: keep the fixed side offset
    // Bone and root matrices are both from the last render, so the offset between them is consistent.
    h.position.setFromMatrixPosition(m.hand.matrixWorld);
    root.worldToLocal(h.position);
    h.position.x -= TOOL_SIDE;
  }

  private takeDamage(m: Member, dmg: number): void {
    if (!m.alive || m.invulnT > 0 || this.ending) return;
    m.hp -= dmg;
    m.hurtT = 0.25;
    if (m.human) { this.hud.hurt(); this.sfx.hurt(); }
    if (m.hp > 0) return;
    m.hp = 0;
    m.alive = false;
    m.downT = DIFFICULTY[this.difficulty].respawn;
    m.vel.set(0, 0, 0);
    if (m.tool !== 'swatter') this.setTool(m, 'swatter'); // power-ups are lost when you go down
    this.cb.dustBurst?.(m.pos.x, m.pos.y, m.pos.z, 2, 8);
    // Their ghost sobs its way up to heaven (they respawn at the checkpoint).
    this.ghosts.spawn(m.pos, m.height * this.opts.charScale(), this.camera);
    const vol = m.human ? 1 : this.earVol(m.pos, 10, 40) * 0.6;
    this.sfx.ghostCry(vol, m.human ? 0.6 : 0.2); // yours lands just after the knock-out sting
    if (m.human) {
      this.humanDownT = 0;
      this.cb.onPlayerDown?.();
    }
  }

  /** Back on your feet — by default near the last checkpoint the cart reached. */
  private respawn(m: Member, atCheckpoint = true): void {
    const s = !atCheckpoint ? m.s : this.reached > 0 ? CHECKPOINTS[this.reached - 1] * this.route.length : 1.5;
    const p = atCheckpoint
      ? this.route.offsetPoint(s, rand(-1, 1) * this.route.halfWidthAt(s) * 0.6, new THREE.Vector3())
      : m.pos.clone();
    m.hp = PLAYER_HP; m.alive = true; m.invulnT = RESPAWN_INVULN; m.s = s;
    m.pos.copy(p);
    if (atCheckpoint) {
      const t = this.route.tangentAt(s, this.tmp);
      m.facing = Math.atan2(t.x, t.z);
    }
    this.cb.dustBurst?.(p.x, p.y, p.z, 1.8, 8);
    if (m.human) {
      this.hud.setRespawn(null);
      this.sfx.respawn();
      this.cb.onRespawn?.(p, m.facing);
    } else if (m.ext && m.root) {
      m.root.rotation.x = 0;
    } else if (m.root) {
      m.root.quaternion.identity();
    }
  }

  // ── Attacks ────────────────────────────────────────────────────────────────
  /** The bug to auto-aim at: nearest in range, favouring ones on the lunch or on you. */
  private aimTarget(m: Member): Bug | null {
    const range = AIM_RANGE[m.tool];
    let best: Bug | null = null, bd = Infinity;
    for (const b of this.bugs) {
      if (b.dieT > 0 || b.spawnT > 0.2) continue;
      const d = Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z);
      if (d > range) continue;
      const score = d - (b.eating ? 1.5 : 0) - (b.target === m ? 2 : 0);
      if (score < bd) { bd = score; best = b; }
    }
    return best;
  }

  private attackWith(m: Member, target: Bug | null): void {
    const tool = TOOLS[m.tool];
    // The AI handicap only applies while the human plays (so they're never a passenger);
    // a crew-only delivery gets full-strength bots so it can actually get somewhere.
    const handicap = !m.human && this.active;
    m.cd = tool.cooldown * (handicap ? AI_COOLDOWN_MUL : 1);
    const dmg = tool.damage * (handicap ? AI_DAMAGE_MUL : 1);
    m.swingT = 1;
    const yaw = target ? Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z) : m.facing;
    m.aimYaw = yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const loud = m.human;

    if (m.tool === 'swatter') {
      if (loud) this.sfx.swing();
      // The weakest tool against swarms: a swing only connects with the nearest bug.
      const inArc: [Bug, number][] = [];
      for (const b of this.bugs) {
        if (b.dieT > 0) continue;
        const dx = b.pos.x - m.pos.x, dz = b.pos.z - m.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > tool.range + BUGS[b.kind].radius) continue;
        if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) continue; // ~70° either side
        inArc.push([b, d]);
      }
      inArc.sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < Math.min(SWAT_MAX_HITS, inArc.length); i++) this.hurtBug(inArc[i][0], dmg, m, fx, fz, 5);
      // The slap lands as the swatter reaches full extension; teammates' slaps are quieter.
      if (inArc.length > 0) this.sfx.swatHit(loud ? 1 : this.teammateVol(m.pos), SWAT_PEAK);
    } else if (m.tool === 'spray') {
      this.sfx.spray(loud ? 1 : this.teammateVol(m.pos));
      const cosCone = Math.cos(0.5);
      for (const b of this.bugs) {
        if (b.dieT > 0) continue;
        const dx = b.pos.x - m.pos.x, dz = b.pos.z - m.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > tool.range || (d > 0.6 && (dx * fx + dz * fz) / d < cosCone)) continue;
        this.hurtBug(b, dmg, m, fx, fz, 1.5);
      }
      for (let i = 0; i < 3; i++) {
        const a = yaw + rand(-0.35, 0.35), sp = rand(9, 14);
        this.emit('mist', this.tmp.set(m.pos.x + fx * 1.2, m.pos.y + 2.1, m.pos.z + fz * 1.2),
          this.tmp2.set(Math.sin(a) * sp, rand(-0.5, 1), Math.cos(a) * sp), 0.55, m);
      }
      m.ammo--;
    } else {
      this.sfx.pew(loud ? 1 : this.teammateVol(m.pos));
      const from = this.tmp.set(m.pos.x + fx * 1.2, m.pos.y + 2.0, m.pos.z + fz * 1.2);
      const to = target ? this.tmp2.copy(target.pos).setY(target.pos.y + 0.5) : this.tmp2.set(from.x + fx * 10, from.y, from.z + fz * 10);
      const v = this.tmp3.subVectors(to, from).normalize().multiplyScalar(30);
      this.emit('drop', from, v, 0.7, m);
      m.ammo--;
    }
    if (m.ammo <= 0) {
      if (m.human) this.hud.showBanner(m.tool === 'spray' ? 'Out of bug spray!' : 'Out of water!', 1.2);
      this.setTool(m, 'swatter');
    } else if (m.human) {
      this.hud.setTool(m.tool, m.ammo);
    }
  }

  /** A teammate's tool sounds: quieter than yours, fading out with distance. */
  private teammateVol(p: Vec3): number {
    return 0.4 * this.earVol(p, 6, 18);
  }

  private hurtBug(b: Bug, dmg: number, by: Member | null, fx: number, fz: number, knock: number): void {
    if (b.dieT > 0) return;
    b.hp -= dmg;
    b.hitT = 0.12;
    if (b.kind !== 'maggot') { b.vel.x += fx * knock; b.vel.z += fz * knock; }
    if (by && b.kind === 'fly') { b.target = by; b.aggroT = 4; } // flies swat back
    if (b.hp > 0) return;
    b.dieT = 0.35;
    b.eating = false;
    this.sfx.squish(by?.human ? 1 : this.earVol(b.pos, 6, 18) * 0.6);
    if (by?.human && this.active) this.cb.onPlayerSquash?.(b.kind);
    this.emit('splat', this.tmp.set(b.pos.x, this.route.heightAt(b.s) + 0.04, b.pos.z), this.tmp2.set(0, 0, 0), 3, null);
    this.cb.dustBurst?.(b.pos.x, b.pos.y, b.pos.z, 0.9, 4);
    if (Math.random() < BUGS[b.kind].drop && this.powerups.length < 4) {
      this.spawnPowerup(Math.random() < 0.5 ? 'spray' : 'watergun', this.tmp.copy(b.pos));
    }
  }

  // ── AI teammates ───────────────────────────────────────────────────────────
  private updateAI(m: Member, dt: number): void {
    if (!m.root) return;
    m.aiT -= dt;
    let target: Bug | null = null;
    let stopAt = 0.4;
    if (m.aiT <= 0) m.aiT = rand(0.2, 0.4);

    // 1. Debris blocking the cart: up to two AI go clear it.
    // (Only once the cart has rolled up to it — the AI don't pre-clear the path, so debris really stops the cart.)
    const blocking = this.debris.find((d) => d.falling <= 0 && d.clearT <= 0 && d.s > this.cartS - 2 && d.s < this.cartS + STOP_GAP + 2.5);
    const idx = this.members.indexOf(m);
    // 2. The most urgent bug: one on the lunch or on me, near the cart.
    let best: Bug | null = null, bd = Infinity;
    for (const b of this.bugs) {
      if (b.dieT > 0) continue;
      const dCart = Math.hypot(b.pos.x - this.cartPos.x, b.pos.z - this.cartPos.z);
      const dMe = Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z);
      if (dCart > (this.active ? AI_ENGAGE_RADIUS : AI_ENGAGE_RADIUS * 1.6) && b.target !== m) continue;
      const score = dMe + (b.eating ? -4 : 0) + (b.target === m ? -5 : 0) + (b.kind === 'maggot' ? -2 : 0);
      if (score < bd) { bd = score; best = b; }
    }
    // 3. A power-up nearby while stuck with the swatter.
    const power = m.tool === 'swatter'
      ? this.powerups.find((p) => Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < 12) : undefined;

    if (blocking && idx <= 2 && (!best || !best.eating)) {
      this.route.offsetPoint(blocking.s - 1.5, (idx - 1.5) * 1.6, m.goal);
      stopAt = 0.6;
    } else if (best) {
      target = best;
      m.goal.copy(best.pos);
      stopAt = Math.max(1.2, TOOLS[m.tool].range * (m.tool === 'swatter' ? 0.7 : 0.8));
    } else if (power) {
      m.goal.copy(power.pos);
      stopAt = 0.2;
    } else {
      // Escort slot around the cart, walking alongside it.
      const slot = [-2.6, 2.6, 0][(idx - 1) % 3];
      const ahead = [1.5, -0.5, -3.5][(idx - 1) % 3];
      this.route.offsetPoint(this.cartS + ahead, slot, m.goal);
      stopAt = 0.6;
    }

    // Seek along the corridor, with separation from teammates.
    const gs = this.route.project(m.goal.x, m.goal.z).s;
    const aim = this.route.steerTarget(m.s, m.goal, gs, this.tmp);
    const dx = aim.x - m.pos.x, dz = aim.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = this.tmp2.set(0, 0, 0);
    const far = Math.abs(gs - m.s) > 6 ? Infinity : dist;
    if (far > stopAt) {
      const sp = AI_SPEED * Math.min(1, (far - stopAt) / 2.5 + 0.35);
      want.set(dx / dist * sp, 0, dz / dist * sp);
    }
    for (const o of this.members) {
      if (o === m || !o.alive) continue;
      const ox = m.pos.x - o.pos.x, oz = m.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.8 && od > 1e-3) { want.x += ox / od * (1.8 - od) * 4; want.z += oz / od * (1.8 - od) * 4; }
    }
    m.vel.lerp(want, 1 - Math.exp(-10 * dt));
    m.pos.addScaledVector(m.vel, dt);
    this.pushOutOfCart(m.pos, 0.6);
    m.s = this.route.clamp(m.pos, 0.6);
    m.pos.y = this.route.heightAt(m.s);

    // Attack whatever's in reach (auto-aim, like the human).
    const aimT = target && Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z) <= TOOLS[m.tool].range + 0.6 ? target : null;
    if (aimT && m.cd <= 0) this.attackWith(m, aimT);

    const speed = Math.hypot(m.vel.x, m.vel.z);
    let face = speed > 0.6 ? Math.atan2(m.vel.x, m.vel.z) : m.facing;
    if (m.swingT > 0 && m.aimYaw !== null) face = m.aimYaw;
    let d = face - m.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    m.facing += d * (1 - Math.exp(-12 * dt));

    const scale = this.opts.charScale() * (m.profile ? SPECIES[m.profile.appearance.species].scale : 1);
    const foot = this.opts.footOffset() + (m.profile ? SPECIES[m.profile.appearance.species].footOffset : 0);
    const anim: AnimState = speed > 4 ? 'running' : speed > 0.6 ? 'walking' : 'idle';
    if (m.ext) {
      // A borrowed camper: the BotManager renders it from this pose (and keeps its scale).
      m.ext.pose.position.set(m.pos.x, m.pos.y, m.pos.z); // Bot adds its own foot offset
      m.ext.pose.facing = m.facing;
      m.ext.pose.anim = anim;
      m.root.rotation.x = 0;
      return;
    }
    m.root.position.set(m.pos.x, m.pos.y + foot, m.pos.z);
    m.root.quaternion.setFromEuler(this.tmpE.set(0, m.facing, 0, 'YXZ'));
    m.root.scale.setScalar(scale);
    m.root.visible = m.invulnT <= 0 || Math.sin(this.matchTime * 30) > -0.3;
    m.anim?.(dt, anim);
  }

  // ── Bugs ───────────────────────────────────────────────────────────────────
  private updateBugs(dt: number): void {
    const d = DIFFICULTY[this.difficulty];
    const bugs = this.bugs;
    let nomming = false;
    for (let i = bugs.length - 1; i >= 0; i--) {
      const b = bugs[i];
      const def = BUGS[b.kind];
      b.t += dt;
      b.hitT = Math.max(0, b.hitT - dt);
      for (const mt of b.model.flash) mt.emissive.setHex(b.hitT > 0 ? 0xffffff : 0x000000);
      if (b.dieT > 0) {
        b.dieT -= dt;
        const k = Math.max(0, b.dieT / 0.35);
        b.model.body.scale.set(1 + (1 - k) * 0.8, k * 0.9 + 0.05, 1 + (1 - k) * 0.8);
        b.pos.y += (this.route.heightAt(b.s) - b.pos.y) * (1 - Math.exp(-12 * dt));
        b.model.root.position.copy(b.pos);
        if (b.dieT <= 0) { this.releaseBug(b); bugs.splice(i, 1); }
        continue;
      }
      if (b.spawnT > 0) b.spawnT = Math.max(0, b.spawnT - dt);
      const pop = 1 - b.spawnT / 0.35;
      b.model.body.scale.setScalar(pop * (1 + (b.hitT > 0 ? 0.15 : 0)));

      if (b.kind === 'maggot') {
        // Stationary blocker: just wiggles.
        b.model.legs.forEach((seg, k) => { seg.position.x = Math.sin(b.t * 5 + k * 0.9) * 0.08; });
        b.model.root.position.copy(b.pos);
        continue;
      }

      // ── Pick a target ──
      b.aggroT = Math.max(0, b.aggroT - dt);
      if (b.target && (!b.target.alive || b.aggroT <= 0 && b.kind !== 'wasp')) b.target = null;
      if (b.kind === 'wasp') {
        // Wasps hunt players first.
        let best: Member | null = null, bd = 16;
        for (const m of this.members) {
          if (!m.alive) continue;
          const dm = Math.hypot(m.pos.x - b.pos.x, m.pos.z - b.pos.z);
          if (dm < bd) { bd = dm; best = m; }
        }
        b.target = best;
      } else if (b.kind === 'ant' && !b.target) {
        // Ants nip at anyone standing right on them.
        for (const m of this.members) {
          if (m.alive && Math.hypot(m.pos.x - b.pos.x, m.pos.z - b.pos.z) < 1.7) { b.target = m; b.aggroT = 2; break; }
        }
      }

      // ── Goal ──
      const goal = this.tmp;
      let reach: number;
      if (b.target) {
        goal.copy(b.target.pos);
        reach = def.reach;
      } else {
        // A spot around the cart's rim (each bug keeps its own angle).
        const c = Math.cos(this.cartYaw), s = Math.sin(this.cartYaw);
        const lx = Math.sin(b.slot) * (CART_HALF_W + 0.3), lz = Math.cos(b.slot) * (CART_HALF_L - 0.3);
        goal.set(this.cartPos.x + lx * c + lz * s, this.cartPos.y, this.cartPos.z - lx * s + lz * c);
        reach = 0.5;
      }
      const flying = def.fly > 0;
      const gs = this.route.project(goal.x, goal.z).s;
      const aim = flying ? goal : this.route.steerTarget(b.s, goal, gs, this.tmp2);
      const dx = aim.x - b.pos.x, dz = aim.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      const arrived = Math.hypot(goal.x - b.pos.x, goal.z - b.pos.z) <= reach + (b.target ? 0 : 0.4);

      // ── Steering: seek/arrive + separation (+ flocking for ant swarms) ──
      const want = this.tmp3.set(0, 0, 0);
      if (!arrived && dist > 1e-3) {
        const sp = def.speed * Math.min(1, dist / 2 + 0.3);
        want.set(dx / dist * sp, 0, dz / dist * sp);
      }
      let cx = 0, cz = 0, ax = 0, az = 0, nFlock = 0;
      for (let j = 0; j < bugs.length; j++) {
        const o = bugs[j];
        if (o === b || o.dieT > 0) continue;
        const ox = b.pos.x - o.pos.x, oz = b.pos.z - o.pos.z;
        const d2 = ox * ox + oz * oz;
        const sepR = def.radius + BUGS[o.kind].radius + 0.25;
        if (d2 < sepR * sepR && d2 > 1e-6) {
          const od = Math.sqrt(d2);
          const f = (sepR - od) / sepR * 7;
          want.x += ox / od * f; want.z += oz / od * f;
        }
        if (b.swarm && o.swarm === b.swarm && d2 < 16) {
          cx += o.pos.x; cz += o.pos.z; ax += o.vel.x; az += o.vel.z; nFlock++;
        }
      }
      if (nFlock > 0 && !arrived) {
        // Cohesion + alignment keep the swarm moving as one blob.
        want.x += (cx / nFlock - b.pos.x) * 0.6 + (ax / nFlock - b.vel.x) * 0.35;
        want.z += (cz / nFlock - b.pos.z) * 0.6 + (az / nFlock - b.vel.z) * 0.35;
      }
      // Don't climb inside the players or the cart.
      for (const m of this.members) {
        if (!m.alive) continue;
        const ox = b.pos.x - m.pos.x, oz = b.pos.z - m.pos.z;
        const od = Math.hypot(ox, oz);
        if (od < 1.0 && od > 1e-3) { want.x += ox / od * 3; want.z += oz / od * 3; }
      }
      if (flying) {
        // A little wander so fliers buzz rather than glide.
        want.x += Math.sin(b.t * 3.1 + b.slot * 5) * 1.6;
        want.z += Math.cos(b.t * 2.7 + b.slot * 3) * 1.6;
      }
      b.vel.lerp(want, 1 - Math.exp(-6 * dt));
      b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
      if (!flying) this.pushOutOfCart(b.pos, def.radius * 0.6);
      b.s = flying ? this.route.project(b.pos.x, b.pos.z).s : this.route.clamp(b.pos, def.radius * 0.5);
      const groundY = this.route.heightAt(b.s);
      const hoverY = groundY + def.fly + (flying ? Math.sin(b.t * 4 + b.slot) * 0.35 : 0);
      b.pos.y += (hoverY - b.pos.y) * (1 - Math.exp(-(flying ? 3 : 20) * dt));

      // ── Eat / attack ──
      b.eating = false;
      b.atkCd -= dt;
      if (arrived) {
        if (b.target) {
          if (b.atkCd <= 0) {
            b.atkCd = def.atkEvery * rand(0.85, 1.15);
            b.model.body.position.z = 0.35; // lunge
            this.takeDamage(b.target, def.dmg * d.dmgMul);
          }
        } else if (!this.ending) {
          b.eating = true;
          nomming = true;
          this.lunch = Math.max(0, this.lunch - def.eat * d.eatMul * dt / 100);
        }
      }
      b.model.body.position.z *= Math.exp(-10 * dt);

      // ── Visuals ──
      const faceX = b.eating || arrived ? goal.x - b.pos.x : b.vel.x;
      const faceZ = b.eating || arrived ? goal.z - b.pos.z : b.vel.z;
      if (faceX * faceX + faceZ * faceZ > 1e-4) {
        let dy = Math.atan2(faceX, faceZ) - b.model.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        b.model.root.rotation.y += dy * (1 - Math.exp(-10 * dt));
      }
      const moving = Math.hypot(b.vel.x, b.vel.z) > 0.4;
      b.model.legs.forEach((leg, k) => { leg.rotation.x = moving || b.eating ? Math.sin(b.t * 22 + k * 1.7) * 0.6 : 0; });
      b.model.wings.forEach((w, k) => { w.rotation.y = Math.sin(b.t * 70 + k * Math.PI) * 0.7; });
      if (b.eating) b.model.body.rotation.x = 0.25 + Math.sin(b.t * 14) * 0.15; // chomp
      else b.model.body.rotation.x = 0;
      b.model.root.position.copy(b.pos);
    }
    if (nomming) this.sfx.nom(this.earVol(this.cartPos, 6, 18));
  }

  // ── Particles (mist / water drops / splats) ────────────────────────────────
  private emit(kind: Particle['kind'], p: Vec3, v: Vec3, life: number, owner: Member | null): void {
    let part = this.particles.find((x) => !x.obj.visible && x.kind === kind);
    if (!part) {
      let obj: Particle['obj'];
      if (kind === 'mist') {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xd8ffe0, transparent: true, depthWrite: false, opacity: 0.6 }));
      } else if (kind === 'drop') {
        obj = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6fd0ff, emissive: 0x1d6fb0, emissiveIntensity: 0.5, roughness: 0.1 }));
      } else {
        const colors = [0x9bd14a, 0xd9c23a, 0x6fae3a];
        obj = new THREE.Mesh(new THREE.CircleGeometry(0.6, 10), asDecal(new THREE.MeshBasicMaterial({ color: pick(colors), transparent: true, depthWrite: false })));
        obj.rotation.x = -Math.PI / 2;
      }
      part = { obj, vel: new THREE.Vector3(), life: 0, max: 1, kind, owner: null };
      this.world.add(obj);
      this.particles.push(part);
    }
    part.obj.visible = true;
    part.obj.position.copy(p);
    part.vel.copy(v);
    part.life = part.max = life;
    part.owner = owner;
    if (kind === 'splat') part.obj.scale.setScalar(rand(0.8, 1.4));
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.obj.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.obj.visible = false; continue; }
      const u = p.life / p.max;
      if (p.kind === 'mist') {
        p.vel.multiplyScalar(Math.exp(-3 * dt));
        p.obj.position.addScaledVector(p.vel, dt);
        p.obj.scale.setScalar(0.6 + (1 - u) * 2.2);
        ((p.obj as InstanceType<typeof THREE.Sprite>).material).opacity = 0.55 * u;
      } else if (p.kind === 'drop') {
        p.vel.y -= 6 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        for (const b of this.bugs) {
          if (b.dieT > 0) continue;
          const r = BUGS[b.kind].radius + 0.55;
          const o = p.obj.position;
          if ((o.x - b.pos.x) ** 2 + (o.y - b.pos.y - 0.4) ** 2 + (o.z - b.pos.z) ** 2 < r * r) {
            this.hurtBug(b, TOOLS.watergun.damage * (p.owner && !p.owner.human && this.active ? AI_DAMAGE_MUL : 1), p.owner, p.vel.x / 30, p.vel.z / 30, 3);
            if (p.owner?.human) this.sfx.splash();
            p.life = 0; p.obj.visible = false;
            break;
          }
        }
      } else {
        ((p.obj as Mesh).material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = Math.min(1, u * 2) * 0.85;
      }
    }
  }

  // ── HUD + ending ───────────────────────────────────────────────────────────
  private updateHud(dt: number): void {
    const human = this.members[0];
    this.hud.setLunch(this.lunch);
    this.hud.setHp(human.hp / PLAYER_HP);
    this.hud.setProgress(this.cartS / this.route.length, this.reached);
    this.hud.setTime(this.matchTime);
    this.hud.setAttackEnabled(human.alive);
    let hint: string | null = null;
    if (!this.ending && human.alive && this.stallFor > 1.2) {
      if (this.stallReason === 'escort') hint = 'Stay near the cart to push it! 🛒';
      else if (this.stallReason === 'debris') hint = 'Clear the debris — stand next to it!';
      else if (this.stallReason === 'maggot') hint = 'Maggots are blocking the cart! 🐛';
      else if (this.stallReason === 'bugs') hint = 'Bugs on the cart — squash them to keep moving! 🐜';
    }
    if (!hint && this.lunch < 0.35 && this.bugs.some((b) => b.eating)) hint = 'Bugs are eating the lunch! 🍱';
    this.hud.setHint(hint);
    this.hud.update(dt);
  }

  private checkEnd(): void {
    if (this.lunch <= 0) this.finish('lost');
    else if (this.cartS >= this.route.length - 0.05) this.finish('won');
  }

  private finish(result: 'won' | 'lost'): void {
    this.ending = result;
    const id = this.matchId;
    this.hud.setHint(null);
    this.hud.setRespawn(null);
    if (result === 'won') {
      this.hud.showBanner(`🎉 LUNCH DELIVERED! 🎉\n${Math.ceil(this.lunch * 100)}% of the lunch made it`, RESULT_SECONDS);
      if (this.active) this.cb.onPlayerWin?.();
      else this.feed.push('🎉 Lunch was delivered to the beach picnic!', 4);
      // Bugs scatter; the feast goes out on the picnic tables.
      for (const b of this.bugs) this.hurtBug(b, 9999, null, 0, 0, 0);
      this.setFeast(true);
    } else {
      this.hud.showBanner('The bugs ate all the lunch! 🐜\nBetter luck next time', RESULT_SECONDS);
      if (this.active) this.cb.onPlayerLose?.();
      else this.feed.push('🐜 The bugs ate the lunch before it reached the beach!', 4);
    }
    // Anyone still down gets up where they lie for the result.
    for (const m of this.members) if (m.joined && !m.alive) this.respawn(m, false);
    setTimeout(() => { if (this.matchId === id && this.running) this.stop(); }, RESULT_SECONDS * 1000);
  }

  private setFeast(on: boolean): void {
    this.picnic.feast.visible = on;
    this.feastT = on ? FEAST_SECONDS : 0;
    this.cb.onFeast?.(on);
  }

  /** Runs every frame, playing or not: flags, the feast timer. */
  private animateIdle(dt: number): void {
    const t = performance.now() / 1000;
    for (let i = 0; i < this.flags.length; i++) this.flags[i].cloth.rotation.y = Math.sin(t * 2.2 + i) * 0.25;
    if (this.feastT > 0 && !this.running && (this.feastT -= dt) <= 0) this.setFeast(false);
  }
}
