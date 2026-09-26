/**
 * Dodgeball — a 4v4 minigame played on the camp's dodgeball court.
 *
 * Self-contained and modelled on LogCourse: it owns its AI players, balls,
 * camera, input button, SFX and screen-shake, exposes `active` + `pose` (the
 * human frog's pose, which main.ts copies onto the shared playerRoot) and is
 * driven by `update(dt, move, camera)` from main.ts's render loop.
 *
 * Faked multiplayer (WIM has no networking): the other 7 players are local AI
 * frogs. All physics/homing/AI are hand-rolled on the global THREE.
 *
 * Design (see brief): drag/joystick to move; a big button flick-thrown UP
 * throws the held ball straight up-court with slight (time-ramping) homing —
 * curveballs; with no ball the button becomes CATCH (a short window that turns
 * an incoming ball into an elimination of the thrower). 3 balls start on the
 * centre line and roll to a random side; loose balls are picked up by contact
 * on your own half; a clean hit eliminates (grounded balls are harmless and
 * slow); eliminated players spectate from the sideline.
 */
import { gameSettings } from './game-settings';
import { distanceFalloff } from './sfx-falloff';
import { loadSpeciesGltf, createCharacter } from './player';
import { createBotProfile, DODGEBALL_BOT_NAMES, DODGEBALL_BOT_ID_BASE, type BotProfile } from './bots/roster';
import { applyAppearance, SPECIES } from './bots/appearance';
import { Nameplates } from './bots/nameplates';
import { formatTroopTag } from './troops';
import type { AnimState } from './player';
import type { FrogPose } from './log-course';
import { icon } from './ui/icons';

type Vec3 = InstanceType<typeof THREE.Vector3>;
type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Camera = InstanceType<typeof THREE.PerspectiveCamera>;
type Scene = InstanceType<typeof THREE.Scene>;
type Object3D = InstanceType<typeof THREE.Object3D>;

const AI_SCALE = 1.9; // court frogs are drawn bigger than the camp crowd
const HIT_SOUND_URL = 'assets/dodgeball-hit.mp3';
const TEAM_COUNT = 4; // per team → 4v4
const NUM_PLAYERS = TEAM_COUNT * 2; // 8 total; one ball each

// Team 0 = the human's team (near/low-z half, camera behind). Team 1 = far half.
const TEAM_COLOR = [0x3aa0ff, 0xff5a48]; // blue / red rings
const HUMAN_RING = 0xffe14a; // gold ring for the human
// Gap (in baked world units, before WORLD_SCALE) between the court edge and the
// perimeter fence. The GLB bakes a roomy ~6.5; we pull the fence in so
// spectators outside it stand close to the action.
const FENCE_MARGIN = 3.5;
const GATE_HALF_GAP = 3.0; // half of fence_rect's gate_w in build_camp.py

const BALL_RADIUS = 0.42;
const PICKUP_RADIUS = 2.4; // generous vs the 1.9×-scaled frogs
const HIT_RADIUS = 1.0;
const CATCH_WINDOW = 0.45; // seconds a catch is live
const THROW_COOLDOWN = 0.35;
const GRAVITY = 16;
const MOVE_SPEED = 7.5;
const BASE_THROW_SPEED = 19;
const BASE_HOMING = 0.55; // steer toward target (gentle early; ramps up over time)
const RAMP_PER_SEC = 0.014; // difficulty creep (throw speed + homing)
const GROUND_FRICTION = 1.6; // per second velocity damp for loose balls
// Tip-off: balls roll off the centre line within ±this angle of straight
// up/down court (60° → never within 30° of rolling along the line).
const BALL_START_MAX_ANGLE = Math.PI / 3;
const BALL_START_SPEED: [number, number] = [5, 9]; // units/s (friction stops them ~3–6 units in)

// Hit knockback: the frog is launched back off the ball and tumbles as one
// physics body (gravity, spin, bounces, sliding friction), lies on its back
// for a beat, then gets up and walks to its bench.
const KNOCK_SPEED = 10;     // horizontal launch speed, along the ball's travel
const KNOCK_UP = 7.5;       // upward launch speed
const KNOCK_SPIN = -9;      // rad/s pitch (negative = backflip, head goes back)
const KNOCK_ROLL = 4;       // max rad/s random sideways roll
const KNOCK_BOUNCE = 0.35;  // vertical restitution on landing
const KNOCK_DOWN_TIME = 0.9; // seconds lying flat before getting up
const KNOCK_GETUP_TIME = 0.55;
const BODY_PIVOT = 0.75;    // spin pivot height above the feet (≈ body centre)
const BODY_LIE_H = 0.35;    // pivot height when lying flat on the ground
// Throw button gestures: a tap throws straight up-court; press + flick throws
// along the flick, clamped to ±FLICK_MAX_ANGLE from straight up.
const FLICK_MIN_PX = 18;          // travel below this is a tap
const FLICK_MAX_ANGLE = Math.PI / 3.8; // 60°
const AIM_ASSIST = 0.35;          // rad (~20°): a flicked ball curves toward an opponent this close to its line
const RESULT_SECONDS = 3.6; // how long the win/lose result shows before reset
const WIN_TEXT_Y = 11;       // spectator win text height above the court
const SPEC_DIST = 9;         // eliminated-spectator camera orbit distance
const SPEC_PITCH = 0.6;      // its default tilt (radians above horizontal)

type BallState = 'loose' | 'held' | 'thrown';

interface Ball {
  mesh: Mesh;
  state: BallState;
  pos: Vec3;
  vel: Vec3;
  holder: Slot | null;
  ownerTeam: number; // team of the last thrower (who a hit credits)
  trail: Trail;
  // Who a thrown ball curves toward: 'nearest' living opponent (taps + AI),
  // a specific aimed-at opponent (flick throws), or nobody (flicked at open court).
  homing: 'nearest' | Slot | null;
  thrower: Slot | null; // who threw it (a catch eliminates them)
}

interface Slot {
  team: number;
  isHuman: boolean;
  root: Group | null; // AI visual (human is rendered by main)
  anim: ((dt: number, s: AnimState) => void) | null;
  ring: Mesh;
  pos: Vec3;
  vel: Vec3;
  facing: number;
  alive: boolean;
  ball: Ball | null;
  catchTimer: number; // >0 while a catch window is open
  throwCd: number;
  aiTimer: number; // AI re-decision timer
  aiDir: Vec3; // current AI wander/seek direction
  squash: number; // 0..1 throw/catch squash pop, decays
  seat: Vec3 | null; // bench seat to sit at once eliminated
  knock: Knock;
}

type KnockPhase = 'none' | 'air' | 'down' | 'getup';
interface Knock {
  phase: KnockPhase;
  t: number;      // time in the current phase
  cy: number;     // pivot height above the court
  vy: number;     // vertical velocity of the pivot
  ang: number;    // pitch about the frog's local X (0 upright, -π/2 on its back)
  angVel: number;
  roll: number;   // sideways roll about local Z
  rollVel: number;
  ang0: number;   // pitch/pivot captured at the start of getting up
  cy0: number;
}

const newKnock = (): Knock => ({
  phase: 'none', t: 0, cy: BODY_PIVOT, vy: 0, ang: 0, angVel: 0, roll: 0, rollVel: 0, ang0: 0, cy0: BODY_PIVOT,
});

/** The human's pose, plus a full orientation so a knocked-over frog can tumble. */
export interface DodgeballPose extends FrogPose {
  quaternion: InstanceType<typeof THREE.Quaternion>;
}

export interface DodgeballCallbacks {
  onStart: () => void;
  onEnd: () => void;
  /** The human's team won the match they were playing. */
  onPlayerWin?: () => void;
  /** The human's team lost the match they were playing. */
  onPlayerLose?: () => void;
  /** The human was eliminated (hit, or their throw was caught). */
  onPlayerOut?: () => void;
  /** The human pulled off a big play: knocked someone out with a throw, or caught a ball. */
  onPlayerPlay?: (play: 'hit' | 'catch') => void;
  /** Dust puff at a world point (knocked-back frogs hitting the ground). */
  dustBurst?: (x: number, y: number, z: number, scale: number, n: number) => void;
}

// ── SFX: recorded clips (CLIPS) + tiny WebAudio synth blips for the rest ──────
// Every sound takes a 0..1 volume `v` from the caller: 1 for your own match, distance
// falloff from the camera while you watch the attract match (sfxVolume()).
const CLIPS = {
  hit: HIT_SOUND_URL,
  throw: 'assets/sfx-dodgeball-throw.mp3',    // a "ya!" (random pitch per throw)
  catch: 'assets/sfx-dodgeball-catch.mp3',    // parry clang — loud, so it's played quiet
  whistle: 'assets/sfx-dodgeball-whistle.mp3', // match start
} as const;
type ClipName = keyof typeof CLIPS;

class Sfx {
  private ctx: AudioContext | null = null;
  private readonly clips = new Map<ClipName, AudioBuffer>();
  private loading = false;
  resume(): void {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.loadClips();
    } catch { /* no audio */ }
  }
  /** Decode the clips once (relative URLs — resolve against the page base). */
  private loadClips(): void {
    const ctx = this.ctx;
    if (!ctx || this.loading) return;
    this.loading = true;
    for (const [name, url] of Object.entries(CLIPS) as [ClipName, string][]) {
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { this.clips.set(name, buf); })
        // Falls back to the synth blips below.
        .catch((e) => console.warn(`[dodgeball] failed to load ${url}`, e));
    }
  }
  /** Plays a clip; false if it isn't loaded (caller falls back to a synth blip). */
  private clip(name: ClipName, gain: number, rate = 1): boolean {
    if (!this.ctx) this.resume(); // the attract match can make noise before you ever play
    const ctx = this.ctx, buf = this.clips.get(name);
    const vol = gameSettings.get().sfxVolume;
    if (!ctx || !buf) return false;
    if (vol <= 0) return true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * vol;
    src.connect(g).connect(ctx.destination);
    src.start();
    return true;
  }
  private blip(f0: number, f1: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx) this.resume();
    const ctx = this.ctx;
    const vol = gameSettings.get().sfxVolume;
    if (!ctx || vol <= 0) return;
    gain *= vol;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  /** "Ya!" at a random pitch so a volley doesn't sound copy-pasted. */
  throwSfx(v = 1): void {
    if (v <= 0.01) return;
    if (!this.clip('throw', 0.6 * v, 0.85 + Math.random() * 0.35)) this.blip(520, 180, 0.18, 'triangle', 0.25 * v);
  }
  catchSfx(v = 1): void {
    if (v <= 0.01) return;
    if (!this.clip('catch', 0.3 * v)) { this.blip(180, 620, 0.22, 'square', 0.3 * v); this.blip(90, 70, 0.25, 'sine', 0.35 * v); }
  }
  hitSfx(v = 1): void {
    if (v <= 0.01) return;
    if (!this.clip('hit', 0.9 * v, 0.94 + Math.random() * 0.12)) this.blip(160, 40, 0.22, 'sawtooth', 0.32 * v); // slight variety per hit
  }
  pickupSfx(v = 1): void { if (v > 0.01) this.blip(360, 720, 0.1, 'sine', 0.22 * v); }
  /** Match start. */
  startWhistleSfx(): void { if (!this.clip('whistle', 0.35)) this.whistleSfx(); }
  /** Match end (still the synth whistle). */
  whistleSfx(v = 1): void { if (v > 0.01) this.blip(900, 1100, 0.3, 'square', 0.18 * v); }
}

// ── Ball motion trail (pooled soft sprites) ──────────────────────────────────
function trailTexture(): InstanceType<typeof THREE.Texture> {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Trail {
  private readonly sprites: InstanceType<typeof THREE.Sprite>[] = [];
  private readonly history: Vec3[] = [];
  private readonly n = 10;
  constructor(scene: Scene, tex: InstanceType<typeof THREE.Texture>, color: number) {
    for (let i = 0; i < this.n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.6);
      scene.add(sp);
      this.sprites.push(sp);
      this.history.push(new THREE.Vector3());
    }
  }
  reset(p: Vec3): void {
    for (const h of this.history) h.copy(p);
  }
  push(p: Vec3): void {
    for (let i = this.history.length - 1; i > 0; i--) this.history[i].copy(this.history[i - 1]);
    this.history[0].copy(p);
    for (let i = 0; i < this.sprites.length; i++) {
      const f = 1 - i / this.n;
      this.sprites[i].position.copy(this.history[i]);
      (this.sprites[i].material as InstanceType<typeof THREE.SpriteMaterial>).opacity = 0.5 * f;
      this.sprites[i].scale.setScalar(0.2 + 0.55 * f);
    }
  }
  hide(): void {
    for (const s of this.sprites) (s.material as InstanceType<typeof THREE.SpriteMaterial>).opacity = 0;
  }
}

/** Screen flick (dx right, dy up, px) → angle from straight up (rad, + = right),
 * clamped to ±FLICK_MAX_ANGLE. A flick sideways or down pins to the limit on
 * that side; a dead-straight-down flick throws straight. */
function flickAngle(dx: number, dy: number): number {
  const a = Math.atan2(dx, dy);
  if (Math.abs(dx) < 1 && dy < 0) return 0;
  return THREE.MathUtils.clamp(a, -FLICK_MAX_ANGLE, FLICK_MAX_ANGLE);
}

export class Dodgeball {
  active = false;  // the human is in the match (controls + locked camera)
  ambient = false; // an AI-only attract match runs on the court (free-roam cam)

  private readonly scene: Scene;
  private readonly container: HTMLElement;
  private readonly cb: DodgeballCallbacks;

  private readonly sfx = new Sfx();
  private ready = false;

  // Court bounds (world space), derived from the zone_dodge_ground mesh.
  private minX = 0; private maxX = 0; private minZ = 0; private maxZ = 0;
  private centreZ = 0; private topY = 0;
  // Fenced enclosure bounds — the free-roam player is blocked from this rect.
  private encMinX = 0; private encMaxX = 0; private encMinZ = 0; private encMaxZ = 0;

  private readonly slots: Slot[] = [];
  private readonly balls: Ball[] = [];
  private readonly ballGroup = new THREE.Group();
  // The 8 court regulars (one nameplate each, same index). Shuffled into
  // slots every match via `perm`: slot i is played by aiChars[perm[i]]. While
  // the human plays, slot 0 is theirs and aiChars[perm[0]] sits the match out.
  private aiChars: { root: Group; update: (dt: number, s: AnimState) => void; height: number; profile: BotProfile }[] = [];
  private perm: number[] = [];
  private readonly nameplates: Nameplates;
  private readonly anchors: (Vec3 | undefined)[] = [];
  private hiddenCourtBalls: Object3D[] = [];

  private matchTime = 0;
  private matchId = 0;     // bumped each start; guards stale win-timers
  private ending = false;  // true once a win has been declared this match
  private shake = 0;
  private benchFill = [0, 0]; // seats taken on the west / east benches
  private banner: HTMLDivElement;
  private throwBtn: HTMLDivElement;
  private throwLabel: HTMLDivElement;
  private throwIcon: HTMLImageElement;

  // Flick tracking on the throw button.
  private flickX0 = 0; private flickY0 = 0; private flickT0 = 0; private flickActive = false;
  private aimArrow!: HTMLDivElement;

  private readonly _pose: DodgeballPose = {
    position: new THREE.Vector3(), facing: 0, anim: 'idle', quaternion: new THREE.Quaternion(),
  };
  // Floating "X Team Won!" text over the court for spectators (camera-facing sprite).
  private winText: InstanceType<typeof THREE.Sprite> | null = null;
  private winTextT = 0;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly camPos = new THREE.Vector3();
  private camReady = false;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: Scene, root: Object3D, container: HTMLElement, cb: DodgeballCallbacks) {
    this.scene = scene;
    this.container = container;
    this.cb = cb;

    // Court bounds from the baked floor mesh (scale-proof).
    const floor = root.getObjectByName('zone_dodge_ground');
    if (floor) {
      const box = new THREE.Box3().setFromObject(floor);
      this.minX = box.min.x; this.maxX = box.max.x;
      this.minZ = box.min.z; this.maxZ = box.max.z;
      this.topY = box.max.y;
      this.centreZ = (this.minZ + this.maxZ) / 2;
    } else {
      // Fallback to the authored constants × world scale if the mesh moved.
      const S = 1.35, cx = -38 * S, cz = 97 * S, w = 26 * S, d = 22 * S;
      this.minX = cx - w / 2; this.maxX = cx + w / 2;
      this.minZ = cz - d / 2; this.maxZ = cz + d / 2;
      this.topY = 0.16 * S; this.centreZ = cz;
    }

    // Pull the baked fence/gate/pad in toward the court (must run before the
    // enclosure bounds and gate banner are read below).
    this.tightenEnclosure(root);

    // Fenced enclosure bounds (the free-roam player is kept out of this whole
    // area so the match is never interrupted). Falls back to the court + margin.
    const enc = root.getObjectByName('zone_dodge_enclosure_ground');
    if (enc) {
      const box = new THREE.Box3().setFromObject(enc);
      this.encMinX = box.min.x; this.encMaxX = box.max.x;
      this.encMinZ = box.min.z; this.encMaxZ = box.max.z;
    } else {
      const m = 9;
      this.encMinX = this.minX - m; this.encMaxX = this.maxX + m;
      this.encMinZ = this.minZ - m; this.encMaxZ = this.maxZ + m;
    }

    // Hide the static decorative court cubes during play.
    root.traverse((o) => { if (/zone_dodge_ball/.test(o.name)) this.hiddenCourtBalls.push(o); });

    // "DODGE BALL ARENA" banner mounted on the gate.
    this.buildBanner(root);

    this.ballGroup.visible = false;
    scene.add(this.ballGroup);

    // Balls — one per player (all start held), one shared trail texture.
    const tex = trailTexture();
    const ballGeom = new THREE.SphereGeometry(BALL_RADIUS, 20, 16);
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff4d3d, roughness: 0.55, metalness: 0.0,
        emissive: 0x3a0d08, emissiveIntensity: 0.4,
      });
      const mesh = new THREE.Mesh(ballGeom, mat);
      mesh.castShadow = true;
      this.ballGroup.add(mesh);
      this.balls.push({
        mesh, state: 'loose', pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        holder: null, ownerTeam: -1, trail: new Trail(scene, tex, 0xffd0a0), homing: 'nearest', thrower: null,
      });
    }

    // Team rings (8) + slots. Human is slot 0 (team 0). Rings live in ballGroup
    // so they hide/show with the match.
    const ringGeom = new THREE.RingGeometry(0.55, 0.78, 24);
    for (let s = 0; s < TEAM_COUNT * 2; s++) {
      const team = s < TEAM_COUNT ? 0 : 1;
      const isHuman = s === 0;
      // Team colour for everyone; slot 0 turns gold only while the human plays
      // it (see setHumanRing) so spectators just see blue vs red.
      const ringMat = new THREE.MeshBasicMaterial({
        color: TEAM_COLOR[team],
        transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      this.ballGroup.add(ring);
      this.slots.push({
        team, isHuman, root: null, anim: null, ring,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: team === 0 ? 0 : Math.PI,
        alive: true, ball: null, catchTimer: 0, throwCd: 0, aiTimer: 0,
        aiDir: new THREE.Vector3(), squash: 0, seat: null, knock: newKnock(),
      });
    }

    // The court regulars are generated like the campgoers: a unique id seeds
    // each one's troop and look, with a name from DODGEBALL_BOT_NAMES. The GLB
    // is already cached from the player load, so the clones are near-instant.
    // Once loaded, an ambient AI match runs so the court always looks alive.
    this.nameplates = new Nameplates(container);
    const profiles = DODGEBALL_BOT_NAMES.slice(0, NUM_PLAYERS)
      .map((name, i) => createBotProfile(DODGEBALL_BOT_ID_BASE + i, name));
    void Promise.all(profiles.map((profile) =>
      loadSpeciesGltf(SPECIES[profile.appearance.species]).then((gltf) => {
        const c = createCharacter(gltf);
        applyAppearance(c.root, profile.appearance);
        c.root.visible = false;
        return { root: c.root, update: c.update, height: c.height, profile };
      }),
    )).then((chars) => {
      for (const c of chars) {
        scene.add(c.root);
        this.aiChars.push(c);
        this.anchors.push(undefined);
        this.nameplates.add(c.profile.name, c.profile.troop ? formatTroopTag(c.profile.troop) : null);
      }
      this.ready = true;
      this.enterAmbient();
    }).catch((e) => console.warn('[dodgeball] AI load failed', e));

    // ── Banner + throw/catch button (debug-era UI; UI pass replaces later) ──
    this.banner = document.createElement('div');
    this.banner.style.cssText =
      'position:absolute;top:14%;left:50%;transform:translateX(-50%);z-index:40;' +
      "font-family:'Fredoka',system-ui,sans-serif;font-weight:700;color:#fff;" +
      'font-size:clamp(16px,4.5vmin,26px);text-align:center;pointer-events:none;' +
      'text-shadow:0 2px 8px rgba(0,0,0,0.5);white-space:pre-line;display:none;';
    container.appendChild(this.banner);

    this.throwBtn = document.createElement('div');
    this.throwBtn.style.cssText =
      // Up and in from the corner (clear of the safe-area insets) so it's easy
      // to hit without fat-fingering the screen edge.
      'position:absolute;right:calc(40px + env(safe-area-inset-right));' +
      'bottom:calc(84px + env(safe-area-inset-bottom));width:104px;height:104px;z-index:30;' +
      'border-radius:50%;background:radial-gradient(circle at 38% 32%,#ffe7b0,#e9b970);' +
      'box-shadow:0 6px 0 #7a5326,0 8px 14px rgba(0,0,0,0.35);display:none;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;touch-action:none;' +
      'user-select:none;cursor:pointer;';
    this.throwLabel = document.createElement('div');
    this.throwLabel.style.cssText =
      "font-family:'Fredoka',system-ui,sans-serif;font-weight:700;color:#5a3d1a;" +
      'font-size:15px;line-height:1.05;pointer-events:none;';
    this.throwLabel.textContent = 'CATCH';
    this.throwIcon = document.createElement('img');
    this.throwIcon.alt = '';
    this.throwIcon.draggable = false;
    this.throwIcon.src = icon('game', 'catch');
    this.throwIcon.style.cssText = 'width:54px;height:54px;object-fit:contain;pointer-events:none;margin-top:-4px;';
    this.throwBtn.append(this.throwIcon, this.throwLabel);
    // Aim arrow: shows the (clamped) flick direction while dragging.
    this.aimArrow = document.createElement('div');
    this.aimArrow.style.cssText =
      'position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;display:none;';
    this.aimArrow.innerHTML =
      '<div style="position:absolute;left:-5px;bottom:40px;width:10px;height:34px;border-radius:5px;' +
      'background:#fff6dc;box-shadow:0 0 0 2px #7a5326;"></div>' +
      '<div style="position:absolute;left:-13px;bottom:70px;width:0;height:0;border-left:13px solid transparent;' +
      'border-right:13px solid transparent;border-bottom:20px solid #fff6dc;' +
      'filter:drop-shadow(0 -2px 0 #7a5326);"></div>';
    this.throwBtn.appendChild(this.aimArrow);
    container.appendChild(this.throwBtn);

    this.throwBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      // Capture so a flick that leaves the button still ends here. Can throw
      // if the pointer is already gone — the gesture still works without it.
      try { this.throwBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.flickActive = true;
      this.flickX0 = e.clientX; this.flickY0 = e.clientY; this.flickT0 = performance.now();
    });
    this.throwBtn.addEventListener('pointermove', (e) => {
      if (!this.flickActive) return;
      const dx = e.clientX - this.flickX0, dy = this.flickY0 - e.clientY;
      const flick = Math.hypot(dx, dy) >= FLICK_MIN_PX && !!this.slots[0].ball && this.slots[0].alive;
      this.aimArrow.style.display = flick ? 'block' : 'none';
      if (flick) this.aimArrow.style.transform = `rotate(${flickAngle(dx, dy)}rad)`;
    });
    this.throwBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (!this.flickActive) return;
      this.flickActive = false;
      this.aimArrow.style.display = 'none';
      const dx = e.clientX - this.flickX0;
      const dy = this.flickY0 - e.clientY; // up = positive
      const dist = Math.hypot(dx, dy);
      const dt = Math.max(16, performance.now() - this.flickT0) / 1000;
      this.onThrowButton(dist / dt, dist, dist >= FLICK_MIN_PX ? flickAngle(dx, dy) : null);
    });
    this.throwBtn.addEventListener('pointercancel', () => {
      this.flickActive = false;
      this.aimArrow.style.display = 'none';
    });
  }

  get pose(): DodgeballPose { return this._pose; }

  /** Re-fit the baked arena fence around a tighter rectangle. Every
   * `zone_dodge_*` node has an identity transform with geometry baked in the
   * camp chunk's frame, so we edit geometry directly in that shared frame. */
  private tightenEnclosure(root: Object3D): void {
    const get = (n: string) => root.getObjectByName(n) as Mesh | undefined;
    const bbox = (m: Mesh) => {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    };
    const court = get('zone_dodge_ground');
    const railN = get('zone_dodge_fence_rail_n');
    const railE = get('zone_dodge_fence_rail_e');
    if (!court || !railN || !railE) return;
    const cb = bbox(court);
    const cx = (cb.min.x + cb.max.x) / 2, cz = (cb.min.z + cb.max.z) / 2;
    const ohw = (bbox(railN).max.x - bbox(railN).min.x) / 2; // old fence half-width
    const ohd = (bbox(railE).max.z - bbox(railE).min.z) / 2; // old fence half-depth
    const nhw = (cb.max.x - cb.min.x) / 2 + FENCE_MARGIN;
    const nhd = (cb.max.z - cb.min.z) / 2 + FENCE_MARGIN;
    if (nhw >= ohw || nhd >= ohd) return; // already tight (e.g. GLB rebuilt)
    const sx = nhw / ohw, sz = nhd / ohd;

    // Stretch/move a mesh's geometry so its x/z extents become [x0,x1]×[z0,z1].
    const fit = (m: Mesh, x0: number, x1: number, z0: number, z1: number) => {
      const b = bbox(m);
      const g = m.geometry;
      g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
      g.scale((x1 - x0) / (b.max.x - b.min.x), 1, (z1 - z0) / (b.max.z - b.min.z));
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      g.computeBoundingBox(); g.computeBoundingSphere();
    };
    const shift = (m: Mesh, dx: number, dz: number) => {
      m.geometry.translate(dx, 0, dz);
      m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
    };

    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !o.name.startsWith('zone_dodge_')) return;
      const b = bbox(m);
      const mx = (b.min.x + b.max.x) / 2, mz = (b.min.z + b.max.z) / 2;
      const hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
      const n = o.name.slice('zone_dodge_'.length);
      if (n === 'fence_rail_n') fit(m, cx - nhw, cx + nhw, cz + nhd - hz, cz + nhd + hz);
      else if (n === 'fence_rail_e') fit(m, cx + nhw - hx, cx + nhw + hx, cz - nhd, cz + nhd);
      else if (n === 'fence_rail_w') fit(m, cx - nhw - hx, cx - nhw + hx, cz - nhd, cz + nhd);
      // South rails run from the corner to the (unchanged-width) gate opening.
      else if (n === 'fence_rail_s_l') fit(m, cx - nhw, cx - GATE_HALF_GAP, cz - nhd - hz, cz - nhd + hz);
      else if (n === 'fence_rail_s_r') fit(m, cx + GATE_HALF_GAP, cx + nhw, cz - nhd - hz, cz - nhd + hz);
      else if (n.startsWith('fence_post_')) {
        // Snap edge posts onto the new edge; spread the rest proportionally.
        const onEW = Math.abs(Math.abs(mx - cx) - ohw) < 0.5;
        const onNS = Math.abs(Math.abs(mz - cz) - ohd) < 0.5;
        const nx = onEW ? cx + Math.sign(mx - cx) * nhw : cx + (mx - cx) * sx;
        const nz = onNS ? cz + Math.sign(mz - cz) * nhd : cz + (mz - cz) * sz;
        shift(m, nx - mx, nz - mz);
        // A south post squeezed into the gate opening would block it.
        if (onNS && mz < cz && Math.abs(nx - cx) < GATE_HALF_GAP + 0.3) m.visible = false;
      } else if (n.startsWith('gate_')) shift(m, 0, (cz - nhd) - (cz - ohd));
      // The grass pad keeps its original 0.5 lip outside the fence.
      else if (n === 'enclosure_ground') fit(m, cx - nhw - 0.5, cx + nhw + 0.5, cz - nhd - 0.5, cz + nhd + 0.5);
    });
  }

  /** Slot 0's ring is gold only while the human is playing it. */
  private setHumanRing(on: boolean): void {
    const s = this.slots[0];
    (s.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.setHex(on ? HUMAN_RING : TEAM_COLOR[s.team]);
  }

  /** A wooden "DODGE BALL ARENA" sign mounted above the gate's top beam,
   * facing the approach path. Text is baked into a CanvasTexture (no
   * TextGeometry) exactly like the log-course signs. */
  private buildBanner(root: Object3D): void {
    const beam = root.getObjectByName('zone_dodge_gate_beam_top');
    if (!beam) return;
    const box = new THREE.Box3().setFromObject(beam);
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) / 2;

    // ── Baked text canvas (cream board, wood frame, brown lettering). ──
    const cw = 768, ch = 224;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d')!;
    const round = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    ctx.fillStyle = '#7a4a28'; round(0, 0, cw, ch, 34); ctx.fill();            // wood frame
    ctx.fillStyle = '#f3e6c8'; round(16, 16, cw - 32, ch - 32, 24); ctx.fill(); // cream panel
    ctx.fillStyle = '#5a3d1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Auto-fit the text to the cream panel width so nothing clips.
    const label = 'DODGE BALL ARENA';
    const maxW = cw - 120;
    let fs = 96;
    ctx.font = `700 ${fs}px 'Fredoka', system-ui, sans-serif`;
    const measured = ctx.measureText(label).width;
    if (measured > maxW) {
      fs = Math.floor(fs * maxW / measured);
      ctx.font = `700 ${fs}px 'Fredoka', system-ui, sans-serif`;
    }
    ctx.fillText(label, cw / 2, ch / 2 + 6);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    // Board plane sized to the beam width, mounted just above it, facing −z
    // (toward a player approaching the gate from the south).
    const bw = size.x * 0.98;
    const bh = bw * (ch / cw);
    const geo = new THREE.PlaneGeometry(bw, bh);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const sign = new THREE.Mesh(geo, mat);
    sign.position.set(cx, box.max.y + bh * 0.45, box.min.z - 0.06);
    sign.rotation.y = Math.PI; // face −z (the approach side)
    sign.renderOrder = 1;
    this.scene.add(sign);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Reset the court to a fresh match: everyone in formation, balls rolling
   * off the centre line. */
  private setupMatch(): void {
    this.matchTime = 0;
    this.matchId++;
    this.ending = false;
    this.shake = 0;
    this.benchFill[0] = 0; this.benchFill[1] = 0;
    this.hideWinText();
    this.shuffleTeams();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.alive = true; slot.ball = null; slot.catchTimer = 0; slot.throwCd = 0;
      slot.aiTimer = Math.random() * 0.6; slot.squash = 0; slot.vel.set(0, 0, 0); slot.seat = null;
      slot.knock = newKnock();
      this.placeAtFormation(slot, i);
      (slot.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = 0.9;
      slot.ring.visible = true;
    }
    // Balls start evenly spaced along the centre line, each rolling off in a
    // random direction — but at least (90° − BALL_START_MAX_ANGLE) away from
    // the line itself, so none dribbles along it and every ball ends up in a half.
    const n = this.balls.length;
    for (let i = 0; i < n; i++) {
      const b = this.balls[i];
      b.state = 'loose'; b.holder = null; b.ownerTeam = -1; b.homing = 'nearest';
      const x = THREE.MathUtils.lerp(this.minX + 1.5, this.maxX - 1.5, (i + 0.5) / n);
      b.pos.set(x, this.topY + BALL_RADIUS, this.centreZ);
      const a = (Math.random() * 2 - 1) * BALL_START_MAX_ANGLE; // off the ±z axis
      const toward = Math.random() < 0.5 ? 1 : -1;              // which half
      const speed = THREE.MathUtils.lerp(BALL_START_SPEED[0], BALL_START_SPEED[1], Math.random());
      b.vel.set(Math.sin(a) * speed, 0, Math.cos(a) * speed * toward);
      b.trail.reset(b.pos); b.trail.hide();
      b.mesh.position.copy(b.pos);
    }
  }

  /** Deal the court regulars into slots in a fresh random order, so teams (and,
   * when the human joins, who sits out) change every match. */
  private shuffleTeams(): void {
    const n = this.aiChars.length;
    if (n === 0) return;
    this.perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    for (let i = 0; i < this.slots.length; i++) {
      const c = this.aiChars[this.perm[i]];
      this.slots[i].root = c ? c.root : null;
      this.slots[i].anim = c ? c.update : null;
    }
  }

  /** Floating name + troop plates over the court regulars. Call after the
   * camera is placed each frame. */
  updateNameplates(camera: Camera, visible: boolean): void {
    this.listenerCam = camera;
    this.nameplates.visible = visible && this.ready && (this.active || this.ambient);
    for (let i = 0; i < this.anchors.length; i++) this.anchors[i] = undefined;
    for (let i = 0; i < this.slots.length; i++) {
      if (i === 0 && this.active) continue; // the human's slot — its regular sits out
      const ci = this.perm[i];
      const c = this.aiChars[ci];
      if (!c || !c.root.visible) continue;
      const a = (this.anchors[ci] = this.anchorPool[ci] ??= new THREE.Vector3());
      a.copy(c.root.position).setY(c.root.position.y + c.height * AI_SCALE + 0.35);
    }
    this.nameplates.update(camera, this.anchors as Vec3[]);
  }
  private readonly anchorPool: Vec3[] = [];
  /** The camera, for how loud the attract match sounds from where you're watching. */
  private listenerCam: Camera | null = null;
  private lastOtherSfx = 0;

  /** Volume for a court sound at `p`: full in your own match; while you watch the attract match,
   * quieter and fading out with camera distance (like the log course / Sumo), rate-limited. */
  private sfxVolume(p: Vec3): number {
    if (this.active) return 1;
    const cam = this.listenerCam;
    if (!cam || !this.ambient) return 0;
    const now = performance.now();
    if (now - this.lastOtherSfx < 90) return 0;
    const v = 0.5 * distanceFalloff(cam.position.distanceTo(p), 12, 45);
    if (v > 0.01) this.lastOtherSfx = now;
    return v;
  }

  /** Start (or restart) the AI-only attract match that keeps the court alive. */
  enterAmbient(): void {
    if (!this.ready) return;
    this.ambient = true;
    this.ballGroup.visible = true;
    for (const o of this.hiddenCourtBalls) o.visible = false; // dynamic balls replace them
    for (const c of this.aiChars) c.root.visible = true;
    this.setupMatch();
  }

  /** The human joins the match: take control of slot 0 + the locked camera. */
  start(): void {
    if (this.active) return;
    if (!this.ready) { console.warn('[dodgeball] not ready yet'); return; }
    this.active = true;
    this.ambient = true; // sim keeps running; slot 0 is now the human
    this.sfx.resume();
    this.camReady = false;
    this.specYawOff = 0; this.specPitch = SPEC_PITCH;
    this.ballGroup.visible = true;
    for (const o of this.hiddenCourtBalls) o.visible = false;
    for (const c of this.aiChars) c.root.visible = true;
    this.setupMatch();
    // Slot 0 is the human — its dealt regular sits this match out (main renders
    // the shared playerRoot in that slot).
    if (this.slots[0].root) this.slots[0].root!.visible = false;
    this.setHumanRing(true);

    this.throwBtn.style.display = 'flex';
    this.showBanner('DODGEBALL — GO!', 1.6);
    this.sfx.startWhistleSfx();
    this.cb.onStart();
  }

  /** The human leaves the match; the court returns to the ambient AI attract match. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.ending = false;
    this.throwBtn.style.display = 'none';
    this.banner.style.display = 'none';
    this.cb.onEnd();
    // Slot 0's AI frog comes back and the attract match restarts.
    if (this.slots[0].root) this.slots[0].root!.visible = true;
    this.setHumanRing(false);
    this.setupMatch();
  }

  /** Where main should drop the human when the match ends — just OUTSIDE the
   * fenced enclosure (south side) so they don't land in the blocked area. */
  /** Just outside the arena's south gate — the walk-up point that opens the Dodge Ball tutorial. */
  gatePoint(out: Vec3): Vec3 {
    return out.set((this.minX + this.maxX) / 2, this.topY, this.encMinZ - 1.0);
  }

  exitPoint(out: Vec3): Vec3 {
    return out.set((this.minX + this.maxX) / 2, this.topY, this.encMinZ - 3.5);
  }

  /** True when (x,z) is inside the fenced arena — used by main's movement
   * collision to keep the free-roaming player out of the ongoing match. Only
   * blocks while an attract/real match is running (always, once loaded) and the
   * player isn't the one playing. */
  inPlayArea(x: number, z: number): boolean {
    if (this.active || !this.ambient) return false; // playing it, or not running
    return x >= this.encMinX && x <= this.encMaxX && z >= this.encMinZ && z <= this.encMaxZ;
  }

  private placeAtFormation(slot: Slot, i: number): void {
    const halfMinZ = slot.team === 0 ? this.minZ + 1.5 : this.centreZ + 1.5;
    const halfMaxZ = slot.team === 0 ? this.centreZ - 1.5 : this.maxZ - 1.5;
    const idxInTeam = i % TEAM_COUNT;
    const x = THREE.MathUtils.lerp(this.minX + 2.5, this.maxX - 2.5, (idxInTeam + 0.5) / TEAM_COUNT);
    const z = slot.team === 0
      ? THREE.MathUtils.lerp(halfMaxZ, halfMinZ, 0.35)
      : THREE.MathUtils.lerp(halfMinZ, halfMaxZ, 0.35);
    slot.pos.set(x, this.topY, z);
    slot.facing = slot.team === 0 ? 0 : Math.PI; // face up/down court
  }

  // ── Throw / catch button ─────────────────────────────────────────────────
  // Called on button release. `flickSpeed` is the flick speed (px/s), `dist`
  // its travel (px), `angle` the clamped flick direction (rad from straight
  // up, + = screen-right) or null for a tap. A tap throws straight ahead at
  // base power and ALWAYS throws, so the button never feels dead; a flick
  // throws along its angle, harder the faster it is.
  private onThrowButton(flickSpeed: number, dist: number, angle: number | null): void {
    const human = this.slots[0];
    if (!human.alive) return;
    if (human.ball) {
      const flickBonus = angle !== null ? THREE.MathUtils.clamp(flickSpeed / 900, 0, 0.7) * Math.min(1, dist / 40) : 0;
      this.throwBall(human, 0.8 + flickBonus, angle);
    } else {
      // No ball → open a catch window.
      human.catchTimer = CATCH_WINDOW;
      human.squash = 1;
    }
  }

  /** `angle` (human flick only): rad from straight up-court, + = screen-right.
   * Omitted/null = the classic straight throw that curves to the nearest opponent. */
  private throwBall(slot: Slot, power: number, angle: number | null = null): void {
    const ball = slot.ball;
    if (!ball || slot.throwCd > 0) return;
    const rampMul = 1 + this.matchTime * RAMP_PER_SEC;
    const speed = BASE_THROW_SPEED * power * rampMul;
    const dir = slot.team === 0 ? 1 : -1; // up-court
    ball.state = 'thrown';
    ball.holder = null;
    ball.ownerTeam = slot.team;
    ball.thrower = slot;
    ball.pos.copy(slot.pos).setY(this.topY + 1.1);
    if (angle === null) {
      ball.vel.set((Math.random() - 0.5) * 2, 6.5, dir * speed);
      ball.homing = 'nearest';
    } else {
      // The camera looks up-court (+z) from behind, so screen-right is world −x.
      const wx = -Math.sin(angle) * dir, wz = Math.cos(angle) * dir;
      ball.vel.set(wx * speed, 6.5, wz * speed);
      ball.homing = this.aimedOpponent(slot.team, slot.pos, wx, wz);
    }
    ball.trail.reset(ball.pos);
    slot.ball = null;
    slot.throwCd = THROW_COOLDOWN;
    slot.squash = 1;
    this.sfx.throwSfx(this.sfxVolume(slot.pos));
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update(dt: number, move: { x: number; y: number }, _camera: Camera): void {
    if (!this.active && !this.ambient) return;
    this.matchTime += dt;
    this.shake = Math.max(0, this.shake - dt * 3);

    // Slot 0 is the human only while `active`; otherwise every slot is AI (the
    // ambient attract match) and there is no human to drive.
    const humanIdx = this.active ? 0 : -1;

    if (this.active) {
      const human = this.slots[0];
      // Human movement (court-plane). The camera looks up-court toward +z, so
      // screen-right is world −x (handedness flip) — hence the negated x.
      // Joystick and keyboard both use up = −y, so up-court is −move.y.
      if (human.alive) {
        const mag = Math.hypot(move.x, move.y);
        if (mag > 0.08) human.vel.set(-move.x * MOVE_SPEED, 0, -move.y * MOVE_SPEED);
        else human.vel.set(0, 0, 0);
        human.throwCd = Math.max(0, human.throwCd - dt);
        human.catchTimer = Math.max(0, human.catchTimer - dt);
        this.integrateSlot(human, dt);
      } else {
        // Eliminated: same as a bot — ride out the knockback, then walk to the
        // bench and wait for the result. No input while out.
        this.updateOut(human, dt);
      }
    }

    // AI for every non-human slot.
    for (let i = 0; i < this.slots.length; i++) {
      if (i === humanIdx) continue;
      this.updateAI(this.slots[i], dt);
    }

    // Balls
    for (const b of this.balls) this.updateBall(b, dt);

    // Rings, squash pop, held-ball carry, anim state
    for (const slot of this.slots) {
      slot.squash = Math.max(0, slot.squash - dt * 4);
      slot.ring.position.set(slot.pos.x, this.topY + 0.03, slot.pos.z);
      const aliveRing = slot.alive ? 0.9 : 0.25;
      (slot.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = aliveRing;
      // pulse the ring while a catch window is live
      if (slot.catchTimer > 0) {
        const p = 0.9 + 0.4 * Math.sin(this.matchTime * 30);
        slot.ring.scale.setScalar(p);
      } else {
        slot.ring.scale.setScalar(1);
      }
      if (slot.ball) {
        // Carry the held ball in front of the holder.
        const fx = Math.sin(slot.facing), fz = Math.cos(slot.facing);
        slot.ball.pos.set(slot.pos.x + fx * 0.7, this.topY + 1.0, slot.pos.z + fz * 0.7);
        slot.ball.mesh.position.copy(slot.ball.pos);
      }
    }

    // AI character transforms + anim (every non-human slot).
    for (let i = 0; i < this.slots.length; i++) {
      if (i === humanIdx) continue;
      const slot = this.slots[i];
      if (!slot.root || !slot.anim) continue;
      this.bodyTransform(slot, slot.root.position, slot.root.quaternion);
      const baseScale = AI_SCALE;
      const sq = 1 - 0.18 * slot.squash;
      slot.root.scale.set(baseScale * (1 + 0.12 * slot.squash), baseScale * sq, baseScale * (1 + 0.12 * slot.squash));
      slot.root.visible = true;
      slot.anim(dt, this.animFor(slot));
    }

    // Only when the human is playing: export its pose + drive the button.
    if (this.active) {
      const human = this.slots[0];
      this.bodyTransform(human, this._pose.position, this._pose.quaternion);
      this._pose.facing = human.facing;
      this._pose.anim = human.alive && human.squash > 0.4 ? 'jumping_up' : this.animFor(human);
      if (human.alive) {
        this.throwLabel.textContent = human.ball ? 'THROW' : (human.catchTimer > 0 ? 'CATCH!' : 'CATCH');
        const art = icon('game', human.ball ? 'throw' : 'catch');
        if (!this.throwIcon.src.endsWith(art)) this.throwIcon.src = art;
        this.throwIcon.style.display = '';
        this.throwBtn.style.opacity = '1';
      } else {
        this.throwLabel.textContent = 'OUT';
        this.throwIcon.style.display = 'none';
        this.throwBtn.style.opacity = '0.5';
      }
    }

    if (!this.active) {
      this.bannerTimer = 0;
      this.banner.style.display = 'none';
    } else if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.style.display = 'none';
    }
    // Slot 0 is gold only while the human plays it; its stand-in bot is blue.
    this.setHumanRing(this.active);
    this.updateWinText(dt);

    this.checkWin();
  }

  private integrateSlot(slot: Slot, dt: number): void {
    slot.pos.addScaledVector(slot.vel, dt);
    const margin = 0.8;
    if (slot.alive) {
      // Living: confined to your own half of the court.
      slot.pos.x = THREE.MathUtils.clamp(slot.pos.x, this.minX + margin, this.maxX - margin);
      const zMin = slot.team === 0 ? this.minZ + margin : this.centreZ + 0.6;
      const zMax = slot.team === 0 ? this.centreZ - 0.6 : this.maxZ - margin;
      slot.pos.z = THREE.MathUtils.clamp(slot.pos.z, zMin, zMax);
    } else {
      // Out: free to shuffle around the sidelines (inside the fenced enclosure).
      slot.pos.x = THREE.MathUtils.clamp(slot.pos.x, this.encMinX + 0.6, this.encMaxX - 0.6);
      slot.pos.z = THREE.MathUtils.clamp(slot.pos.z, this.encMinZ + 0.6, this.encMaxZ - 0.6);
    }
    // Face the way you move (keeps the frog readable); default to up/down court.
    if (slot.vel.lengthSq() > 1) slot.facing = Math.atan2(slot.vel.x, slot.vel.z);
    // Auto-pickup of a loose ball on your own half.
    if (slot.alive && !slot.ball) this.tryPickup(slot);
  }

  private tryPickup(slot: Slot): void {
    for (const b of this.balls) {
      if (b.state !== 'loose') continue;
      // AI only grabs balls on its own half (stays on its side); the human can
      // grab any loose ball in reach so they're never stuck waiting.
      if (!this.humanControls(slot)) {
        const onOwnHalf = slot.team === 0 ? b.pos.z <= this.centreZ : b.pos.z >= this.centreZ;
        if (!onOwnHalf) continue;
      }
      const dx = b.pos.x - slot.pos.x, dz = b.pos.z - slot.pos.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        b.state = 'held'; b.holder = slot; b.ownerTeam = slot.team;
        slot.ball = b; slot.squash = 1;
        // AI wind-up before it can throw, so a picked-up ball isn't launched the
        // same frame (gives a human time to react / dodge).
        if (!this.humanControls(slot)) slot.aiTimer = 0.9 + Math.random() * 1.0;
        b.trail.hide();
        this.sfx.pickupSfx(this.sfxVolume(slot.pos));
        return;
      }
    }
  }

  private updateBall(b: Ball, dt: number): void {
    if (b.state === 'held') { b.trail.hide(); return; }

    if (b.state === 'thrown') {
      // Homing: steer horizontal velocity toward the nearest living opponent.
      const target = b.homing === 'nearest' ? this.nearestOpponent(b.ownerTeam, b.pos)
        : b.homing && b.homing.alive ? b.homing : null;
      if (target) {
        const homing = (BASE_HOMING + this.matchTime * RAMP_PER_SEC) * dt;
        const desired = this.tmp.set(target.pos.x - b.pos.x, 0, target.pos.z - b.pos.z);
        if (desired.lengthSq() > 0.001) {
          desired.normalize();
          const speed = Math.hypot(b.vel.x, b.vel.z);
          const cur = this.tmp2.set(b.vel.x, 0, b.vel.z).normalize();
          cur.lerp(desired, Math.min(1, homing)).normalize();
          b.vel.x = cur.x * speed;
          b.vel.z = cur.z * speed;
        }
      }
      b.vel.y -= GRAVITY * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.trail.push(b.pos);

      // Hit test vs opposing living players.
      for (const slot of this.slots) {
        if (!slot.alive || slot.team === b.ownerTeam) continue;
        const dx = slot.pos.x - b.pos.x, dz = slot.pos.z - b.pos.z;
        const dy = (this.topY + 1.0) - b.pos.y;
        if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS && Math.abs(dy) < 1.3) {
          if (slot.catchTimer > 0) this.onCatch(slot, b);
          else this.onHit(slot, b);
          return;
        }
      }

      // Ground / bounds → becomes a harmless loose ball.
      if (b.pos.y <= this.topY + BALL_RADIUS) {
        b.pos.y = this.topY + BALL_RADIUS;
        b.vel.y = 0; b.vel.x *= 0.4; b.vel.z *= 0.4;
        b.state = 'loose'; b.ownerTeam = -1; b.trail.hide();
      }
      this.clampBall(b);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += b.vel.z * dt * 0.5;
      return;
    }

    // Loose: roll with friction, bounce off the invisible court barrier.
    b.pos.addScaledVector(b.vel, dt);
    const damp = Math.exp(-GROUND_FRICTION * dt);
    b.vel.x *= damp; b.vel.z *= damp;
    b.pos.y = this.topY + BALL_RADIUS;
    this.clampBall(b);
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.x += b.vel.z * dt;
    b.mesh.rotation.z -= b.vel.x * dt;
  }

  private readonly tmp2 = new THREE.Vector3();

  private clampBall(b: Ball): void {
    const m = BALL_RADIUS;
    if (b.pos.x < this.minX + m) { b.pos.x = this.minX + m; b.vel.x = Math.abs(b.vel.x) * 0.6; }
    if (b.pos.x > this.maxX - m) { b.pos.x = this.maxX - m; b.vel.x = -Math.abs(b.vel.x) * 0.6; }
    if (b.pos.z < this.minZ + m) { b.pos.z = this.minZ + m; b.vel.z = Math.abs(b.vel.z) * 0.6; }
    if (b.pos.z > this.maxZ - m) { b.pos.z = this.maxZ - m; b.vel.z = -Math.abs(b.vel.z) * 0.6; }
  }

  /** Slot 0 is only the human while they're in a match; during the ambient
   * attract match it's an AI bot and must behave (and report) like one. */
  private humanControls(slot: Slot): boolean {
    return this.active && slot.isHuman;
  }

  /** Give a newly-eliminated player a seat on a sideline bench to shuffle off to. */
  private assignSeat(slot: Slot): void {
    // West bench for team 0, east bench for team 1; spread seats along z.
    const side = slot.team; // 0 = west, 1 = east
    const idx = this.benchFill[side]++;
    const x = side === 0 ? this.minX - 2.6 : this.maxX + 2.6;
    const z = THREE.MathUtils.lerp(this.minZ + 1.5, this.maxZ - 1.5, (idx + 0.5) / TEAM_COUNT);
    slot.seat = new THREE.Vector3(x, this.topY, z);
  }

  private onHit(slot: Slot, b: Ball): void {
    slot.alive = false;
    this.assignSeat(slot);
    if (slot.ball) { slot.ball.state = 'loose'; slot.ball.holder = null; slot.ball = null; }
    this.launchKnock(slot, b.vel);
    b.state = 'loose'; b.ownerTeam = -1; b.vel.set(0, 0, 0); b.trail.hide();
    this.shake = Math.max(this.shake, 0.4);
    this.sfx.hitSfx(this.sfxVolume(slot.pos));
    if (b.thrower && this.humanControls(b.thrower) && b.thrower !== slot) this.cb.onPlayerPlay?.('hit');
    if (this.humanControls(slot)) {
      this.showBanner("You're eliminated!", 2);
      this.cb.onPlayerOut?.();
    }
  }

  // ── Knockback + walk-off ──────────────────────────────────────────────────

  /** Send a hit frog flying back along the ball's travel direction. */
  private launchKnock(slot: Slot, ballVel: Vec3): void {
    const dir = this.tmp.set(ballVel.x, 0, ballVel.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, slot.team === 0 ? -1 : 1);
    dir.normalize();
    // Face the thrower so the backflip reads as "knocked backwards".
    slot.facing = Math.atan2(-dir.x, -dir.z);
    slot.vel.copy(dir).multiplyScalar(KNOCK_SPEED);
    const k = slot.knock;
    k.phase = 'air'; k.t = 0;
    k.cy = BODY_PIVOT; k.vy = KNOCK_UP;
    k.ang = 0; k.angVel = KNOCK_SPIN * (0.8 + Math.random() * 0.4);
    k.roll = 0; k.rollVel = (Math.random() * 2 - 1) * KNOCK_ROLL;
  }

  /** An eliminated player: tumble out the knockback, then walk to the bench. */
  private updateOut(slot: Slot, dt: number): void {
    slot.throwCd = 0; slot.catchTimer = 0;
    const k = slot.knock;
    if (k.phase === 'none') {
      if (slot.seat) {
        const dx = slot.seat.x - slot.pos.x, dz = slot.seat.z - slot.pos.z;
        if (Math.hypot(dx, dz) > 0.4) slot.vel.set(dx, 0, dz).setLength(MOVE_SPEED * 0.55);
        else { slot.vel.set(0, 0, 0); slot.facing = slot.team === 0 ? Math.PI / 2 : -Math.PI / 2; }
      } else {
        slot.vel.set(0, 0, 0);
      }
      this.integrateSlot(slot, dt);
      return;
    }

    k.t += dt;
    if (k.phase === 'getup') {
      // Ease the body back upright (to the nearest whole turn) and stand.
      const u = Math.min(1, k.t / KNOCK_GETUP_TIME);
      const e = u * u * (3 - 2 * u);
      const upright = Math.round(k.ang0 / (Math.PI * 2)) * Math.PI * 2;
      k.ang = THREE.MathUtils.lerp(k.ang0, upright, e);
      k.cy = THREE.MathUtils.lerp(k.cy0, BODY_PIVOT, e);
      k.roll *= 1 - e;
      slot.vel.set(0, 0, 0);
      if (u >= 1) { k.phase = 'none'; k.ang = 0; k.roll = 0; k.cy = BODY_PIVOT; slot.squash = 1; }
      return;
    }

    // Flying / sliding: integrate the body.
    slot.pos.addScaledVector(slot.vel, dt);
    // Bounce off the enclosure fence so nobody gets flung out of the arena.
    const m = 0.6;
    if (slot.pos.x < this.encMinX + m) { slot.pos.x = this.encMinX + m; slot.vel.x = Math.abs(slot.vel.x) * 0.5; }
    if (slot.pos.x > this.encMaxX - m) { slot.pos.x = this.encMaxX - m; slot.vel.x = -Math.abs(slot.vel.x) * 0.5; }
    if (slot.pos.z < this.encMinZ + m) { slot.pos.z = this.encMinZ + m; slot.vel.z = Math.abs(slot.vel.z) * 0.5; }
    if (slot.pos.z > this.encMaxZ - m) { slot.pos.z = this.encMaxZ - m; slot.vel.z = -Math.abs(slot.vel.z) * 0.5; }
    k.vy -= GRAVITY * dt;
    k.cy += k.vy * dt;
    k.ang += k.angVel * dt;
    k.roll += k.rollVel * dt;
    // The pivot rests lower the flatter the body is.
    const groundH = THREE.MathUtils.lerp(BODY_PIVOT, BODY_LIE_H, Math.abs(Math.sin(k.ang)));
    if (k.cy <= groundH) {
      k.cy = groundH;
      if (k.vy < -2.5) {
        // Impact dust — a big puff on the first slam, smaller on later bounces.
        this.cb.dustBurst?.(slot.pos.x, this.topY, slot.pos.z, AI_SCALE,
          Math.round(THREE.MathUtils.clamp(-k.vy, 3, 10)));
        // Bounce: lose energy and spin on every impact.
        k.vy = -k.vy * KNOCK_BOUNCE;
        slot.vel.multiplyScalar(0.6);
        k.angVel *= 0.5; k.rollVel *= 0.5;
        this.shake = Math.max(this.shake, this.humanControls(slot) ? 0.35 : 0.15);
      } else {
        k.vy = 0;
        if (k.phase === 'air') { k.phase = 'down'; k.t = 0; }
      }
    }
    if (k.phase === 'down') {
      // Slide to a stop and settle flat on the back.
      const f = Math.exp(-6 * dt);
      slot.vel.multiplyScalar(f);
      k.angVel *= f; k.rollVel *= f;
      const lie = -Math.PI / 2 + Math.round((k.ang + Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2;
      const s = 1 - Math.exp(-8 * dt);
      k.ang += (lie - k.ang) * s;
      k.roll += (0 - k.roll) * s;
      if (k.t > KNOCK_DOWN_TIME && slot.vel.lengthSq() < 0.25) {
        k.phase = 'getup'; k.t = 0; k.ang0 = k.ang; k.cy0 = k.cy;
      }
    }
  }

  /** World position (of the feet origin) + orientation for a slot's body,
   * rotating the tumble about the body centre rather than the feet. */
  private bodyTransform(slot: Slot, outPos: Vec3, outQuat: InstanceType<typeof THREE.Quaternion>): void {
    const k = slot.knock;
    this.tmpE.set(k.ang, slot.facing, k.roll, 'YXZ');
    outQuat.setFromEuler(this.tmpE);
    if (k.phase === 'none') { outPos.set(slot.pos.x, this.topY, slot.pos.z); return; }
    const off = this.tmp.set(0, BODY_PIVOT, 0).applyQuaternion(outQuat);
    outPos.set(slot.pos.x - off.x, this.topY + k.cy - off.y, slot.pos.z - off.z);
  }

  private animFor(slot: Slot): AnimState {
    const k = slot.knock.phase;
    if (k === 'air' || k === 'down') return 'falling_idle';
    if (k === 'getup') return 'hard_landing';
    const moving = slot.vel.lengthSq() > 1;
    if (!slot.alive) return moving ? 'walking' : 'idle';
    return moving ? 'running' : 'idle';
  }

  private onCatch(catcher: Slot, b: Ball): void {
    // The thrower is eliminated; the catcher gains the ball.
    // The actual thrower is out (fallback: nearest teammate, e.g. an old ball).
    const thrower = b.thrower?.alive && b.thrower.team === b.ownerTeam ? b.thrower : this.nearestOfTeam(b.ownerTeam, b.pos);
    if (thrower) {
      thrower.alive = false;
      this.assignSeat(thrower);
      if (thrower.ball) { thrower.ball.state = 'loose'; thrower.ball.holder = null; thrower.ball = null; }
      if (this.humanControls(thrower)) {
        this.showBanner("Caught! You're eliminated!", 2);
        this.cb.onPlayerOut?.();
      }
    }
    b.state = 'held'; b.holder = catcher; b.ownerTeam = catcher.team;
    catcher.ball = b; catcher.catchTimer = 0; catcher.squash = 1;
    b.trail.hide();
    this.shake = Math.max(this.shake, 1.0); // strong shake on a catch
    this.sfx.catchSfx(this.sfxVolume(catcher.pos));
    if (this.humanControls(catcher)) { this.showBanner('NICE CATCH!', 1.3); this.cb.onPlayerPlay?.('catch'); }
  }

  private nearestOpponent(team: number, p: Vec3): Slot | null {
    let best: Slot | null = null; let bd = Infinity;
    for (const s of this.slots) {
      if (!s.alive || s.team === team) continue;
      const d = (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** The living opponent closest to the throw line (wx,wz) within AIM_ASSIST,
   * or null if the flick is aimed at open court. */
  private aimedOpponent(team: number, p: Vec3, wx: number, wz: number): Slot | null {
    let best: Slot | null = null; let ba = AIM_ASSIST;
    for (const s of this.slots) {
      if (!s.alive || s.team === team) continue;
      const dx = s.pos.x - p.x, dz = s.pos.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const a = Math.acos(THREE.MathUtils.clamp((dx * wx + dz * wz) / len, -1, 1));
      if (a < ba) { ba = a; best = s; }
    }
    return best;
  }

  private nearestOfTeam(team: number, p: Vec3): Slot | null {
    let best: Slot | null = null; let bd = Infinity;
    for (const s of this.slots) {
      if (!s.alive || s.team !== team) continue;
      const d = (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  private updateAI(slot: Slot, dt: number): void {
    slot.throwCd = Math.max(0, slot.throwCd - dt);
    slot.catchTimer = Math.max(0, slot.catchTimer - dt);
    slot.aiTimer -= dt;

    if (!slot.alive) { this.updateOut(slot, dt); return; }

    // Incoming-ball reaction: dodge, or occasionally attempt a catch.
    const incoming = this.incomingBall(slot);
    if (incoming && slot.catchTimer <= 0 && slot.throwCd <= 0) {
      if (Math.random() < 0.012) { slot.catchTimer = CATCH_WINDOW; slot.squash = 1; }
      else {
        // strafe perpendicular to the incoming ball
        const side = Math.sign(slot.pos.x - incoming.pos.x) || (Math.random() < 0.5 ? 1 : -1);
        slot.vel.set(side * MOVE_SPEED, 0, 0);
        this.integrateSlot(slot, dt);
        return;
      }
    }

    if (slot.ball) {
      // Holding: line up on the nearest opponent, then throw after a windup.
      const target = this.nearestOpponent(slot.team, slot.pos);
      if (target) {
        const dx = target.pos.x - slot.pos.x;
        slot.vel.set(THREE.MathUtils.clamp(dx, -1, 1) * MOVE_SPEED * 0.5, 0, 0);
        // Opening grace: no throws for the first ~1.2s so the tip-off isn't an
        // instant bloodbath and there's a beat to grab a ball.
        if (slot.aiTimer <= 0 && slot.throwCd <= 0 && this.matchTime > 1.2) {
          this.throwBall(slot, 0.8 + Math.random() * 0.5);
          slot.aiTimer = 1.2 + Math.random() * 0.9; // pause before next decision
        }
      }
    } else {
      // Seeking: go for the nearest loose ball on our half, else wander.
      const ball = this.nearestLooseBallOnHalf(slot.team, slot.pos);
      if (ball) {
        slot.vel.set(ball.pos.x - slot.pos.x, 0, ball.pos.z - slot.pos.z);
        if (slot.vel.lengthSq() > 0) slot.vel.setLength(MOVE_SPEED);
      } else {
        if (slot.aiTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          slot.aiDir.set(Math.cos(a), 0, Math.sin(a));
          slot.aiTimer = 0.6 + Math.random();
        }
        slot.vel.copy(slot.aiDir).setLength(MOVE_SPEED * 0.4);
      }
    }
    this.integrateSlot(slot, dt);
  }

  private incomingBall(slot: Slot): Ball | null {
    for (const b of this.balls) {
      if (b.state !== 'thrown' || b.ownerTeam === slot.team) continue;
      const dx = slot.pos.x - b.pos.x, dz = slot.pos.z - b.pos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 36) continue; // only react when it's within ~6u
      // is it heading roughly toward us?
      if (b.vel.x * dx + b.vel.z * dz > 0) return b;
    }
    return null;
  }

  private nearestLooseBallOnHalf(team: number, p: Vec3): Ball | null {
    let best: Ball | null = null; let bd = Infinity;
    for (const b of this.balls) {
      if (b.state !== 'loose') continue;
      const onHalf = team === 0 ? b.pos.z <= this.centreZ : b.pos.z >= this.centreZ;
      if (!onHalf) continue;
      const d = (b.pos.x - p.x) ** 2 + (b.pos.z - p.z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ── Camera (locked rotation, follows the human) ───────────────────────────
  private readonly camLook = new THREE.Vector3();
  private readonly camLookTarget = new THREE.Vector3();
  // Spectator orbit (drag) once the human is out: yaw offset from the default
  // "behind the frog, facing the court" heading, plus pitch.
  private specYawOff = 0;
  private specPitch = SPEC_PITCH;

  /** Drag-orbit input from main (already scaled to radians). Only used while
   * the human is eliminated and spectating; ignored while they're playing. */
  orbit(dYaw: number, dPitch: number): void {
    if (!this.active || this.slots[0].alive) return;
    // Same directions as the camp camera's drag orbit.
    this.specYawOff += dYaw;
    this.specPitch = THREE.MathUtils.clamp(this.specPitch - dPitch, 0.12, 1.25);
  }
  updateCamera(camera: Camera, dt: number): void {
    const h = this.slots[0];
    const behind = 9, height = 6.2, lookAhead = 7, lookY = 1.8;
    if (!h.alive && h.knock.phase === 'none') {
      // Out: orbit the frog (on its way to / on the bench). Default heading
      // sits behind it facing the court; drag to rotate / tilt.
      const cx = (this.minX + this.maxX) / 2;
      const yaw = Math.atan2(h.pos.x - cx, h.pos.z - this.centreZ) + this.specYawOff;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const cp = Math.cos(this.specPitch), sp = Math.sin(this.specPitch);
      const headY = this.topY + 1.2;
      this.tmp.set(h.pos.x + sy * cp * SPEC_DIST, headY + sp * SPEC_DIST, h.pos.z + cy * cp * SPEC_DIST);
      // Look past the frog in the camera's facing direction (toward the court by default).
      this.camLookTarget.set(h.pos.x - sy * 5, headY, h.pos.z - cy * 5);
    } else {
      // Team 0 looks up-court (+z); camera sits behind at lower z. While
      // knocked back it keeps chasing the flying frog.
      this.tmp.set(h.pos.x, this.topY + height, h.pos.z - behind);
      this.camLookTarget.set(h.pos.x, this.topY + lookY, h.pos.z + lookAhead);
    }
    const s = 1 - Math.exp(-(h.alive || h.knock.phase === 'none' ? 8 : 3) * dt);
    if (!this.camReady) { this.camPos.copy(this.tmp); this.camLook.copy(this.camLookTarget); this.camReady = true; }
    else { this.camPos.lerp(this.tmp, s); this.camLook.lerp(this.camLookTarget, s); }

    // Screen shake.
    const shake = gameSettings.get().screenShake ? this.shake : 0;
    const sx = (Math.random() - 0.5) * shake * 1.2;
    const sy = (Math.random() - 0.5) * shake * 1.2;
    camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    camera.lookAt(this.camLook);
  }

  // ── UI / status ─────────────────────────────────────────────────────────────
  private bannerTimer = 0;
  private showBanner(text: string, seconds: number): void {
    // Every banner is a message to the human — none while they're not playing.
    if (!this.active) return;
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    this.bannerTimer = seconds;
  }

  private checkWin(): void {
    if (this.ending) return; // fire once, not every frame after a win
    const a = this.slots.filter((s) => s.team === 0 && s.alive).length;
    const b = this.slots.filter((s) => s.team === 1 && s.alive).length;
    if (a !== 0 && b !== 0) return;
    this.ending = true;
    const id = this.matchId;
    const winner = b === 0 ? 0 : 1;
    if (this.active) {
      // Player match: show the result (the human is always blue / team 0) —
      // even from the bench — then hand back to the ambient attract match.
      const won = winner === 0;
      this.showBanner(won ? '🏆 YOUR TEAM WON!\nBlue Team Won!' : 'YOUR TEAM LOST\nRed Team Won!', RESULT_SECONDS);
      this.sfx.whistleSfx();
      if (won) this.cb.onPlayerWin?.();
      else this.cb.onPlayerLose?.();
      setTimeout(() => { if (this.matchId === id && this.active) this.stop(); }, RESULT_SECONDS * 1000);
    } else {
      // Ambient attract match: spectators see the winner float over the court,
      // then a fresh match starts.
      this.showWinText(winner);
      setTimeout(() => {
        if (this.matchId === id && this.ambient && !this.active) this.setupMatch();
      }, RESULT_SECONDS * 1000);
    }
  }

  /** Camera-facing "Red/Blue Team Won!" text floating over the court. */
  private showWinText(team: number): void {
    const text = team === 0 ? 'Blue Team Won!' : 'Red Team Won!';
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const ctx = cv.getContext('2d')!;
    // Largest font that fits the canvas with room for the outline.
    let px = 150;
    ctx.font = `700 ${px}px 'Fredoka', system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    if (w > 940) { px = Math.floor(px * 940 / w); ctx.font = `700 ${px}px 'Fredoka', system-ui, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 26;
    ctx.strokeStyle = '#3a2410';
    ctx.strokeText(text, 512, 128);
    ctx.fillStyle = '#' + TEAM_COLOR[team].toString(16).padStart(6, '0');
    ctx.fillText(text, 512, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!this.winText) {
      this.winText = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      this.winText.renderOrder = 10; // drawn over the gate sign / fence
      this.scene.add(this.winText);
    } else {
      const mat = this.winText.material as InstanceType<typeof THREE.SpriteMaterial>;
      mat.map?.dispose();
      mat.map = tex; mat.needsUpdate = true;
    }
    this.winText.position.set((this.minX + this.maxX) / 2, this.topY + WIN_TEXT_Y, this.centreZ);
    this.winText.visible = true;
    this.winTextT = 0;
  }

  private hideWinText(): void {
    if (this.winText) this.winText.visible = false;
  }

  private updateWinText(dt: number): void {
    const w = this.winText;
    if (!w || !w.visible) return;
    // Players inside the match get the banner instead.
    if (this.active) { w.visible = false; return; }
    this.winTextT += dt;
    const pop = Math.min(1, this.winTextT / 0.35);
    const s = (1 - Math.pow(1 - pop, 3)) * (1 + 0.04 * Math.sin(this.winTextT * 4));
    w.scale.set(16 * s, 4 * s, 1);
    w.position.y = this.topY + WIN_TEXT_Y + 0.3 * Math.sin(this.winTextT * 2);
  }

  status(): string {
    const a = this.slots.filter((s) => s.team === 0 && s.alive).length;
    const b = this.slots.filter((s) => s.team === 1 && s.alive).length;
    const held = this.balls.filter((x) => x.state === 'held').length;
    return `DODGEBALL  blue ${a} vs red ${b}  balls held:${held}  t:${this.matchTime.toFixed(0)}s`;
  }
}
