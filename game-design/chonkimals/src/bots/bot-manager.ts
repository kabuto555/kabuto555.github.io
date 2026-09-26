/**
 * BotManager — spawns the fake players and decides where they go.
 *
 * Bots pick a hotspot (weighted by hotspot weight × activity interest ×
 * personality affinity × crowding), path to a free standing point over the
 * nav graph, linger, and repeat — with occasional random wanders and
 * chained follow-ups (log course start → finish).
 */
import type { ChatService } from '../chat/chat-service';
import { gameEvents } from '../events';
import type { FrogPose, LogCourse } from '../log-course';
import type { Sumo } from '../sumo/sumo';
import { loadSpeciesGltf, createCharacter } from '../player';
import { seededRng, type Rng } from '../rng';
import { formatTroopTag } from '../troops';
import { applyAppearance, SPECIES } from './appearance';
import { Bot, type BotWorld, type ExternalPose } from './bot';
import { BotChatter, type BotActivity } from './bot-chatter';
import { itemById } from '../inventory/items';
import { playToySound } from '../inventory/toy-sounds';
import { useToy } from '../customization/toy-use';
import { distanceFalloff } from '../sfx-falloff';
import { CourseDriver } from './course-driver';
import {
  HOTSPOTS, NAV_EDGES, NAV_NODES, isStandable, type HotspotDef, type HotspotKind, type XZ,
} from './camp-map';
import { Nameplates } from './nameplates';
import { NavGraph, dist } from './nav';
import { GroundCache } from './ground-cache';
import { BOT_COUNT, createBotProfile } from './roster';

type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Vector3 = import('three').Vector3;
type Camera = import('three').Camera;
type Matrix4 = import('three').Matrix4;

/**
 * A ride at the top of the climb (zipline, hang glider). Bots queue at `hotspot`; when a
 * bot's turn comes, `begin` puts it on the ride and returns the pose to follow until `done`.
 */
export interface BotRideSpot {
  hotspot: string;
  begin(from: Vector3, height: () => number): { readonly pose: ExternalPose; readonly done: boolean } | null;
  /** After landing: 'decide' = carry on from there (it lands in camp); 'recycle' = hang about
   * the landing, then quietly rejoin the camp crowd once the player isn't nearby (a landing
   * with no walk back, like the fenced-off beach). */
  after: 'decide' | 'recycle';
  /** Called when a bot sets off (e.g. the counselor cheers). */
  onBegin?(): void;
}

export interface BotManagerOptions {
  scene: import('three').Scene;
  /** Assembled stage; the camp chunk must be named `chunk_0_camp`. */
  stageRoot: Object3D;
  collisionMeshes: Mesh[];
  container: HTMLElement;
  count?: number;
  /** When present, bots at its start line sometimes play it. */
  logCourse?: LogCourse | null;
  /** When present, bots use quick chat to react and banter. */
  chat?: ChatService | null;
  /** When present, bots keep out of the sumo ring and crowd round to watch. */
  sumo?: Sumo | null;
  /** Rides bots take a turn on (they queue at the ride's hotspot). */
  rides?: BotRideSpot[];
}

const TOY_NEAR = 5, TOY_FAR = 32;  // bots' toys: full volume within NEAR of the camera, silent past FAR
const SHADOW_RANGE = 40;           // only bots this close to the camera cast (skinned) shadows
const RIDE_GAP = 3.5;               // seconds between two bots setting off on the same ride
const RECYCLE_LINGER = [4, 9] as const; // seconds a bot hangs about a dead-end landing
const RECYCLE_UNSEEN = 38;          // …then rejoins camp once the player is at least this far away
const RIDE_CHEERS = ['WHEEEE!!', 'yeet 🚀', 'bye guys!!', 'here I goooo', 'weeeee 🪁', 'send it!!'];

const START_TRAVELLING = 0.25;  // fraction of bots mid-trip at boot
const WANDER_LINGER = [1, 4] as const;
const PATH_JITTER = 0.6;        // camp-local, sideways scatter on waypoints
const STAND_SPACING = 1.1;      // camp-local, min gap between standing points
const SEPARATION_R = 1.0;       // world, per unit of character scale
const SEPARATION_K = 2.5;       // push speed at full overlap (u/s)
const REVISIT_PENALTY = 0.15;
const FAVORITE_BONUS = 4;
const MAX_COURSE_BOTS = 8;      // bots walking to or playing the log course at once
const MIN_COURSE_BOTS = 4;      // below this, bots anywhere may head over to play
const RECRUIT_CHANCE = 0.2;     // × courseJoin, per decision, while below the minimum
const LOG_START_SPOTS = new Set(['log_start_queue', 'log_start_bridge']);
const HYPE_HOP_RATE = 0.35;     // extra hops/s for bots watching the sumo ring (cheering)

// Pestering: every so often a bot runs up to the player and blurts something chaotic.
const PESTER_FIRST = [0, 1] as const; // seconds after boot before the first visit (from the closest bot)
const PESTER_EVERY = [6, 20] as const; // seconds between visits
const PESTER_RANGE = [6, 45] as const;  // candidate bots are this far from the player
const PESTER_REACH = 2.1;               // stop this close (world)
const PESTER_HANG = [3.5, 6.5] as const; // seconds spent in the player's face
const PESTER_GIVE_UP = 20;              // stop chasing after this long
const PESTER_REROUTE = 0.5;             // seconds between re-aiming at the moving player

interface Pester {
  bot: Bot;
  phase: 'approach' | 'hang';
  timer: number;
  reroute: number;
  hang: number;
  /** When (in hang time) to try a second line; Infinity = no second line. */
  secondLineAt: number;
  lines: number;
}

const KIND_COLOR: Record<HotspotKind, number> = {
  minigame_start: 0x33dd55, minigame_end: 0xffcc22, spectate: 0x33aaff, social: 0xff66cc,
};

export class BotManager {
  readonly bots: Bot[] = [];
  private readonly nav = new NavGraph(NAV_NODES, NAV_EDGES);
  private readonly hotspots = new Map(HOTSPOTS.map((h) => [h.id, h]));
  private readonly occupancy = new Map<string, number>();
  private readonly interest = new Map<string, number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly anchors: Vector3[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly campInverse: Matrix4;
  private readonly world: BotWorld;
  /** The world for scripted bots: the minigames are still off-limits, `blockers` aren't. */
  private readonly scriptedWorld: BotWorld;
  private readonly group = new THREE.Group();
  private navDebug: Object3D | null = null;
  /** Bots heading to the log course start rail (lane they'll take). */
  private readonly courseBound = new Map<Bot, number>();
  private readonly courseDrivers = new Map<Bot, CourseDriver>();
  private chatter: BotChatter | null = null;
  /** Where sound is heard from (the camera), for bots' toy falloff. */
  private readonly listener = new THREE.Vector3();
  private pester: Pester | null = null;
  private pesterIn = 0;
  /** The first visit after boot always comes from the closest bot. */
  private firstPester = true;
  private readonly pesterRng: Rng = seededRng(0, 'pester');
  /** Bots a script (the FTUE) has borrowed: no decisions, pestering or course trips. */
  private readonly scripted = new Set<Bot>();
  private frame = 0;
  scale = 1;
  /** Bots on a ride (following its pose) and bots waiting to rejoin camp after one. */
  private readonly riding = new Map<Bot, { handle: { readonly pose: ExternalPose; readonly done: boolean }; after: BotRideSpot['after'] }>();
  private readonly recycling = new Map<Bot, number>();
  private readonly lastRideStart = new Map<string, number>();
  private clock = 0;
  /** Pauses the "run up and pester the player" visits while the player is busy
   * (Lunch Delivery, the FTUE arrival) without pausing the rest of the camp. */
  pesterPaused = false;
  /** Grounding fine-tune shared with the player so bots sit at the same height. */
  footOffset = 0;
  /** More off-limits ground for free-roaming bots (e.g. a board game laid out on the grass, and
   * its seats) — bots a script has borrowed (sitting down to that game) may still walk in.
   * `from` is where the step starts (so a bot caught inside can be let back out). */
  readonly blockers: ((x: number, z: number, fromX?: number, fromZ?: number) => boolean)[] = [];
  /** While true, nobody runs up to pester the player (e.g. they're mid board game). */
  pesterHold: () => boolean = () => false;

  private constructor(
    private readonly opts: BotManagerOptions,
    private readonly campMatrix: Matrix4,
    private readonly nameplates: Nameplates,
  ) {
    this.campInverse = campMatrix.clone().invert();
    this.group.name = 'bots';
    opts.scene.add(this.group);
    // Walking bots read the (static) ground from a lazily-filled height lattice instead of
    // raycasting the detailed collision meshes every frame (bot.ts passes fromY = groundY + 3).
    const ground = new GroundCache(opts.collisionMeshes);
    this.world = {
      groundAt: (x, z, fromY) => ground.heightAt(x, z, fromY, fromY - 3),
      blocked: (x, z, fx, fz) => !!opts.logCourse?.inPlayArea(x, z) || !!opts.sumo?.blocks(x, z)
        || this.blockers.some((f) => f(x, z, fx, fz)),
    };
    this.scriptedWorld = {
      groundAt: this.world.groundAt,
      blocked: (x, z) => !!opts.logCourse?.inPlayArea(x, z) || !!opts.sumo?.blocks(x, z),
    };
  }

  static async create(opts: BotManagerOptions): Promise<BotManager> {
    const camp = opts.stageRoot.getObjectByName('chunk_0_camp');
    if (!camp) throw new Error('BotManager: camp chunk (chunk_0_camp) not found');
    camp.updateMatrixWorld(true);
    const mgr = new BotManager(opts, camp.matrixWorld.clone(), new Nameplates(opts.container));
    await mgr.spawn(opts.count ?? BOT_COUNT);
    mgr.pesterIn = mgr.pesterRng.range(...PESTER_FIRST);
    if (opts.chat) {
      mgr.chatter = new BotChatter(mgr.bots, opts.chat, (b) => mgr.activityOf(b), (b, out) => b.headPosition(out, mgr.scale),
        (b) => mgr.playToy(b));
    }
    return mgr;
  }

  // ── Public controls ────────────────────────────────────────────────────────
  /**
   * Multiplies how attractive a hotspot group is (e.g. 'log_course' while the
   * course is running). Boosting also cuts some lingers short so the crowd
   * reacts right away.
   */
  setInterest(group: string, multiplier: number): void {
    const prev = this.interest.get(group) ?? 1;
    this.interest.set(group, multiplier);
    if (multiplier > prev) {
      for (const b of this.bots) {
        const g = b.spotId ? this.hotspots.get(b.spotId)?.group : undefined;
        if (g !== group && b.rng.chance(0.4)) b.hurry(4);
      }
    }
  }

  setVisible(v: boolean): void { this.group.visible = v; }
  setNameplatesVisible(v: boolean): void { this.nameplates.visible = v; }

  setNavDebugVisible(v: boolean): void {
    if (v && !this.navDebug) this.navDebug = this.buildNavDebug();
    if (this.navDebug) this.navDebug.visible = v;
  }

  summary(): string {
    const travelling = this.bots.filter((b) => b.mode === 'travel' && !b.driven).length;
    const riding = this.riding.size ? `  riding: ${this.riding.size}` : '';
    const pester = this.pester ? `  pestering: ${this.pester.bot.profile.name} (${this.pester.phase})` : '';
    return `bots: ${this.bots.length}  moving: ${travelling}  on course: ${this.courseDrivers.size}${riding}${pester}`;
  }

  // ── Scripting (FTUE) ───────────────────────────────────────────────────────
  /**
   * Borrows the `count` free bots closest to `near` for a script: they stop
   * deciding for themselves until handed back with `returnBots`.
   */
  borrowGroup(count: number, near: Vector3): Bot[] {
    if (this.pester) this.endPester();
    const free = this.bots.filter((b) => !b.driven && !this.courseBound.has(b) && !this.courseDrivers.has(b)
      && !this.scripted.has(b) && !this.recycling.has(b));
    free.sort((a, b) => a.root.position.distanceToSquared(near) - b.root.position.distanceToSquared(near));
    const picked = free.slice(0, count);
    for (const b of picked) {
      this.release(b);
      b.spotId = null;
      this.scripted.add(b);
      b.travel([], null, 1e9);
    }
    return picked;
  }

  /** Hands borrowed bots back to the crowd AI. */
  returnBots(bots: Bot[]): void {
    for (const b of bots) {
      if (!this.scripted.delete(b)) continue;
      b.speedOverride = null;
      b.hurry(2.5);
    }
  }

  /** Drops a bot at a world point (grounded). */
  teleport(bot: Bot, pos: Vector3): void {
    bot.placeAt(pos, this.groundAt(pos.x, pos.z, pos.y + 60, 120) ?? pos.y);
  }

  /** Camp-local XZ (tools/build_camp.py numbers) → world. */
  campToWorld(x: number, z: number, out = new THREE.Vector3()): Vector3 {
    return this.toWorld([x, z], out);
  }

  /** Walkable route between two world points over the camp nav graph (no jitter). */
  route(from: Vector3, to: Vector3): Vector3[] {
    const pts = this.nav.route(this.toLocal(from), this.toLocal(to));
    const path = pts.map((p) => this.toWorld(p));
    path[path.length - 1] = to.clone();
    return path;
  }

  /** Floating speech bubble over a bot with any text (not loadout-gated). */
  say(bot: Bot, text: string): void {
    this.opts.chat?.emote(bot.profile.memberId, text);
  }

  // ── Per frame ──────────────────────────────────────────────────────────────
  /** Call once per frame after the camera is placed. */
  update(dt: number, camera: Camera, player?: Vector3): void {
    this.listener.copy(camera.position);
    this.frame++;
    if (!this.group.visible) {
      this.nameplates.update(camera, []);
      return;
    }
    this.clock += dt;
    this.separate(player);
    this.updateCourse(dt);
    this.updateRides(dt, player);
    if (player) this.updatePester(dt, player);
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      // Per-species scale/footOffset (SPECIES[x].scale/footOffset) layers on top of
      // the shared base so one animal's residual export mismatch never needs a
      // special case elsewhere — see appearance.ts's SpeciesDef doc comment.
      const species = SPECIES[b.profile.appearance.species];
      const scale = this.scale * species.scale;
      const footOffset = this.footOffset + species.footOffset;
      b.root.scale.setScalar(scale);
      // Never left standing inside the sumo ring (e.g. there before it loaded): step out.
      if (!b.driven && this.opts.sumo?.blocks(b.root.position.x, b.root.position.z)) {
        this.teleport(b, this.opts.sumo.ejectPoint(b.root.position.x, b.root.position.z, this.tmp).clone());
      }
      const d = camera.position.distanceTo(b.root.position);
      const every = d < 30 ? 1 : d < 60 ? 2 : 4;
      b.setCastShadow(d < SHADOW_RANGE);
      const world = this.scripted.has(b) ? this.scriptedWorld : this.world;
      if (b.update(dt, world, (this.frame + i) % every === 0, footOffset) && this.pester?.bot !== b
        && !this.scripted.has(b) && !this.recycling.has(b)) this.decide(b);
      // Sumo spectators bounce with excitement.
      if (b.mode === 'linger' && b.spotId === 'sumo_ring' && b.rng.chance(HYPE_HOP_RATE * dt)) b.hop();
      b.headPosition(this.anchors[i], scale);
    }
    this.nameplates.update(camera, this.anchors);
    this.chatter?.update(dt);
  }

  /** A bot plays its toy: the hold-up-and-shake gesture, its sound faded by distance, and a
   * `toy` event so others nearby can answer. False if it can't be seen (hidden crowd) or has none. */
  private playToy(bot: Bot): boolean {
    if (!bot.root.visible || !this.group.visible || this.scripted.has(bot)) return false;
    const id = bot.profile.appearance.attire.toy ?? null;
    const sound = id ? itemById(id)?.sound : undefined;
    if (!sound) return false;
    useToy(bot.root);
    const vol = distanceFalloff(this.listener.distanceTo(bot.root.position), TOY_NEAR, TOY_FAR);
    if (vol > 0.02) playToySound(sound, vol * 0.75); // a touch under your own toy
    gameEvents.emit({ type: 'toy', actor: { id: bot.profile.memberId, name: bot.profile.name }, pos: bot.root.position, itemId: id });
    return true;
  }

  /** What a bot is doing, for chatter. */
  private activityOf(bot: Bot): BotActivity {
    if (this.pester?.bot === bot) return { kind: 'pester' };
    if (this.courseDrivers.has(bot)) return { kind: 'course' };
    if (this.courseBound.has(bot)) return { kind: 'minigame_queue' };
    const spot = bot.mode === 'linger' && bot.spotId ? this.hotspots.get(bot.spotId) : undefined;
    switch (spot?.kind) {
      case 'spectate': return { kind: 'spectate', finishLine: false, hype: spot.group === 'sumo' };
      case 'minigame_end': return { kind: 'spectate', finishLine: true };
      case 'minigame_start': return { kind: 'minigame_queue' };
      case 'social': return { kind: 'social', campfire: spot.id === 'campfire' };
      default: return { kind: 'wander' };
    }
  }

  // ── Spawning ───────────────────────────────────────────────────────────────
  private async spawn(count: number): Promise<void> {
    for (let id = 0; id < count; id++) {
      const profile = createBotProfile(id);
      const gltf = await loadSpeciesGltf(SPECIES[profile.appearance.species]);
      const character = createCharacter(gltf);
      applyAppearance(character.root, profile.appearance);
      const bot = new Bot(profile, character, seededRng(id, 'behaviour'));
      this.bots.push(bot);
      this.group.add(bot.root);
      this.anchors.push(new THREE.Vector3());
      this.nameplates.add(profile.name, profile.troop ? formatTroopTag(profile.troop) : null);

      if (bot.rng.chance(START_TRAVELLING)) {
        this.placeLocal(bot, NAV_NODES[bot.rng.pick(this.nav.ids)]);
        this.decide(bot);
      } else {
        const spot = this.chooseHotspot(bot);
        const stand = this.pickStandPoint(spot, bot);
        this.placeLocal(bot, stand);
        this.claim(bot, spot, stand);
        const face = this.faceYaw(spot, stand);
        if (face !== null) bot.root.rotation.y = face;
        bot.travel([], face, bot.rng.range(0, spot.linger[1] * bot.profile.personality.lingerScale));
      }
    }
  }

  private placeLocal(bot: Bot, p: XZ): void {
    const w = this.toWorld(p);
    bot.placeAt(w, this.groundAt(w.x, w.z, 60, 120) ?? 0);
  }

  // ── Lending bots to minigames ──────────────────────────────────────────────
  /** A free-roaming bot within `radius` (XZ, world) of `pos` — not on the log course,
   * heading there, pestering, or already lent out — or null. Closest first. */
  findFreeBotNear(pos: Vector3, radius: number): Bot | null {
    let best: Bot | null = null, bd = radius;
    for (const b of this.bots) {
      if (b.driven || this.courseBound.has(b) || this.courseDrivers.has(b) || this.pester?.bot === b
        || this.scripted.has(b) || this.recycling.has(b)) continue;
      const d = Math.hypot(b.root.position.x - pos.x, b.root.position.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Free to be asked along to something: roaming the camp, not riding / racing / pestering /
   * scripted / rejoining camp. */
  isFree(b: Bot): boolean {
    return !b.driven && !this.courseBound.has(b) && !this.courseDrivers.has(b) && this.pester?.bot !== b
      && !this.scripted.has(b) && !this.recycling.has(b);
  }

  /** What kind of spot a bot is hanging about at (null = wandering / travelling). */
  spotKind(b: Bot): HotspotKind | null {
    return b.mode === 'linger' && b.spotId ? this.hotspots.get(b.spotId)?.kind ?? null : null;
  }

  /** Takes a free bot out of the crowd AI for an outside activity (a board game) — it stands
   * where it is until walked somewhere with `walkTo`, and goes back with `returnBots`. */
  enlist(bot: Bot): void {
    if (this.pester?.bot === bot) this.pester = null;
    this.release(bot);
    bot.spotId = null;
    this.scripted.add(bot);
    bot.travel([], null, 1e9);
  }

  /** Free bots within `radius` of `pos` cut their linger short (e.g. a game's just been laid
   * out where they stand: they step off it). */
  shoo(pos: Vector3, radius: number): void {
    for (const b of this.bots) {
      if (this.isFree(b) && Math.hypot(b.root.position.x - pos.x, b.root.position.z - pos.z) < radius) b.hurry(0.4);
    }
  }

  /** Walks an enlisted bot over the camp paths to `to` (coming in via `via`), then holds `faceYaw`. */
  walkTo(bot: Bot, to: Vector3, faceYaw: number, speed: number | null, via?: Vector3): void {
    const path = this.route(bot.root.position, via ?? to);
    if (via) path.push(to.clone());
    bot.speedOverride = speed;
    bot.travel(path, faceYaw, 1e9);
  }

  /** Hand a bot to an outside driver (e.g. Lunch Delivery) that moves it by updating
   * `pose` each frame. Returns the function that gives it back. */
  borrow(bot: Bot, pose: FrogPose): () => void {
    this.release(bot);
    bot.spotId = null;
    bot.setExternalPose(pose);
    return () => {
      if (!bot.driven) return;
      bot.setExternalPose(null); // lingers 0s, so it picks somewhere new right away
    };
  }

  // ── Pestering the player ───────────────────────────────────────────────────
  private updatePester(dt: number, player: Vector3): void {
    const busy = !!this.opts.logCourse?.active || !!this.opts.sumo?.active || this.pesterPaused || this.pesterHold() || !this.chatter;
    const p = this.pester;
    if (!p) {
      if (busy || (this.pesterIn -= dt) > 0) return;
      this.pesterIn = this.pesterRng.range(...PESTER_EVERY);
      this.startPester(player, this.firstPester);
      if (this.pester) this.firstPester = false;
      else if (this.firstPester) this.pesterIn = 1; // nobody free yet: try again shortly
      return;
    }
    const bot = p.bot;
    const d = Math.hypot(bot.root.position.x - player.x, bot.root.position.z - player.z);
    const yaw = Math.atan2(player.x - bot.root.position.x, player.z - bot.root.position.z);
    p.timer += dt;

    if (p.phase === 'approach') {
      if (busy || p.timer > PESTER_GIVE_UP || d > PESTER_RANGE[1] + 15) { this.endPester(); return; }
      if (d <= PESTER_REACH) {
        p.phase = 'hang';
        p.timer = 0;
        bot.travel([], yaw, 1e9);
        bot.faceTowards(yaw);
        bot.hop();
        if (this.chatter!.blurt(bot)) p.lines++;
        return;
      }
      if ((p.reroute -= dt) <= 0) {
        p.reroute = PESTER_REROUTE;
        // Aim for a spot just short of the player, on the bot's side.
        const k = (d - PESTER_REACH * 0.8) / d;
        const goal = new THREE.Vector3(
          bot.root.position.x + (player.x - bot.root.position.x) * k, 0,
          bot.root.position.z + (player.z - bot.root.position.z) * k,
        );
        // Never cut through the log course: stop on the bank and go round via the paths.
        const course = this.opts.logCourse;
        if (course?.inPlayArea(goal.x, goal.z)) course.ejectPoint(goal.x, goal.z, goal);
        const sumo = this.opts.sumo;
        if (sumo?.blocks(goal.x, goal.z)) sumo.ejectPoint(goal.x, goal.z, goal); // ...and round the sumo ring
        const goalLocal = this.toLocal(goal);
        const direct = d <= 12 && !this.crossesPlayArea(bot.root.position, goal);
        const path = direct ? [this.toWorld(goalLocal)] : this.routeWorld(bot, this.toLocal(bot.root.position), goalLocal);
        bot.travel(path, yaw, 1e9);
      }
      return;
    }

    // Hanging out in the player's face: keep turning to them, hop, maybe say more.
    if (busy || p.timer > p.hang || d > PESTER_REACH * 4) { this.endPester(); return; }
    bot.faceTowards(yaw);
    if (bot.rng.chance(0.9 * dt)) bot.hop();
    if (p.timer >= p.secondLineAt) {
      p.secondLineAt = Infinity;
      if (this.chatter!.blurt(bot)) p.lines++;
    }
  }

  /** Picks a bot to come bug the player; `nearest` = the closest free bot, wherever it is. */
  private startPester(player: Vector3, nearest = false): void {
    const free = this.bots.filter((b) => !b.driven && !this.courseBound.has(b) && !this.courseDrivers.has(b)
      && !this.scripted.has(b) && !this.recycling.has(b));
    const dist = (b: Bot) => b.root.position.distanceTo(player);
    const bot = nearest
      ? free.filter((b) => dist(b) > PESTER_REACH).sort((a, b) => dist(a) - dist(b))[0]
      : this.pesterRng.weighted(
        free.filter((b) => dist(b) >= PESTER_RANGE[0] && dist(b) <= PESTER_RANGE[1]),
        (b) => {
          const chaos = b.profile.chatLoadout.messages().filter((m) => m.category === 'chaos').length;
          return b.profile.personality.chattiness * (1 + chaos);
        },
      );
    if (!bot) return;
    this.release(bot);
    bot.spotId = null;
    this.pester = {
      bot, phase: 'approach', timer: 0, reroute: 0, lines: 0,
      hang: bot.rng.range(...PESTER_HANG),
      secondLineAt: bot.rng.chance(0.5) ? bot.rng.range(1.8, 3) : Infinity,
    };
  }

  private endPester(): void {
    const bot = this.pester?.bot;
    this.pester = null;
    if (bot && !bot.driven) this.decide(bot);
  }

  /** Whether the straight line a→b passes through off-limits ground (the log
   * course's play area, the sumo ring). */
  private crossesPlayArea(a: Vector3, b: Vector3): boolean {
    const n = Math.ceil(a.distanceTo(b) / 0.5);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.world.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return true;
    }
    return false;
  }

  // ── Rides (zipline, hang glider) ───────────────────────────────────────────
  /** At a ride's queue spot with the linger over: set off (if the last rider has cleared). */
  private tryRide(bot: Bot): boolean {
    const ride = bot.spotId ? this.opts.rides?.find((rd) => rd.hotspot === bot.spotId) : undefined;
    if (!ride) return false;
    const last = this.lastRideStart.get(ride.hotspot) ?? -Infinity;
    if (this.clock - last < RIDE_GAP) { bot.lingerLeft = 0.8; return true; } // wait your turn
    const species = SPECIES[bot.profile.appearance.species];
    const handle = ride.begin(bot.root.position, () => bot.height * this.scale * species.scale);
    if (!handle) return false;
    this.lastRideStart.set(ride.hotspot, this.clock);
    this.release(bot);
    bot.spotId = null;
    bot.setExternalPose(handle.pose);
    this.riding.set(bot, { handle, after: ride.after });
    if (bot.rng.chance(0.6)) this.say(bot, bot.rng.pick(RIDE_CHEERS));
    ride.onBegin?.();
    return true;
  }

  private updateRides(dt: number, player?: Vector3): void {
    for (const [bot, ride] of this.riding) {
      if (!ride.handle.done) continue;
      this.riding.delete(bot);
      bot.setExternalPose(null);
      if (ride.after === 'recycle') {
        this.recycling.set(bot, bot.rng.range(...RECYCLE_LINGER));
        bot.travel([], bot.root.rotation.y, 1e9);
      } else {
        this.decide(bot);
      }
    }
    for (const [bot, left] of this.recycling) {
      const t = left - dt;
      const far = !player || player.distanceTo(bot.root.position) > RECYCLE_UNSEEN;
      if (t > 0 || !far) { this.recycling.set(bot, Math.max(0, t)); continue; }
      // Rejoin the camp crowd somewhere out of sight, as if they'd walked back up.
      this.recycling.delete(bot);
      const spot = this.chooseHotspot(bot);
      const stand = this.pickStandPoint(spot, bot);
      this.placeLocal(bot, stand);
      this.claim(bot, spot, stand);
      bot.travel([], this.faceYaw(spot, stand), bot.rng.range(...spot.linger));
    }
  }

  // ── Log course ─────────────────────────────────────────────────────────────
  private updateCourse(dt: number): void {
    const course = this.opts.logCourse;
    if (!course) return;
    for (const [bot, driver] of this.courseDrivers) {
      const outcome = driver.update(dt);
      if (outcome === 'running') continue;
      course.removeBotRunner(driver.runner);
      this.courseDrivers.delete(bot);
      bot.setExternalPose(null);
      // Quit mid-river: climb out onto the bank rather than stand in the play area.
      const p = bot.root.position;
      if (course.inPlayArea(p.x, p.z)) {
        const bank = course.ejectPoint(p.x, p.z, new THREE.Vector3());
        bot.placeAt(bank, this.groundAt(bank.x, bank.z, bank.y + 5, 20) ?? bank.y);
      } else if (outcome !== 'won') {
        // Swam out / bumped onto the bank: the course lands them at water level, so stand on the ground.
        bot.placeAt(p, this.groundAt(p.x, p.z, p.y + 5, 20) ?? p.y);
      }
      if (outcome === 'won') {
        // Celebrate at the finish, then carry on as normal.
        bot.spotId = null;
        const finishes = HOTSPOTS.filter((h) => h.group === 'log_course' && h.kind === 'minigame_end');
        this.goTo(bot, bot.rng.pick(finishes));
      } else {
        if (outcome === 'gave_up') {
          gameEvents.emit({ type: 'course_quit', actor: driver.runner.actor, pos: bot.root.position });
        }
        // Gave up or got bumped onto the bank; the revisit penalty steers it elsewhere.
        bot.spotId = 'log_start_bridge';
        this.decide(bot);
      }
    }
  }

  /** Walk to a start-rail node; `decide` hands the bot to the course on arrival. */
  private headToCourse(bot: Bot, course: LogCourse): void {
    const lane = course.pickStartLane();
    const target = course.startPosition(lane, new THREE.Vector3());
    this.release(bot);
    bot.spotId = null;
    const local = this.toLocal(target);
    bot.standLocal = [local[0], local[1]];
    const path = this.routeWorld(bot, this.toLocal(bot.root.position), local);
    path[path.length - 1] = target;
    this.courseBound.set(bot, lane);
    bot.travel(path, null, bot.rng.range(0.1, 0.5));
  }

  private joinCourse(bot: Bot, course: LogCourse, lane: number): void {
    const p = bot.profile.personality;
    const runner = course.addBotRunner(lane, { id: bot.profile.memberId, name: bot.profile.name }, p.courseAttempts);
    this.courseDrivers.set(bot, new CourseDriver(course, runner, bot.rng, p.courseSkill, p.courseAggression));
    bot.setExternalPose(runner.pose);
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  private decide(bot: Bot): void {
    if (this.tryRide(bot)) return;
    const r = bot.rng;
    const course = this.opts.logCourse;
    const lane = this.courseBound.get(bot);
    if (lane !== undefined) {
      this.courseBound.delete(bot);
      if (course) { this.joinCourse(bot, course, lane); return; }
    }
    const onCourse = this.courseBound.size + this.courseDrivers.size;
    const join = bot.profile.personality.courseJoin;
    const atStart = !!bot.spotId && LOG_START_SPOTS.has(bot.spotId);
    if (course && onCourse < MAX_COURSE_BOTS
      && (atStart ? r.chance(join) : onCourse < MIN_COURSE_BOTS && r.chance(RECRUIT_CHANCE * join))) {
      this.headToCourse(bot, course);
      return;
    }
    const cur = bot.spotId ? this.hotspots.get(bot.spotId) : undefined;
    let next: HotspotDef | undefined;
    for (const f of cur?.next ?? []) {
      if (r.chance(f.chance)) { next = this.hotspots.get(f.id); break; }
    }

    const here = this.toLocal(bot.root.position);
    if (!next && r.chance(bot.profile.personality.wanderChance)) {
      const dest = NAV_NODES[r.pick(this.nav.ids)];
      this.release(bot);
      bot.spotId = null;
      bot.standLocal = [dest[0], dest[1]];
      bot.travel(this.routeWorld(bot, here, dest), null, r.range(...WANDER_LINGER));
      return;
    }

    this.goTo(bot, next ?? this.chooseHotspot(bot));
  }

  private goTo(bot: Bot, spot: HotspotDef): void {
    const here = this.toLocal(bot.root.position);
    const stand = this.pickStandPoint(spot, bot);
    this.release(bot);
    this.claim(bot, spot, stand);
    const linger = bot.rng.range(...spot.linger) * bot.profile.personality.lingerScale;
    bot.travel(this.routeWorld(bot, here, stand), this.faceYaw(spot, stand), linger);
  }

  private chooseHotspot(bot: Bot): HotspotDef {
    const p = bot.profile.personality;
    const pick = bot.rng.weighted(HOTSPOTS, (h) => {
      const occ = this.occupancy.get(h.id) ?? 0;
      const crowd = occ < h.capacity ? 1 - 0.5 * (occ / h.capacity) : 0.15 / (1 + occ - h.capacity);
      return h.weight
        * (h.group ? this.interest.get(h.group) ?? 1 : 1)
        * p.affinity[h.kind]
        * crowd
        * (h.id === p.favorite ? FAVORITE_BONUS : 1)
        * (h.id === bot.spotId ? REVISIT_PENALTY : 1);
    });
    return pick ?? HOTSPOTS[0];
  }

  private claim(bot: Bot, spot: HotspotDef, stand: XZ): void {
    bot.spotId = spot.id;
    bot.standLocal = [stand[0], stand[1]];
    this.occupancy.set(spot.id, (this.occupancy.get(spot.id) ?? 0) + 1);
  }

  private release(bot: Bot): void {
    if (!bot.spotId) return;
    this.occupancy.set(bot.spotId, Math.max(0, (this.occupancy.get(bot.spotId) ?? 1) - 1));
  }

  /** Random standable point in the hotspot ring, spaced from other bots there. */
  private pickStandPoint(h: HotspotDef, bot: Bot): XZ {
    const r = bot.rng;
    const rMin = h.minRadius ?? 0;
    let fallback: XZ = h.center;
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, Math.PI * 2);
      const rad = Math.sqrt(r.range(rMin * rMin, h.radius * h.radius));
      const p: XZ = [h.center[0] + Math.cos(a) * rad, h.center[1] + Math.sin(a) * rad];
      if (!isStandable(p)) continue;
      fallback = p;
      const crowded = this.bots.some((o) => o !== bot && o.spotId === h.id && dist(o.standLocal, p) < STAND_SPACING);
      if (!crowded) return p;
    }
    return fallback;
  }

  private faceYaw(h: HotspotDef, stand: XZ): number | null {
    const target = h.face === 'center' ? h.center : h.face;
    if (!target) return null;
    const a = this.toWorld(stand), b = this.toWorld(target, this.tmp);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  private routeWorld(bot: Bot, from: XZ, to: XZ): Vector3[] {
    const pts = this.nav.route(from, to);
    return pts.map((p, i) => {
      if (i === pts.length - 1) return this.toWorld(p);
      const j: XZ = [p[0] + bot.rng.range(-PATH_JITTER, PATH_JITTER), p[1] + bot.rng.range(-PATH_JITTER, PATH_JITTER)];
      return this.toWorld(j);
    });
  }

  // ── Crowd separation ───────────────────────────────────────────────────────
  private separate(player?: Vector3): void {
    const R = SEPARATION_R * this.scale;
    const n = this.bots.length;
    for (let i = 0; i < n; i++) {
      const a = this.bots[i].root.position;
      for (let j = i + 1; j < n; j++) {
        const b = this.bots[j].root.position;
        const dx = a.x - b.x, dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const f = (1 - d / R) * SEPARATION_K / d;
        this.bots[i].push.x += dx * f; this.bots[i].push.z += dz * f;
        this.bots[j].push.x -= dx * f; this.bots[j].push.z -= dz * f;
      }
      if (player) {
        const dx = a.x - player.x, dz = a.z - player.z;
        const d2 = dx * dx + dz * dz;
        const PR = R * 1.2;
        if (d2 < PR * PR && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const f = (1 - d / PR) * SEPARATION_K * 1.5 / d;
          this.bots[i].push.x += dx * f; this.bots[i].push.z += dz * f;
        }
      }
    }
  }

  // ── Space helpers ──────────────────────────────────────────────────────────
  private toWorld(p: XZ, out = new THREE.Vector3()): Vector3 {
    return out.set(p[0], 0, p[1]).applyMatrix4(this.campMatrix);
  }

  private toLocal(v: Vector3): XZ {
    const l = this.tmp.copy(v).applyMatrix4(this.campInverse);
    return [l.x, l.z];
  }

  private groundAt(x: number, z: number, fromY: number, far: number): number | null {
    this.raycaster.set(this.tmp.set(x, fromY, z), this.down);
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.opts.collisionMeshes, false);
    return hits.length > 0 ? hits[0].point.y : null;
  }

  // ── Debug overlay ──────────────────────────────────────────────────────────
  private buildNavDebug(): Object3D {
    const g = new THREE.Group();
    g.name = 'bot_nav_debug';
    const lift = 0.35;
    const edgePts: Vector3[] = [];
    for (const [a, b] of this.nav.edges()) {
      edgePts.push(this.toWorld(a).setY(lift), this.toWorld(b).setY(lift));
    }
    g.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(edgePts),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 }),
    ));
    for (const h of HOTSPOTS) {
      const ring: Vector3[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ring.push(this.toWorld([h.center[0] + Math.cos(a) * h.radius, h.center[1] + Math.sin(a) * h.radius]).setY(lift));
      }
      g.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ring),
        new THREE.LineBasicMaterial({ color: KIND_COLOR[h.kind], depthTest: false }),
      ));
    }
    g.renderOrder = 999;
    this.opts.scene.add(g);
    return g;
  }
}
