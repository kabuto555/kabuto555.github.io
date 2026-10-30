// Taurus Demon box rig (~4.8 m to the horn tips) + procedural animator. One merged mesh per bone
// (vertex-colored boxes over a 32px hide texture), shared materials, telegraph FX (eye glow,
// landing-target ring, slam shockwave). Faces -z like every enemy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng';
import { disposeSkeletons, BLOB_LIFT, createBlobShadow, makeBoxGeometry, makePs1Material, skinMeshes, toPs1Texture } from '../../render';
import type { Enemy, EnemyView } from '../enemy';
import { JUMP, moveOf, taurusData } from './taurus';

/** [w, h, d, x, y, z, color, tiltX?, tiltZ?] bone-local. */
type Part = readonly [number, number, number, number, number, number, number, number?, number?];

const HIDE = 0x9a6448;
const HIDE_D = 0x6e4430;
const BELLY = 0xb48058;
const HORN = 0xd8cbb0;
const HORN_D = 0xa89a80;
const HOOF = 0x1e1814;
const CLOTH = 0x4a3a2c;
const WOOD = 0x7a5630;
const IRON = 0x56565a;

function paint(geo: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = nrm.getY(i) < -0.5 ? 0.62 : nrm.getY(i) > 0.5 ? 1.1 : 0.92;
    col[i * 3] = Math.min(1, c.r * s);
    col[i * 3 + 1] = Math.min(1, c.g * s);
    col[i * 3 + 2] = Math.min(1, c.b * s);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function build(parts: readonly Part[]): THREE.BufferGeometry {
  const geos = parts.map(([w, h, d, x, y, z, color, tx, tz]) => {
    const g = makeBoxGeometry(w, h, d, { tile: 0.8, maxSegment: 0 });
    g.clearGroups();
    if (tz) g.rotateZ(tz);
    if (tx) g.rotateX(tx);
    g.translate(x, y, z);
    paint(g, color);
    return g;
  });
  const m = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  m.computeBoundingSphere();
  return m;
}

/** 32px hide: dark mottled skin with fur strokes and scars. */
function hideCanvas(size = 32): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = new Rng(4242);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fur = Math.sin(x * 1.7 + Math.sin(y * 0.9) * 1.5) > 0.7 ? -0.16 : 0;
      const blot = Math.sin(x * 0.45) * Math.cos(y * 0.6 + 1) * 0.1;
      const v = 0.8 + fur + blot + (rng.next() - 0.5) * 0.18;
      const o = (y * size + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[o] = g;
      img.data[o + 1] = Math.round(g * 0.93);
      img.data[o + 2] = Math.round(g * 0.88);
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

interface TaurusMats {
  body: THREE.Material;
  flashHit: THREE.Material;
  flashStagger: THREE.Material;
  eyes: THREE.Material;
  eyesHot: THREE.Material;
  ring: THREE.MeshBasicMaterial;
  wave: THREE.MeshBasicMaterial;
}
let mats: TaurusMats | null = null;
function materials(): TaurusMats {
  if (mats) return mats;
  const tex = toPs1Texture(hideCanvas());
  tex.name = 'taurusHide';
  const mk = (em: number) => makePs1Material({ map: tex, vertexColors: true, emissive: em });
  mats = {
    body: mk(0x000000),
    flashHit: mk(0x8a1a0a),
    flashStagger: mk(0xc0b080),
    eyes: makePs1Material({ lit: false, color: 0xd05018 }),
    eyesHot: makePs1Material({ lit: false, color: 0xfff070 }),
    ring: makePs1Material({ lit: false, color: 0xd02010, transparent: true, opacity: 0.55, side: THREE.DoubleSide }) as THREE.MeshBasicMaterial,
    wave: makePs1Material({ lit: false, color: 0xcfc2a8, transparent: true, opacity: 0.7, side: THREE.DoubleSide }) as THREE.MeshBasicMaterial,
  };
  mats.ring.depthWrite = false;
  mats.wave.depthWrite = false;
  return mats;
}

// ------------------------------------------------------------------ geometry (bone-local; hips at y = 2.0)

const HIPS_Y0 = 2.0;
const LEG_X = 0.62;
const SH_X = 1.32;
const SH_Y = 1.72;

const PARTS = {
  pelvis: [
    [1.5, 0.6, 1.0, 0, 0.05, 0, HIDE_D],
    [1.6, 0.7, 1.1, 0, -0.25, 0.02, CLOTH], // loincloth wrap
    [0.9, 0.8, 0.12, 0, -0.6, -0.5, CLOTH, 0.12], // front flap
  ],
  thigh: [
    [0.62, 1.1, 0.7, 0, -0.5, 0, HIDE],
  ],
  shin: [
    [0.5, 0.95, 0.55, 0, -0.45, 0.06, HIDE_D],
    [0.64, 0.26, 0.82, 0, -0.9, -0.1, HOOF], // hoof
  ],
  torso: [
    [1.6, 0.9, 1.05, 0, 0.45, 0, BELLY], // gut
    [2.3, 1.15, 1.35, 0, 1.35, 0, HIDE], // barrel chest
    [2.6, 0.55, 1.2, 0, 1.85, 0.08, HIDE_D], // shoulder yoke
    [1.0, 0.7, 0.9, 0, 2.05, 0.35, HIDE_D], // hump
    [1.5, 0.6, 0.1, 0, 1.2, -0.68, BELLY], // pecs plate
  ],
  head: [
    [0.8, 0.62, 0.82, 0, 0.22, -0.2, HIDE],
    [0.56, 0.38, 0.46, 0, 0.1, -0.78, HIDE_D], // snout
    [0.3, 0.12, 0.08, 0, 0.0, -1.02, HOOF], // nostrils
    [0.62, 0.16, 0.5, 0, -0.14, -0.62, HIDE_D], // jaw
    // horns: three segments each side, sweeping out, up and forward
    [0.26, 0.26, 0.34, 0.5, 0.48, -0.1, HORN_D],
    [0.24, 0.24, 0.52, 0.72, 0.6, -0.18, HORN, -0.4],
    [0.17, 0.17, 0.52, 0.9, 0.84, -0.42, HORN, -0.9],
    [0.26, 0.26, 0.34, -0.5, 0.48, -0.1, HORN_D],
    [0.24, 0.24, 0.52, -0.72, 0.6, -0.18, HORN, -0.4],
    [0.17, 0.17, 0.52, -0.9, 0.84, -0.42, HORN, -0.9],
  ],
  eyes: [
    [0.14, 0.09, 0.05, 0.2, 0.32, -0.62, 0xffffff],
    [0.14, 0.09, 0.05, -0.2, 0.32, -0.62, 0xffffff],
  ],
  upperArm: [
    [0.62, 1.25, 0.66, 0, -0.55, 0, HIDE],
    [0.8, 0.5, 0.8, 0, 0.05, 0, HIDE_D], // deltoid
  ],
  foreArm: [
    [0.56, 1.1, 0.6, 0, -0.5, 0, HIDE_D],
    [0.66, 0.5, 0.66, 0, -1.15, -0.04, HIDE], // fist
  ],
  // club along -y from the grip (hanging from the fist)
  club: [
    [0.2, 1.1, 0.2, 0, -0.3, 0, WOOD],
    [0.6, 1.6, 0.6, 0, -1.6, 0, WOOD],
    [0.68, 0.14, 0.68, 0, -1.0, 0, IRON],
    [0.68, 0.14, 0.68, 0, -2.2, 0, IRON],
    [0.22, 0.22, 0.22, 0.36, -1.5, 0, IRON], // studs
    [0.22, 0.22, 0.22, -0.36, -1.9, 0, IRON],
    [0.22, 0.22, 0.22, 0, -1.7, 0.36, IRON],
    [0.22, 0.22, 0.22, 0, -1.3, -0.36, IRON],
  ],
} satisfies Record<string, readonly Part[]>;

let geos: Record<keyof typeof PARTS, THREE.BufferGeometry> | null = null;
function geometries() {
  if (geos) return geos;
  const g = {} as Record<keyof typeof PARTS, THREE.BufferGeometry>;
  for (const k of Object.keys(PARTS) as (keyof typeof PARTS)[]) g[k] = build(PARTS[k]);
  geos = g;
  return g;
}

// ------------------------------------------------------------------ pose channels

const BODY_X = 0;
const BODY_Z = 1;
const HIPS_Y = 2;
const SPINE_X = 3;
const SPINE_Y = 4;
const NECK_X = 5;
const SHL_X = 6;
const SHL_Z = 7;
const ELL_X = 8;
const SHR_X = 9;
const SHR_Z = 10;
const ELR_X = 11;
const CLUB_X = 12;
const HIPL_X = 13;
const KNEEL_X = 14;
const HIPR_X = 15;
const KNEER_X = 16;
const N = 17;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const easeIn = (u: number) => u * u;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export class TaurusView implements EnemyView {
  /** Static container (world space): the rig + world-space FX rings. */
  readonly root = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly shL = new THREE.Group();
  private readonly elL = new THREE.Group();
  private readonly shR = new THREE.Group();
  private readonly elR = new THREE.Group();
  private readonly grip = new THREE.Group();
  private readonly hipL = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly eyes: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly wave: THREE.Mesh;
  private readonly tgt = new Float32Array(N);
  private readonly cur = new Float32Array(N);
  private readonly prev = new Float32Array(N);
  private readonly out = new Float32Array(N);
  private phase = 0;
  private time = 0;
  private flashT = 0;
  private flashMat: THREE.Material;
  private shownMat: THREE.Material;
  private sink = 0;
  private prevSink = 0;
  private hot = false;

  constructor() {
    const m = materials();
    const g = geometries();
    this.flashMat = m.flashHit;
    this.shownMat = m.body;
    this.root.name = 'taurus';
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry) => {
      const mesh = new THREE.Mesh(geo, m.body);
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    this.root.add(this.rig);
    this.rig.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = HIPS_Y0;
    add(this.hips, g.pelvis);
    for (const [hip, knee, x] of [
      [this.hipL, this.kneeL, -LEG_X],
      [this.hipR, this.kneeR, LEG_X],
    ] as const) {
      hip.position.set(x, -0.1, 0);
      this.hips.add(hip);
      add(hip, g.thigh);
      knee.position.y = -1.05;
      hip.add(knee);
      add(knee, g.shin);
    }
    this.spine.position.y = 0.25;
    this.hips.add(this.spine);
    add(this.spine, g.torso);
    this.neck.position.set(0, 1.95, -0.62);
    this.spine.add(this.neck);
    add(this.neck, g.head);
    this.eyes = new THREE.Mesh(g.eyes, m.eyes);
    this.neck.add(this.eyes);
    for (const [sh, el, x] of [
      [this.shL, this.elL, -SH_X],
      [this.shR, this.elR, SH_X],
    ] as const) {
      sh.position.set(x, SH_Y, 0);
      this.spine.add(sh);
      add(sh, g.upperArm);
      el.position.y = -1.12;
      sh.add(el);
      add(el, g.foreArm);
    }
    this.grip.position.set(0, -1.15, -0.05);
    this.elR.add(this.grip);
    add(this.grip, g.club);
    // 11 per-bone meshes -> one skinned body mesh (flash swaps its material as before).
    const skinned = skinMeshes(this.rig, this.meshes, 'taurus');
    if (skinned.length) {
      this.meshes.length = 0;
      for (const s of skinned) this.meshes.push(s.mesh);
    }
    this.shadow = createBlobShadow(1.7);
    this.shadow.position.y = BLOB_LIFT;
    this.rig.add(this.shadow);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(JUMP.aoeRadius - 0.35, JUMP.aoeRadius, 24).rotateX(-Math.PI / 2), m.ring);
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 24).rotateX(-Math.PI / 2), m.wave);
    this.wave.visible = false;
    this.wave.renderOrder = 2;
    this.root.add(this.wave);
  }

  flash(kind: 'hit' | 'block' | 'stagger'): void {
    const m = materials();
    this.flashMat = kind === 'stagger' ? m.flashStagger : m.flashHit;
    this.flashT = kind === 'stagger' ? 0.2 : 0.06;
  }

  sync(e: Enemy, dt: number): void {
    this.time += dt;
    this.prev.set(this.cur);
    this.prevSink = this.sink;
    const rate = this.pose(e, dt);
    const k = 1 - Math.exp(-rate * dt);
    for (let i = 0; i < N; i++) this.cur[i]! += (this.tgt[i]! - this.cur[i]!) * k;

    const m = materials();
    if (this.flashT > 0) this.flashT -= dt;
    const want = this.flashT > 0 ? this.flashMat : m.body;
    if (want !== this.shownMat) {
      this.shownMat = want;
      for (const mesh of this.meshes) mesh.material = want;
    }
    // eye glow = "something is coming" (windups) and rage (roar)
    const hot = e.alive && (e.state === 'windup' || e.state === 'alert');
    if (hot !== this.hot) {
      this.hot = hot;
      this.eyes.material = hot ? m.eyesHot : m.eyes;
    }
    this.shadow.visible = e.alive;

    // FX: landing target ring while airborne, shockwave after the slam
    const d = taurusData(e);
    this.ring.visible = d.airborne;
    if (d.airborne) {
      this.ring.position.set(d.jumpTo.x, d.jumpTo.y + 0.06, d.jumpTo.z);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 14));
    }
    if (d.slamT < 0.5) {
      d.slamT += dt;
      const u = clamp01(d.slamT / 0.5);
      const p = e.capsule.position;
      this.wave.visible = true;
      this.wave.position.set(p.x, p.y + 0.08, p.z);
      const r = 0.8 + u * JUMP.aoeRadius * 1.1;
      this.wave.scale.set(r, 1, r);
      m.wave.opacity = 0.75 * (1 - u);
    } else this.wave.visible = false;
  }

  render(e: Enemy, alpha: number): void {
    const p = e.capsule.position;
    const q = e.prevPos;
    const sink = lerp(this.prevSink, this.sink, alpha);
    this.rig.position.set(lerp(q.x, p.x, alpha), lerp(q.y, p.y, alpha) - sink, lerp(q.z, p.z, alpha));
    let dy = e.transform.yaw - e.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    this.rig.rotation.y = e.prevYaw + dy * alpha;
    // the blob shadow stays on the deck during the jump
    this.shadow.position.y = BLOB_LIFT - (lerp(q.y, p.y, alpha) - taurusData(e).jumpFrom.y) * (taurusData(e).airborne ? 1 : 0);

    const o = this.out;
    for (let i = 0; i < N; i++) o[i] = this.prev[i]! + (this.cur[i]! - this.prev[i]!) * alpha;
    const f = e.flinch * e.flinch * 0.35; // big: barely flinches
    this.body.rotation.set(o[BODY_X]!, 0, o[BODY_Z]!);
    this.hips.position.y = HIPS_Y0 + o[HIPS_Y]!;
    this.spine.rotation.set(o[SPINE_X]! + 0.2 * f, o[SPINE_Y]!, 0.12 * f * e.flinchSide);
    this.neck.rotation.x = o[NECK_X]!;
    this.shL.rotation.set(o[SHL_X]!, 0, o[SHL_Z]!);
    this.elL.rotation.x = o[ELL_X]!;
    this.shR.rotation.set(o[SHR_X]!, 0, o[SHR_Z]!);
    this.elR.rotation.x = o[ELR_X]!;
    this.grip.rotation.x = o[CLUB_X]!;
    this.hipL.rotation.x = o[HIPL_X]!;
    this.kneeL.rotation.x = o[KNEEL_X]!;
    this.hipR.rotation.x = o[HIPR_X]!;
    this.kneeR.rotation.x = o[KNEER_X]!;
  }

  dispose(): void {
    disposeSkeletons(this.root);
    this.root.removeFromParent();
    this.ring.geometry.dispose();
    this.wave.geometry.dispose();
  }

  // ------------------------------------------------------------------ poses

  private base(): void {
    const T = this.tgt;
    T.fill(0);
    T[SPINE_X] = -0.32;
    T[NECK_X] = 0.28;
    T[SHL_Z] = -0.28;
    T[SHR_Z] = 0.24;
    T[SHL_X] = 0.12;
    T[SHR_X] = 0.2;
    T[ELL_X] = 0.4;
    T[ELR_X] = 0.45;
    T[CLUB_X] = -0.75;
    T[HIPL_X] = T[HIPR_X] = 0.22;
    T[KNEEL_X] = T[KNEER_X] = -0.38;
    T[HIPS_Y] = -0.08;
  }

  private walk(a: number, stride: number): void {
    const T = this.tgt;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    T[HIPL_X]! += s * stride * a;
    T[HIPR_X]! -= s * stride * a;
    T[KNEEL_X]! -= Math.max(0, -c) * 0.7 * a;
    T[KNEER_X]! -= Math.max(0, c) * 0.7 * a;
    T[HIPS_Y]! -= Math.abs(s) * 0.14 * a;
    T[BODY_Z] = s * 0.05 * a;
    T[SHL_X]! -= s * 0.3 * a;
    T[SHR_X]! += s * 0.2 * a;
    T[SPINE_Y] = s * 0.08 * a;
  }

  private overhead(u: number, v: number): void {
    const T = this.tgt;
    const raise = u * (1 - v);
    T[SHL_X] = lerp(lerp(0.12, 2.85, u), 1.05, v);
    T[SHR_X] = lerp(lerp(0.2, 2.95, u), 1.0, v);
    T[SHL_Z] = lerp(-0.28, 0.25, raise);
    T[SHR_Z] = lerp(0.24, -0.25, raise);
    T[ELL_X] = T[ELR_X] = lerp(0.45, 0.7, raise);
    T[CLUB_X] = lerp(lerp(-0.75, -0.25, u), -1.25, v);
    T[SPINE_X] = lerp(lerp(-0.32, 0.22, u), -0.95, v);
    T[NECK_X] = lerp(0.2, 0.6, v);
    T[HIPL_X] = T[HIPR_X] = lerp(0.22, 0.5, Math.max(u * 0.6, v));
    T[KNEEL_X] = T[KNEER_X] = lerp(-0.38, -0.85, Math.max(u * 0.6, v));
    T[HIPS_Y] = lerp(-0.08, -0.4, Math.max(u * 0.5, v));
  }

  private sweep(u: number, v: number): void {
    const T = this.tgt;
    T[SPINE_Y] = lerp(-0.95 * u, 1.05, v); // wind right, rip across to the left
    T[SPINE_X] = lerp(-0.32, -0.5, u);
    T[SHR_X] = lerp(lerp(0.2, 1.3, u), 1.5, v);
    T[SHR_Z] = lerp(lerp(0.24, 1.05, u), 0.35, v);
    T[ELR_X] = lerp(0.45, 0.2, u);
    T[CLUB_X] = -1.45;
    T[SHL_X] = lerp(0.12, 0.9, u);
    T[SHL_Z] = lerp(-0.28, -0.7, u);
    T[HIPL_X] = 0.45;
    T[KNEEL_X] = -0.7;
    T[HIPR_X] = -0.15;
    T[KNEER_X] = -0.45;
    T[HIPS_Y] = lerp(-0.08, -0.35, u);
  }

  private crouch(u: number): void {
    const T = this.tgt;
    T[HIPS_Y] = -0.75 * u;
    T[HIPL_X] = T[HIPR_X] = 0.22 + 0.85 * u;
    T[KNEEL_X] = T[KNEER_X] = -0.38 - 1.25 * u;
    T[SPINE_X] = -0.32 - 0.45 * u;
    T[SHL_X] = T[SHR_X] = -0.8 * u;
    T[SHL_Z] = -0.5 * u - 0.2;
    T[SHR_Z] = 0.5 * u + 0.2;
    T[CLUB_X] = -0.2;
  }

  /** Write the target pose for the current state; returns the damping rate (1/s). */
  private pose(e: Enemy, dt: number): number {
    const T = this.tgt;
    const t = e.ctx.stateTime;
    const a = e.ctx.currentAttack;
    this.base();
    switch (e.state) {
      case 'idle':
        T[SPINE_X]! += Math.sin(this.time * 1.4) * 0.04; // heavy breathing
        T[NECK_X]! += Math.sin(this.time * 1.4 + 0.5) * 0.05;
        return 4;
      case 'alert': {
        // the roar: rear up, arms wide, head thrown back, shaking
        const u = easeOut(clamp01(t / 0.5));
        const shake = Math.sin(this.time * 40) * 0.05 * u;
        T[SPINE_X] = lerp(-0.32, 0.2, u) + shake;
        T[NECK_X] = lerp(0.28, 0.85, u);
        T[SHL_Z] = lerp(-0.28, -1.25, u);
        T[SHR_Z] = lerp(0.24, 1.2, u);
        T[SHL_X] = T[SHR_X] = 0.5 * u;
        T[ELL_X] = T[ELR_X] = 0.9 * u;
        return 9;
      }
      case 'chase':
      case 'return':
      case 'patrol':
      case 'hitReact': {
        const sp = clamp01(e.speed / 3.4);
        this.phase += dt * (1.2 + e.speed * 1.5);
        this.walk(sp, 0.5);
        return 8;
      }
      case 'windup': {
        if (!a) return 8;
        // full telegraph at 70% of the windup, then a trembling hold (the "now roll" read)
        const u = easeOut(clamp01(t / Math.max(0.05, a.windup * 0.7)));
        const hold = u >= 1 ? Math.sin(this.time * 34) * 0.03 : 0;
        if (a.id === 'overhead_smash') this.overhead(u, 0);
        else if (a.id === 'sweep') this.sweep(u, 0);
        else if (a.id === 'jump_slam') this.crouch(u);
        else {
          // charge: horns down, club dragging, pawing the deck
          T[SPINE_X] = -0.32 - 0.6 * u;
          T[NECK_X] = 0.05;
          T[SHL_X] = -0.35 * u;
          T[SHR_X] = -0.55 * u;
          T[CLUB_X] = -0.1;
          T[HIPS_Y] = -0.25 * u;
          T[HIPR_X] = 0.22 + Math.sin(this.time * 9) * 0.45 * u;
          T[KNEER_X] = -0.5 - Math.max(0, Math.cos(this.time * 9)) * 0.5 * u;
        }
        T[SPINE_X]! += hold;
        T[SHR_X]! += hold;
        return 9;
      }
      case 'attack': {
        if (!a) return 20;
        const m = moveOf(a);
        if (a.id === 'jump_slam') {
          const d = taurusData(e);
          if (d.airborne) {
            // tucked, club raised for the landing smash
            T[HIPL_X] = T[HIPR_X] = 0.9;
            T[KNEEL_X] = T[KNEER_X] = -1.3;
            T[SHL_X] = T[SHR_X] = 2.7;
            T[ELL_X] = T[ELR_X] = 0.5;
            T[CLUB_X] = -0.3;
            T[SPINE_X] = 0.05;
            return 14;
          }
          this.overhead(1, 1);
          T[HIPS_Y] = -0.6;
          return 40;
        }
        if (a.id === 'charge') {
          this.phase += dt * 9;
          this.walk(1, 0.75);
          T[SPINE_X] = -1.0;
          T[NECK_X] = 0.1;
          T[SHL_X] = -0.5;
          T[SHR_X] = -0.7;
          T[CLUB_X] = 0;
          return 14;
        }
        const v = easeIn(clamp01(t / Math.max(0.05, m.active)));
        if (a.id === 'sweep') this.sweep(1, v);
        else this.overhead(1, v);
        return 40;
      }
      case 'recover': {
        if (!a) return 4;
        const m = moveOf(a);
        // hold the follow-through (club in the deck = punish window), then heave back up
        if (t < m.recover * 0.55) {
          if (a.id === 'sweep') this.sweep(1, 1);
          else if (a.id === 'charge') {
            T[SPINE_X] = -0.8;
            T[HIPL_X] = 0.6;
            T[KNEEL_X] = -0.9;
            T[HIPS_Y] = -0.3;
          } else this.overhead(1, 1);
          return 12;
        }
        return 3;
      }
      case 'stagger': {
        // dropped to one knee, head down, club on the deck
        const u = clamp01(t / e.tuning.staggerTime);
        const wob = Math.sin(t * 12) * 0.06 * (1 - u);
        T[HIPS_Y] = -0.85;
        T[HIPL_X] = 1.35;
        T[KNEEL_X] = -1.6;
        T[HIPR_X] = -0.3;
        T[KNEER_X] = -1.5;
        T[SPINE_X] = -0.75 + wob;
        T[NECK_X] = -0.35;
        T[SHL_X] = 0.6;
        T[SHR_X] = 0.75;
        T[SHL_Z] = -0.15;
        T[SHR_Z] = 0.15;
        T[CLUB_X] = -1.35;
        return u < 0.8 ? 10 : 3;
      }
      case 'dead': {
        const fall = e.tuning.deathFall;
        const u = clamp01(t / fall);
        const g = u * u;
        T[BODY_X] = 1.42 * g; // topples backward
        T[BODY_Z] = 0.1 * g;
        T[SPINE_X] = 0.1;
        T[NECK_X] = 0.5;
        T[SHL_Z] = -1.3;
        T[SHR_Z] = 1.3;
        T[HIPL_X] = T[HIPR_X] = 0.6;
        const sinkStart = fall + e.tuning.corpseTime;
        this.sink = t > sinkStart ? Math.min(2.5, ((t - sinkStart) / e.tuning.sinkTime) * 2.5) : 0;
        return 12;
      }
    }
    return 6;
  }
}
