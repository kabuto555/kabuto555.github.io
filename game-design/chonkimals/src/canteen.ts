// The Canteen — the camp's storefront: a clay snack shack on the grass west of the
// entrance plaza (the first building you see on arrival), with Counselor Crumbs
// behind the serving window. Walking up floats two buttons (a gate in main.ts):
//   "Browse Shop"       → the Shop (pony beads + the golden-pinecone packs)
//   "Get Care Package"  → the Camp Care Package gacha screen
//
// Built at runtime from clay primitives (no GLB) as a child of the camp chunk, so it
// shares the camp's WORLD_SCALE. Call `Canteen.build()` right after the world loads —
// before bots cache ground heights — so its invisible collider is in place; it's added
// to the walkable list, and at 4.2 u tall it reads as a wall to the step test.

import { CampNpc } from './npc';
import { COUNSELOR } from './bots/appearance';
import type { ChatService } from './chat/chat-service';
import { buildCarePackage, clay, roundedBox } from './care-package/box-model';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Camera = import('three').Camera;
type Scene = import('three').Scene;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export const CANTEEN = {
  chunk: 'chunk_0_camp',
  /** Camp-local (build_camp.py units): west of the plaza, between the fence and the lake. */
  at: { x: -18.8, z: 11.7 }, // moved 3.5 toward the gate to make room for the Mail + Bulletin Board corner
  /** Serving window faces +x (the plaza / spawn). */
  yaw: Math.PI / 2,
  /** Buttons show within this distance (world) of the building's footprint… */
  reach: 2.6,
  /** …measured from the front, where you queue at the window. */
  queueOut: 2.2,
  colors: {
    wall: 0xf3dfbf, trim: 0x8a5a3a, floor: 0x9c6b45, roof: 0xe2574c, roofEdge: 0xb8403a,
    awningA: 0xf06a5e, awningB: 0xfff4e2, counter: 0xc98f5a, inside: 0x8c6448, shelf: 0x7a5234,
  },
  npc: { name: 'Counselor Crumbs', tag: '<Canteen>', species: COUNSELOR.species, scale: COUNSELOR.scale },
  /** Local height of the counselor's feet (deck top is 0.3). */
  npcRiser: 0.95,
};

const JAR_COLORS = [0xff7ab6, 0x7fd3ff, 0xffd23f, 0x9b7bff, 0x6fe0a4, 0xff9f5a];

export class Canteen {
  /** Invisible collision box(es) for the walkable list. */
  readonly colliders: Mesh[] = [];
  /** Where "go to the canteen" drops the player (queueing at the window). */
  readonly gatePoint = new THREE.Vector3();
  private readonly min = new THREE.Vector3();
  private readonly max = new THREE.Vector3();
  private readonly front = new THREE.Vector3();
  private npc: CampNpc | null = null;
  private npcAt = new THREE.Vector3();
  private npcFacing = 0;
  private sign: Group | null = null;
  private t = 0;

  private constructor(private readonly root: Group) {}

  /** Builds the shack in the camp. Returns null if the camp chunk isn't there. */
  static build(stageRoot: Object3D): Canteen | null {
    const chunk = stageRoot.getObjectByName(CANTEEN.chunk);
    if (!chunk) return null;
    const g = new THREE.Group();
    g.name = 'canteen';
    g.position.set(CANTEEN.at.x, 0, CANTEEN.at.z);
    g.rotation.y = CANTEEN.yaw;
    chunk.add(g);
    const c = new Canteen(g);
    c.assemble();
    g.updateMatrixWorld(true);

    // Collider over the whole footprint (local frame, front = +z).
    const col = new THREE.Mesh(new THREE.BoxGeometry(7.2, 4.2, 6.0), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    col.name = 'canteen_collider';
    col.position.set(0, 2.1, 0.05);
    col.visible = false; // collision only (raycasts still hit invisible meshes)
    g.add(col);
    col.updateMatrixWorld(true);
    c.colliders.push(col);

    const box = new THREE.Box3().setFromObject(col);
    c.min.copy(box.min);
    c.max.copy(box.max);
    // World-space front direction + the queue spot in front of the window.
    c.front.set(0, 0, 1).transformDirection(g.matrixWorld).setY(0).normalize();
    const faceLocal = g.localToWorld(new THREE.Vector3(0, 0, 3.0));
    c.gatePoint.copy(faceLocal).addScaledVector(c.front, CANTEEN.queueOut).setY(box.min.y);
    // The counselor stands on a riser behind the counter so they're seen from the waist up.
    c.npcAt.copy(g.localToWorld(new THREE.Vector3(0, CANTEEN.npcRiser, 1.55)));
    c.npcFacing = Math.atan2(c.front.x, c.front.z);
    return c;
  }

  /** Posts the counselor behind the window (async: loads the character model). */
  async addCounselor(scene: Scene, container: HTMLElement, chat: ChatService): Promise<void> {
    this.npc = await CampNpc.create(scene, container, chat, {
      id: 'canteen', name: CANTEEN.npc.name, tag: CANTEEN.npc.tag,
      species: CANTEEN.npc.species, scale: CANTEEN.npc.scale, position: this.npcAt, facing: this.npcFacing,
      greetLine: 'Snacks, gear & Care Packages! 📦', greetRadius: 10, rearmRadius: 15, lookRadius: 14,
    });
  }

  /** XZ distance from `p` to the building's footprint. */
  distance(p: Vector3): number {
    const dx = Math.max(this.min.x - p.x, 0, p.x - this.max.x);
    const dz = Math.max(this.min.z - p.z, 0, p.z - this.max.z);
    return Math.hypot(dx, dz);
  }

  get reach(): number { return CANTEEN.reach; }

  /** A spot out in the plaza facing the window (dev `?goto=canteenView`). */
  viewPoint(out: Vector3): Vector3 { return out.copy(this.gatePoint).addScaledVector(this.front, 9); }
  /** Camera heading that sits the camera on the plaza side, looking at the building. */
  get frontHeading(): number { return Math.atan2(this.front.x, this.front.z); }

  update(dt: number, camera: Camera, player: Vector3 | null, busy: boolean): void {
    this.t += dt;
    if (this.sign) this.sign.rotation.z = Math.sin(this.t * 1.6) * 0.025;
    this.npc?.update(dt, camera, player, busy);
  }

  say(text: string): void { this.npc?.say(text); }

  // ── Geometry (local frame: serving window faces +z, ground at y = 0) ─────────
  private assemble(): void {
    const C = CANTEEN.colors;
    const g = this.root;
    const add = (m: Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const rb = (w: number, h: number, d: number, r: number, color: number) => new THREE.Mesh(roundedBox(w, h, d, r, 3), clay(color));

    const W = 6.4, D = 4.8, H = 3.0, T = 0.34, FLOOR = 0.3;
    // Deck + walls.
    add(rb(W + 0.6, FLOOR, D + 0.9, 0.12, C.floor), 0, FLOOR / 2, 0.2);
    add(rb(W, H, T, 0.12, C.wall), 0, FLOOR + H / 2, -D / 2);
    for (const s of [-1, 1]) add(rb(T, H, D, 0.12, C.wall), s * (W / 2 - T / 2), FLOOR + H / 2, 0);
    // Front wall around the serving window (x ±2.3, y 1.45…2.6).
    const sill = 1.45, lintel = 2.6;
    add(rb(W, sill - FLOOR, T, 0.1, C.wall), 0, FLOOR + (sill - FLOOR) / 2, D / 2);
    add(rb(W, FLOOR + H - lintel, T, 0.1, C.wall), 0, lintel + (FLOOR + H - lintel) / 2, D / 2);
    for (const s of [-1, 1]) add(rb(0.9, lintel - sill, T, 0.08, C.wall), s * 2.75, (sill + lintel) / 2, D / 2);
    // Corner posts + window trim.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(rb(0.42, H + 0.1, 0.42, 0.1, C.trim), sx * (W / 2), FLOOR + H / 2, sz * (D / 2));
    }
    add(rb(4.9, 0.16, 0.5, 0.06, C.trim), 0, lintel + 0.06, D / 2 + 0.05);
    // Counter shelf poking out under the window.
    add(rb(5.1, 0.18, 1.0, 0.07, C.counter), 0, sill, D / 2 + 0.3);
    for (const s of [-1, 1]) add(rb(0.16, 0.5, 0.16, 0.05, C.trim), s * 2.2, sill - 0.32, D / 2 + 0.62).rotation.x = -0.5;

    // Riser the counselor stands on (hidden behind the counter front).
    add(rb(1.6, CANTEEN.npcRiser - FLOOR, 1.2, 0.08, C.shelf), 0, FLOOR + (CANTEEN.npcRiser - FLOOR) / 2, 1.55);
    // Interior: warm dark back wall, shelves of candy jars, a menu board.
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.7, H - 0.2), clay(C.inside, 0.95));
    add(inside, 0, FLOOR + H / 2, -D / 2 + T / 2 + 0.01);
    for (const sy of [1.55, 2.25]) {
      add(rb(W - 1.0, 0.1, 0.45, 0.04, C.shelf), 0, sy, -D / 2 + 0.45);
      for (let i = 0; i < 7; i++) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 14),
          new THREE.MeshStandardMaterial({ color: JAR_COLORS[(i + (sy > 2 ? 3 : 0)) % JAR_COLORS.length], roughness: 0.35 }));
        add(jar, -2.1 + i * 0.7, sy + 0.22, -D / 2 + 0.45);
        add(rb(0.34, 0.08, 0.34, 0.03, 0xfff4e2), -2.1 + i * 0.7, sy + 0.42, -D / 2 + 0.45);
      }
    }
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7),
      new THREE.MeshStandardMaterial({ map: signTexture('CARE PACKAGES', '#2f3a33', '#fff4e2', 58, '#ffd23f'), roughness: 0.9 }));
    add(menu, 0, 2.85, -D / 2 + T / 2 + 0.02);
    // A care package on the counter, and a little stack out front.
    const onCounter = buildCarePackage().root;
    onCounter.scale.setScalar(0.42);
    onCounter.position.set(1.65, sill + 0.09, D / 2 + 0.35);
    onCounter.rotation.y = -0.35;
    g.add(onCounter);
    for (const [x, y, z, s, r] of [[-4.3, 0, 2.6, 0.62, 0.2], [-4.1, 0.62, 2.55, 0.5, -0.3], [-4.45, 0, 1.6, 0.5, 0.5]] as const) {
      const p = buildCarePackage().root;
      p.scale.setScalar(s);
      p.position.set(x, y, z);
      p.rotation.y = r;
      g.add(p);
    }

    // Gable roof (ridge along x) with a thick rim.
    const rise = 1.35, half = D / 2 + 0.8;
    const slope = Math.atan2(rise, half);
    const len = Math.hypot(rise, half);
    for (const s of [-1, 1]) {
      const slab = rb(W + 1.2, 0.26, len + 0.1, 0.1, C.roof);
      add(slab, 0, FLOOR + H + rise / 2 + 0.05, s * half / 2).rotation.x = s * slope;
      const rim = rb(W + 1.3, 0.2, 0.3, 0.08, C.roofEdge);
      add(rim, 0, FLOOR + H - 0.02, s * (half - 0.05));
    }
    // Gable ends.
    for (const s of [-1, 1]) {
      const tri = new THREE.Shape();
      tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, rise); tri.closePath();
      const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), clay(C.wall));
      gable.rotation.y = Math.PI / 2;
      add(gable, s * (W / 2) - 0.1, FLOOR + H, 0);
    }

    // Striped awning over the window.
    const stripes = 9, aw = 5.6 / stripes;
    for (let i = 0; i < stripes; i++) {
      const st = rb(aw + 0.02, 0.1, 1.5, 0.04, i % 2 ? C.awningB : C.awningA);
      add(st, -2.8 + aw / 2 + i * aw, lintel + 0.45, D / 2 + 0.7).rotation.x = 0.42;
      // Scalloped edge.
      const sc = new THREE.Mesh(new THREE.SphereGeometry(aw * 0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), clay(i % 2 ? C.awningB : C.awningA));
      sc.rotation.x = Math.PI;
      add(sc, -2.8 + aw / 2 + i * aw, lintel + 0.16, D / 2 + 1.38);
    }

    // Hanging "CANTEEN" sign on the roof front.
    const sign = new THREE.Group();
    sign.position.set(0, FLOOR + H + rise + 0.15, 0.35);
    const board = new THREE.Mesh(roundedBox(3.9, 1.05, 0.2, 0.08, 3), clay(C.trim));
    board.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.82),
      new THREE.MeshStandardMaterial({ map: signTexture('CANTEEN', '#fff4e2', '#b8403a', 150), roughness: 0.85,
        emissive: 0xffffff, emissiveIntensity: 0.12 }));
    (face.material as InstanceType<typeof THREE.MeshStandardMaterial>).emissiveMap =
      (face.material as InstanceType<typeof THREE.MeshStandardMaterial>).map;
    face.position.z = 0.11;
    board.add(face);
    board.position.y = 0.75;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), clay(C.trim));
      post.position.set(s * 1.5, 0.12, 0);
      sign.add(post);
    }
    sign.add(board);
    g.add(sign);
    sign.traverse((o) => { o.userData.noBatch = true; }); // it sways
    this.sign = sign;

    // A-frame board out front: today's special.
    const easel = new THREE.Group();
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(roundedBox(1.1, 1.5, 0.08, 0.04, 2), clay(C.trim));
      leg.position.set(0, 0.72, s * 0.22);
      leg.rotation.x = s * 0.28;
      easel.add(leg);
      const chalk = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2),
        new THREE.MeshStandardMaterial({ map: chalkTexture(), roughness: 0.95 }));
      chalk.position.set(0, 0.74, s * 0.27);
      chalk.rotation.set(s * 0.28, s > 0 ? 0 : Math.PI, 0);
      easel.add(chalk);
    }
    easel.traverse((o) => { o.castShadow = true; });
    easel.position.set(3.9, 0, 3.2);
    easel.rotation.y = 0.5;
    g.add(easel);
  }
}

/** Painted plank lettering (optionally with an underline swoosh). */
function signTexture(text: string, bg: string, ink: string, size: number, accent?: string): InstanceType<typeof THREE.CanvasTexture> {
  const W = 1024, H = Math.round(W * 0.23);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px 'Fredoka', system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillText(text, W / 2 + 5, H / 2 + 8);
  ctx.fillStyle = ink;
  ctx.fillText(text, W / 2, H / 2 + 2);
  if (accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W * 0.22, H * 0.84);
    ctx.quadraticCurveTo(W / 2, H * 0.96, W * 0.78, H * 0.84);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Chalkboard: "TODAY: CARE PACKAGES!" with a doodled box. */
function chalkTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const W = 384, H = 512;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2f3a33';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c89060';
  ctx.lineWidth = 22;
  ctx.strokeRect(0, 0, W, H);
  ctx.fillStyle = '#fff4e2';
  ctx.textAlign = 'center';
  ctx.font = "700 44px 'Fredoka', system-ui, sans-serif";
  ctx.fillText('TODAY', W / 2, 78);
  ctx.font = "600 38px 'Fredoka', system-ui, sans-serif";
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('CARE', W / 2, 330);
  ctx.fillText('PACKAGES!', W / 2, 376);
  ctx.fillStyle = '#ff9fc8';
  ctx.font = "600 30px 'Fredoka', system-ui, sans-serif";
  ctx.fillText('rare chonks inside?!', W / 2, 440);
  // Doodled box.
  ctx.strokeStyle = '#fff4e2';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeRect(122, 170, 140, 100);
  ctx.strokeRect(112, 146, 160, 28);
  ctx.beginPath(); ctx.moveTo(192, 146); ctx.lineTo(192, 270); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(172, 132, 20, 12, -0.4, 0, Math.PI * 2); ctx.ellipse(212, 132, 20, 12, 0.4, 0, Math.PI * 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
