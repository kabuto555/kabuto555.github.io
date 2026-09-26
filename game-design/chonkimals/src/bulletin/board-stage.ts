// The Bulletin Board close-up — a small self-contained three.js stage (own renderer
// + canvas, global THREE, no addons), the same pattern as the Care Package opening.
// The board stands on a patch of camp grass under the sky; the camera dollies in on
// open. Tap a notice and it's pulled off the cork (its pin pops out and sticks back
// in), flies up to fill the screen and turns to face you; tap off it (or "Pin it
// back") and it flies home. The daily challenge gets a DONE! stamp slammed on when
// you claim it. All numbers in STAGE_TUNING.

import { buildBoardModel, BOARD_LAYOUT, type BoardModel } from './board-model';
import { drawStamp, PAPER_KINDS, PaperSet, type PaperData, type PaperKind } from './papers';
import { clay } from '../care-package/box-model';
import { bangTexture } from '../mailbox';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Quaternion = InstanceType<typeof THREE.Quaternion>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;
type Sprite = InstanceType<typeof THREE.Sprite>;

export const STAGE_TUNING = {
  fov: 40,
  /** World width kept in frame on portrait phones / height on wide screens. */
  fitWidth: 4.1,
  fitHeight: 7.2,
  lookY: 3.3,
  introDur: 1.15,
  focusDur: 0.55,
  unfocusDur: 0.42,
  /** Share of the view height the focused paper fills (leaves room for the buttons). */
  focusFill: 0.64,
  focusMaxWidth: 0.92,
  /** Focused paper sits this much (of view height) above centre. */
  focusLift: 0.035,
  dim: 0.42,
  sway: 0.07,
};

const SKY_TOP = 0x6fb2e8;
const SKY_HORIZON = 0xdff1ff;
const CONFETTI_COLORS = [0xff7ab6, 0x7fd3ff, 0xffd23f, 0x9b7bff, 0x6fe0a4, 0xff9f5a];
const MAX_CONFETTI = 70;

interface Tween {
  t: number; dur: number;
  update(k: number): void;
  done?: () => void;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k: number) => { const c = 1.5; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class BoardStage {
  readonly canvas: HTMLCanvasElement;
  readonly papers: PaperSet;
  /** A tap landed on a notice (or on nothing: null). */
  onTap: ((k: PaperKind | null) => void) | null = null;
  private renderer: InstanceType<typeof THREE.WebGLRenderer>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(STAGE_TUNING.fov, 1, 0.05, 200);
  private model: BoardModel;
  private dimMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  private dim: Mesh;
  private bangs = {} as Record<PaperKind, Sprite>;
  private alerts = {} as Record<PaperKind, boolean>;
  private tweens: Tween[] = [];
  private focusedKind: PaperKind | null = null;
  private moving = false;
  private pressed: PaperKind | null = null;
  private downAt: { x: number; y: number } | null = null;
  private camBase = new THREE.Vector3();
  private camFrom = new THREE.Vector3();
  private intro = 0;
  private shake = 0;
  private dimAmt = 0;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private fitW = -1;
  private fitH = -1;
  private raycaster = new THREE.Raycaster();
  private confetti: InstanceType<typeof THREE.InstancedMesh>;
  private conf: { p: Vector3; v: Vector3; ax: Vector3; ang: number; spin: number; life: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private disposed = false;

  constructor(private host: HTMLElement, data: () => PaperData) {
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

    // Sky.
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(SKY_TOP) }, uHor: { value: new THREE.Color(SKY_HORIZON) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop, uHor; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(uHor, uTop, smoothstep(0.42, 0.9, vUv.y)), 1.0); }',
      depthWrite: false,
    }));
    sky.position.set(0, 10, -40);
    sky.renderOrder = -10;
    this.scene.add(sky);

    // Lights.
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a8a48, 1.15));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.1);
    key.position.set(3.5, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0005;
    const sc = key.shadow.camera as InstanceType<typeof THREE.OrthographicCamera>;
    sc.left = -4; sc.right = 4; sc.top = 6; sc.bottom = -2; sc.near = 1; sc.far = 25;
    this.scene.add(key);

    // Camp ground: grass, a worn dirt patch in front of the board, a few trees and bushes.
    const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48), clay(0x7cc35a, 0.95));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), clay(0xc9a071, 0.95));
    dirt.rotation.x = -Math.PI / 2;
    dirt.scale.set(1.4, 0.8, 1);
    dirt.position.set(0, 0.01, 1.4);
    dirt.receiveShadow = true;
    this.scene.add(dirt);
    const r = seeded(5);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (3.2 + r() * 10), z = -3 - r() * 14;
      this.scene.add(tree(x, z, 0.8 + r() * 0.8, r() < 0.3 ? 0xf2a7c3 : r() < 0.5 ? 0x5fae45 : 0x4f9a3c));
    }
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45 + r() * 0.3, 14, 10), clay(0x5aa843, 0.9));
      b.position.set((r() - 0.5) * 12, 0.25, -1.2 - r() * 3);
      if (Math.abs(b.position.x) < 2.4) b.position.x += 3 * Math.sign(b.position.x || 1);
      b.scale.y = 0.75;
      b.castShadow = true;
      this.scene.add(b);
    }

    // The board (full-res papers).
    this.papers = new PaperSet(1, data);
    this.model = buildBoardModel(this.papers.textures);
    this.scene.add(this.model.root);

    // "!" tags over notices that want you.
    const bt = bangTexture();
    for (const k of PAPER_KINDS) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, transparent: true, depthWrite: false }));
      s.center.set(0.5, 0);
      s.scale.set(0.34, 0.42, 1);
      s.visible = false;
      s.renderOrder = 3;
      this.scene.add(s);
      this.bangs[k] = s;
    }

    // Dim card behind a focused notice (rides on the camera).
    this.scene.add(this.camera);
    this.dimMat = new THREE.MeshBasicMaterial({ color: 0x1a0f06, transparent: true, opacity: 0, depthWrite: false });
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.dimMat);
    this.dim.renderOrder = 5;
    this.dim.visible = false;
    this.camera.add(this.dim);

    // Stamp confetti.
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.035, 0.06),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX_CONFETTI);
    this.confetti.frustumCulled = false;
    this.confetti.renderOrder = 12;
    const col = new THREE.Color();
    for (let i = 0; i < MAX_CONFETTI; i++) {
      this.conf.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), ang: 0, spin: 0, life: 0 });
      this.confetti.setColorAt(i, col.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
      this.confetti.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
    }
    this.scene.add(this.confetti);

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onCancel);
    this.fit();
    this.camera.position.copy(this.camFrom);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get focused(): PaperKind | null { return this.focusedKind; }
  get busy(): boolean { return this.moving; }

  redraw(k?: PaperKind): void { this.papers.redraw(k); }

  setAlerts(a: Partial<Record<PaperKind, boolean>>): void { Object.assign(this.alerts, a); }

  /** Pull a notice off the board and bring it up to the camera. */
  focus(k: PaperKind): Promise<void> {
    if (this.moving || this.focusedKind) return Promise.resolve();
    this.moving = true;
    this.focusedKind = k;
    const pivot = this.model.pivots[k];
    const pin = this.model.pins[k];
    const paper = this.model.papers[k];
    this.pressed = null;
    // Pin pops out and sticks back into the cork where it was.
    this.scene.attach(pin);
    const pinRest = pin.position.clone();
    const pinOut = pinRest.clone().add(new THREE.Vector3(0, 0.12, 0.35));
    this.tween(0.42, (t) => {
      const up = Math.sin(Math.PI * Math.min(1, t * 1.25));
      pin.position.lerpVectors(pinRest, pinOut, up);
      pin.rotation.z = t * Math.PI * 2;
    });
    // Paper flies to the camera.
    this.scene.attach(pivot);
    paper.renderOrder = 10;
    const fromP = pivot.position.clone(), fromQ = pivot.quaternion.clone();
    const { pos: toP, quat: toQ } = this.focusPose();
    const arc = new THREE.Vector3(0, 0.25, 0);
    return new Promise((res) => {
      this.tween(STAGE_TUNING.focusDur, (t) => {
        const e = easeOutBack(t);
        pivot.position.lerpVectors(fromP, toP, e).addScaledVector(arc, Math.sin(Math.PI * t));
        pivot.quaternion.slerpQuaternions(fromQ, toQ, Math.min(1, easeOut(t)));
        pivot.rotateY(Math.sin(Math.PI * t) * 0.35);
        this.dimAmt = easeOut(t);
      }, () => { this.moving = false; res(); });
    });
  }

  /** Send the focused notice back to its pin. */
  unfocus(): Promise<void> {
    const k = this.focusedKind;
    if (!k || this.moving) return Promise.resolve();
    this.moving = true;
    const pivot = this.model.pivots[k];
    const pin = this.model.pins[k];
    const paper = this.model.papers[k];
    const L = BOARD_LAYOUT.papers[k];
    const fromP = pivot.position.clone(), fromQ = pivot.quaternion.clone();
    const toP = new THREE.Vector3(L.x, L.y - BOARD_LAYOUT.pinDrop, BOARD_LAYOUT.corkFront + 0.012);
    const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, L.rot));
    return new Promise((res) => {
      this.tween(STAGE_TUNING.unfocusDur, (t) => {
        const e = easeInOut(t);
        pivot.position.lerpVectors(fromP, toP, e);
        pivot.quaternion.slerpQuaternions(fromQ, toQ, e);
        pivot.rotateY(-Math.sin(Math.PI * t) * 0.25);
        this.dimAmt = 1 - e;
      }, () => {
        this.model.root.attach(pivot);
        pivot.attach(pin);
        paper.renderOrder = 0;
        this.focusedKind = null;
        this.moving = false;
        this.shake = 0.02;
        res();
      });
    });
  }

  /** Slam the DONE! stamp onto the focused notice (then bake it into the paper). */
  stamp(k: PaperKind): Promise<void> {
    const paper = this.model.papers[k];
    const c = Object.assign(document.createElement('canvas'), { width: 560, height: 240 });
    drawStamp(c.getContext('2d')!, 280, 120, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const w = BOARD_LAYOUT.paperW * 0.7;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (240 / 560)), mat);
    // Paper px (400, 560) → sheet-local.
    m.position.set(0, BOARD_LAYOUT.paperH / 2 - 0.56 * BOARD_LAYOUT.paperH, 0.03);
    m.renderOrder = 11;
    paper.add(m);
    return new Promise((res) => {
      this.tween(0.2, (t) => {
        const s = 2.4 - 1.4 * easeOut(t);
        m.scale.set(s, s, 1);
        mat.opacity = Math.min(1, t * 1.6);
      }, () => {
        this.shake = 0.06;
        this.burst(m.getWorldPosition(new THREE.Vector3()));
        this.tween(0.45, () => {}, () => {
          this.papers.redraw(k);
          paper.remove(m);
          m.geometry.dispose(); tex.dispose(); mat.dispose();
          res();
        });
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
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
    this.papers.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  private tween(dur: number, update: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur, update, done });
  }

  /** Where the focused notice's pivot (its pin point) goes: centred, facing the camera. */
  private focusPose(): { pos: Vector3; quat: Quaternion } {
    const T = STAGE_TUNING, L = BOARD_LAYOUT;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dH = L.paperH / (T.focusFill * 2 * half);
    const dW = L.paperW / (T.focusMaxWidth * 2 * half * this.camera.aspect);
    const d = Math.max(dH, dW);
    // Use the resting camera (no sway) so the pose is stable.
    const cam = new THREE.PerspectiveCamera().copy(this.camera, false);
    cam.position.copy(this.camBase);
    cam.lookAt(0, T.lookY, 0);
    cam.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const viewH = 2 * d * half;
    const pos = cam.position.clone().addScaledVector(fwd, d)
      .addScaledVector(up, viewH * T.focusLift + (L.paperH / 2 - L.pinDrop));
    this.dim.position.set(0, 0, -(d + 0.5));
    const dimH = 2 * (d + 0.5) * half * 1.2;
    this.dim.scale.set(dimH * Math.max(1, this.camera.aspect) * 1.2, dimH, 1);
    return { pos, quat: cam.quaternion.clone() };
  }

  private pick(e: PointerEvent): PaperKind | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(PAPER_KINDS.map((k) => this.model.papers[k]), false);
    return (hits[0]?.object.userData.paper as PaperKind | undefined) ?? null;
  }

  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
    if (!this.focusedKind && !this.moving) this.pressed = this.pick(e);
  };

  private onUp = (e: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    this.pressed = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14 || this.moving) return;
    this.onTap?.(this.pick(e));
  };

  private onCancel = () => { this.downAt = null; this.pressed = null; };

  private burst(at: Vector3): void {
    for (const c of this.conf) {
      c.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.1, 0.05));
      c.v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, 0.4 + Math.random());
      c.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      c.ang = Math.random() * 6;
      c.spin = 6 + Math.random() * 10;
      c.life = 1.2 + Math.random() * 0.6;
    }
  }

  private fit(): void {
    this.fitW = this.host.clientWidth;
    this.fitH = this.host.clientHeight;
    const w = Math.max(1, this.fitW), h = Math.max(1, this.fitH);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max((STAGE_TUNING.fitWidth / 2) / (half * this.camera.aspect), (STAGE_TUNING.fitHeight / 2) / half);
    this.camBase.set(0, STAGE_TUNING.lookY + 0.35, dist);
    this.camFrom.set(2.6, STAGE_TUNING.lookY + 1.6, dist * 1.75);
    // Re-seat a focused notice for the new aspect.
    if (this.focusedKind && !this.moving) {
      const { pos, quat } = this.focusPose();
      this.model.pivots[this.focusedKind].position.copy(pos);
      this.model.pivots[this.focusedKind].quaternion.copy(quat);
    }
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    if (this.host.clientWidth !== this.fitW || this.host.clientHeight !== this.fitH) this.fit();

    for (const tw of [...this.tweens]) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      tw.update(tw.dur > 0 ? tw.t / tw.dur : 1);
      if (tw.t >= tw.dur) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done?.(); }
    }

    // Camera: intro dolly, then a gentle sway + any stamp shake.
    this.intro = Math.min(1, this.intro + dt / STAGE_TUNING.introDur);
    const e = easeInOut(this.intro);
    this.camera.position.lerpVectors(this.camFrom, this.camBase, e);
    const sway = STAGE_TUNING.sway * (1 - this.dimAmt * 0.8);
    this.camera.position.x += Math.sin(this.clock * 0.45) * sway;
    this.camera.position.y += Math.sin(this.clock * 0.6) * sway * 0.4;
    this.camera.lookAt(0, STAGE_TUNING.lookY, 0);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.25);
    }

    this.dim.visible = this.dimAmt > 0.01;
    this.dimMat.opacity = this.dimAmt * STAGE_TUNING.dim;

    // Resting notices stir; the one under your finger lifts off the cork a touch.
    let i = 0;
    for (const k of PAPER_KINDS) {
      const pv = this.model.pivots[k];
      const L = BOARD_LAYOUT.papers[k];
      if (k !== this.focusedKind) {
        pv.rotation.z = L.rot + Math.sin(this.clock * 1.7 + i * 1.9) * 0.012;
        pv.rotation.x = -Math.max(0, Math.sin(this.clock * 1.1 + i * 2.3)) * 0.04 - (this.pressed === k ? 0.12 : 0);
        pv.position.z += ((BOARD_LAYOUT.corkFront + 0.012 + (this.pressed === k ? 0.08 : 0)) - pv.position.z) * (1 - Math.exp(-14 * dt));
      }
      const b = this.bangs[k];
      b.visible = !!this.alerts[k] && k !== this.focusedKind && !this.moving;
      if (b.visible) {
        b.position.set(L.x + 0.46, L.y + 0.02 + Math.sin(this.clock * 3 + i) * 0.04, BOARD_LAYOUT.corkFront + 0.2);
        const s = 1 + Math.sin(this.clock * 6 + i) * 0.06;
        b.scale.set(0.34 * s, 0.42 * s, 1);
      }
      i++;
    }

    // Confetti.
    let live = false;
    for (let j = 0; j < this.conf.length; j++) {
      const c = this.conf[j];
      if (c.life <= 0) { this.confetti.setMatrixAt(j, this.tmpM.makeScale(0, 0, 0)); continue; }
      live = true;
      c.life -= dt;
      c.v.y -= 4.5 * dt;
      c.v.multiplyScalar(1 - 1.4 * dt);
      c.p.addScaledVector(c.v, dt);
      c.ang += c.spin * dt;
      this.tmpQ.setFromAxisAngle(c.ax, c.ang);
      const s = Math.min(1, c.life * 2);
      this.confetti.setMatrixAt(j, this.tmpM.compose(c.p, this.tmpQ, this.tmpS.set(s, s, s)));
    }
    if (live || this.confetti.userData.live) this.confetti.instanceMatrix.needsUpdate = true;
    this.confetti.userData.live = live;

    this.renderer.render(this.scene, this.camera);
  };
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function tree(x: number, z: number, s: number, leaf: number): Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 10), clay(0x8a5a3a));
  trunk.position.y = 0.8;
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), clay(leaf, 0.9));
  top.position.y = 2.2;
  top.scale.y = 0.9;
  const top2 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), clay(leaf, 0.9));
  top2.position.set(0.5, 2.75, 0.1);
  for (const m of [trunk, top, top2]) { m.castShadow = true; g.add(m); }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  return g;
}
