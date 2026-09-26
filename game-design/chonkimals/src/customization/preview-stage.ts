// Turntable preview for the Customize screen: its own little WebGL canvas showing the
// player's chonk (dressed, idling) in a cabin dressing room, or out at their camp spot next
// to their tent. Drag to spin; let go and it coasts, then drifts round slowly on its own.
// The room's mirror shows a live reflection. walkOut() / walkIn() play the trip between the
// two: the chonk walks to the cabin door, it swings open, the camera follows it out, a soft
// fade, and it strolls up to its tent (and back). dispose() frees the GL context.

import { createCharacter, loadSpeciesGltf, type PlayerResult } from '../player';
import { SPECIES, speciesForChonk } from '../bots/appearance';
import { dressCharacter } from './attire';
import { useToy } from './toy-use';
import { buildTent } from './tent-model';
import type { AvatarLoadout, TentLoadout } from './loadout';
import { DOOR, buildDressingRoom, dressingRoomLights } from './dressing-room';
import { COLORS } from '../ui/theme';

type Object3D = import('three').Object3D;
type Vec3 = import('three').Vector3;

const IDLE_SPIN = 0.25;   // rad/s once you've let go for a while
const IDLE_AFTER = 2.5;   // s after a drag before the idle spin kicks in
/** Dressing-room framing: camera distance / height as multiples of the chonk's height. */
const ROOM_VIEW = { fov: 38, dist: 4.1, pitch: 0.15, targetY: 0.66, forward: 0.45 };
/** The chonk's rug (spins with it) — its top is what the feet stand on. */
const RUG_TOP = 0.03;
const MIRROR_RT = { w: 256, h: 400 };
/** The walk between the room and the tent. Speeds in chonk heights / s, times in s. */
const TRIP = { walk: 1.55, turn: 0.28, fade: 0.3, doorSpeed: 5, camPush: 0.5 };

type Mode = 'room' | 'tent';
/** `resolve` fires on arrival (the cut to the other place) — the rest of the walk plays on while you edit. */
interface Trip { kind: 'out' | 'in'; phase: number; t: number; tent?: TentLoadout; resolve: (() => void) | null; }

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class PreviewStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: InstanceType<typeof THREE.WebGLRenderer>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  private turntable = new THREE.Group();
  private content: Object3D | null = null;
  private character: PlayerResult | null = null;
  private characterSpecies = '';
  /** Chonk height (world units) and the root lift that stands its posed feet on y = 0. */
  private charH = 1;
  private footY = 0;
  private mode: Mode = 'room';
  private avatarHolder: Object3D | null = null;
  private tentRoot: Object3D | null = null;
  private tentExtent = 2;
  /** Seconds until the posed character gets grounded + framed (the idle pose ≠ the rest-pose
   * bounds, and the idle clip takes a moment to fade in). */
  private settle = 0;
  private target = new THREE.Vector3();
  private dist = 5;
  private pitch = 0.18;
  private yaw = -0.5;
  private spin = 0;
  private sinceDrag = IDLE_AFTER;
  private dragX: number | null = null;
  private raf = 0;
  private last = 0;
  private token = 0;
  private disposed = false;
  private observer: ResizeObserver;
  private room = buildDressingRoom();
  private roomLights = dressingRoomLights();
  private mirrorRT: import('three').WebGLRenderTarget<import('three').Texture> | null = null;
  private mirrorCam = new THREE.PerspectiveCamera(46, MIRROR_RT.w / MIRROR_RT.h, 0.05, 100);
  private mirrorTick = 0;
  /** Part of the canvas the subject should be centred in (CSS px from the top), e.g. the gap
   * between overlaid UI. null = the whole canvas. */
  private focus: { top: number; height: number } | null = null;
  private hemi: InstanceType<typeof THREE.HemisphereLight>;
  private trip: Trip | null = null;
  /** 0..1: how far the camera has leant in towards the door (during a trip). */
  private camPush = 0;
  private veil: HTMLElement;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;';
    host.appendChild(this.canvas);
    // Soft fade between the room and the camp spot.
    this.veil = document.createElement('div');
    this.veil.style.cssText = `position:absolute;inset:0;background:${COLORS.cream};opacity:0;pointer-events:none;`;
    host.appendChild(this.veil);

    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x7a6048, 1.3);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xfff0d6, 2.4);
    key.position.set(3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0005;
    const sc = key.shadow.camera as InstanceType<typeof THREE.OrthographicCamera>;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 0.5; sc.far = 30;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe4ff, 0.8);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);
    this.scene.add(this.turntable);
    this.room.root.visible = false;
    this.roomLights.visible = false;
    this.scene.add(this.room.root, this.roomLights);

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.trip) return;
      this.dragX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragX === null || this.trip) return;
      const dx = e.clientX - this.dragX;
      this.dragX = e.clientX;
      const k = 6 / Math.max(200, this.canvas.clientWidth);
      this.yaw += dx * k;
      this.spin = dx * k * 60;
      this.sinceDrag = 0;
    });
    const up = () => { this.dragX = null; this.canvas.style.cursor = 'grab'; };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);

    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(host);
    this.fit();
    this.raf = requestAnimationFrame(this.frame);
    // Dev: ?debug exposes the stage (poke at trips / framing from the console).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { chonkPreview?: PreviewStage }).chonkPreview = this;
  }

  /** Dev snapshot for the console (?debug). */
  debugState(): Record<string, unknown> {
    const p = this.character?.root.position;
    return { mode: this.mode, trip: this.trip ? `${this.trip.kind}:${this.trip.phase}` : null,
      pos: p ? [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] : null,
      door: +this.room.door.rotation.y.toFixed(2), camPush: +this.camPush.toFixed(2), veil: this.veil.style.opacity };
  }

  get busy(): boolean { return !!this.trip; }

  /** Past the cut: the chonk is already in the destination scene, just finishing its walk. */
  private get arrived(): boolean {
    const tr = this.trip;
    return !!tr && tr.phase >= (tr.kind === 'out' ? 3 : 1);
  }

  private arrive(): void {
    const r = this.trip?.resolve;
    if (this.trip) this.trip.resolve = null;
    r?.();
  }

  /** The player's chonk wearing `loadout`, in the dressing room (reuses the loaded model when
   * the chonk hasn't changed). */
  async showAvatar(chonkId: string, loadout: AvatarLoadout): Promise<void> {
    // Mid walk-in (already indoors) just re-dress; before the cut, leave the trip alone.
    if (this.trip && !(this.trip.kind === 'in' && this.arrived)) return;
    const fresh = await this.ensureCharacter(chonkId, loadout);
    if (fresh === null) return;
    if (this.trip && !fresh) return; // re-dressed; keep walking
    if (fresh) this.endTrip(); // a different chonk: start it fresh on the rug
    if (this.mode !== 'room' || !this.avatarHolder || this.content !== this.avatarHolder || fresh) this.enterRoom(fresh);
  }

  /** Show off the toy: the character holds it up and shakes it (after its outfit is on). */
  playToy(): void {
    if (this.character && !this.trip) useToy(this.character.root);
  }

  /** The player's camp spot, with their chonk (if `chonk` is given) standing out front.
   * Rebuilt each call (cheap: a few dozen primitives). */
  async showTent(loadout: TentLoadout, chonk?: { id: string; avatar: AvatarLoadout }): Promise<void> {
    if (this.trip && !(this.trip.kind === 'out' && this.arrived)) return;
    if (this.trip && this.character) {
      // Still strolling up to the tent: rebuild it around the chonk, which carries on walking.
      const c = this.character.root, at = c.position.clone(), yaw = c.rotation.y;
      this.enterTent(loadout);
      this.tentRoot!.add(c);
      c.position.copy(at);
      c.rotation.y = yaw;
      return;
    }
    let fresh = false;
    if (chonk) {
      const f = await this.ensureCharacter(chonk.id, chonk.avatar);
      if (f === null) return;
      fresh = f;
    }
    this.enterTent(loadout);
    const c = this.character;
    if (c && this.tentRoot) {
      const [sx, sz] = this.tentSpot();
      this.tentRoot.add(c.root);
      c.root.position.set(sx, this.footY, sz);
      c.root.rotation.y = 0;
      if (fresh) { this.settle = 0.35; c.root.visible = false; } // ground it once the idle pose is in
    }
  }

  /** Room → tent: walk out of the door, fade, stroll up to the tent. Resolves when it's standing there. */
  walkOut(tent: TentLoadout): Promise<void> {
    if (this.trip) {
      // Changed your mind on the way in: turn round and head back out.
      if (this.trip.kind !== 'in' || !this.arrived) return Promise.resolve();
      this.arrive();
      return new Promise((resolve) => { this.trip = { kind: 'out', phase: 0, t: 0, tent, resolve }; });
    }
    if (this.mode !== 'room' || !this.character || this.settle > 0 || this.content !== this.avatarHolder) {
      return this.showTent(tent); // nothing to walk yet — just cut
    }
    return new Promise((resolve) => { this.trip = { kind: 'out', phase: 0, t: 0, tent, resolve }; });
  }

  /** Tent → room: fade, come in through the door, walk to the rug and turn to face you. */
  walkIn(chonkId: string, avatar: AvatarLoadout): Promise<void> {
    if (this.trip) {
      if (this.trip.kind !== 'out' || !this.arrived) return Promise.resolve();
      this.arrive();
      return new Promise((resolve) => { this.trip = { kind: 'in', phase: 0, t: 0, resolve }; });
    }
    if (this.mode !== 'tent' || !this.character || this.settle > 0) return this.showAvatar(chonkId, avatar);
    return new Promise((resolve) => { this.trip = { kind: 'in', phase: 0, t: 0, resolve }; });
  }

  /** Centre the subject in the band `top`..`top + height` (CSS px) of the canvas — the gap
   * between UI laid over it. */
  setFocus(top: number, height: number): void {
    this.focus = { top, height };
    this.fit();
  }

  dispose(): void {
    this.disposed = true;
    this.trip?.resolve?.();
    this.trip = null;
    this.mirrorRT?.dispose();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.setContent(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.veil.remove();
  }

  // ── Scenes ──────────────────────────────────────────────────────────────

  /** Load (or re-dress) the chonk. Returns true when a new model was made, false when the
   * current one was reused, null when a newer request superseded this one. */
  private async ensureCharacter(chonkId: string, loadout: AvatarLoadout): Promise<boolean | null> {
    const t = ++this.token;
    const speciesId = speciesForChonk(chonkId);
    let fresh = false;
    if (!this.character || this.characterSpecies !== speciesId) {
      const sp = SPECIES[speciesId];
      const gltf = await loadSpeciesGltf(sp);
      if (t !== this.token || this.disposed) return null;
      this.character?.root.removeFromParent();
      const c = createCharacter(gltf, { lod: false });
      c.root.scale.setScalar(sp.scale);
      this.character = c;
      this.characterSpecies = speciesId;
      this.charH = c.height * sp.scale;
      this.footY = 0;
      this.avatarHolder = null;
      fresh = true;
    }
    dressCharacter(this.character.root, loadout);
    return fresh;
  }

  /** Dressing room: the chonk on its rug in the middle. `fresh` = a new model to ground first. */
  private enterRoom(fresh: boolean): void {
    const c = this.character;
    if (!c) return;
    const h = this.charH;
    if (!this.avatarHolder) {
      const holder = new THREE.Group();
      // Round braided rug (spins with the chonk): red rim, cream middle.
      const rug = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, RUG_TOP, 40),
        new THREE.MeshStandardMaterial({ color: 0xc8453b, roughness: 1 }));
      rim.position.y = RUG_TOP / 2;
      const mid = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), new THREE.MeshStandardMaterial({ color: 0xf3e2c4, roughness: 1 }));
      mid.rotation.x = -Math.PI / 2;
      mid.position.y = RUG_TOP + 0.002;
      rim.receiveShadow = mid.receiveShadow = true;
      rug.add(rim, mid);
      rug.scale.set(h * 0.55, 1, h * 0.55);
      holder.add(rug);
      this.avatarHolder = holder;
    }
    this.mode = 'room';
    this.avatarHolder.add(c.root);
    c.root.position.set(0, this.footY + RUG_TOP, 0);
    c.root.rotation.y = 0;
    this.setContent(this.avatarHolder);
    this.useRoom(h);
    this.target.set(0, h * ROOM_VIEW.targetY, this.turntable.position.z);
    this.dist = h * ROOM_VIEW.dist;
    this.pitch = ROOM_VIEW.pitch;
    if (fresh) {
      this.settle = 0.35;
      c.root.visible = false; // until it's grounded, so it doesn't pop down onto the rug
    }
  }

  /** Camp spot: the tent on its clearing (the chonk is placed by the caller). */
  private enterTent(loadout: TentLoadout): void {
    this.character?.root.removeFromParent();
    const tent = buildTent(loadout);
    this.mode = 'tent';
    this.tentRoot = tent.root;
    this.tentExtent = tent.extent;
    this.setContent(tent.root);
    this.useRoom(0);
    this.target.set(0, 0.5, 0);
    this.dist = (3 + tent.extent * 3.1) * 1.28; // the full-height view band would otherwise crop it
    this.pitch = 0.5;
  }

  /** Where the chonk stands at the tent: out front, just right of the path to the door (x, z). */
  private tentSpot(): [number, number] { return [this.tentExtent * 0.32, this.tentExtent * 0.95]; }

  /** Dressing room on (scaled to a chonk `h` tall) or off (`h` = 0, e.g. the tent view). */
  private useRoom(h: number): void {
    const on = h > 0;
    this.room.root.visible = this.roomLights.visible = on;
    if (on) { this.room.root.scale.setScalar(h); this.roomLights.scale.setScalar(h); }
    // In the room the chonk steps forward off the back wall (the camera keeps its distance to it).
    this.turntable.position.z = on ? h * ROOM_VIEW.forward : 0;
    this.hemi.intensity = on ? 0.95 : 1.3; // the lamp + window carry more of the light indoors
    this.camera.fov = on ? ROOM_VIEW.fov : 32;
    this.fit();
  }

  private setContent(o: Object3D | null): void {
    if (this.content && this.content !== o) this.turntable.remove(this.content);
    this.content = o;
    if (o) this.turntable.add(o);
  }

  /** Stand the posed character on the ground (the rug, indoors) and frame it. */
  private ground(root: Object3D): void {
    root.visible = true;
    root.position.y = 0;
    this.turntable.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    if (box.isEmpty()) return;
    // setFromObject is in world space: measure relative to the root's own world height.
    const base = root.getWorldPosition(new THREE.Vector3()).y;
    this.footY = base - box.min.y;
    root.position.y = this.footY + (this.mode === 'room' ? RUG_TOP : 0);
    if (this.mode !== 'room') return;
    const h = box.max.y - box.min.y;
    this.target.set(0, h * ROOM_VIEW.targetY, this.turntable.position.z);
    this.dist = h * ROOM_VIEW.dist;
  }

  // ── The trip between the room and the tent ──────────────────────────────

  /** Room point (chonk units, room-local) → turntable-local (world units), at feet height. */
  private roomPoint(x: number, z: number): Vec3 {
    const h = this.charH;
    return new THREE.Vector3(x * h, this.footY + RUG_TOP, z * h - this.turntable.position.z);
  }

  /** Walk the chonk towards `to` (turntable-local). True once it's there. */
  private walkTo(to: Vec3, dt: number): boolean {
    const r = this.character!.root;
    const dx = to.x - r.position.x, dz = to.z - r.position.z;
    const d = Math.hypot(dx, dz);
    const step = TRIP.walk * this.charH * dt;
    if (d > 1e-4) r.rotation.y += wrap(Math.atan2(dx, dz) - r.rotation.y) * Math.min(1, dt * 10);
    if (d <= step) { r.position.x = to.x; r.position.z = to.z; return true; }
    r.position.x += (dx / d) * step;
    r.position.z += (dz / d) * step;
    return false;
  }

  /** Turn the chonk to `heading`; true once it's facing it. */
  private turnTo(heading: number, dt: number): boolean {
    const r = this.character!.root;
    const e = wrap(heading - r.rotation.y);
    r.rotation.y += e * Math.min(1, dt * 9);
    return Math.abs(e) < 0.03;
  }

  private setDoor(open: number, dt?: number): void {
    const d = this.room.door;
    const want = open * DOOR.open;
    d.rotation.y = dt === undefined ? want : d.rotation.y + (want - d.rotation.y) * Math.min(1, dt * TRIP.doorSpeed);
  }

  /** One frame of the trip. Returns whether the chonk is walking (for its animation). */
  private runTrip(dt: number): boolean {
    const tr = this.trip!;
    tr.t += dt;
    const next = () => { tr.phase++; tr.t = 0; };
    const doorFront = this.roomPoint(DOOR.x, DOOR.z + 0.55);
    const doorway = this.roomPoint(DOOR.x, DOOR.z + 0.02);
    const rug = new THREE.Vector3(0, this.footY + RUG_TOP, 0); // the rug is the turntable's centre
    const fade = (from: number, to: number) => {
      const k = Math.min(1, tr.t / TRIP.fade);
      this.veil.style.opacity = String(from + (to - from) * k);
      return k >= 1;
    };
    // Settle the turntable square to the room so room-local paths line up.
    this.yaw += wrap(-this.yaw) * Math.min(1, dt * 9);
    this.spin = 0;

    if (tr.kind === 'out') {
      switch (tr.phase) {
        case 0: // face the door
          const p = this.character!.root.position;
          this.turnTo(Math.atan2(doorFront.x - p.x, doorFront.z - p.z), dt);
          if (tr.t > TRIP.turn) { this.yaw = 0; next(); }
          return false;
        case 1: { // walk to the door; it swings open as we get close
          this.camPush = Math.min(1, this.camPush + dt * 1.1);
          const there = this.walkTo(doorFront, dt);
          const r = this.character!.root.position;
          if (Math.hypot(r.x - doorFront.x, r.z - doorFront.z) < this.charH * 1.1) this.setDoor(1, dt);
          if (there) next();
          return true;
        }
        case 2: // step through, fading out
          this.setDoor(1, dt);
          this.walkTo(doorway, dt);
          if (fade(0, 1)) { this.swapToTent(tr.tent!); next(); this.arrive(); }
          return true;
        case 3: { // outside: fade in while strolling up to the tent
          fade(1, 0);
          const [sx, sz] = this.tentSpot();
          if (this.walkTo(new THREE.Vector3(sx, this.footY, sz), dt) && tr.t > TRIP.fade) next();
          return true;
        }
        default: // turn to say hi, then back to the turntable
          if (this.turnTo(0, dt) || tr.t > 0.8) this.endTrip();
          return false;
      }
    }
    switch (tr.phase) {
      case 0: // fade out at the tent
        if (fade(0, 1)) { this.swapToRoom(); next(); this.arrive(); }
        return false;
      case 1: // in through the door, fading in
        fade(1, 0);
        if (this.walkTo(doorFront, dt) && tr.t > TRIP.fade) next();
        return true;
      case 2: { // back to the rug; the door swings shut behind (gently — it's right behind the chonk)
        this.setDoor(0, dt * 0.5);
        this.camPush = Math.max(0, this.camPush - dt * 1.1);
        if (this.walkTo(rug, dt)) next();
        return true;
      }
      default:
        this.setDoor(0, dt);
        this.camPush = Math.max(0, this.camPush - dt * 1.5);
        if ((this.turnTo(0, dt) && this.camPush === 0) || tr.t > 1.2) this.endTrip();
        return false;
    }
  }

  private swapToTent(tent: TentLoadout): void {
    const c = this.character!;
    this.setDoor(0);
    this.camPush = 0;
    this.enterTent(tent);
    this.yaw = 0;
    this.tentRoot!.add(c.root);
    // Walk in from off to the right (the way back to the cabin), towards the tent.
    const [sx, sz] = this.tentSpot();
    c.root.position.set(sx + this.tentExtent * 1.6, this.footY, sz + this.tentExtent * 0.4);
    c.root.rotation.y = Math.atan2(sx - c.root.position.x, sz - c.root.position.z);
  }

  private swapToRoom(): void {
    const c = this.character!;
    this.enterRoom(false);
    this.yaw = 0;
    this.setDoor(1);
    this.camPush = 1;
    // enterRoom stood it on the rug — start it in the doorway instead (points are computed after
    // enterRoom moved the turntable forward), facing into the room.
    c.root.position.copy(this.roomPoint(DOOR.x, DOOR.z + 0.02));
    c.root.rotation.y = 0;
  }

  private endTrip(): void {
    const tr = this.trip;
    this.trip = null;
    this.veil.style.opacity = '0';
    this.sinceDrag = 0; // a beat before the idle spin picks up again
    tr?.resolve?.();
  }

  // ── Frame ───────────────────────────────────────────────────────────────

  /** Live mirror: render the room from the glass looking out, flipped, onto the glass. */
  private renderMirror(): void {
    const glass = this.room.mirror;
    if (!this.room.root.visible) return;
    if (!this.mirrorRT) {
      this.mirrorRT = new THREE.WebGLRenderTarget<import('three').Texture>(MIRROR_RT.w, MIRROR_RT.h);
      const tex = this.mirrorRT.texture;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = -1; // mirror image
      const m = glass.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      m.map = tex;
      m.color.setHex(0xdcebf5); // faint blue tint on the glass
      m.needsUpdate = true;
    }
    const at = new THREE.Vector3(), normal = new THREE.Vector3(0, 0, 1);
    glass.getWorldPosition(at);
    normal.applyQuaternion(glass.getWorldQuaternion(new THREE.Quaternion()));
    this.mirrorCam.position.copy(at).addScaledVector(normal, 0.02);
    const look = this.character ? this.character.root.getWorldPosition(new THREE.Vector3()) : this.target.clone();
    look.y = this.target.y * 0.9;
    this.mirrorCam.lookAt(look);
    glass.visible = false;
    this.renderer.setRenderTarget(this.mirrorRT);
    this.renderer.render(this.scene, this.mirrorCam);
    this.renderer.setRenderTarget(null);
    glass.visible = true;
  }

  private fit(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Shift the image so the subject sits in the focus band, not the canvas centre.
    const f = this.focus;
    if (f) this.camera.setViewOffset(w, h, 0, h / 2 - (f.top + f.height / 2), w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    let walking = false;
    if (this.trip && this.character) {
      walking = this.runTrip(dt);
    } else if (this.dragX === null) {
      this.sinceDrag += dt;
      this.spin *= Math.exp(-dt * 3); // coast
      const idle = this.sinceDrag > IDLE_AFTER ? IDLE_SPIN : 0;
      this.yaw += (this.spin + idle) * dt;
    }
    this.turntable.rotation.y = this.yaw;
    this.character?.update(dt, walking ? 'walking' : 'idle');
    if (this.settle > 0 && this.character && (this.settle -= dt) <= 0) this.ground(this.character.root);
    // Pull back when the focus band is only part of the canvas, so the subject fills the band.
    const band = this.focus ? Math.min(1, this.focus.height / Math.max(1, this.host.clientHeight)) : 1;
    let d = this.dist / Math.max(0.35, band);
    const tgt = this.target.clone();
    if (this.camPush > 0 && this.mode === 'room') {
      // Lean in towards the door to follow the chonk out.
      const k = this.camPush * this.camPush * (3 - 2 * this.camPush) * TRIP.camPush;
      const door = new THREE.Vector3(DOOR.x * this.charH, this.charH * 0.8, DOOR.z * this.charH);
      tgt.lerp(door, k);
      d *= 1 - 0.35 * k;
    }
    const c = Math.cos(this.pitch);
    this.camera.position.set(tgt.x, tgt.y + Math.sin(this.pitch) * d, tgt.z + c * d);
    this.camera.lookAt(tgt);
    if ((this.mirrorTick = (this.mirrorTick + 1) % 2) === 0) this.renderMirror(); // 30 fps is plenty for the mirror
    this.renderer.render(this.scene, this.camera);
  };
}
