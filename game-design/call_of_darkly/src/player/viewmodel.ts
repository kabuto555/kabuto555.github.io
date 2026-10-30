import * as THREE from 'three';
import type { GunDef, MeleeDef, ShieldDef } from '../data/types';
import { WEAPONS } from '../data/weapons';
import { makeBoxGeometry, makePs1Material } from '../render';
import { getTexture } from '../render/textures';
import { makeStarTexture } from '../fx/tex';

const FLASH_SIZE: Record<string, number> = { pistol: 0.13, revolver: 0.17, smg: 0.16, ar: 0.2, lmg: 0.24, marksman: 0.22, shotgun: 0.3, launcher: 0.3 };
let starTex: THREE.Texture | null = null;
function starTexture(): THREE.Texture {
  return (starTex ??= makeStarTexture());
}

/** Everything the viewmodel needs per frame (plain data; CombatSystem fills it). */
export interface ViewmodelState {
  gunId: string | null;
  leftId: string | null;
  /** 0..1 ADS blend. */
  adsT: number;
  /** 0..1 reload progress, -1 when not reloading. */
  reloadT: number;
  /** 0 = gun fully lowered .. 1 = raised (right-hand swap). */
  raise: number;
  /** Left-hand raise (swap). */
  leftRaise: number;
  /** 0..1 shield raise. */
  blockT: number;
  /** -1 none, else 0..1 swing progress. */
  swingT: number;
  sprinting: boolean;
  /** Horizontal speed m/s. */
  speed: number;
  /** Increments per shot (kick + muzzle flash trigger). */
  shotCount: number;
  /** Camera yaw/pitch (rad) for sway. */
  yaw: number;
  pitch: number;
  /** FOV zoom factor (>1 = zoomed in); the viewmodel scales by 1/zoom to keep its apparent size. */
  zoom: number;
}

export function newViewmodelState(): ViewmodelState {
  return { gunId: null, leftId: null, adsT: 0, reloadT: -1, raise: 1, leftRaise: 1, blockT: 0, swingT: -1, sprinting: false, speed: 0, shotCount: 0, yaw: 0, pitch: 0, zoom: 1 };
}

// ------------------------------------------------------------------ model building

interface Model {
  root: THREE.Group;
  /** Moving mag for the reload animation (guns). */
  mag?: THREE.Object3D;
  magY?: number;
  flash?: THREE.Object3D;
}

type Tex = 'metal' | 'wood' | 'stone' | null;

const matCache = new Map<string, THREE.Material>();
function mat(color: number, tex: Tex, opacity: number): THREE.Material {
  const k = `${color}:${tex}:${opacity}`;
  let m = matCache.get(k);
  if (!m) {
    m = makePs1Material({
      map: tex ? getTexture(tex, 32, 7) : null,
      color,
      // The dark 'metal' texture x a mid-grey colour rendered the gun near-black against the ground
      // (the actual cause of the "invisible gun"): lift every part with a dim self-lit floor.
      emissive: new THREE.Color(color).multiplyScalar(0.55),
      snap: false, // viewmodel parts must not swim against the camera
      transparent: opacity < 1,
      opacity,
    });
    m.depthTest = false; // drawn over the world (no wall clipping); painter's order set per part
    m.depthWrite = false;
    matCache.set(k, m);
  }
  return m;
}

const SKIN = 0xd09a70;
const GLOVE = 0x4a5040;

class Builder {
  readonly root = new THREE.Group();
  private parts: THREE.Mesh[] = [];
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, tex: Tex = 'metal', opacity = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(makeBoxGeometry(w, h, d, { tile: 0.25, maxSegment: 0 }), mat(color, tex, opacity));
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    this.parts.push(mesh);
    return mesh;
  }
  /** Painter's order: farthest (most -z) first; hands are added last so they sort by z too. */
  finish(base = 1000): THREE.Group {
    this.parts.sort((a, b) => a.position.z - b.position.z);
    this.parts.forEach((p, i) => {
      p.renderOrder = base + i;
      p.frustumCulled = false;
    });
    return this.root;
  }
}

/** Gun origin = sight line / bore axis point above the receiver; muzzle toward -Z. */
function buildGun(def: GunDef): Model {
  const b = new Builder();
  const dark = 0x8a8f9a;
  const mid = 0xb4bac4;
  const cls = def.class;
  let mag: THREE.Object3D | undefined;
  let muzzleZ = -0.5;
  if (cls === 'pistol' || cls === 'revolver') {
    const rev = cls === 'revolver';
    b.box(0.04, 0.045, 0.2, 0, -0.045, -0.06, rev ? 0x555a60 : mid); // slide / barrel
    b.box(0.03, 0.02, 0.02, 0, -0.015, 0.03, dark); // rear sight
    b.box(0.015, 0.02, 0.012, 0, -0.012, -0.15, dark); // front sight
    b.box(0.036, 0.09, 0.05, 0, -0.115, 0.02, 0x4a3828, 'wood'); // grip
    b.box(0.03, 0.012, 0.06, 0, -0.082, -0.01, dark); // trigger guard
    if (rev) b.box(0.052, 0.058, 0.06, 0, -0.05, -0.02, 0x666b72); // cylinder
    else mag = b.box(0.028, 0.03, 0.04, 0, -0.165, 0.02, dark); // mag in grip
    muzzleZ = -0.17;
  } else if (cls === 'shotgun') {
    const dbl = def.fireMode === 'double';
    b.box(0.07, 0.07, 0.34, 0, -0.06, -0.02, 0x4a3828, 'wood'); // receiver
    b.box(0.03, 0.03, 0.55, dbl ? -0.017 : 0, -0.04, -0.4, dark); // barrel(s)
    if (dbl) b.box(0.03, 0.03, 0.55, 0.017, -0.04, -0.4, dark);
    else b.box(0.04, 0.04, 0.32, 0, -0.08, -0.33, 0x4a3828, 'wood'); // pump
    b.box(0.015, 0.02, 0.012, 0, -0.012, -0.64, dark);
    b.box(0.06, 0.1, 0.2, 0, -0.1, 0.25, 0x4a3828, 'wood'); // stock
    muzzleZ = -0.69;
  } else if (cls === 'launcher') {
    b.box(0.09, 0.09, 0.9, 0, -0.07, -0.2, 0x55603f); // tube
    b.box(0.13, 0.13, 0.12, 0, -0.07, -0.68, 0x3a4228); // warhead
    b.box(0.04, 0.12, 0.05, 0, -0.17, 0.0, dark); // grip
    b.box(0.03, 0.05, 0.03, 0, -0.005, -0.1, dark); // sight
    muzzleZ = -0.74;
  } else {
    // ar / smg / lmg / marksman: parametric long gun
    const len = cls === 'smg' ? 0.42 : cls === 'lmg' ? 0.62 : cls === 'marksman' ? 0.72 : 0.56;
    b.box(0.052, 0.075, len, 0, -0.055, -len / 2 + 0.12, mid); // receiver
    b.box(0.022, 0.022, 0.2, 0, -0.045, -len, dark); // barrel
    b.box(0.044, 0.06, 0.16, 0, -0.05, -len + 0.1, 0x787e88); // handguard
    b.box(0.05, 0.1, 0.14, 0, -0.085, 0.2, dark); // stock
    b.box(0.036, 0.1, 0.05, 0, -0.14, 0.08, dark); // pistol grip
    mag = b.box(0.032, cls === 'lmg' ? 0.2 : 0.14, cls === 'lmg' ? 0.14 : 0.05, 0, cls === 'lmg' ? -0.2 : -0.17, -0.06, 0x585c64);
    if (cls === 'marksman') b.box(0.04, 0.05, 0.24, 0, 0.012, -0.05, 0x484e58); // scope
    else {
      b.box(0.012, 0.03, 0.04, 0, -0.005, -0.12, dark); // front sight post
      b.box(0.012, 0.022, 0.03, 0, -0.01, 0.08, dark); // rear sight
    }
    muzzleZ = -len - 0.1;
  }
  // hands (nearest): right on the grip, left under the foregrip
  b.box(0.06, 0.07, 0.09, 0, -0.13, 0.06, SKIN);
  b.box(0.07, 0.07, 0.18, 0.05, -0.16, 0.16, GLOVE);
  if (cls !== 'pistol' && cls !== 'revolver') {
    b.box(0.07, 0.06, 0.1, -0.005, -0.1, -0.22, SKIN);
    b.box(0.08, 0.07, 0.2, -0.06, -0.16, -0.06, GLOVE);
  }
  const root = b.finish();
  // muzzle flash: PS1 star quad facing the camera (viewmodel looks down -Z), rotation randomised per shot
  const flash = new THREE.Group();
  const fm = makePs1Material({ map: starTexture(), color: 0xffffff, lit: false, snap: false, alphaTest: 0.4, side: THREE.DoubleSide });
  fm.depthTest = false;
  fm.depthWrite = false;
  const size = FLASH_SIZE[cls] ?? 0.2;
  const star = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fm);
  star.renderOrder = 2000;
  star.frustumCulled = false;
  flash.add(star);
  flash.userData.baseScale = 1;
  flash.position.set(0, -0.045, muzzleZ);
  flash.visible = false;
  root.add(flash);
  const out: Model = { root, flash };
  if (mag) {
    out.mag = mag;
    out.magY = mag.position.y;
  }
  return out;
}

function buildLeft(def: MeleeDef | ShieldDef): Model {
  const b = new Builder();
  if (def.class === 'shield') {
    if (def.blockPhys >= 0.99) {
      b.box(0.62, 0.78, 0.025, 0, 0, 0, 0x9ab8cc, null, 0.55); // translucent riot plate
      b.box(0.66, 0.05, 0.04, 0, 0.4, 0, 0x2c3036);
      b.box(0.66, 0.05, 0.04, 0, -0.4, 0, 0x2c3036);
      b.box(0.05, 0.78, 0.04, -0.32, 0, 0, 0x2c3036);
      b.box(0.05, 0.78, 0.04, 0.32, 0, 0, 0x2c3036);
    } else {
      b.box(0.36, 0.46, 0.03, 0, 0, 0, 0x30353a); // opaque ballistic plate
      b.box(0.14, 0.06, 0.04, 0, 0.1, -0.03, 0x1e2226); // viewport slit
      b.box(0.38, 0.04, 0.04, 0, 0.24, 0, 0x4a5058);
    }
    b.box(0.08, 0.08, 0.12, 0, -0.02, 0.1, SKIN); // fist gripping
    b.box(0.09, 0.08, 0.32, 0, -0.1, 0.3, GLOVE);
    return { root: b.finish() };
  }
  const knife = def.id.includes('knife');
  const len = def.reach > 2 ? 1.1 : knife ? 0.2 : 0.3;
  b.box(knife ? 0.012 : 0.03, knife ? 0.04 : 0.1, len, 0, 0, -len / 2 - 0.04, knife ? 0xc8ccd0 : 0x9aa0a6); // blade
  b.box(0.03, 0.03, 0.12, 0, 0, 0.02, 0x2a2420, 'wood'); // handle
  b.box(0.06, 0.012, 0.012, 0, 0, -0.045, 0x2a2e32); // guard
  b.box(0.06, 0.06, 0.09, 0, -0.005, 0.03, SKIN);
  b.box(0.08, 0.08, 0.34, 0, -0.05, 0.26, GLOVE);
  return { root: b.finish() };
}

// ------------------------------------------------------------------ poses

const HIP = new THREE.Vector3(0.16, -0.06, -0.34);
const ADS_POS = new THREE.Vector3(0, -0.004, -0.3); // gun origin (sight line) sits on the crosshair
const ease = (t: number) => t * t * (3 - 2 * t);

/** Viewmodel root; parent it to the camera (and add the camera to the scene). */
export class Viewmodel {
  readonly group = new THREE.Group();
  private readonly right = new THREE.Group();
  private readonly left = new THREE.Group();
  private readonly gunModels = new Map<string, Model>();
  private readonly leftModels = new Map<string, Model>();
  private curGun: Model | null = null;
  private curLeft: Model | null = null;
  private curGunId: string | null = null;
  private curLeftId: string | null = null;
  private kick = 0;
  private lastShot = 0;
  private flashFrames = 0;
  private kickRoll = 0;
  private kickLift = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private sprintBlend = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;

  constructor() {
    this.group.name = 'viewmodel';
    this.right.scale.setScalar(0.42); // viewmodel guns are drawn smaller than life or the receiver fills the screen
    this.left.scale.setScalar(0.6);
    this.group.add(this.right, this.left);
  }

  /** Call once per render frame (after the camera was positioned). */
  update(dt: number, s: ViewmodelState): void {
    this.ensure(s);
    const gun = this.curGun;

    // shot kick / flash
    if (s.shotCount !== this.lastShot) {
      if (s.shotCount > this.lastShot) {
        this.kick = Math.min(1.4, this.kick + 1);
        this.kickRoll = (Math.random() - 0.5) * 0.06;
        this.kickLift = Math.min(1, this.kickLift + 0.6);
        this.flashFrames = 2;
      }
      this.lastShot = s.shotCount;
    }
    this.kick *= Math.exp(-14 * dt);
    this.kickLift *= Math.exp(-9 * dt);
    this.kickRoll *= Math.exp(-12 * dt);
    if (gun?.flash) {
      // 2 render frames, random spin + size jitter
      gun.flash.visible = this.flashFrames > 0;
      if (gun.flash.visible) {
        this.flashFrames--;
        gun.flash.rotation.z = Math.random() * Math.PI * 2;
        gun.flash.scale.setScalar(0.8 + Math.random() * 0.4);
      }
    } else this.flashFrames = 0;

    // bob / sway
    const moving = s.speed > 0.5 ? Math.min(1, s.speed / 4.5) : 0;
    this.bobPhase += s.speed * dt * 2.6;
    this.bobAmp += (moving - this.bobAmp) * Math.min(1, dt * 8);
    this.sprintBlend += ((s.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 9);
    const dyaw = wrap(s.yaw - this.lastYaw);
    const dpitch = s.pitch - this.lastPitch;
    this.lastYaw = s.yaw;
    this.lastPitch = s.pitch;
    this.swayX += (-dyaw * 0.9 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 0.9 - this.swayY) * Math.min(1, dt * 10);
    const swayX = clamp(this.swayX, -0.04, 0.04) * (1 - s.adsT * 0.8);
    const swayY = clamp(this.swayY, -0.04, 0.04) * (1 - s.adsT * 0.8);

    // right hand pose
    const a = ease(s.adsT);
    const p = this.right.position;
    p.lerpVectors(HIP, ADS_POS, a);
    const bobK = (1 - a * 0.9) * this.bobAmp * (1 + this.sprintBlend);
    p.x += Math.sin(this.bobPhase) * 0.012 * bobK + swayX;
    p.y += Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobK - 0.006 * bobK + swayY;
    p.z += this.kick * 0.05 * (1 - a * 0.4);
    p.y += this.kickLift * 0.012 * (1 - a * 0.5);
    let rx = this.kick * 0.07 * (1 - a * 0.4) + this.kickLift * 0.04 * (1 - a * 0.5);
    let rz = this.kickRoll * (1 - a * 0.7);
    p.x += -0.06 * this.sprintBlend;
    p.y += -0.08 * this.sprintBlend;
    rx += -0.35 * this.sprintBlend;
    const ry = 0.55 * this.sprintBlend;
    if (s.reloadT >= 0) {
      const u = s.reloadT;
      const dip = Math.sin(Math.PI * Math.min(1, u * 1.05));
      p.y -= 0.1 * dip * (1 - a * 0.3);
      p.x -= 0.03 * dip;
      rx -= 0.45 * dip;
      rz += 0.55 * dip;
      if (gun?.mag && gun.magY !== undefined) {
        const out = u < 0.35 ? u / 0.35 : u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.15);
        gun.mag.position.y = gun.magY - 0.14 * Math.min(1, out);
      }
    } else if (gun?.mag && gun.magY !== undefined) gun.mag.position.y = gun.magY;
    const low = 1 - s.raise;
    p.y -= 0.35 * low;
    rx -= 0.9 * low;
    this.right.rotation.set(rx + swayY * 1.5, ry + swayX * 1.5, rz);
    this.right.visible = !!gun && s.raise > 0.02;
    this.group.scale.setScalar(1 / Math.max(0.5, s.zoom));

    // left hand pose
    const l = this.left;
    const ld = s.leftId ? (WEAPONS[s.leftId] as ShieldDef | MeleeDef | undefined) : undefined;
    if (this.curLeft && ld) {
      const lw = 1 - s.leftRaise;
      if (ld.class === 'shield') {
        const riot = ld.blockPhys >= 0.99;
        const bt = ease(s.blockT);
        l.position.set(riot ? -0.34 + 0.26 * bt : -0.3 + 0.2 * bt, riot ? -0.42 + 0.4 * bt : -0.3 + 0.28 * bt, -0.44 - 0.1 * bt);
        l.rotation.set(-0.25 * (1 - bt), 0.45 * (1 - bt), 0.12 * (1 - bt));
        l.position.y -= 0.5 * lw;
        l.position.x += this.bobAmp * Math.sin(this.bobPhase) * 0.01;
        l.visible = s.leftRaise > 0.02;
      } else {
        l.position.set(-0.22 + swayX, -0.2 + swayY, -0.36);
        l.rotation.set(0.35, 0.25, 0.35);
        const t = s.swingT;
        if (t >= 0) {
          const wind = t < 0.3 ? ease(t / 0.3) : 1 - ease(Math.min(1, (t - 0.3) / 0.3));
          const slash = t < 0.3 ? 0 : t < 0.65 ? ease((t - 0.3) / 0.35) : 1 - ease((t - 0.65) / 0.35);
          l.position.x += 0.1 * wind + 0.4 * slash;
          l.position.z += 0.1 * wind - 0.16 * slash;
          l.position.y += 0.08 * wind + 0.05 * slash;
          l.rotation.z += -0.7 * wind + 1.7 * slash;
          l.rotation.y += 0.4 * wind - 1.2 * slash;
          l.rotation.x += -0.3 * slash;
        }
        l.position.y -= 0.5 * lw;
        l.position.x += this.bobAmp * Math.sin(this.bobPhase) * 0.01 * (1 - a);
        // out of the way of the sights while ADS (unless mid-swing)
        l.visible = s.leftRaise > 0.02 && (s.adsT < 0.5 || s.swingT >= 0);
      }
    } else l.visible = false;
  }

  private ensure(s: ViewmodelState): void {
    if (s.gunId !== this.curGunId) {
      if (this.curGun) this.right.remove(this.curGun.root);
      this.curGunId = s.gunId;
      this.curGun = null;
      if (s.gunId) {
        let m = this.gunModels.get(s.gunId);
        const d = WEAPONS[s.gunId];
        if (!m && d && d.hand === 'R') this.gunModels.set(s.gunId, (m = buildGun(d as GunDef)));
        if (m) {
          this.right.add(m.root);
          this.curGun = m;
        }
      }
    }
    if (s.leftId !== this.curLeftId) {
      if (this.curLeft) this.left.remove(this.curLeft.root);
      this.curLeftId = s.leftId;
      this.curLeft = null;
      if (s.leftId) {
        let m = this.leftModels.get(s.leftId);
        const d = WEAPONS[s.leftId];
        if (!m && d && d.hand === 'L') this.leftModels.set(s.leftId, (m = buildLeft(d as MeleeDef | ShieldDef)));
        if (m) {
          this.left.add(m.root);
          this.curLeft = m;
        }
      }
    }
  }

  dispose(): void {
    for (const m of [...this.gunModels.values(), ...this.leftModels.values()]) {
      m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mt = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) for (const x of mt) x.dispose();
        else mt?.dispose();
      });
    }
    for (const m of matCache.values()) m.dispose();
    matCache.clear();
    this.gunModels.clear();
    this.leftModels.clear();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrap(a: number): number {
  return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a;
}
