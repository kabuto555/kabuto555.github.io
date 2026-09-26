// The Care Package opening — a small self-contained three.js stage (own renderer
// + canvas, hand-rolled effects on the global THREE, no addons) that plays the
// open → burst → reveal sequence. Everything scales with an INTENSITY 0…4 taken
// from the reward's rarity (rewards.ts RARITY_INFO.intensity), toned down one step
// for a duplicate and topped with an extra sparkle burst when the item is new:
//
//   0 common     one rattle, a polite pop, a little confetti
//   1 uncommon   two rattles, seam glow, light beam + slow god rays
//   2 rare       three rattles whose glow "upgrades" colour each shake, push-in,
//                shockwave ring, flash, sparkles
//   3 epic       four rattles, the box levitates + spins, the room darkens,
//                double shockwave, big flash, the reward spins once
//   4 legendary  five rattles + a held breath, full blackout, triple shockwave,
//                white-out flash, counter-rotating rays, confetti storm, two spins
//
// Tuning numbers are all in STAGE_TUNING (lock values there after playtesting).

import { buildCarePackage, clay, type CarePackageModel } from './box-model';
import { sfxBurst, sfxRattle, sfxReveal } from './sfx';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Sprite = InstanceType<typeof THREE.Sprite>;
type Color = InstanceType<typeof THREE.Color>;
type Texture = InstanceType<typeof THREE.Texture>;

/** Per-intensity tables are indexed 0…4. */
export const STAGE_TUNING = {
  shakes:        [1, 2, 3, 4, 5],
  shakeDur:      0.3,
  shakeGap:      [0.35, 0.3, 0.26, 0.22, 0.2],
  /** Silent held beat before a legendary bursts. */
  holdBeforeBurst: [0, 0, 0, 0.18, 0.6],
  wobble:        [0.06, 0.08, 0.1, 0.13, 0.16],
  levitate:      [0, 0, 0, 0.35, 0.55],
  darken:        [0, 0, 0.15, 0.6, 0.9],
  pushIn:        [0, 0, 0.1, 0.16, 0.22],
  lidSpeed:      [3.2, 4, 4.8, 5.8, 7],
  flash:         [0, 0.22, 0.45, 0.75, 1],
  confetti:      [20, 45, 80, 140, 220],
  rings:         [0, 0, 1, 2, 3],
  camShake:      [0.02, 0.035, 0.07, 0.11, 0.17],
  beam:          [0, 0.35, 0.5, 0.65, 0.8],
  rays:          [0, 0.35, 0.55, 0.72, 0.9],
  orbitSparkles: [0, 0, 8, 14, 24],
  newSparkles:   [8, 12, 16, 22, 30],
  rewardSpins:   [0, 0, 0, 1, 2],
  /** Seconds from burst to the reward settling (the reveal card shows then). */
  settle:        [1.0, 1.1, 1.2, 1.35, 1.6],
  /** Horizontal world width kept in frame (portrait phones). */
  fitWidth: 3.4,
};

const CONFETTI_COLORS = [0xff7ab6, 0x7fd3ff, 0xffd23f, 0x9b7bff, 0x6fe0a4, 0xff9f5a, 0xffffff];
const MAX_CONFETTI = 260;
const MAX_SPARKS = 56;
const BG_INNER = 0xffedcf;
const BG_OUTER = 0xe5ad7c;
const BG_DARK = 0x160d26;

export interface PlayOptions {
  /** 0…4 (after the duplicate/new adjustment). */
  intensity: number;
  /** The reward's own rarity index 0…4 (drives the colour "upgrade" tease). */
  rarityIndex: number;
  /** Rarity colours by index, for the tease. */
  tierColors: readonly string[];
  isNew: boolean;
  duplicate: boolean;
  art: HTMLCanvasElement;
}

type Phase = 'idle' | 'drop' | 'build' | 'burst';

interface Spark { s: Sprite; mode: 'off' | 'orbit' | 'burst'; a: number; r: number; y: number; w: number; v: Vector3; life: number; max: number; }

export class CarePackageStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: InstanceType<typeof THREE.WebGLRenderer>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private box: CarePackageModel;
  private boxHolder = new THREE.Group();
  private light: InstanceType<typeof THREE.PointLight>;
  private bgMat: InstanceType<typeof THREE.ShaderMaterial>;
  private beam: Mesh;
  private beamMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  private rays: Mesh[] = [];
  private rayMats: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
  private rings: { m: Mesh; mat: InstanceType<typeof THREE.MeshBasicMaterial>; t: number }[] = [];
  private reward: Mesh;
  private rewardMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  private halo: Sprite;
  private confetti: InstanceType<typeof THREE.InstancedMesh>;
  private conf: { p: Vector3; v: Vector3; ax: Vector3; ang: number; spin: number; life: number }[] = [];
  private sparks: Spark[] = [];
  private flash: HTMLElement;
  private raf = 0;
  private last = 0;
  private t = 0;          // time in the current phase
  private clock = 0;      // total time
  private phase: Phase = 'idle';
  private o: PlayOptions | null = null;
  private e = 0;          // effective intensity
  private buildLen = 0;
  private shakeIdx = -1;
  private lidVel = new THREE.Vector3();
  private lidSpin = new THREE.Vector3();
  private settleResolve: (() => void) | null = null;
  private dropResolve: (() => void) | null = null;
  private revealSfx = false;
  private camBase = new THREE.Vector3();
  private look = new THREE.Vector3(0, 1.2, 0);
  private lookTarget = new THREE.Vector3(0, 1.2, 0);
  private dark = 0;
  private tint = new THREE.Color();
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private disposed = false;
  private fitW = -1;
  private fitH = -1;
  private readonly resize = () => this.fit();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = ((THREE as unknown as { NeutralToneMapping?: number }).NeutralToneMapping ??
      THREE.ACESFilmicToneMapping) as typeof THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    host.appendChild(this.canvas);
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;';
    host.appendChild(this.flash);

    // Backdrop: a big radial-gradient card that can fade to night.
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { uInner: { value: new THREE.Color(BG_INNER) }, uOuter: { value: new THREE.Color(BG_OUTER) }, uDark: { value: 0 },
        uNight: { value: new THREE.Color(BG_DARK) }, uTint: { value: new THREE.Color(0xffffff) }, uTintAmt: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uInner, uOuter, uNight, uTint; uniform float uDark, uTintAmt; varying vec2 vUv;
        void main(){ float d = length((vUv - vec2(0.5, 0.52)) * vec2(1.0, 1.25)) * 2.0;
          vec3 day = mix(uInner, uOuter, smoothstep(0.0, 1.0, d));
          vec3 night = mix(uTint * 0.5 + uNight * 0.5, uNight, smoothstep(0.0, 0.8, d));
          vec3 c = mix(day, night, uDark);
          c = mix(c, uTint, uTintAmt * (1.0 - smoothstep(0.0, 0.9, d)));
          gl_FragColor = vec4(c, 1.0); }`,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.bgMat);
    bg.position.set(0, 3, -12);
    bg.renderOrder = -10;
    this.scene.add(bg);

    // Lights.
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x9a6a48, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.2);
    key.position.set(2.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 4;
    const sc = key.shadow.camera as InstanceType<typeof THREE.OrthographicCamera>;
    sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 15;
    this.scene.add(key);
    this.light = new THREE.PointLight(0xffffff, 0, 7, 1.6);
    this.light.position.set(0, 1.3, 0.3);
    this.scene.add(this.light);

    // Canteen table the package sits on.
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.3, 48), clay(0xb07a4c));
    table.position.y = -0.15;
    table.receiveShadow = true;
    this.scene.add(table);
    const cloth = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshStandardMaterial({
      map: gingham(), roughness: 0.95 }));
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = 0.004;
    cloth.receiveShadow = true;
    this.scene.add(cloth);

    // The package.
    this.box = buildCarePackage();
    this.boxHolder.add(this.box.root);
    this.scene.add(this.boxHolder);

    // Beam of light out of the box.
    this.beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 7, 32, 1, true).translate(0, 3.5, 0), this.beamMat);
    this.beam.position.y = 1;
    this.beam.scale.y = 0.001;
    this.scene.add(this.beam);

    // God rays behind the reward (two layers, the second counter-rotates at high intensity).
    const rt = raysTexture();
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), mat);
      m.position.set(0, 2.1, -0.8 - i * 0.05);
      this.scene.add(m);
      this.rays.push(m);
      this.rayMats.push(mat);
    }

    // Shockwave rings.
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      m.visible = false;
      this.scene.add(m);
      this.rings.push({ m, mat, t: -1 });
    }

    // The reward card + halo.
    this.rewardMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
    this.reward = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), this.rewardMat);
    this.reward.visible = false;
    this.scene.add(this.reward);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.setScalar(3.4);
    this.scene.add(this.halo);

    // Confetti (one instanced draw).
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.13),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX_CONFETTI);
    this.confetti.frustumCulled = false;
    const col = new THREE.Color();
    for (let i = 0; i < MAX_CONFETTI; i++) {
      this.conf.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), ang: 0, spin: 0, life: 0 });
      this.confetti.setColorAt(i, col.setHex(0xffffff));
      this.confetti.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
    }
    this.scene.add(this.confetti);

    // Sparkles.
    const st = sparkTexture();
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      this.scene.add(s);
      this.sparks.push({ s, mode: 'off', a: 0, r: 0, y: 0, w: 0, v: new THREE.Vector3(), life: 0, max: 1 });
    }

    this.fit();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get busy(): boolean { return this.phase === 'build' || this.phase === 'burst' || this.phase === 'drop'; }

  /** Play the whole sequence; resolves when the reward has settled (show the card then). */
  play(o: PlayOptions): Promise<void> {
    this.o = o;
    this.e = Math.max(0, Math.min(4, Math.round(o.intensity)));
    const T = STAGE_TUNING;
    this.buildLen = T.shakes[this.e] * (T.shakeDur + T.shakeGap[this.e]) + T.holdBeforeBurst[this.e];
    this.phase = 'build';
    this.t = 0;
    this.shakeIdx = -1;
    this.revealSfx = false;
    // Reward art.
    const tex = new THREE.CanvasTexture(o.art);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.rewardMat.map?.dispose();
    this.rewardMat.map = tex;
    this.rewardMat.needsUpdate = true;
    const rc = this.rarityColor();
    this.halo.material.color.copy(rc);
    this.beamMat.color.copy(rc);
    this.rayMats.forEach((m) => m.color.copy(o.duplicate ? rc.clone().lerp(new THREE.Color(0xcccccc), 0.55) : rc));
    this.rings.forEach((r) => r.mat.color.copy(rc));
    return new Promise((res) => { this.settleResolve = res; });
  }

  /** Tap during the build-up: jump straight to the burst. */
  skip(): void {
    if (this.phase === 'build') { this.t = this.buildLen; }
  }

  /** Clear the reveal and drop a fresh, closed package onto the table. */
  reset(): Promise<void> {
    this.phase = 'drop';
    this.t = 0;
    this.o = null;
    this.reward.visible = false;
    this.halo.material.opacity = 0;
    this.beamMat.opacity = 0;
    this.beam.scale.y = 0.001;
    this.rayMats.forEach((m) => { m.opacity = 0; });
    this.light.intensity = 0;
    this.box.glowMat.opacity = 0;
    this.box.seamMat.opacity = 0;
    this.box.lid.position.set(0, this.box.bodyHeight, 0);
    this.box.lid.rotation.set(0, 0, 0);
    this.box.lid.scale.setScalar(1);
    this.box.lid.visible = true;
    this.sparks.forEach((s) => { s.mode = 'off'; s.s.visible = false; });
    this.bgMat.uniforms.uTintAmt.value = 0;
    return new Promise((res) => { this.dropResolve = res; });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        const mm = mat as InstanceType<typeof THREE.MeshBasicMaterial>;
        mm.map?.dispose();
        mm.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.flash.remove();
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // The host may be laid out (or resized by the preview shell) after construction.
    if (this.host.clientWidth !== this.fitW || this.host.clientHeight !== this.fitH) this.fit();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    this.t += dt;
    const T = STAGE_TUNING;
    const e = this.e;
    const b = this.box;
    const hold = this.boxHolder;
    let shake = 0;

    if (this.phase === 'idle' || this.phase === 'drop') {
      let y = 0;
      if (this.phase === 'drop') {
        // Fall in from above with a squashy bounce.
        const k = Math.min(1, this.t / 0.55);
        y = k < 1 ? 3.2 * (1 - k) * (1 - k) : 0;
        const land = this.t - 0.55;
        const sq = land > 0 ? Math.exp(-land * 8) * Math.sin(land * 26) * 0.14 : 0;
        hold.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
        if (this.t > 1.0) { this.phase = 'idle'; this.dropResolve?.(); this.dropResolve = null; }
      } else {
        const br = Math.sin(this.clock * 2.4) * 0.018;
        hold.scale.set(1 - br * 0.5, 1 + br, 1 - br * 0.5);
      }
      hold.position.set(0, y, 0);
      hold.rotation.set(0, Math.sin(this.clock * 0.7) * 0.28, 0);
      this.dark += (0 - this.dark) * (1 - Math.exp(-4 * dt));
      this.lookTarget.set(0, 1.1, 0);
    } else if (this.phase === 'build' && this.o) {
      const cycle = T.shakeDur + T.shakeGap[e];
      const i = Math.min(T.shakes[e] - 1, Math.floor(this.t / cycle));
      const inShake = this.t - i * cycle;
      const prog = Math.min(1, this.t / this.buildLen);
      if (i !== this.shakeIdx && this.t < T.shakes[e] * cycle) {
        this.shakeIdx = i;
        sfxRattle((i + 1) / T.shakes[e] * (0.4 + e * 0.15));
        // Glow colour "upgrades" a tier per rattle at rare+ (the classic gacha tease).
        const tier = e >= 2 ? Math.max(0, this.o.rarityIndex - (T.shakes[e] - 1 - i)) : this.o.rarityIndex;
        this.tint.set(this.o.tierColors[tier]);
        b.seamMat.color.copy(this.tint);
        this.light.color.copy(this.tint);
      }
      const k = (i + 1) / T.shakes[e];
      const sIn = inShake < T.shakeDur ? Math.sin((inShake / T.shakeDur) * Math.PI) : 0;
      const wob = T.wobble[e] * (0.6 + 0.6 * k);
      hold.rotation.z = Math.sin(inShake * 42) * wob * sIn;
      hold.rotation.x = Math.cos(inShake * 37) * wob * 0.5 * sIn;
      hold.scale.set(1 + sIn * 0.06, 1 - sIn * 0.08, 1 + sIn * 0.06);
      b.lid.position.y = b.bodyHeight + sIn * (0.05 + 0.04 * k * (1 + e * 0.3)) * Math.abs(Math.sin(inShake * 30));
      // Levitate + spin for epic/legendary.
      const lev = T.levitate[e] * smooth(prog);
      hold.position.y = lev + (lev > 0 ? Math.sin(this.clock * 9) * 0.01 : 0);
      if (e >= 3) hold.rotation.y += dt * (0.5 + prog * (e === 4 ? 7 : 3));
      else hold.rotation.y += (0 - hold.rotation.y) * (1 - Math.exp(-6 * dt));
      // Leaking light.
      const leak = e === 0 ? 0.25 : 0.35 + 0.55 * k;
      b.seamMat.opacity = leak * (0.5 + 0.5 * sIn);
      this.light.intensity = (e === 0 ? 0.8 : 2 + e * 1.4) * k * (0.6 + 0.4 * sIn);
      this.dark += (T.darken[e] * smooth(prog) - this.dark) * (1 - Math.exp(-5 * dt));
      shake = e >= 3 ? 0.012 * k * e * sIn : 0;
      if (e >= 2) this.orbitSparks(Math.round(T.orbitSparkles[e] * prog), lev);
      this.lookTarget.set(0, 1.1 + lev * 0.5, 0);
      if (this.t >= this.buildLen) this.burst();
    } else if (this.phase === 'burst' && this.o) {
      const tb = this.t;
      // Lid flies.
      this.lidVel.y -= 9.5 * dt;
      b.lid.position.addScaledVector(this.lidVel, dt);
      b.lid.rotation.x += this.lidSpin.x * dt;
      b.lid.rotation.z += this.lidSpin.z * dt;
      if (tb > 0.7) b.lid.scale.multiplyScalar(Math.exp(-6 * dt));
      if (b.lid.scale.x < 0.02) b.lid.visible = false;
      // Box settles back down.
      hold.position.y += (0 - hold.position.y) * (1 - Math.exp(-5 * dt));
      hold.rotation.set(0, hold.rotation.y + (Math.round(hold.rotation.y / (Math.PI * 2)) * Math.PI * 2 - hold.rotation.y) *
        (1 - Math.exp(-4 * dt)), 0);
      const recoil = Math.exp(-tb * 7) * Math.sin(tb * 30) * 0.12;
      hold.scale.set(1 - recoil * 0.5, 1 + recoil, 1 - recoil * 0.5);
      b.seamMat.opacity *= Math.exp(-8 * dt);
      b.glowMat.color.copy(this.rarityColor());
      b.glowMat.opacity = Math.min(1, tb * 8) * (0.55 + 0.45 * Math.exp(-tb * 2));
      this.light.color.copy(this.rarityColor());
      this.light.intensity = (1.5 + e * 1.5) * (0.5 + Math.exp(-tb * 2.5) * 1.5);
      // Beam + rays.
      this.beam.scale.y = Math.min(1, tb / 0.28);
      this.beamMat.opacity = T.beam[e] * (0.55 + 0.45 * Math.exp(-tb * 2)) * (this.o.duplicate ? 0.6 : 1);
      const rayK = smooth(Math.min(1, tb / 0.5)) * T.rays[e];
      this.rays[0].rotation.z += dt * (0.25 + e * 0.08);
      this.rays[1].rotation.z -= dt * (0.18 + e * 0.05);
      this.rayMats[0].opacity = rayK;
      this.rayMats[1].opacity = e >= 4 ? rayK * 0.7 : 0;
      // Flash + camera shake.
      this.flash.style.opacity = String(T.flash[e] * Math.exp(-tb * 5.5));
      shake = T.camShake[e] * Math.exp(-tb * 4.5);
      // Rings.
      for (const r of this.rings) {
        if (r.t < 0) continue;
        const lt = tb - r.t;
        if (lt < 0) continue;
        r.m.visible = true;
        const s = 1 + lt * (5 + e);
        r.m.scale.set(s, s, s);
        r.mat.opacity = Math.max(0, 0.9 * (1 - lt / 0.8));
        if (lt > 0.8) { r.m.visible = false; r.t = -1; }
      }
      // The reward rises out of the box.
      const rt = tb - 0.12;
      if (rt > 0) {
        this.reward.visible = true;
        const k = Math.min(1, rt / 0.8);
        const topY = this.o.duplicate ? 2.0 : 2.2;
        const y = 0.9 + (topY - 0.9) * easeOutBack(k);
        const bob = k >= 1 ? Math.sin(this.clock * 2.2) * 0.05 : 0;
        this.reward.position.set(0, y + bob, 0.15);
        const sc = 0.2 + 0.8 * easeOutBack(k);
        this.reward.scale.setScalar(sc);
        const spins = T.rewardSpins[e] * (this.o.duplicate ? 0 : 1);
        this.reward.rotation.y = spins > 0 ? (1 - smooth(k)) * spins * Math.PI * 2 : Math.sin(this.clock * 1.6) * 0.12 * k;
        this.halo.position.set(0, y + bob, 0);
        this.halo.material.opacity = (0.35 + e * 0.13) * k * (this.o.duplicate ? 0.55 : 1);
        this.rays.forEach((m) => m.position.setY(y + bob));
        this.lookTarget.set(0, 1.35 + (y - 0.9) * 0.35, 0);
        if (!this.revealSfx && rt > 0.35) {
          this.revealSfx = true;
          sfxReveal(e, this.o.isNew);
          if (this.o.isNew) this.burstSparks(T.newSparkles[e], this.reward.position);
          this.bgMat.uniforms.uTint.value.copy(this.rarityColor());
        }
        this.bgMat.uniforms.uTintAmt.value = Math.min(0.45, rt * 0.6) * (e / 4) * (this.o.duplicate ? 0.5 : 1);
      }
      this.dark += (T.darken[e] * 0.7 - this.dark) * (1 - Math.exp(-2 * dt));
      if (e >= 2) this.orbitSparks(T.orbitSparkles[e], hold.position.y);
      if (tb >= T.settle[e] && this.settleResolve) { this.settleResolve(); this.settleResolve = null; }
    }

    this.bgMat.uniforms.uDark.value = this.dark;
    this.updateConfetti(dt);
    this.updateSparks(dt);

    // Camera: base framing, push-in during the build, shake.
    const push = this.phase === 'build' ? T.pushIn[e] * smooth(Math.min(1, this.t / Math.max(0.01, this.buildLen)))
      : this.phase === 'burst' ? T.pushIn[e] * Math.exp(-this.t * 1.5) : 0;
    this.look.lerp(this.lookTarget, 1 - Math.exp(-4 * dt));
    this.camera.position.copy(this.camBase).lerp(this.look, push);
    if (shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0).multiplyScalar(shake));
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  };

  private burst(): void {
    const o = this.o!;
    const T = STAGE_TUNING;
    const e = this.e;
    this.phase = 'burst';
    this.t = 0;
    const sp = T.lidSpeed[e];
    this.lidVel.set((Math.random() - 0.5) * 1.6, sp, 0.6 + Math.random() * 0.8);
    this.lidSpin.set(-(2 + e * 1.4), 0, (Math.random() - 0.5) * (3 + e * 2));
    sfxBurst(e);
    const n = Math.round(T.confetti[e] * (o.duplicate ? 0.6 : 1));
    this.spawnConfetti(n, o.duplicate);
    for (let i = 0; i < this.rings.length; i++) this.rings[i].t = i < T.rings[e] ? i * 0.13 : -1;
    this.sparks.forEach((s) => { if (s.mode === 'orbit') { s.mode = 'burst'; s.v.set(Math.cos(s.a), 0.8, Math.sin(s.a)).multiplyScalar(3); s.life = 0; s.max = 0.6; } });
  }

  private rarityColor(): Color {
    return new THREE.Color(this.o ? this.o.tierColors[this.o.rarityIndex] : '#ffffff');
  }

  private spawnConfetti(n: number, muted: boolean): void {
    const col = new THREE.Color();
    const rc = this.rarityColor();
    let placed = 0;
    for (let i = 0; i < MAX_CONFETTI && placed < n; i++) {
      const c = this.conf[i];
      if (c.life > 0) continue;
      placed++;
      const a = Math.random() * Math.PI * 2;
      const up = 3.5 + Math.random() * (2.5 + this.e);
      const out = 0.6 + Math.random() * (1.2 + this.e * 0.35);
      c.p.set((Math.random() - 0.5) * 0.8, 1.1, (Math.random() - 0.5) * 0.6);
      c.v.set(Math.cos(a) * out, up, Math.sin(a) * out * 0.6 + 0.4);
      c.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      c.ang = Math.random() * 6;
      c.spin = 6 + Math.random() * 10;
      c.life = 2.6 + Math.random() * 1.2;
      if (Math.random() < 0.35) col.copy(rc);
      else col.setHex(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
      if (muted) col.lerp(new THREE.Color(0xd8cfc4), 0.5);
      this.confetti.setColorAt(i, col);
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  private updateConfetti(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      const c = this.conf[i];
      if (c.life <= 0) continue;
      any = true;
      c.life -= dt;
      c.v.y -= 6.5 * dt;
      c.v.multiplyScalar(Math.exp(-1.6 * dt));
      // Flutter: paper floats down with a side-to-side drift.
      if (c.v.y < 0) { c.v.y = Math.max(c.v.y, -1.4); c.p.x += Math.sin(this.clock * 5 + i) * dt * 0.4; }
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.02) { c.p.y = 0.02; c.v.set(0, 0, 0); c.spin = 0; }
      c.ang += c.spin * dt;
      const s = c.life < 0.5 ? c.life / 0.5 : 1;
      this.tmpQ.setFromAxisAngle(c.ax, c.ang);
      this.tmpM.compose(c.p, this.tmpQ, this.tmpS.set(s, s, s));
      this.confetti.setMatrixAt(i, this.tmpM);
      if (c.life <= 0) this.confetti.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true;
  }

  private orbitSparks(want: number, lift: number): void {
    let have = this.sparks.filter((s) => s.mode === 'orbit').length;
    for (const s of this.sparks) {
      if (have >= want) break;
      if (s.mode !== 'off') continue;
      s.mode = 'orbit';
      s.a = Math.random() * Math.PI * 2;
      s.r = 1.0 + Math.random() * 0.7;
      s.y = 0.3 + Math.random() * 1.4 + lift;
      s.w = (1.2 + Math.random() * 1.5) * (Math.random() < 0.5 ? -1 : 1);
      s.life = 0; s.max = Infinity;
      s.s.material.color.copy(this.tint.getHex() ? this.tint : new THREE.Color(0xffffff));
      s.s.visible = true;
      have++;
    }
  }

  private burstSparks(n: number, at: Vector3): void {
    const rc = this.rarityColor();
    let placed = 0;
    for (const s of this.sparks) {
      if (placed >= n) break;
      if (s.mode !== 'off') continue;
      placed++;
      const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 1.4;
      s.mode = 'burst';
      s.s.position.copy(at);
      s.v.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) * 0.5 + 0.3).multiplyScalar(2 + Math.random() * 2.5);
      s.life = 0; s.max = 0.7 + Math.random() * 0.6;
      s.s.material.color.copy(Math.random() < 0.5 ? rc : new THREE.Color(0xfff6c8));
      s.s.visible = true;
    }
  }

  private updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (s.mode === 'off') continue;
      s.life += dt;
      if (s.mode === 'orbit') {
        s.a += s.w * dt;
        s.s.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(this.clock * 3 + s.a) * 0.1, Math.sin(s.a) * s.r * 0.6 + 0.2);
        const tw = 0.55 + 0.45 * Math.sin(this.clock * 12 + s.a * 5);
        s.s.material.opacity = Math.min(1, s.life * 3) * tw;
        s.s.scale.setScalar(0.18 + 0.1 * tw);
      } else {
        s.v.y -= 2.5 * dt;
        s.v.multiplyScalar(Math.exp(-2.2 * dt));
        s.s.position.addScaledVector(s.v, dt);
        const k = s.life / s.max;
        s.s.material.opacity = Math.max(0, 1 - k);
        s.s.scale.setScalar(0.34 * (1 - k * 0.6));
        if (k >= 1) { s.mode = 'off'; s.s.visible = false; }
      }
    }
  }

  private fit(): void {
    this.fitW = this.host.clientWidth;
    this.fitH = this.host.clientHeight;
    const w = Math.max(1, this.fitW), h = Math.max(1, this.fitH);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep `fitWidth` across on narrow phones; on wide screens the height rules.
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const byW = (STAGE_TUNING.fitWidth / 2) / (half * this.camera.aspect);
    const byH = 2.4 / half;
    const dist = Math.max(byW, byH);
    this.camBase.set(0, 1.3 + dist * 0.16, dist);
    this.camera.updateProjectionMatrix();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const smooth = (x: number) => x * x * (3 - 2 * x);
function easeOutBack(x: number): number {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function raysTexture(): Texture {
  return canvasTex(512, 512, (ctx) => {
    ctx.translate(256, 256);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, w = (Math.PI / n) * (i % 2 ? 0.45 : 0.7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 256, a - w / 2, a + w / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-256, -256, 512, 512);
  });
}

function beamTexture(): Texture {
  return canvasTex(8, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
  });
}

function glowTexture(): Texture {
  return canvasTex(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

function sparkTexture(): Texture {
  return canvasTex(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 7 : 62;
      ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
}

function gingham(): Texture {
  const t = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#fff6ea';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(226,80,70,0.45)';
    for (let i = 0; i < 8; i++) { ctx.fillRect(i * 32, 0, 16, 256); ctx.fillRect(0, i * 32, 256, 16); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
