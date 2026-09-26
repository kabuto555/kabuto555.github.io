/**
 * Sumo power-ups that pop into the ring every now and then:
 *
 *   bomb          touch it and it explodes, blasting everyone nearby outward
 *   spicy pepper  eat it and your bumps hit much harder for a while (you're on fire)
 *
 * This module owns the pickups (spawning, bobbing, despawn blink, touch
 * test) plus their effects' visuals — the blast shockwave and the pooled fire
 * particles. What an item actually does to the chonks lives in sumo.ts.
 */

import { asDecal } from '../materials';

type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Scene = InstanceType<typeof THREE.Scene>;
type Sprite = InstanceType<typeof THREE.Sprite>;
type SpriteMaterial = InstanceType<typeof THREE.SpriteMaterial>;

export type ItemKind = 'bomb' | 'pepper';

const SPAWN_EVERY: readonly [number, number] = [5, 9]; // seconds between spawns
const FIRST_SPAWN: readonly [number, number] = [3, 5]; // seconds after GO
const MAX_ITEMS = 2;           // on the ring at once
const LIFE = 12;               // seconds before an untouched item vanishes
const BLINK = 2;               // ...blinking for this long first
const ITEM_SCALE = 1.7;        // drawn big enough to read from the high sumo camera
const ITEM_R = 0.65 * ITEM_SCALE; // touch radius (world)
const POP_IN = 0.35;           // spawn scale-up time
const BOMB_CHANCE = 0.45;

export interface Item {
  kind: ItemKind;
  x: number;
  z: number;
  age: number;
  mesh: Group;
  live: boolean;
}

export interface RingInfo { cx: number; cz: number; R: number; topY: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function softDot(): InstanceType<typeof THREE.Texture> {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const std = (color: number, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, emissive, emissiveIntensity: ei });

function buildBomb(dot: InstanceType<typeof THREE.Texture>): Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), std(0x2b2d36, 0x110000, 0.2));
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 12), std(0x8a8f99));
  cap.position.y = 1.26;
  g.add(cap);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6), std(0xc9a26b));
  fuse.position.set(0.08, 1.48, 0);
  fuse.rotation.z = -0.4;
  g.add(fuse);
  // Flickering spark on the fuse tip.
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dot, color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  spark.name = 'spark';
  spark.position.set(0.16, 1.68, 0);
  spark.scale.setScalar(0.6);
  g.add(spark);
  return g;
}

/** One continuous chilli: a lathed, tapering profile (round shoulder → pointy
 * tip), bent along a circular arc so it curls — no separate segments. */
function pepperGeometry(): InstanceType<typeof THREE.LatheGeometry> {
  const L = 1.35, R = 0.32, BEND_R = 1.15; // length, max radius, bend radius
  // Profile from tip (y=0) to shoulder (y=L): fattens quickly, then a rounded top.
  const pts: InstanceType<typeof THREE.Vector2>[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const body = Math.pow(t, 0.55);                                  // pointy tip, plump body
    const dome = t > 0.78 ? Math.sqrt(Math.max(0, 1 - ((t - 0.78) / 0.22) ** 2)) : 1; // shoulder rounds shut
    pts.push(new THREE.Vector2(Math.max(0.002, R * body * dome), t * L));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  // Bend: distance down from the shoulder (s = L − y) maps onto an arc curling toward +x.
  const pos = g.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = (L - y) / BEND_R;
    const px = BEND_R - BEND_R * Math.cos(th), py = L - BEND_R * Math.sin(th);
    // Offset off the spine along its in-plane normal (cos θ, sin θ); z is untouched.
    pos.setXYZ(i, px + x * Math.cos(th), py + x * Math.sin(th), z);
  }
  g.computeVertexNormals();
  return g;
}

function buildPepper(dot: InstanceType<typeof THREE.Texture>): Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const chilli = new THREE.Mesh(pepperGeometry(), std(0xe02a1c, 0x5a0800, 0.5));
  chilli.castShadow = true;
  body.add(chilli);
  // Green cap hugging the shoulder, and a little stem curling off it.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10), std(0x3fa33a));
  cap.scale.set(1, 0.42, 1);
  cap.position.y = 1.3;
  body.add(cap);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.32, 8), std(0x3a8f35));
  stem.position.set(-0.05, 1.5, 0);
  stem.rotation.z = 0.35;
  body.add(stem);
  // Lift it and tip it so the curl reads from above (centred over its shadow).
  body.position.set(-0.25, 0.1, 0);
  body.rotation.z = 0.25;
  g.add(body);
  // Warm glow behind it so it reads as "hot" from the high camera.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dot, color: 0xff6a20, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.y = 0.8;
  glow.scale.setScalar(2.2);
  g.add(glow);
  return g;
}

// ── Fire particles (spicy chonks) ────────────────────────────────────────────
interface Flame { sp: Sprite; life: number; age: number; vx: number; vy: number; vz: number; size: number }
const FIRE_HOT = new THREE.Color(0xfff07a);
const FIRE_MID = new THREE.Color(0xff8a1e);
const FIRE_END = new THREE.Color(0xd4200c);

class FireFx {
  private readonly pool: Flame[] = [];
  private next = 0;
  private readonly c = new THREE.Color();

  constructor(scene: Scene, dot: InstanceType<typeof THREE.Texture>) {
    for (let i = 0; i < 220; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      }));
      sp.visible = false;
      sp.renderOrder = 6;
      scene.add(sp);
      this.pool.push({ sp, life: 0, age: 0, vx: 0, vy: 0, vz: 0, size: 1 });
    }
  }

  /** Emit flames licking up a body at (x, footY, z) of radius r / height h for `dt`. */
  emit(x: number, footY: number, z: number, r: number, h: number, dt: number): void {
    const n = Math.min(6, Math.floor(dt * 120 + Math.random()));
    for (let k = 0; k < n; k++) {
      const f = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random());
      f.sp.position.set(x + Math.cos(a) * rr, footY + Math.random() * h * 0.8, z + Math.sin(a) * rr);
      f.vx = Math.cos(a) * 0.5; f.vz = Math.sin(a) * 0.5; f.vy = rand(2.8, 4.4);
      f.age = 0; f.life = rand(0.4, 0.7); f.size = rand(1.0, 1.7) * r;
      f.sp.visible = true;
    }
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.sp.visible) continue;
      f.age += dt;
      const u = f.age / f.life;
      if (u >= 1) { f.sp.visible = false; continue; }
      f.sp.position.x += f.vx * dt; f.sp.position.y += f.vy * dt; f.sp.position.z += f.vz * dt;
      const m = f.sp.material as SpriteMaterial;
      if (u < 0.4) this.c.copy(FIRE_HOT).lerp(FIRE_MID, u / 0.4);
      else this.c.copy(FIRE_MID).lerp(FIRE_END, (u - 0.4) / 0.6);
      m.color.copy(this.c);
      m.opacity = (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85) * 0.9;
      f.sp.scale.setScalar(f.size * (1 - 0.55 * u));
    }
  }

  clear(): void { for (const f of this.pool) f.sp.visible = false; }
}

// ── Blast shockwave ──────────────────────────────────────────────────────────
interface Blast { ring: Mesh; flash: Sprite; t: number; radius: number }
const BLAST_TIME = 0.55;

export class SumoItems {
  readonly items: Item[] = [];
  readonly fire: FireFx;
  private readonly blasts: Blast[] = [];
  private spawnIn = 0;
  private clock = 0;

  constructor(scene: Scene) {
    const dot = softDot();
    for (let i = 0; i < MAX_ITEMS; i++) {
      for (const kind of ['bomb', 'pepper'] as const) {
        const mesh = kind === 'bomb' ? buildBomb(dot) : buildPepper(dot);
        mesh.visible = false;
        scene.add(mesh);
        this.items.push({ kind, x: 0, z: 0, age: 0, mesh, live: false });
      }
    }
    this.fire = new FireFx(scene, dot);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
        asDecal(new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false })),
      );
      ring.visible = false;
      ring.renderOrder = 6;
      scene.add(ring);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      }));
      flash.visible = false;
      flash.renderOrder = 7;
      scene.add(flash);
      this.blasts.push({ ring, flash, t: BLAST_TIME, radius: 1 });
    }
  }

  /** New match: clear the ring and restart the spawn clock. */
  reset(): void {
    for (const it of this.items) { it.live = false; it.mesh.visible = false; }
    this.spawnIn = rand(...FIRST_SPAWN);
    this.fire.clear();
  }

  /** The live pickups (for the AI). */
  live(): Item[] { return this.items.filter((i) => i.live); }

  /**
   * Spawns (while `fighting`) and animates items. `clear(x, z, r)` says whether a
   * spot is free (no chonk / obstacle there) for a new item.
   */
  update(dt: number, ring: RingInfo, fighting: boolean, clear: (x: number, z: number, r: number) => boolean): void {
    this.clock += dt;
    if (fighting && (this.spawnIn -= dt) <= 0) {
      this.spawnIn = rand(...SPAWN_EVERY);
      this.spawn(ring, clear);
    }
    for (const it of this.items) {
      if (!it.live) continue;
      it.age += dt;
      if (it.age >= LIFE) { it.live = false; it.mesh.visible = false; continue; }
      const pop = Math.min(1, it.age / POP_IN);
      const q = pop - 1; // ease-out-back: overshoots a little, then settles
      it.mesh.scale.setScalar(ITEM_SCALE * Math.max(0.01, 1 + 2.70158 * q * q * q + 1.70158 * q * q));
      it.mesh.position.set(it.x, ring.topY + 0.15 + 0.18 * Math.sin(this.clock * 3 + it.x), it.z);
      it.mesh.rotation.y += dt * (it.kind === 'pepper' ? 1.6 : 0.6);
      // Blink before vanishing.
      it.mesh.visible = it.age < LIFE - BLINK || Math.floor(it.age * 8) % 2 === 0;
      if (it.kind === 'bomb') {
        const spark = it.mesh.getObjectByName('spark') as Sprite | undefined;
        if (spark) spark.scale.setScalar(0.45 + 0.35 * Math.random());
      }
    }
    for (const b of this.blasts) {
      if (b.t >= BLAST_TIME) continue;
      b.t += dt;
      const u = Math.min(1, b.t / BLAST_TIME);
      const e = 1 - Math.pow(1 - u, 3);
      b.ring.scale.setScalar(Math.max(0.01, b.radius * e));
      (b.ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = 0.9 * (1 - u);
      const fm = b.flash.material as SpriteMaterial;
      fm.opacity = Math.max(0, 1 - u * 2.2);
      b.flash.scale.setScalar(2 + b.radius * 0.9 * e);
      if (u >= 1) { b.ring.visible = false; b.flash.visible = false; }
    }
    this.fire.update(dt);
  }

  /** Debug: drop a `kind` item at (x, z) right now (reuses a live one if the pool is full). */
  place(kind: ItemKind, x: number, z: number): void {
    const it = this.items.find((i) => !i.live && i.kind === kind) ?? this.items.find((i) => i.kind === kind)!;
    it.x = x; it.z = z; it.age = 0; it.live = true;
    it.mesh.visible = true;
    it.mesh.scale.setScalar(0.01);
  }

  private spawn(ring: RingInfo, clear: (x: number, z: number, r: number) => boolean): void {
    const live = this.items.filter((i) => i.live).length;
    if (live >= MAX_ITEMS) return;
    const kind: ItemKind = Math.random() < BOMB_CHANCE ? 'bomb' : 'pepper';
    const it = this.items.find((i) => !i.live && i.kind === kind);
    if (!it) return;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ring.R * 0.72;
      const x = ring.cx + Math.cos(a) * r, z = ring.cz + Math.sin(a) * r;
      if (!clear(x, z, ITEM_R + 0.8) || this.items.some((o) => o.live && Math.hypot(o.x - x, o.z - z) < 3)) continue;
      it.x = x; it.z = z; it.age = 0; it.live = true;
      it.mesh.visible = true;
      it.mesh.scale.setScalar(0.01);
      return;
    }
  }

  /** The item a chonk (circle x,z,r) is touching, removed from the ring — or null. */
  take(x: number, z: number, r: number): Item | null {
    for (const it of this.items) {
      if (!it.live || it.age < POP_IN * 0.5) continue;
      if (Math.hypot(it.x - x, it.z - z) < r + ITEM_R) {
        it.live = false;
        it.mesh.visible = false;
        return it;
      }
    }
    return null;
  }

  /** Shockwave + flash at a blast point, growing out to `radius`. */
  explode(x: number, y: number, z: number, radius: number): void {
    const b = this.blasts.find((q) => q.t >= BLAST_TIME) ?? this.blasts[0];
    b.t = 0;
    b.radius = radius;
    b.ring.position.set(x, y + 0.05, z);
    b.ring.scale.setScalar(0.01);
    b.ring.visible = true;
    b.flash.position.set(x, y + 1, z);
    b.flash.visible = true;
  }
}
