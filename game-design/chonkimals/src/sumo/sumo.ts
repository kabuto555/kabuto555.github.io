/**
 * Sumo — five chonks dropped into the camp's sumo ring; the last one still
 * inside wins.
 *
 * Self-contained like Dodgeball: owns its AI regulars, physics, obstacles,
 * camera, input and HUD, exposes `active` + `pose` (the human's pose, which
 * main.ts copies onto the shared playerRoot) and is driven by `update()` from
 * the render loop. While nobody is playing, the regulars run an AI-only
 * attract match so the camp crowd always has something to watch.
 *
 * Design (see brief): a high fixed camera shows the whole ring. Drag anywhere
 * to pull back like a slingshot (an arrow previews where you'll go) and let go
 * to charge the opposite way — also mid-slide, to recover from the edge.
 * Chonks bounce off each other like rubber balls and off logs, picnic tables
 * and rocks; knockback grows over time so matches don't stall. Knocked out
 * players tumble onto the apron and spectate from there (emotes + chat).
 */
import { gameSettings } from '../game-settings';
import { loadSpeciesGltf, createCharacter, type AnimState } from '../player';
import { createBotProfile, SUMO_BOT_NAMES, SUMO_BOT_ID_BASE, type BotProfile } from '../bots/roster';
import { applyAppearance, SPECIES } from '../bots/appearance';
import { Nameplates } from '../bots/nameplates';
import { formatTroopTag } from '../troops';
import { gameEvents, PLAYER_ACTOR, type Actor } from '../events';
import type { ChatService } from '../chat/chat-service';
import { GameBanner } from '../ui/game-banner';
import {
  playBoom, playHopPop, playPowerUp, playPunch, playSpicy, playSpringBoing, playTaikoCountdown, playWhoosh,
} from '../minigame-sounds';
import type { FrogPose } from '../log-course';
import { SumoObstacles, collide, type Contact } from './sumo-obstacles';
import { DragLauncher, LaunchArrow, type DragState } from './sumo-input';
import { decide, makeBrain, type Launch, type SumoBody, type SumoBrain } from './sumo-ai';
import { SumoItems, type Item } from './sumo-items';
import { SumoTrails } from './sumo-trails';
import { icon } from '../ui/icons';
import { asDecal } from '../materials';

type Vec3 = InstanceType<typeof THREE.Vector3>;
type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Camera = InstanceType<typeof THREE.PerspectiveCamera>;
type Scene = InstanceType<typeof THREE.Scene>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Quat = InstanceType<typeof THREE.Quaternion>;

const PLAYERS = 5;
const SIZE = 1.4;             // sumo chonks are drawn (and collide) bigger than the camp crowd
const BODY_R = 0.95 * SIZE;   // collision radius (world)
const MAX_LAUNCH = 19;        // u/s at a full pull
const MIN_LAUNCH = 6;
const FRICTION = 1.5;         // per-second exponential velocity decay (a full launch slides ~12.7)
const LAUNCH_KEEP = 0.3;      // share of the current slide kept when launching again
const LAUNCH_CD = 0.55;       // seconds between launches
const RESTITUTION = 0.95;
const MIN_BOUNCE = 3;         // rubbery: every real bump shoves both apart at least this hard
const OBSTACLE_BOUNCE = 0.75;
const PRESSURE_RAMP = 0.035;  // knockback multiplier growth per second of fighting
const PRESSURE_MAX = 4;
const OUT_MARGIN = 0.15;      // centre this far past the edge = out
const SPAWN_FRAC = 0.62;      // spawn circle, fraction of the ring radius
const COUNTDOWN = 2.2;        // drop-in + "READY…" before anyone may launch
const START_BUFFER = 0.2;     // a release this close to the start is queued for "GO"; earlier ones are ignored
// Kabuki-style taiko over the countdown (seconds from the start): "ka" clacks
// that speed up, then a fast double "don-don" — the first don is GO.
const TAIKO_KA = [0.3, 0.9, 1.35, 1.65, 1.86, 2.02] as const;
const TAIKO_DON = [COUNTDOWN, COUNTDOWN + 0.13] as const;
const AI_GRACE = 0.35;        // AI waits this long after GO
const RESULT_DELAY = 1.1;     // beat after the last knockout before the result
const RESULT_SECONDS = 3.4;
const HIT_EVENT_FORCE = 9;    // impacts at least this hard emit a 'sumo_hit'
const LAST_HIT_WINDOW = 3;    // seconds a bump counts for the knockout credit
const APRON_STAND = 0.9;      // knocked-out chonks stand at least this far outside the edge
const WIN_TEXT_Y = 9;
const CAM_FOV = 45;
const CAM_PITCH = 1.08;       // ~62° down
const HUMAN_RING = 0xffe14a;
const SLOT_RING = [0xffa040, 0x3aa0ff, 0xff5a48, 0x5ad16a, 0xc070ff];
// Power-ups (see sumo-items.ts).
const BLAST_R = 7.5;          // bomb reach (world)
const BLAST_SPEED = 22;       // outward speed at the blast centre (u/s)
const BLAST_MIN = 0.4;        // share of that still felt at the edge of the reach
const SPICY_TIME = 8;         // seconds a pepper lasts
const SPICY_MULT = 1.9;       // a spicy chonk's bumps knock others this much further
const SPICY_RING = 0xff5a1a;
const CHEERS = ['😭', '😤', '👏', '🔥', '😂', '💀', '📣', '🍿', '😮'];

// Knocked-out tumble (world units, like Dodgeball's).
const GRAVITY = 16;
const KNOCK_UP = 6.5;
const KNOCK_SPIN = -8;
const KNOCK_ROLL = 3;
const KNOCK_BOUNCE = 0.35;
const KNOCK_DOWN_TIME = 0.7;
const KNOCK_GETUP_TIME = 0.5;
const BODY_PIVOT = 0.75 * SIZE;
const BODY_LIE_H = 0.35 * SIZE;

type KnockPhase = 'none' | 'air' | 'down' | 'getup';
interface Knock {
  phase: KnockPhase; t: number;
  cy: number; vy: number; // pivot world Y + its vertical speed
  ang: number; angVel: number; roll: number; rollVel: number;
  ang0: number; cy0: number;
}
const newKnock = (): Knock => ({ phase: 'none', t: 0, cy: 0, vy: 0, ang: 0, angVel: 0, roll: 0, rollVel: 0, ang0: 0, cy0: 0 });

interface Slot extends SumoBody {
  index: number;
  isHuman: boolean;
  actor: Actor;
  root: Group | null;
  anim: ((dt: number, s: AnimState) => void) | null;
  char: Regular | null;
  ring: Mesh;
  facing: number;
  cd: number;
  queued: Launch | null;
  brain: SumoBrain;
  squash: number;  // 0..1 bump pop
  crouch: number;  // 0..1 pull-back crouch
  dropH: number;   // drop-in height above the ring
  dropV: number;
  knock: Knock;
  lastHitBy: Slot | null;
  lastHitT: number;
  lastEventT: number;
  outAt: number;
  cheerIn: number;
  /** Seconds of spicy pepper left (0 = normal). */
  spicy: number;
}

interface Regular {
  root: Group;
  update: (dt: number, s: AnimState) => void;
  height: number;
  profile: BotProfile;
  actor: Actor;
}

/** The human's pose, plus a full orientation (tumbles) and scale multipliers on
 * the shared character scale (sumo size × bump squash). */
export interface SumoPose extends FrogPose {
  quaternion: Quat;
  squashXZ: number;
  squashY: number;
}

export interface SumoOptions {
  /** When present, the regulars register as speakers (knocked-out ones taunt). */
  chat?: ChatService | null;
  /** Shared character scale / grounding fine-tune (params.frogScale / footOffset). */
  charScale: () => number;
  footOffset: () => number;
}

export interface SumoCallbacks {
  onStart: () => void;
  onEnd: () => void;
  onPlayerWin?: () => void;
  onPlayerLose?: () => void;
  /** The human got knocked out of the ring (now spectating). */
  onPlayerOut?: () => void;
  dustBurst?: (x: number, y: number, z: number, scale: number, n: number) => void;
}

type Phase = 'countdown' | 'fight' | 'result';

export class Sumo {
  /** The human is in the match (controls + locked camera). */
  active = false;
  /** The regulars' AI-only attract match is running (always, once loaded). */
  ambient = false;

  private ready = false;
  private readonly scene: Scene;
  private readonly opts: SumoOptions;
  private readonly cb: SumoCallbacks;

  // Ring (world): centre, playing radius, surface height; apron pad radius/height.
  private cx = 0; private cz = 0; private R = 12; private topY = 0;
  private padR = 14; private padY = 0;
  /** Spectators (bots, the free-roaming player) are kept outside this radius. */
  private blockR = 15;
  private gateDirX = -1; private gateDirZ = 0;

  private readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private regulars: Regular[] = [];
  private perm: number[] = [];
  private readonly obstacles: SumoObstacles;
  private readonly items: SumoItems;
  private readonly trails: SumoTrails;
  private readonly boundary: Mesh;
  private readonly boundaryMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  private readonly marker: Mesh;
  private readonly arrow: LaunchArrow;
  private readonly drag: DragLauncher;
  private readonly banner: GameBanner;
  private readonly heatPill: HTMLDivElement;
  private readonly heatText: HTMLSpanElement;
  private readonly nameplates: Nameplates;
  private readonly anchors: (Vec3 | undefined)[] = [];
  private readonly anchorPool: Vec3[] = [];
  private winText: InstanceType<typeof THREE.Sprite> | null = null;
  private winTextT = 0;

  private phase: Phase = 'countdown';
  private phaseT = 0;
  private fightT = 0;
  private pressure = 1;
  private heatShown = 1;
  private resultIn = -1;
  private matchId = 0;
  private shake = 0;
  private clock = 0;
  private lastPop = 0;
  private camera: Camera | null = null;
  private cancelTaiko: (() => void) | null = null;

  private readonly _pose: SumoPose = {
    position: new THREE.Vector3(), facing: 0, anim: 'idle', quaternion: new THREE.Quaternion(), squashXZ: 1, squashY: 1,
  };
  private readonly contact: Contact = { nx: 0, nz: 0, depth: 0 };
  private readonly tmp = new THREE.Vector3();
  private readonly tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camReady = false;

  constructor(scene: Scene, root: Object3D, container: HTMLElement, opts: SumoOptions, cb: SumoCallbacks) {
    this.scene = scene;
    this.opts = opts;
    this.cb = cb;
    this.measureRing(root);

    scene.add(this.group);
    this.group.visible = false;
    this.obstacles = new SumoObstacles(scene);
    this.items = new SumoItems(scene);
    this.trails = new SumoTrails(scene, PLAYERS);

    // Painted boundary just inside the bales — warms to red as knockback ramps up.
    this.boundaryMat = asDecal(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.boundary = new THREE.Mesh(new THREE.RingGeometry(this.R - 0.24, this.R - 0.04, 96).rotateX(-Math.PI / 2), this.boundaryMat);
    this.boundary.position.set(this.cx, this.topY + 0.025, this.cz);
    this.group.add(this.boundary);

    // Bobbing "that's you" chevron over the human's head (the camera is far up).
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.8, 4).rotateX(Math.PI),
      new THREE.MeshBasicMaterial({ color: HUMAN_RING, depthTest: false, transparent: true }),
    );
    this.marker.renderOrder = 9;
    this.marker.visible = false;
    scene.add(this.marker);

    const ringGeom = new THREE.RingGeometry(BODY_R * 0.9, BODY_R * 1.15, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < PLAYERS; i++) {
      const ring = new THREE.Mesh(ringGeom, asDecal(new THREE.MeshBasicMaterial({
        color: SLOT_RING[i], transparent: true, opacity: 0.9, depthWrite: false,
      })));
      this.group.add(ring);
      this.slots.push({
        index: i, isHuman: i === 0, actor: PLAYER_ACTOR, root: null, anim: null, char: null, ring,
        x: 0, z: 0, vx: 0, vz: 0, alive: true, facing: 0, cd: 0, queued: null, brain: makeBrain(),
        squash: 0, crouch: 0, dropH: 0, dropV: 0, knock: newKnock(),
        lastHitBy: null, lastHitT: -99, lastEventT: -99, outAt: -1, cheerIn: 0, spicy: 0,
      });
    }

    this.arrow = new LaunchArrow(scene);
    this.drag = new DragLauncher(container, (s) => this.onRelease(s));
    this.banner = new GameBanner(container);

    this.heatPill = document.createElement('div');
    this.heatPill.style.cssText =
      'position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:30;' +
      "font-family:'Fredoka',system-ui,sans-serif;font-weight:700;font-size:clamp(13px,3.6vmin,18px);color:#fff6dc;" +
      'padding:6px 14px;border-radius:999px;background:rgba(90,61,26,0.82);box-shadow:0 3px 0 rgba(0,0,0,0.25);' +
      'pointer-events:none;display:none;white-space:nowrap;';
    const kb = document.createElement('img');
    kb.src = icon('game', 'knockback'); kb.alt = '';
    kb.style.cssText = 'width:1.6em;height:1.6em;vertical-align:-0.45em;margin:-0.3em 6px -0.3em -4px;';
    this.heatText = document.createElement('span');
    this.heatPill.append(kb, this.heatText);
    container.appendChild(this.heatPill);

    // The ring regulars are generated like the campgoers (seeded id → troop,
    // look, chat loadout). The GLBs are cached from the player load.
    this.nameplates = new Nameplates(container);
    const profiles = SUMO_BOT_NAMES.slice(0, PLAYERS).map((name, i) => createBotProfile(SUMO_BOT_ID_BASE + i, name));
    void Promise.all(profiles.map((profile) =>
      loadSpeciesGltf(SPECIES[profile.appearance.species]).then((gltf) => {
        const c = createCharacter(gltf);
        applyAppearance(c.root, profile.appearance);
        c.root.visible = false;
        const actor = { id: profile.memberId, name: profile.name };
        return { root: c.root, update: c.update, height: c.height, profile, actor };
      }),
    )).then((chars) => {
      for (const c of chars) {
        scene.add(c.root);
        this.regulars.push(c);
        this.anchors.push(undefined);
        this.nameplates.add(c.profile.name, c.profile.troop ? formatTroopTag(c.profile.troop) : null);
        opts.chat?.register({ actor: c.actor, loadout: c.profile.chatLoadout, anchor: (out) => this.headOf(c, out) });
      }
      this.ready = true;
      this.ambient = true;
      this.group.visible = true;
      this.setupMatch();
    }).catch((e) => console.warn('[sumo] regulars failed to load', e));
  }

  get pose(): SumoPose { return this._pose; }

  // ── Ring geometry ─────────────────────────────────────────────────────────

  /** Ring centre/radius/height from the baked meshes (scale-proof), with the
   * authored build_camp.py numbers as a fallback. */
  private measureRing(root: Object3D): void {
    const camp = root.getObjectByName('chunk_0_camp');
    camp?.updateMatrixWorld(true);
    const toWorld = (x: number, y: number, z: number) =>
      camp ? camp.localToWorld(new THREE.Vector3(x, y, z)) : new THREE.Vector3(x, y, z).multiplyScalar(1.35);
    const surf = root.getObjectByName('zone_sumo_surface');
    if (surf) {
      const b = new THREE.Box3().setFromObject(surf);
      this.cx = (b.min.x + b.max.x) / 2; this.cz = (b.min.z + b.max.z) / 2;
      this.R = (b.max.x - b.min.x) / 2; this.topY = b.max.y;
    } else {
      const c = toWorld(20, 0.22, 92), e = toWorld(29, 0.22, 92);
      this.cx = c.x; this.cz = c.z; this.topY = c.y; this.R = c.distanceTo(e);
    }
    const pad = root.getObjectByName('zone_sumo_pad_ground');
    if (pad) {
      const b = new THREE.Box3().setFromObject(pad);
      this.padR = (b.max.x - b.min.x) / 2; this.padY = b.max.y;
    } else {
      this.padR = this.R * (10.4 / 9); this.padY = this.topY - 0.14 * 1.35;
    }
    this.blockR = this.padR + 0.8;
    // The gate faces the camp path that runs in from the west-southwest.
    const g = toWorld(8, 0, 87);
    const dx = g.x - this.cx, dz = g.z - this.cz, d = Math.hypot(dx, dz) || 1;
    this.gateDirX = dx / d; this.gateDirZ = dz / d;
  }

  private floorAt(x: number, z: number): number {
    return Math.hypot(x - this.cx, z - this.cz) < this.R ? this.topY : this.padY;
  }

  /** Walk-up point that opens the Sumo tutorial (just outside the spectator line). */
  gatePoint(out: Vec3): Vec3 {
    return out.set(this.cx + this.gateDirX * (this.blockR + 1.2), this.padY, this.cz + this.gateDirZ * (this.blockR + 1.2));
  }

  /** Where main drops the human after a match. */
  exitPoint(out: Vec3): Vec3 {
    return out.set(this.cx + this.gateDirX * (this.blockR + 3), this.padY, this.cz + this.gateDirZ * (this.blockR + 3));
  }

  /** How far (x,z) is from the spectator line round the ring (0 = right against it). */
  edgeDistance(x: number, z: number): number {
    return Math.max(0, Math.hypot(x - this.cx, z - this.cz) - this.blockR);
  }

  /** Free-roam player collision: the ring + apron are off-limits unless you're playing. */
  inPlayArea(x: number, z: number): boolean {
    return !this.active && this.blocks(x, z);
  }

  /** The nearest point just outside the spectator line from (x,z). */
  ejectPoint(x: number, z: number, out: Vec3): Vec3 {
    const dx = x - this.cx, dz = z - this.cz, d = Math.hypot(dx, dz);
    const nx = d > 1e-3 ? dx / d : this.gateDirX, nz = d > 1e-3 ? dz / d : this.gateDirZ;
    return out.set(this.cx + nx * (this.blockR + 0.6), this.padY, this.cz + nz * (this.blockR + 0.6));
  }

  /** Bots never walk into or across the ring. */
  blocks(x: number, z: number): boolean {
    return this.ready && Math.hypot(x - this.cx, z - this.cz) < this.blockR;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** The human joins: take slot 0, the locked camera and the drag controls. */
  start(): void {
    if (this.active) return;
    if (!this.ready) { console.warn('[sumo] not ready yet'); return; }
    this.active = true;
    this.camReady = false;
    this.setupMatch();
    this.drag.setEnabled(true);
    this.banner.show('Sumo!', 'Drag to pull back, let go to charge', 'info', COUNTDOWN);
    this.cb.onStart();
  }

  /** The human is still fighting in the current match (not knocked out / spectating). */
  get playerInRing(): boolean {
    return this.active && this.slots.some((s) => s.alive && this.humanControls(s));
  }

  /** The human leaves; the ring goes back to the attract match. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.cancelTaiko?.();
    this.cancelTaiko = null;
    this.drag.setEnabled(false);
    this.arrow.hide();
    this.marker.visible = false;
    this.banner.hide();
    this.heatPill.style.display = 'none';
    this.cb.onEnd();
    this.setupMatch();
  }

  /** Fresh match: shuffle the regulars into slots, drop everyone in, lay out obstacles. */
  private setupMatch(): void {
    this.matchId++;
    // Taiko over the countdown: full in your match; spectators hear it fade with distance.
    this.cancelTaiko?.();
    const taikoVol = this.active ? 1 : Math.min(1, this.sfxVolume(this.cx, this.cz) * 1.6);
    this.cancelTaiko = taikoVol > 0.01 ? playTaikoCountdown(TAIKO_KA, TAIKO_DON, taikoVol) : null;
    this.phase = 'countdown';
    this.phaseT = 0;
    this.fightT = 0;
    this.pressure = 1;
    this.heatShown = 1;
    this.resultIn = -1;
    this.shake = 0;
    if (this.winText) this.winText.visible = false;
    this.shuffle();
    const spawns: { x: number; z: number }[] = [];
    for (let i = 0; i < PLAYERS; i++) {
      const s = this.slots[i];
      const a = -Math.PI / 2 + (i / PLAYERS) * Math.PI * 2; // slot 0 nearest the camera
      s.x = this.cx + Math.cos(a) * this.R * SPAWN_FRAC;
      s.z = this.cz + Math.sin(a) * this.R * SPAWN_FRAC;
      spawns.push({ x: s.x, z: s.z });
      s.vx = s.vz = 0;
      s.alive = true;
      s.facing = Math.atan2(this.cx - s.x, this.cz - s.z);
      s.cd = 0; s.queued = null; s.brain = makeBrain();
      s.squash = 0; s.crouch = 0;
      s.dropH = 7 + i * 1.3 + Math.random(); s.dropV = 0;
      s.knock = newKnock();
      s.lastHitBy = null; s.lastHitT = -99; s.lastEventT = -99; s.outAt = -1;
      s.cheerIn = 0; s.spicy = 0;
      const human = this.humanControls(s);
      s.actor = human ? PLAYER_ACTOR : s.char?.actor ?? { id: `sumo:${i}`, name: 'Chonk' };
      (s.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.setHex(human ? HUMAN_RING : SLOT_RING[i]);
    }
    this.obstacles.layout(this.cx, this.topY, this.cz, this.R, spawns);
    this.items.reset();
    this.trails.reset();
    for (const r of this.regulars) r.root.visible = true;
    // Slot 0's regular sits the match out while the human plays it.
    if (this.active && this.slots[0].char) this.slots[0].char.root.visible = false;
  }

  private shuffle(): void {
    const n = this.regulars.length;
    this.perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    for (const s of this.slots) {
      const c = this.regulars[this.perm[s.index]] ?? null;
      s.char = c; s.root = c?.root ?? null; s.anim = c?.update ?? null;
    }
  }

  private humanControls(s: Slot): boolean {
    return this.active && s.isHuman;
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  /** Screen pull → launch: opposite the drag, mapped through the camera's view. */
  private pullToLaunch(s: DragState): Launch | null {
    const cam = this.camera;
    if (!cam) return null;
    const e = cam.matrixWorld.elements;
    let rx = e[0], rz = e[2];          // screen right, flattened
    let ux = e[4], uz = e[6];          // screen up, flattened (≈ forward for a down-tilted cam)
    const rl = Math.hypot(rx, rz) || 1, ul = Math.hypot(ux, uz) || 1;
    rx /= rl; rz /= rl; ux /= ul; uz /= ul;
    const wx = -(rx * s.dx - ux * s.dy), wz = -(rz * s.dx - uz * s.dy);
    const len = Math.hypot(wx, wz);
    if (len < 1e-6) return null;
    return { dx: wx / len, dz: wz / len, power: s.power };
  }

  private onRelease(s: DragState): void {
    const h = this.slots[0];
    if (!this.active || !h.alive) return;
    const l = this.pullToLaunch(s);
    if (!l) return;
    // Released just before "GO" or during a cooldown: fires the moment it's allowed.
    // Too early in the countdown and it's dropped, so nobody pre-loads their opener.
    if (this.phase === 'countdown') {
      if (this.phaseT >= COUNTDOWN - START_BUFFER) h.queued = l;
    } else if (this.phase !== 'fight' || h.cd > 0) h.queued = l;
    else this.launch(h, l);
  }

  /** Velocity a launch would give `s` (keeps a share of its current slide). */
  private launchVel(s: Slot, l: Launch, out: { x: number; z: number }): void {
    const speed = THREE.MathUtils.lerp(MIN_LAUNCH, MAX_LAUNCH, l.power);
    out.x = s.vx * LAUNCH_KEEP + l.dx * speed;
    out.z = s.vz * LAUNCH_KEEP + l.dz * speed;
  }

  private readonly lv = { x: 0, z: 0 };
  private launch(s: Slot, l: Launch): void {
    this.launchVel(s, l, this.lv);
    s.vx = this.lv.x; s.vz = this.lv.z;
    s.cd = LAUNCH_CD;
    s.queued = null;
    s.facing = Math.atan2(l.dx, l.dz);
    s.squash = 0.8;
    s.crouch = 0;
    const v = this.sfxVolume(s.x, s.z);
    if (this.humanControls(s)) { playSpringBoing(0.45); playWhoosh(0.8); }
    else if (v > 0.05) { playSpringBoing(0.1 * v); playWhoosh(0.25 * v); }
  }

  // ── Per frame ─────────────────────────────────────────────────────────────

  update(dt: number, camera: Camera): void {
    if (!this.ready) return;
    this.camera = camera;
    this.clock += dt;
    this.phaseT += dt;
    this.shake = Math.max(0, this.shake - dt * 3);

    if (this.phase === 'countdown') {
      this.updateDrop(dt);
      if (this.phaseT >= COUNTDOWN) {
        this.phase = 'fight';
        this.phaseT = 0;
        if (this.active) this.banner.show('GO!', '', 'good', 0.9);
      }
    } else {
      if (this.phase === 'fight') {
        this.fightT += dt;
        this.pressure = Math.min(PRESSURE_MAX, 1 + this.fightT * PRESSURE_RAMP);
      }
      this.think(dt);
      const steps = Math.max(1, Math.ceil(dt / 0.017));
      for (let i = 0; i < steps; i++) this.step(dt / steps);
      for (const s of this.slots) if (!s.alive) this.updateOut(s, dt);
      this.updateOutcome(dt);
    }

    this.updateItems(dt);
    for (const s of this.slots) {
      s.squash = Math.max(0, s.squash - dt * 3.5);
      if (s.spicy > 0 && (!s.alive || (s.spicy -= dt) <= 0)) s.spicy = 0;
      if (s.spicy > 0) {
        this.items.fire.emit(s.x, this.topY + s.dropH, s.z, BODY_R * 0.85, 2.2 * SIZE, dt);
        const flick = 0.75 + 0.25 * Math.sin(this.clock * 30);
        (s.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.setHex(SPICY_RING).multiplyScalar(flick);
      } else {
        (s.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.setHex(this.humanControls(s) ? HUMAN_RING : SLOT_RING[s.index]);
      }
      const ringY = s.alive ? this.topY : this.floorAt(s.x, s.z);
      s.ring.position.set(s.x, ringY + 0.03, s.z);
      s.ring.visible = s.alive && s.dropH < 3;
    }
    this.updateHuman(dt);
    this.updateVisuals(dt);
    this.updateTrails(dt);
    this.updateHud();
    this.banner.update(dt);
    this.updateWinText(dt);
  }

  /** The drop-in: everyone falls onto their spawn with a dusty landing. */
  private updateDrop(dt: number): void {
    for (const s of this.slots) {
      if (s.dropH <= 0) continue;
      s.dropV -= GRAVITY * 1.4 * dt;
      s.dropH += s.dropV * dt;
      if (s.dropH <= 0) {
        s.dropH = 0; s.dropV = 0; s.squash = 1;
        this.cb.dustBurst?.(s.x, this.topY, s.z, this.opts.charScale(), 6);
        // Your own match's drop-in stays quiet under the taiko countdown.
        const v = this.active ? 0 : this.sfxVolume(s.x, s.z);
        if (v > 0.05) playHopPop(0.35 * v);
      }
    }
  }

  /** Launch decisions: the human's queued release, the AI's picks. */
  private think(dt: number): void {
    const fighting = this.phase === 'fight';
    for (const s of this.slots) {
      s.cd = Math.max(0, s.cd - dt);
      if (!s.alive || !fighting) continue;
      if (this.humanControls(s)) {
        if (s.queued && s.cd <= 0) this.launch(s, s.queued);
        continue;
      }
      s.brain.think -= dt;
      if (s.brain.think > 0 || s.cd > 0 || this.fightT < AI_GRACE) continue;
      s.brain.think = THREE.MathUtils.lerp(s.brain.pace[0], s.brain.pace[1], Math.random());
      const l = decide(s, s.brain, this.slots, this.cx, this.cz, this.R, this.items.live(), s.spicy > 0);
      if (l) this.launch(s, l);
    }
  }

  /** One physics substep for everyone still in the ring. */
  private step(dt: number): void {
    const damp = Math.exp(-FRICTION * dt);
    const alive = this.slots.filter((s) => s.alive);
    for (const s of alive) {
      s.x += s.vx * dt; s.z += s.vz * dt;
      s.vx *= damp; s.vz *= damp;
      if (s.vx * s.vx + s.vz * s.vz < 0.04) s.vx = s.vz = 0;
    }
    // Chonk vs chonk: bouncy, momentum-conserving, boosted by the knockback ramp.
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) this.bump(alive[i], alive[j]);
    }
    // Chonk vs obstacles.
    const c = this.contact;
    for (const s of alive) {
      for (const col of this.obstacles.colliders) {
        if (!collide(col, s.x, s.z, BODY_R, c)) continue;
        s.x += c.nx * c.depth; s.z += c.nz * c.depth;
        const vn = s.vx * c.nx + s.vz * c.nz;
        if (vn < 0) {
          s.vx -= (1 + OBSTACLE_BOUNCE) * vn * c.nx;
          s.vz -= (1 + OBSTACLE_BOUNCE) * vn * c.nz;
          if (vn < -4) { s.squash = Math.min(1, -vn / 14); this.pop(s.x, s.z, -vn, this.humanControls(s), playHopPop); }
        }
      }
    }
    // Out of the ring?
    for (const s of alive) {
      if (Math.hypot(s.x - this.cx, s.z - this.cz) > this.R + OUT_MARGIN) this.knockOut(s);
    }
  }

  private bump(a: Slot, b: Slot): void {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz), min = BODY_R * 2;
    if (d >= min || d < 1e-6) return;
    const nx = dx / d, nz = dz / d;
    const sep = (min - d) / 2;
    a.x -= nx * sep; a.z -= nz * sep;
    b.x += nx * sep; b.z += nz * sep;
    const aIn = a.vx * nx + a.vz * nz, bIn = -(b.vx * nx + b.vz * nz);
    const vn = aIn + bIn; // closing speed
    if (vn <= 0) return;
    const j = Math.max(MIN_BOUNCE, (1 + RESTITUTION) * vn / 2 * this.pressure);
    // A spicy chonk's bump sends the OTHER one flying (its own speed is unchanged).
    const ja = j * (b.spicy > 0 ? SPICY_MULT : 1), jb = j * (a.spicy > 0 ? SPICY_MULT : 1);
    a.vx -= nx * ja; a.vz -= nz * ja;
    b.vx += nx * jb; b.vz += nz * jb;
    a.squash = b.squash = Math.min(1, vn / 12);
    a.lastHitBy = b; b.lastHitBy = a;
    a.lastHitT = b.lastHitT = this.fightT;
    const human = this.humanControls(a) || this.humanControls(b);
    if (human) this.shake = Math.max(this.shake, Math.min(0.6, vn / 25));
    this.pop((a.x + b.x) / 2, (a.z + b.z) / 2, vn, human, playPunch); // chonk on chonk
    // Big hits are events the crowd reacts to (the harder charger gets the credit).
    const hitter = aIn >= bIn ? a : b, target = hitter === a ? b : a;
    if (vn >= HIT_EVENT_FORCE && this.clock - hitter.lastEventT > 0.8) {
      hitter.lastEventT = this.clock;
      gameEvents.emit({
        type: 'sumo_hit', actor: hitter.actor, target: target.actor,
        pos: this.tmp.set(target.x, this.topY, target.z), force: vn,
      });
    }
  }

  // ── Power-ups ─────────────────────────────────────────────────────────────

  /** Spawn/animate items; while fighting, chonks still in the ring pick them up by touch. */
  private updateItems(dt: number): void {
    const fighting = this.phase === 'fight';
    const c = this.contact;
    this.ringInfo.cx = this.cx; this.ringInfo.cz = this.cz; this.ringInfo.R = this.R; this.ringInfo.topY = this.topY;
    this.items.update(dt, this.ringInfo, fighting, (x, z, r) =>
      this.slots.every((s) => !s.alive || Math.hypot(s.x - x, s.z - z) > r + BODY_R + 1)
      && this.obstacles.colliders.every((col) => !collide(col, x, z, r, c)));
    if (!fighting) return;
    for (const s of this.slots) {
      if (!s.alive) continue;
      const it = this.items.take(s.x, s.z, BODY_R);
      if (!it) continue;
      gameEvents.emit({ type: 'sumo_item', actor: s.actor, pos: this.tmp.set(it.x, this.topY, it.z), item: it.kind });
      if (it.kind === 'bomb') this.detonate(s, it);
      else this.eatPepper(s);
    }
  }

  private readonly ringInfo = { cx: 0, cz: 0, R: 0, topY: 0 };

  /** Debug: drop a power-up just in front of you (or of the first chonk still in, if you're not playing). */
  debugDropItem(kind: 'bomb' | 'pepper'): void {
    const s = (this.active && this.slots[0].alive ? this.slots[0] : this.slots.find((q) => q.alive)) ?? this.slots[0];
    const toC = Math.atan2(this.cx - s.x, this.cz - s.z);
    this.items.place(kind, s.x + Math.sin(toC) * 3, s.z + Math.cos(toC) * 3);
  }

  /** Bomb: everyone in reach is blasted straight away from it (the toucher too). */
  private detonate(by: Slot, it: Item): void {
    const boost = 1 + (this.pressure - 1) * 0.5; // blasts ramp up a bit with the match too
    for (const s of this.slots) {
      if (!s.alive) continue;
      let dx = s.x - it.x, dz = s.z - it.z;
      let d = Math.hypot(dx, dz);
      if (d >= BLAST_R) continue;
      if (d < 0.05) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); d = 1; }
      const f = BLAST_SPEED * (BLAST_MIN + (1 - BLAST_MIN) * (1 - d / BLAST_R)) * boost;
      s.vx += (dx / d) * f; s.vz += (dz / d) * f;
      s.squash = 1;
      // Whoever set it off gets the credit for anyone it blows out.
      if (s !== by) { s.lastHitBy = by; s.lastHitT = this.fightT; }
    }
    this.items.explode(it.x, this.topY, it.z, BLAST_R);
    this.cb.dustBurst?.(it.x, this.topY, it.z, this.opts.charScale() * 1.6, 12);
    const near = this.active && Math.hypot(this.slots[0].x - it.x, this.slots[0].z - it.z) < BLAST_R;
    this.shake = Math.max(this.shake, this.active ? (near ? 0.9 : 0.5) : 0);
    playBoom(this.active ? 0.9 : 0.9 * this.sfxVolume(it.x, it.z));
    if (this.humanControls(by)) this.banner.show('BOOM!', 'You set off the bomb', 'info', 1.2);
    else if (near) this.banner.show('BOOM!', `${by.actor.name} set off a bomb`, 'bad', 1.2);
  }

  /** Spicy pepper: your bumps hit much harder for a while (movement unchanged). */
  private eatPepper(s: Slot): void {
    s.spicy = SPICY_TIME;
    s.squash = 1;
    const vol = this.humanControls(s) ? 0.9 : 0.9 * this.sfxVolume(s.x, s.z);
    playPowerUp(vol); // the pickup…
    playSpicy(vol);   // …and the spicy pepper on top
    if (this.humanControls(s)) this.banner.show('SPICY!', 'Your hits knock chonks way further', 'good', 1.5);
  }

  /** Impact sound (`play`: punch for chonk-on-chonk, pop off obstacles), louder the
   * harder the hit; rate-limited for bystanders. */
  private pop(x: number, z: number, force: number, human: boolean, play: (volume: number) => void): void {
    const k = THREE.MathUtils.clamp(force / 16, 0.2, 1);
    if (human) { play(0.8 * k); return; }
    if (this.clock - this.lastPop < 0.08) return;
    const v = this.sfxVolume(x, z);
    if (v <= 0.05) return;
    this.lastPop = this.clock;
    play(0.4 * k * v);
  }

  /** Volume scale for sounds at (x,z): full while playing, else fades with camera distance. */
  private sfxVolume(x: number, z: number): number {
    if (this.active) return 1;
    const cam = this.camera;
    if (!cam) return 0;
    const d = Math.hypot(cam.position.x - x, cam.position.z - z);
    return THREE.MathUtils.clamp(1 - (d - 15) / 35, 0, 1) * 0.5;
  }

  private knockOut(s: Slot): void {
    s.alive = false;
    s.outAt = this.fightT;
    s.cd = 0; s.queued = null; s.crouch = 0;
    // Keep flying the way you were going (at least a little outward), and tumble.
    let hx = s.vx, hz = s.vz;
    const ox = s.x - this.cx, oz = s.z - this.cz, ol = Math.hypot(ox, oz) || 1;
    const sp = Math.hypot(hx, hz);
    if (sp < 5) { hx = (ox / ol) * 5; hz = (oz / ol) * 5; }
    s.vx = hx; s.vz = hz;
    s.facing = Math.atan2(-hx, -hz); // backflip away from the ring
    const k = s.knock;
    k.phase = 'air'; k.t = 0;
    k.cy = this.topY + BODY_PIVOT; k.vy = KNOCK_UP;
    k.ang = 0; k.angVel = KNOCK_SPIN * (0.8 + Math.random() * 0.4);
    k.roll = 0; k.rollVel = (Math.random() * 2 - 1) * KNOCK_ROLL;
    s.cheerIn = 1.5 + Math.random() * 2;
    const by = s.lastHitBy && this.fightT - s.lastHitT < LAST_HIT_WINDOW ? s.lastHitBy : null;
    gameEvents.emit({ type: 'sumo_out', actor: s.actor, pos: this.tmp.set(s.x, this.topY, s.z), by: by?.actor ?? null });
    if (this.humanControls(s)) {
      this.shake = Math.max(this.shake, 0.5);
      this.drag.setEnabled(false);
      this.arrow.hide();
      this.banner.show('Knocked out!', by ? `by ${by.actor.name}` : 'Cheer from the sidelines!', 'bad', 2.2);
      this.cb.onPlayerOut?.();
    } else if (this.active) {
      const by0 = by && this.humanControls(by);
      if (by0) this.banner.show('Ring out!', `You knocked out ${s.actor.name}`, 'good', 1.6);
    }
  }

  /** A knocked-out chonk: tumble onto the apron, get up, watch (and taunt). */
  private updateOut(s: Slot, dt: number): void {
    const k = s.knock;
    if (k.phase === 'none') {
      s.vx = s.vz = 0;
      this.clampApron(s, true);
      const want = Math.atan2(this.cx - s.x, this.cz - s.z);
      s.facing += wrap(want - s.facing) * (1 - Math.exp(-4 * dt));
      if (!this.humanControls(s)) this.cheer(s, dt);
      return;
    }
    k.t += dt;
    if (k.phase === 'getup') {
      const u = Math.min(1, k.t / KNOCK_GETUP_TIME);
      const e = u * u * (3 - 2 * u);
      const upright = Math.round(k.ang0 / (Math.PI * 2)) * Math.PI * 2;
      k.ang = THREE.MathUtils.lerp(k.ang0, upright, e);
      k.cy = THREE.MathUtils.lerp(k.cy0, this.floorAt(s.x, s.z) + BODY_PIVOT, e);
      k.roll *= 1 - e;
      if (u >= 1) { k.phase = 'none'; k.ang = 0; k.roll = 0; s.squash = 1; }
      return;
    }
    s.x += s.vx * dt; s.z += s.vz * dt;
    this.clampApron(s, false);
    k.vy -= GRAVITY * dt;
    k.cy += k.vy * dt;
    k.ang += k.angVel * dt;
    k.roll += k.rollVel * dt;
    const floor = this.floorAt(s.x, s.z);
    const groundH = floor + THREE.MathUtils.lerp(BODY_PIVOT, BODY_LIE_H, Math.abs(Math.sin(k.ang)));
    if (k.cy <= groundH) {
      k.cy = groundH;
      if (k.vy < -2.5) {
        this.cb.dustBurst?.(s.x, floor, s.z, this.opts.charScale(), Math.round(THREE.MathUtils.clamp(-k.vy, 3, 10)));
        k.vy = -k.vy * KNOCK_BOUNCE;
        s.vx *= 0.6; s.vz *= 0.6;
        k.angVel *= 0.5; k.rollVel *= 0.5;
        if (this.humanControls(s)) this.shake = Math.max(this.shake, 0.3);
      } else {
        k.vy = 0;
        if (k.phase === 'air') { k.phase = 'down'; k.t = 0; }
      }
    }
    if (k.phase === 'down') {
      const f = Math.exp(-6 * dt);
      s.vx *= f; s.vz *= f;
      k.angVel *= f; k.rollVel *= f;
      const lie = -Math.PI / 2 + Math.round((k.ang + Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2;
      const sm = 1 - Math.exp(-8 * dt);
      k.ang += (lie - k.ang) * sm;
      k.roll += (0 - k.roll) * sm;
      if (k.t > KNOCK_DOWN_TIME && s.vx * s.vx + s.vz * s.vz < 0.25) {
        k.phase = 'getup'; k.t = 0; k.ang0 = k.ang; k.cy0 = k.cy;
      }
    }
  }

  /** Keep knocked-out chonks on the apron: never past the spectator line, and
   * (once standing) never back inside the ring. */
  private clampApron(s: Slot, standing: boolean): void {
    const ox = s.x - this.cx, oz = s.z - this.cz;
    const r = Math.hypot(ox, oz) || 1e-6;
    const nx = ox / r, nz = oz / r;
    const maxR = this.padR - 0.35;
    const minR = standing ? Math.min(maxR, this.R + APRON_STAND) : 0;
    const cr = THREE.MathUtils.clamp(r, minR, maxR);
    if (cr !== r) {
      s.x = this.cx + nx * cr; s.z = this.cz + nz * cr;
      const vr = s.vx * nx + s.vz * nz;
      if (r > maxR && vr > 0) { s.vx -= vr * nx; s.vz -= vr * nz; }
    }
  }

  /** Knocked-out regulars cheer and taunt from the apron. */
  private cheer(s: Slot, dt: number): void {
    const chat = this.opts.chat;
    if (!chat || (s.cheerIn -= dt) > 0) return;
    s.cheerIn = 2.5 + Math.random() * 4;
    s.squash = 0.7;
    const lines = s.char?.profile.chatLoadout.forContext(Math.random() < 0.5 ? 'watch_bump' : 'spectate_idle') ?? [];
    if (lines.length > 0 && Math.random() < 0.35) chat.say(s.actor.id, lines[Math.floor(Math.random() * lines.length)].id);
    else chat.emote(s.actor.id, CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  }

  /** Last one in wins: short beat, result, then the next match (or back to camp). */
  private updateOutcome(dt: number): void {
    if (this.phase === 'fight') {
      const alive = this.slots.filter((s) => s.alive).length;
      if (alive <= 1) {
        if (this.resultIn < 0) this.resultIn = RESULT_DELAY;
        if ((this.resultIn -= dt) <= 0) this.declareResult();
      }
      return;
    }
    if (this.phase === 'result' && this.phaseT >= RESULT_SECONDS) {
      if (this.active) this.stop();
      else this.setupMatch();
    }
  }

  private declareResult(): void {
    this.phase = 'result';
    this.phaseT = 0;
    // Nobody left (a double ring-out) → whoever stayed in longest.
    const winner = this.slots.find((s) => s.alive)
      ?? this.slots.reduce((a, b) => (b.outAt > a.outAt ? b : a));
    winner.squash = 1;
    gameEvents.emit({ type: 'sumo_win', actor: winner.actor, pos: this.tmp.set(winner.x, this.topY, winner.z) });
    if (this.active) {
      this.drag.setEnabled(false);
      this.arrow.hide();
      if (this.humanControls(winner)) {
        this.banner.show('YOU WIN!', 'Last chonk standing', 'good', RESULT_SECONDS);
        this.cb.onPlayerWin?.();
      } else {
        this.banner.show('You lost', `${winner.actor.name} is the last chonk standing`, 'bad', RESULT_SECONDS);
        this.cb.onPlayerLose?.();
      }
    } else {
      this.showWinText(`${winner.actor.name} wins!`);
    }
  }

  // ── Human + visuals ───────────────────────────────────────────────────────

  private updateHuman(dt: number): void {
    if (!this.active) return;
    const h = this.slots[0];
    const pull = h.alive ? this.drag.drag : null;
    if (pull) {
      const l = this.pullToLaunch(pull);
      if (l) {
        // Preview: where this launch would carry you (current slide included).
        this.launchVel(h, l, this.lv);
        const sp = Math.hypot(this.lv.x, this.lv.z);
        const dist = sp / FRICTION;
        const ex = h.x + (this.lv.x / sp) * dist, ez = h.z + (this.lv.z / sp) * dist;
        const out = Math.hypot(ex - this.cx, ez - this.cz) > this.R;
        const yaw = Math.atan2(this.lv.x, this.lv.z);
        this.arrow.show(h.x, this.topY, h.z, yaw, dist, l.power, out, this.phase === 'fight' && h.cd <= 0);
        h.facing += wrap(yaw - h.facing) * (1 - Math.exp(-14 * dt));
        h.crouch += (l.power - h.crouch) * (1 - Math.exp(-12 * dt));
      }
    } else {
      this.arrow.hide();
      h.crouch *= Math.exp(-10 * dt);
    }
    this.bodyTransform(h, this._pose.position, this._pose.quaternion);
    this._pose.facing = h.facing;
    this._pose.anim = this.animFor(h);
    const sq = this.squashOf(h);
    this._pose.squashXZ = sq.xz * SIZE; this._pose.squashY = sq.y * SIZE;
    // "That's you" chevron.
    this.marker.visible = h.alive && h.dropH <= 0;
    this.marker.position.set(h.x, this.topY + 3.2 * SIZE + 0.25 * Math.sin(this.clock * 5), h.z);
  }

  private updateVisuals(dt: number): void {
    const scale = this.opts.charScale();
    const foot = this.opts.footOffset();
    for (const s of this.slots) {
      if (this.humanControls(s) || !s.root || !s.anim || !s.char) continue;
      const sp = SPECIES[s.char.profile.appearance.species];
      if (s.alive && s.vx * s.vx + s.vz * s.vz > 2) {
        s.facing += wrap(Math.atan2(s.vx, s.vz) - s.facing) * (1 - Math.exp(-10 * dt));
      }
      this.bodyTransform(s, s.root.position, s.root.quaternion);
      s.root.position.y += foot + sp.footOffset;
      const sq = this.squashOf(s);
      const base = scale * sp.scale * SIZE;
      s.root.scale.set(base * sq.xz, base * sq.y, base * sq.xz);
      s.root.visible = true;
      s.anim(dt, this.animFor(s));
    }
    // Boundary warms toward red as knockback climbs.
    const heat = (this.pressure - 1) / (PRESSURE_MAX - 1);
    this.boundaryMat.color.setRGB(1, 1 - 0.75 * heat, 1 - 0.85 * heat);
    this.boundaryMat.opacity = 0.5 + 0.3 * heat + (heat > 0.3 ? 0.12 * Math.sin(this.clock * (4 + 8 * heat)) : 0);
  }

  /** Movement streaks behind anyone sliding fast (including a ring-out tumble). */
  private updateTrails(dt: number): void {
    for (const s of this.slots) {
      const flying = s.alive || s.knock.phase === 'air';
      const speed = flying && s.dropH <= 0 ? Math.hypot(s.vx, s.vz) : 0;
      const color = s.spicy > 0 ? SPICY_RING : this.humanControls(s) ? HUMAN_RING : SLOT_RING[s.index];
      this.trails.update(s.index, dt, s.x, this.floorAt(s.x, s.z) + 0.3, s.z, speed, BODY_R * 1.9, color);
    }
  }

  private squashOf(s: Slot): { xz: number; y: number } {
    const pop = s.squash, c = s.crouch;
    return { xz: 1 + 0.14 * pop + 0.12 * c, y: 1 - 0.2 * pop - 0.18 * c };
  }

  /** Feet position + orientation, pivoting tumbles about the body centre. */
  private bodyTransform(s: Slot, outPos: Vec3, outQuat: Quat): void {
    const k = s.knock;
    this.tmpE.set(k.ang, s.facing, k.roll, 'YXZ');
    outQuat.setFromEuler(this.tmpE);
    if (k.phase === 'none') { outPos.set(s.x, this.floorAt(s.x, s.z) + s.dropH, s.z); return; }
    const off = this.tmp.set(0, BODY_PIVOT, 0).applyQuaternion(outQuat);
    outPos.set(s.x - off.x, k.cy - off.y, s.z - off.z);
  }

  private animFor(s: Slot): AnimState {
    const k = s.knock.phase;
    if (k === 'air' || k === 'down') return 'falling_idle';
    if (k === 'getup') return 'hard_landing';
    if (s.dropH > 0) return 'falling_idle';
    if (!s.alive) return 'idle';
    return s.vx * s.vx + s.vz * s.vz > 6 ? 'running' : 'idle';
  }

  private updateHud(): void {
    if (!this.active || this.phase !== 'fight') { this.heatPill.style.display = 'none'; return; }
    this.heatPill.style.display = 'block';
    const alive = this.slots.filter((s) => s.alive).length;
    this.heatText.textContent = `Knockback ×${this.pressure.toFixed(1)}   ·   ${alive} left`;
    // Call out each whole step of the ramp.
    const step = Math.floor(this.pressure);
    if (step > this.heatShown) {
      this.heatShown = step;
      if (this.slots[0].alive) this.banner.show('Knockback up!', `Hits are ×${step} as strong`, 'info', 1.3);
    }
  }

  // ── Camera (fixed, high, frames the whole ring) ──────────────────────────
  updateCamera(camera: Camera, dt: number): void {
    if (camera.fov !== CAM_FOV) { camera.fov = CAM_FOV; camera.updateProjectionMatrix(); }
    const vHalf = THREE.MathUtils.degToRad(CAM_FOV / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const Rv = this.R + 2.2; // ring + a strip of apron for the knocked-out
    const sp = Math.sin(CAM_PITCH), cp = Math.cos(CAM_PITCH);
    const fitW = Rv / Math.tan(hHalf);
    const fitH = (Rv * sp) / Math.tan(vHalf) + Rv * cp;
    const L = Math.max(fitW, fitH) * 1.08;
    this.tmp.set(this.cx, this.topY + L * sp, this.cz - L * cp);
    const look = this.camLookT.set(this.cx, this.topY, this.cz);
    if (!this.camReady) { this.camPos.copy(this.tmp); this.camLook.copy(look); this.camReady = true; }
    else {
      const s = 1 - Math.exp(-6 * dt);
      this.camPos.lerp(this.tmp, s); this.camLook.lerp(look, s);
    }
    const shake = gameSettings.get().screenShake ? this.shake : 0;
    camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * shake * 1.4,
      this.camPos.y + (Math.random() - 0.5) * shake * 1.4,
      this.camPos.z,
    );
    camera.lookAt(this.camLook);
  }
  private readonly camLookT = new THREE.Vector3();

  /** Where the sun's shadow camera should centre while playing. */
  centre(out: Vec3): Vec3 { return out.set(this.cx, this.topY, this.cz); }

  // ── Nameplates / chat anchors ─────────────────────────────────────────────

  private headOf(c: Regular, out: Vec3): Vec3 {
    const sp = SPECIES[c.profile.appearance.species];
    return out.copy(c.root.position).setY(c.root.position.y + c.height * this.opts.charScale() * sp.scale * SIZE + 0.35);
  }

  /** Floating name + troop plates over the regulars. Call after the camera is placed. */
  updateNameplates(camera: Camera, visible: boolean): void {
    this.nameplates.visible = visible && this.ready;
    for (let i = 0; i < this.anchors.length; i++) this.anchors[i] = undefined;
    for (const s of this.slots) {
      if (this.humanControls(s) || !s.char || !s.char.root.visible) continue;
      const ci = this.perm[s.index];
      this.anchors[ci] = this.headOf(s.char, this.anchorPool[ci] ??= new THREE.Vector3());
    }
    this.nameplates.update(camera, this.anchors as Vec3[]);
  }

  // ── Floating "X wins!" for spectators ─────────────────────────────────────
  private showWinText(text: string): void {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const ctx = cv.getContext('2d')!;
    let px = 140;
    ctx.font = `700 ${px}px 'Fredoka', system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    if (w > 940) { px = Math.floor(px * 940 / w); ctx.font = `700 ${px}px 'Fredoka', system-ui, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 24;
    ctx.strokeStyle = '#3a2410';
    ctx.strokeText(text, 512, 128);
    ctx.fillStyle = '#ffe14a';
    ctx.fillText(text, 512, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!this.winText) {
      this.winText = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      this.winText.renderOrder = 10;
      this.scene.add(this.winText);
    } else {
      const m = this.winText.material as InstanceType<typeof THREE.SpriteMaterial>;
      m.map?.dispose();
      m.map = tex; m.needsUpdate = true;
    }
    this.winText.visible = true;
    this.winTextT = 0;
  }

  private updateWinText(dt: number): void {
    const w = this.winText;
    if (!w || !w.visible) return;
    if (this.active) { w.visible = false; return; }
    this.winTextT += dt;
    const pop = Math.min(1, this.winTextT / 0.35);
    const s = (1 - Math.pow(1 - pop, 3)) * (1 + 0.04 * Math.sin(this.winTextT * 4));
    w.scale.set(16 * s, 4 * s, 1);
    w.position.set(this.cx, this.topY + WIN_TEXT_Y + 0.3 * Math.sin(this.winTextT * 2), this.cz);
  }

  status(): string {
    const alive = this.slots.filter((s) => s.alive).length;
    const h = this.slots[0];
    const you = this.active ? `  you: ${h.alive ? 'in' : 'out'} v=${Math.hypot(h.vx, h.vz).toFixed(1)}` : '';
    const items = this.items.live().map((i) => i.kind).join(',') || '-';
    const spicy = this.slots.filter((s) => s.spicy > 0).length;
    return `SUMO  ${this.phase}  in ring: ${alive}  knockback ×${this.pressure.toFixed(2)}  t:${this.fightT.toFixed(0)}s  items:${items} spicy:${spicy}${you}`;
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
