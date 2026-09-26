/**
 * First Time User Experience — the scripted arrival at Camp Chonkton.
 *
 *  1. GREET   You arrive at the front gate: a crane shot opens high over the whole
 *             camp and swoops down to you (your chonk isn't in view yet) while a
 *             crowd of campers bursts out through the torii to swarm you.
 *  2. NAME    One of them asks your name → the "New Camper!" panel (name + chonk).
 *  3. REVEAL  The panel closes, your chonk pops in, the camera eases back to the
 *             standard follow view and the crowd says hi.
 *  4. WALK    Everyone auto-walks into camp to the first cherry blossom tree.
 *  5. MEET    The camera frames the Camp Counselor, who gives the rundown in the
 *             Figma speech bubble.
 *  6. TENT    The Counselor asks where you'd like to pitch your tent; the camera rises to a
 *             bird's-eye view of camp with a tappable pin on each tent site. Pick one and the
 *             camera swoops over to see your tent pop up there. Then control is handed back.
 *
 * The Counselor is a permanent camp NPC (they stay under the tree for returning
 * players). Everything is local/faked: the crowd is borrowed from the BotManager.
 * Content lives in FTUE_SCRIPT, tuning in FTUE_TUNING; replay via the debug panel
 * or `?ftue=1`.
 */
import { params } from './debug-panel';
import { createCharacter, loadSpeciesGltf, type AnimState, type PlayerResult } from './player';
import { COUNSELOR, SPECIES, type SpeciesId } from './bots/appearance';
import type { BotManager } from './bots/bot-manager';
import type { Bot } from './bots/bot';
import { Nameplates } from './bots/nameplates';
import { DialogueBox, type DialogueLine } from './ui/dialogue';
import { showNewCamper } from './ui/profile-screen';
import { OWNED_CHARACTERS } from './ui/store-presets';
import { storageGet, storageSet } from './storage';

type Vector3 = import('three').Vector3;
type Object3D = import('three').Object3D;
type Group = import('three').Group;
type PerspectiveCamera = import('three').PerspectiveCamera;

const DONE_KEY = 'chonk.ftue.v1';

/** Copy (thin code, thick content). */
export const FTUE_SCRIPT = {
  counselorName: 'Counselor Chonk',
  counselorTag: '<Camp Counselor>',
  ask: "Ooh, a new camper!! What's your name?",
  greetings: ['hiii!!', 'a new camper!!', 'welcome!!', '👋', 'omg hi', 'yooo', 'fresh chonk!!', '🎉', 'hewwo'],
  meet: (name: string) => [`hi ${name}!!`, `${name}!!! 🎉`, `nice to meet u ${name}`, 'welcome welcome!!', '👋👋'],
  follow: ['follow us!!', 'this way!!', 'come meet the counselor!'],
  /** Tour-guide chatter on the walk in. */
  tour: ['the lake is SO nice', 'dodgeball later??', 'u gotta try the log course', 'counselor is the best',
    'dont fall in the river lol', 'this is the plaza!!', 'i fell in the lake yesterday', '🌸🌸🌸'],
  counselor: (name: string): string[] => [
    `Welcome to Camp Chonkton, ${name}! Explore, play and socialize with friends.`,
    'Walk up to any area to check it out and learn how to play!',
  ],
  tentAsk: 'Oh! And every camper gets their very own tent. Where would you like to set up yours?',
  tentHint: 'Tap a spot to pitch your tent!',
  tentDone: (site: string): string =>
    `Great pick! Your tent's all set up at the ${site}. Walk up to it any time to make it your own!`,
};

/** Tuning — locked values (tune live, then write the numbers here). */
export const FTUE_TUNING = {
  greeters: 7,
  /** Camp-local XZ (tools/build_camp.py) where you arrive: just OUTSIDE the torii gate (z 7). */
  startLocal: [0, 2] as [number, number],
  /** Camp-local XZ the crowd runs out from (the plaza, inside the gate). */
  crowdFromLocal: [0, 20] as [number, number],
  /** Greeting arc in front of you: radius range (world) and half-angle (rad). */
  swarmRadius: [3.4, 5.2] as [number, number],
  swarmSpread: 0.8,
  swarmSpeed: [6.5, 9.5] as [number, number],
  greetEvery: [0.35, 0.8] as [number, number],
  /** Seconds of greeting before the name question. */
  greetTime: 6.4,
  /** Seconds after arrival before the crowd bursts out through the gate (so the crane sees it). */
  crowdDelay: 1.1,
  /** Walk into camp (world u/s) — the escort matches it. */
  walkSpeed: 5.8,
  /** Player stops this far from the Counselor (world). */
  meetDist: 3.6,
  /** Crowd ring around the Counselor (world). */
  ringRadius: 5.4,
  /** Ring fan, radians from the approach direction: first slot, then spread across. */
  ringFrom: 1.35,
  ringStep: 1.0,
  counselorSpecies: COUNSELOR.species,
  counselorScale: COUNSELOR.scale,
  /** How far in front of the cherry tree trunk the Counselor stands (world). */
  counselorFromTrunk: 2.2,
  /**
   * Arrival flight (your chonk is hidden throughout): a high aerial over the gate looking
   * into camp → one continuous glide down → settles behind your arrival spot with the
   * whole torii in frame as the crowd streams out through the gate.
   * After you pick a chonk the camera eases into the standard follow cam for the walk.
   * Keys are world units relative to the arrival point along the view direction:
   * back = behind it, up = above the ground, look* = the aim point. The gate is ~6.75 AHEAD.
   */
  craneTime: 6.0,
  craneKeys: [
    // Heights/distances only ever decrease → one smooth glide down, no dip-and-bounce.
    { back: 13, up: 24, lookAhead: 40, lookUp: 0, fov: 72 },      // aerial: the whole camp
    { back: 10.5, up: 12, lookAhead: 24, lookUp: 3, fov: 80 },    // gliding down toward the gate
    // Settled: far enough back (+ wide enough) that the whole torii (~11.3 wide) fits a portrait screen.
    { back: 8.5, up: 6.8, lookAhead: 10, lookUp: 4.3, fov: 88 },
  ],
  talkFov: 52,
  /** Bird's-eye tent-site picker: vertical fov, tilt back from straight down (rad), margin (world). */
  overview: { fov: 55, tilt: 0.42, margin: 26 },
  /** Looking at your freshly pitched tent: distance back / up (world). */
  tentShot: { back: 19, up: 11, lookUp: 1.2, fov: 60 },
};

/** A tent site the FTUE offers (world position = where its pin sits). */
export interface FtueTentSite { id: string; label: string; emoji: string; pos: Vector3; }

export interface FtueHost {
  container: HTMLElement;
  scene: import('three').Scene;
  camera: PerspectiveCamera;
  /** Current player holder (stable across model swaps). */
  player: Group;
  /** Player body height in world units (current species, current scale). */
  playerHeight(): number;
  groundAt(x: number, z: number): number | null;
  /** The standard follow-cam for a camera heading (camera yaw = where it sits FROM). */
  followCam(heading: number, outPos: Vector3, outLook: Vector3): void;
  setControlsVisible(v: boolean): void;
  currentName(): string;
  currentCharacter(): string;
  playable(chonkId: string): boolean;
  /** Save + apply the profile (swaps the player model). */
  applyProfile(name: string, chonkId: string): Promise<void>;
  dustBurst(x: number, y: number, z: number, n: number): void;
  /** Control returns to the player; `heading` = the camera heading to continue from. */
  onFinish(heading: number): void;
  /** The tent sites to choose from (none = skip the TENT step). */
  tentSites?(): FtueTentSite[];
  /** Pitch the player's tent at site `id`; returns where it stands (world). */
  chooseTentSite?(id: string): Vector3;
  /** Push the fog / far plane out for the bird's-eye view (and back). */
  setWideView?(on: boolean): void;
}

export interface FtuePose { anim: AnimState; }

type Shot = 'arrive' | 'follow' | 'talk' | 'overview' | 'tent';

export class Ftue {
  active = false;
  readonly pose: FtuePose = { anim: 'idle' };

  private bots: BotManager | null = null;
  private greeters: Bot[] = [];
  private dialogue: DialogueBox;
  private counselor: PlayerResult | null = null;
  private counselorHome = new THREE.Vector3();
  private counselorFace = 0;
  private counselorYaw = 0;
  private plates: Nameplates;
  private plateAnchor = new THREE.Vector3();
  /** Where the player stops to listen (world) and the unit vector Counselor → player. */
  private meetPoint = new THREE.Vector3();
  private approach = new THREE.Vector3(0, 0, -1);

  // Player motion owned by the script.
  private path: Vector3[] = [];
  private pathIdx = 0;
  private arrive: (() => void) | null = null;
  private faceYaw: number | null = null;
  private hopH = 0;
  private hopV = 0;
  private smoothY = 0;
  /** 0→1 reveal pop (scale overshoot), 1 = settled. */
  private pop = 1;

  // Camera.
  private shot: Shot = 'arrive';
  /** 0→1 progress of the arrival crane, and its flight path (built per run). */
  private crane = 0;
  private cranePath: import('three').CatmullRomCurve3 | null = null;
  private craneLook: import('three').CatmullRomCurve3 | null = null;
  private blendK = 3;
  private heading = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly tgtPos = new THREE.Vector3();
  private readonly tgtLook = new THREE.Vector3();
  private fov = 70;
  private startYaw = 0;
  /** Fixed shots (overview / tent): position, aim, fov. */
  private readonly fixedPos = new THREE.Vector3();
  private readonly fixedLook = new THREE.Vector3();
  private fixedFov = 55;
  /** Tent-site pins (DOM, projected each frame) while the picker is up. */
  private pins: { el: HTMLElement; pos: Vector3 }[] = [];
  private pinLayer: HTMLElement | null = null;

  // Timers.
  private waits: { t: number; done: () => void }[] = [];
  private chatterOn = false;
  private chatterIn = 0;
  private chatterLines: readonly string[] = [];
  /** Chance a chatter beat also hops (greeting = always, walking = sometimes). */
  private chatterHop = 1;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly host: FtueHost) {
    this.dialogue = new DialogueBox(host.container);
    this.plates = new Nameplates(host.container);
    this.plates.add(FTUE_SCRIPT.counselorName, FTUE_SCRIPT.counselorTag, '#ffd23f');
  }

  static shouldRun(): boolean {
    const q = new URLSearchParams(location.search).get('ftue');
    if (q === '1') return true;
    if (q === '0') return false;
    return !storageGet<boolean>(DONE_KEY, false);
  }

  /** Places the Counselor under the cherry tree nearest the gate. Call once after the stage + bots load. */
  async setup(stageRoot: Object3D, bots: BotManager | null): Promise<void> {
    this.bots = bots;
    const start = this.startPoint();
    const trunk = findCherryTrunk(stageRoot, start);
    if (!trunk) { console.warn('[ftue] no cherry tree found; Counselor stands in the plaza'); }
    const trunkPos = trunk ?? this.local(0, 20);
    // Stand in front of the trunk, on the side you approach from (toward the nav route).
    const reach = bots ? bots.route(start, trunkPos) : [start, trunkPos];
    const from = reach.length >= 2 ? reach[reach.length - 2] : start;
    this.approach.set(from.x - trunkPos.x, 0, from.z - trunkPos.z).normalize();
    this.counselorHome.copy(trunkPos).addScaledVector(this.approach, FTUE_TUNING.counselorFromTrunk);
    this.counselorHome.y = this.host.groundAt(this.counselorHome.x, this.counselorHome.z) ?? trunkPos.y;
    this.meetPoint.copy(this.counselorHome).addScaledVector(this.approach, FTUE_TUNING.meetDist);
    this.counselorFace = Math.atan2(this.approach.x, this.approach.z);
    this.counselorYaw = this.counselorFace;

    try {
      const sp = SPECIES[FTUE_TUNING.counselorSpecies];
      this.counselor = createCharacter(await loadSpeciesGltf(sp));
      this.counselor.root.name = 'npc_counselor';
      this.host.scene.add(this.counselor.root);
    } catch (e) {
      console.warn('[ftue] counselor load failed:', e);
    }
  }

  /** Runs the whole arrival. Resolves when control is back with the player. */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const T = FTUE_TUNING;
    const h = this.host;
    const bots = this.bots;
    h.setControlsVisible(false);
    if (bots) bots.pesterPaused = true;

    // ── 1. GREET ─────────────────────────────────────────────────────────────
    const start = this.startPoint();
    const inward = this.local(T.crowdFromLocal[0], T.crowdFromLocal[1]);
    this.startYaw = Math.atan2(inward.x - start.x, inward.z - start.z);
    this.placePlayer(start, this.startYaw);
    h.player.visible = false;
    this.shot = 'arrive';
    this.crane = 0;
    this.buildCrane(start);
    this.blendK = 12; // the crane target itself is eased; track it tightly
    this.snapCamera();

    this.greeters = bots ? bots.borrowGroup(T.greeters, inward) : [];
    const n = this.greeters.length;
    this.greeters.forEach((b, i) => {
      // Burst out from inside the gate, a little staggered, into an arc facing you.
      const jitter = this.tmp.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      bots!.teleport(b, inward.clone().add(jitter));
      const t = n > 1 ? i / (n - 1) : 0.5;
      const ang = this.startYaw + (t - 0.5) * 2 * T.swarmSpread;
      const r = i % 2 ? T.swarmRadius[1] : T.swarmRadius[0];
      const slot = new THREE.Vector3(start.x + Math.sin(ang) * r, start.y, start.z + Math.cos(ang) * r);
      const faceMe = Math.atan2(start.x - slot.x, start.z - slot.z);
      b.speedOverride = T.swarmSpeed[0] + Math.random() * (T.swarmSpeed[1] - T.swarmSpeed[0]);
      b.travel([], faceMe, 1e9);
      this.later(T.crowdDelay + Math.random() * 0.6, () => b.travel([slot], faceMe, 1e9));
    });
    this.chatterLines = FTUE_SCRIPT.greetings;
    this.chatterHop = 1;
    this.chatterOn = true;
    this.chatterIn = T.crowdDelay + 0.8;
    await this.wait(T.greetTime);

    // ── 2. NAME ──────────────────────────────────────────────────────────────
    const asker = this.greeters.slice().sort((a, b) =>
      a.root.position.distanceToSquared(start) - b.root.position.distanceToSquared(start))[0];
    this.chatterOn = false;
    if (asker) asker.hop();
    await this.dialogue.play([{ name: asker?.profile.name ?? 'Camper', text: FTUE_SCRIPT.ask }]);
    const profile = await new Promise<{ name: string; id: string }>((resolve) => {
      showNewCamper(h.container, {
        name: storageGet<boolean>(DONE_KEY, false) ? h.currentName() : '', characters: OWNED_CHARACTERS, selectedId: h.playable(h.currentCharacter()) ? h.currentCharacter() : 'froggo',
        playable: h.playable, onDone: (name, id) => resolve({ name, id }),
      });
    });
    await h.applyProfile(profile.name, profile.id);

    // ── 3. REVEAL ────────────────────────────────────────────────────────────
    h.player.visible = true;
    this.placePlayer(start, this.startYaw);
    this.hopV = 7;
    h.dustBurst(start.x, start.y, start.z, 10);
    this.pop = 0;
    this.heading = this.startYaw + Math.PI;
    this.shot = 'follow';
    this.blendK = 2.2;
    const meet = FTUE_SCRIPT.meet(profile.name);
    this.greeters.forEach((b, i) => this.later(0.25 + i * 0.22, () => { b.hop(); if (i < 4) bots?.say(b, meet[i % meet.length]); }));
    await this.wait(1.9);

    // ── 4. WALK ──────────────────────────────────────────────────────────────
    const lead = this.greeters[Math.floor(Math.random() * Math.max(1, n))];
    if (lead) bots?.say(lead, FTUE_SCRIPT.follow[Math.floor(Math.random() * FTUE_SCRIPT.follow.length)]);
    const route = bots ? bots.route(h.player.position, this.meetPoint) : [this.meetPoint.clone()];
    this.escort(route);
    this.blendK = 3;
    this.chatterLines = FTUE_SCRIPT.tour;
    this.chatterHop = 0.3;
    this.chatterIn = 1.4;
    this.chatterOn = true;
    await this.walk(route);
    this.chatterOn = false;

    // ── 5. MEET ──────────────────────────────────────────────────────────────
    this.faceYaw = Math.atan2(this.counselorHome.x - h.player.position.x, this.counselorHome.z - h.player.position.z);
    this.shot = 'talk';
    this.blendK = 2.4;
    await this.wait(1.1);
    const name = FTUE_SCRIPT.counselorName;
    const lines: DialogueLine[] = FTUE_SCRIPT.counselor(profile.name).map((text) => ({ name, text }));
    await this.dialogue.play(lines);

    // ── 6. TENT ──────────────────────────────────────────────────────────────
    const sites = h.tentSites?.() ?? [];
    if (sites.length && h.chooseTentSite) await this.pickTent(sites);

    // ── Hand back ────────────────────────────────────────────────────────────
    this.shot = 'follow';
    this.heading = (this.faceYaw ?? h.player.rotation.y) + Math.PI;
    this.blendK = 3;
    this.greeters.forEach((b, i) => this.later(i * 0.12, () => b.hop()));
    await this.wait(0.9);
    this.finish();
  }

  /** Aborts / completes: flags done, hands everything back. */
  finish(): void {
    if (!this.active) return;
    this.active = false;
    storageSet(DONE_KEY, true);
    // Drop a ?ftue=1 replay flag so refreshing afterwards doesn't force the arrival again.
    const url = new URL(location.href);
    if (url.searchParams.has('ftue')) {
      url.searchParams.delete('ftue');
      history.replaceState(history.state, '', url);
    }
    this.waits = [];
    this.chatterOn = false;
    this.clearPins();
    this.host.setWideView?.(false);
    this.path = [];
    this.arrive = null;
    this.host.player.visible = true;
    if (this.bots) {
      this.bots.returnBots(this.greeters);
      this.bots.pesterPaused = false;
    }
    this.greeters = [];
    this.host.setControlsVisible(true);
    this.host.onFinish(this.heading);
  }

  /** Per frame while active: drives the player + camera. */
  update(dt: number): void {
    // Script timers.
    if (this.waits.length) {
      const due = this.waits.filter((w) => (w.t -= dt) <= 0);
      if (due.length) {
        this.waits = this.waits.filter((w) => w.t > 0);
        due.forEach((w) => w.done());
      }
    }
    this.updateChatter(dt);
    if (this.shot === 'arrive' && this.crane < 1) this.crane = Math.min(1, this.crane + dt / FTUE_TUNING.craneTime);

    const p = this.host.player;
    let moving = false;
    if (this.path.length && this.pathIdx < this.path.length) {
      const tgt = this.path[this.pathIdx];
      const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z;
      const d = Math.hypot(dx, dz);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? 0.12 : 0.8)) {
        if (++this.pathIdx >= this.path.length) {
          this.path = [];
          const a = this.arrive; this.arrive = null; a?.();
        }
      } else {
        const step = Math.min(d, FTUE_TUNING.walkSpeed * dt);
        p.position.x += (dx / d) * step;
        p.position.z += (dz / d) * step;
        this.faceYaw = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (this.faceYaw !== null) {
      let d = this.faceYaw - p.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.rotation.y += d * (1 - Math.exp(-params.turnSpeed * dt));
    }
    // Hop (the reveal pop).
    if (this.hopH > 0 || this.hopV > 0) {
      this.hopV -= 18 * dt;
      this.hopH = Math.max(0, this.hopH + this.hopV * dt);
      if (this.hopH === 0) {
        this.hopV = 0;
        this.host.dustBurst(p.position.x, this.smoothY, p.position.z, 6);
      }
    }
    if (this.pop < 1) {
      // main sets the real scale each frame before this runs; overshoot on top of it.
      this.pop = Math.min(1, this.pop + dt / 0.42);
      const t = this.pop, c = 2.2;
      p.scale.multiplyScalar(Math.max(0.01, 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)));
    }
    const g = this.host.groundAt(p.position.x, p.position.z);
    if (g !== null) this.smoothY += (g - this.smoothY) * (1 - Math.exp(-14 * dt));
    p.position.y = this.smoothY + params.footOffset + this.hopH;
    this.pose.anim = this.hopH > 0 ? (this.hopV > 0 ? 'jumping_up' : 'falling_idle') : moving ? 'walking' : 'idle';

    // Follow heading eases in behind the walk direction.
    if (this.shot === 'follow' && moving) {
      let dh = p.rotation.y + Math.PI - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * (1 - Math.exp(-1.6 * dt));
    }
    this.updateCamera(dt);
  }

  /** Every frame, FTUE or not: the Counselor idles under the tree and turns to nearby players. */
  updateAmbient(dt: number, camera: import('three').Camera, playerPos: Vector3 | null): void {
    const c = this.counselor;
    if (!c) return;
    const s = params.frogScale * SPECIES[FTUE_TUNING.counselorSpecies].scale * FTUE_TUNING.counselorScale;
    c.root.scale.setScalar(s);
    c.root.position.set(this.counselorHome.x,
      this.counselorHome.y + params.footOffset + SPECIES[FTUE_TUNING.counselorSpecies].footOffset * FTUE_TUNING.counselorScale,
      this.counselorHome.z);
    let want = this.counselorFace;
    if (this.active && this.shot === 'talk') {
      // Speak to the viewer: face the camera (it sits just behind your chonk).
      want = Math.atan2(this.camPos.x - this.counselorHome.x, this.camPos.z - this.counselorHome.z);
    } else if (playerPos && playerPos.distanceTo(this.counselorHome) < 11) {
      want = Math.atan2(playerPos.x - this.counselorHome.x, playerPos.z - this.counselorHome.z);
    }
    let d = want - this.counselorYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.counselorYaw += d * (1 - Math.exp(-4 * dt));
    c.root.rotation.y = this.counselorYaw;
    c.update(dt, 'idle');
    this.plates.visible = params.showNameplates;
    this.plates.update(camera, [this.plateAnchor.copy(c.root.position).setY(c.root.position.y + c.top() * s + 0.35)]);
  }

  // ── Tent site ──────────────────────────────────────────────────────────────
  private async pickTent(sites: FtueTentSite[]): Promise<void> {
    const h = this.host;
    const name = FTUE_SCRIPT.counselorName;
    await this.dialogue.play([{ name, text: FTUE_SCRIPT.tentAsk }]);
    // Up to the bird's-eye view, then the pins pop in.
    h.setWideView?.(true);
    this.frameOverview(sites.map((s) => s.pos));
    this.shot = 'overview';
    this.blendK = 1.5;
    await this.wait(1.6);
    const id = await this.showPins(sites);
    const site = sites.find((s) => s.id === id)!;
    const at = h.chooseTentSite!(id);
    // Swoop over to see it pitched (from the overview's side, so it reads as flying down).
    const T = FTUE_TUNING.tentShot;
    const back = this.tmp.copy(this.camPos).sub(at).setY(0).normalize();
    this.fixedPos.copy(at).addScaledVector(back, T.back).setY(at.y + T.up);
    this.fixedLook.copy(at).setY(at.y + T.lookUp);
    this.fixedFov = T.fov;
    this.shot = 'tent';
    this.blendK = 1.8;
    await this.wait(1.7);
    await this.dialogue.play([{ name, text: FTUE_SCRIPT.tentDone(site.label) }]);
    h.setWideView?.(false);
  }

  /** A camera high over camp that fits every point (portrait-aware), tilted back a little. */
  private frameOverview(points: Vector3[]): void {
    const O = FTUE_TUNING.overview;
    const c = new THREE.Vector3();
    points.forEach((p) => c.add(p));
    c.divideScalar(points.length);
    // Screen-up runs along the widest spread (the tall axis of a portrait screen).
    let u = new THREE.Vector3(0, 0, 1), best = -1;
    for (const a of points) for (const b of points) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > best) { best = d; u = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); }
    }
    const v = new THREE.Vector3(u.z, 0, -u.x);
    let su = 0, sv = 0;
    for (const p of points) {
      const d = this.tmp.copy(p).sub(c).setY(0);
      su = Math.max(su, Math.abs(d.dot(u)));
      sv = Math.max(sv, Math.abs(d.dot(v)));
    }
    su += O.margin; sv += O.margin;
    const tanV = Math.tan(THREE.MathUtils.degToRad(O.fov / 2));
    const dist = Math.max(su / tanV, sv / (tanV * this.host.camera.aspect)) * 1.05;
    const maxY = Math.max(...points.map((p) => p.y));
    this.fixedLook.copy(c).setY(maxY);
    this.fixedPos.copy(this.fixedLook).addScaledVector(u, -Math.sin(O.tilt) * dist);
    this.fixedPos.y += Math.cos(O.tilt) * dist;
    this.fixedFov = O.fov;
  }

  /** Tappable pins over each site; resolves with the one you tap. */
  private showPins(sites: FtueTentSite[]): Promise<string> {
    return new Promise((resolve) => {
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:0;z-index:55;pointer-events:none;overflow:hidden;';
      const hint = document.createElement('div');
      hint.textContent = FTUE_SCRIPT.tentHint;
      hint.style.cssText = "position:absolute;left:50%;top:calc(env(safe-area-inset-top) + 7%);transform:translateX(-50%);" +
        "padding:10px 22px;border-radius:22px;background:#fff8ea;border:4px solid #674833;box-shadow:0 5px 0 #3a2415;" +
        "font-family:'Fredoka',system-ui,sans-serif;font-weight:700;font-size:clamp(16px,4.6vmin,24px);color:#3a2415;white-space:nowrap;";
      layer.appendChild(hint);
      hint.animate([{ opacity: 0, transform: 'translate(-50%,-20px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 260 });
      this.host.container.appendChild(layer);
      this.pinLayer = layer;
      sites.forEach((s, i) => {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;' +
          'pointer-events:auto;cursor:pointer;user-select:none;touch-action:manipulation;will-change:transform;';
        const pill = document.createElement('div');
        pill.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:#ebdecd;" +
          "border:4px solid #674833;box-shadow:0 6px 0 #3a2415,0 8px 14px rgba(0,0,0,0.3);font-family:'Fredoka',system-ui,sans-serif;" +
          'font-weight:700;font-size:clamp(15px,4.2vmin,22px);color:#3a2415;white-space:nowrap;';
        pill.textContent = `${s.emoji} ${s.label}`;
        const stem = document.createElement('div');
        stem.style.cssText = 'width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;' +
          'border-top:16px solid #674833;margin-top:-2px;';
        const dot = document.createElement('div');
        dot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#ffd23f;border:3px solid #674833;margin-top:2px;';
        el.append(pill, stem, dot);
        pill.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }],
          { duration: 800 + i * 90, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
        el.animate([{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1.1', offset: 0.7 }, { opacity: 1, scale: '1' }],
          { duration: 320, delay: i * 120, fill: 'backwards', easing: 'ease-out' });
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 200 });
          window.setTimeout(() => { this.clearPins(); resolve(s.id); }, 160);
        });
        layer.appendChild(el);
        this.pins.push({ el, pos: s.pos.clone() });
      });
      this.updatePins();
    });
  }

  private updatePins(): void {
    const layer = this.pinLayer;
    if (!layer) return;
    const w = layer.clientWidth, hgt = layer.clientHeight;
    for (const p of this.pins) {
      const v = this.tmp.copy(p.pos).project(this.host.camera);
      const x = (v.x + 1) * 0.5 * w, y = (1 - v.y) * 0.5 * hgt;
      // The pin's dot sits on the site (the element's bottom-centre).
      p.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }

  private clearPins(): void {
    this.pinLayer?.remove();
    this.pinLayer = null;
    this.pins = [];
  }

  // ── Script helpers ─────────────────────────────────────────────────────────
  private wait(seconds: number): Promise<void> {
    return new Promise((done) => this.waits.push({ t: seconds, done }));
  }

  private later(seconds: number, fn: () => void): void {
    this.waits.push({ t: seconds, done: fn });
  }

  private walk(path: Vector3[]): Promise<void> {
    this.path = path;
    this.pathIdx = 0;
    return new Promise((r) => { this.arrive = r; });
  }

  /** Greeters lead the way along your route (spread sideways), then ring the Counselor. */
  private escort(route: Vector3[]): void {
    const T = FTUE_TUNING;
    const n = this.greeters.length;
    const baseAng = Math.atan2(this.approach.x, this.approach.z);
    this.greeters.forEach((b, i) => {
      const lat = ((i % 3) - 1) * 1.6 + (Math.random() - 0.5) * 0.6;
      const pts: Vector3[] = [];
      for (let k = 0; k < route.length - 1; k++) {
        const a = k === 0 ? this.host.player.position : route[k - 1];
        const dir = this.tmp.copy(route[k]).sub(a).setY(0).normalize();
        pts.push(route[k].clone().add(new THREE.Vector3(dir.z * lat, 0, -dir.x * lat)));
      }
      // Ring slot: flanking the Counselor (sides / a little behind), never between
      // the camera and them, facing in.
      const side = i % 2 ? 1 : -1;
      const ang = baseAng + side * (T.ringFrom + Math.floor(i / 2) * (T.ringStep / Math.max(1, Math.ceil(n / 2) - 1)));
      const slot = new THREE.Vector3(
        this.counselorHome.x + Math.sin(ang) * T.ringRadius, this.counselorHome.y,
        this.counselorHome.z + Math.cos(ang) * T.ringRadius);
      pts.push(slot);
      const face = Math.atan2(this.counselorHome.x - slot.x, this.counselorHome.z - slot.z);
      b.speedOverride = T.walkSpeed * (1.08 + Math.random() * 0.12);
      b.travel(pts, face, 1e9);
    });
  }

  private updateChatter(dt: number): void {
    if (!this.chatterOn || !this.greeters.length || (this.chatterIn -= dt) > 0) return;
    const [a, b] = FTUE_TUNING.greetEvery;
    const walking = this.chatterHop < 1;
    this.chatterIn = (a + Math.random() * (b - a)) * (walking ? 2.4 : 1);
    const bot = this.greeters[Math.floor(Math.random() * this.greeters.length)];
    if (Math.random() < this.chatterHop) bot.hop();
    if (Math.random() < 0.75) {
      const g = this.chatterLines;
      this.bots?.say(bot, g[Math.floor(Math.random() * g.length)]);
    }
  }

  private placePlayer(pos: Vector3, yaw: number): void {
    const p = this.host.player;
    const g = this.host.groundAt(pos.x, pos.z) ?? pos.y;
    p.position.set(pos.x, g + params.footOffset, pos.z);
    p.rotation.set(0, yaw, 0);
    this.smoothY = g;
    this.faceYaw = yaw;
    this.hopH = 0;
    this.hopV = 0;
  }

  private startPoint(): Vector3 {
    const s = this.local(FTUE_TUNING.startLocal[0], FTUE_TUNING.startLocal[1]);
    s.y = this.host.groundAt(s.x, s.z) ?? 0;
    return s;
  }

  private local(x: number, z: number): Vector3 {
    return this.bots ? this.bots.campToWorld(x, z) : new THREE.Vector3(x * 1.35, 0, z * 1.35);
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  private shotTarget(): number {
    const T = FTUE_TUNING;
    const p = this.host.player.position;
    const ground = this.smoothY;
    if (this.shot === 'arrive' && this.cranePath && this.craneLook) {
      // Fly-through → wide vista. Your chonk is hidden, so this reads as arriving.
      const c = this.crane;
      const e = c < 0.5 ? 4 * c ** 3 : 1 - (-2 * c + 2) ** 3 / 2; // ease in-out
      this.cranePath.getPointAt(e, this.tgtPos);
      this.craneLook.getPointAt(e, this.tgtLook);
      const keys = T.craneKeys;
      const seg = Math.min(keys.length - 2, Math.floor(e * (keys.length - 1)));
      const u = e * (keys.length - 1) - seg;
      return keys[seg].fov + (keys[seg + 1].fov - keys[seg].fov) * u;
    }
    if (this.shot === 'overview' || this.shot === 'tent') {
      this.tgtPos.copy(this.fixedPos);
      this.tgtLook.copy(this.fixedLook);
      return this.fixedFov;
    }
    if (this.shot === 'talk') {
      // Over your shoulder, the Counselor framed above the speech bubble.
      const a = this.approach;
      const side = new THREE.Vector3(a.z, 0, -a.x);
      const ch = (this.counselor?.height ?? 2) * params.frogScale * SPECIES[T.counselorSpecies].scale * T.counselorScale;
      this.tgtPos.copy(this.meetPoint).addScaledVector(a, 5.2).addScaledVector(side, 2.9);
      this.tgtPos.y = this.meetPoint.y + ch * 0.82;
      this.tgtLook.copy(this.counselorHome);
      this.tgtLook.y = this.counselorHome.y + ch * 0.68; // high enough to catch the blossoms
      return T.talkFov;
    }
    this.host.followCam(this.heading, this.tgtPos, this.tgtLook);
    return params.camFov;
  }

  /** Bakes the fly-through keys into world-space curves from the arrival point. */
  private buildCrane(start: Vector3): void {
    const f = new THREE.Vector3(Math.sin(this.startYaw), 0, Math.cos(this.startYaw));
    const at = (along: number, up: number) => start.clone().addScaledVector(f, along).setY(start.y + up);
    const keys = FTUE_TUNING.craneKeys;
    this.cranePath = new THREE.CatmullRomCurve3(keys.map((k) => at(-k.back, k.up)), false, 'centripetal');
    this.craneLook = new THREE.CatmullRomCurve3(keys.map((k) => at(k.lookAhead, k.lookUp)), false, 'centripetal');
  }

  private snapCamera(): void {
    this.fov = this.shotTarget();
    this.camPos.copy(this.tgtPos);
    this.camLook.copy(this.tgtLook);
    this.applyCamera();
  }

  private updateCamera(dt: number): void {
    const fov = this.shotTarget();
    const k = 1 - Math.exp(-this.blendK * dt);
    this.camPos.lerp(this.tgtPos, k);
    this.camLook.lerp(this.tgtLook, k);
    this.fov += (fov - this.fov) * k;
    this.applyCamera();
    this.updatePins();
  }

  private applyCamera(): void {
    const cam = this.host.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

/** World position (ground) of the cherry-blossom tree trunk nearest `near`. */
function findCherryTrunk(root: Object3D, near: Vector3): Vector3 | null {
  const trunks = new Map<string, Object3D>();
  const cherries: string[] = [];
  root.traverse((o) => {
    const m = /^(prop_tree_\d+)_(trunk|canopy)$/.exec(o.name);
    if (!m) return;
    if (m[2] === 'trunk') trunks.set(m[1], o);
    else {
      const mat = (o as import('three').Mesh).material as import('three').Material | undefined;
      if (mat && /cherry/i.test(mat.name)) cherries.push(m[1]);
    }
  });
  let best: Vector3 | null = null;
  let bestD = Infinity;
  for (const id of cherries) {
    const t = trunks.get(id);
    if (!t) continue;
    const box = new THREE.Box3().setFromObject(t);
    const c = box.getCenter(new THREE.Vector3()).setY(box.min.y);
    const d = c.distanceToSquared(near);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
