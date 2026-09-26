// Mr Kodak's Photo Booth — a little teal clay booth with a red striped curtain and a
// marquee "PHOTO BOOTH" sign, on the grass just north of the lake path (between the plaza and
// Troop HQ), angled to face the plaza. Mr Kodak (the camp photographer counselor) stands by
// his big old box camera on its tripod; your three newest snapshots hang framed on the
// booth's side, and a bobbing "!" floats over the roof while there are photos you haven't
// seen. Walking up floats a "Post Cards" button (a gate in main.ts) that opens the post card
// screen. Built at runtime as a child of the camp chunk; call `PhotoBooth.build()` before
// bots sample ground heights (it has colliders).

import { CampNpc } from '../npc';
import { COUNSELOR } from '../bots/appearance';
import type { ChatService } from '../chat/chat-service';
import { clay, roundedBox } from '../care-package/box-model';
import { bangTexture } from '../mailbox';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Camera = import('three').Camera;
type Scene = import('three').Scene;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;
type Texture = InstanceType<typeof THREE.Texture>;
type StdMat = InstanceType<typeof THREE.MeshStandardMaterial>;

export const PHOTO_BOOTH = {
  chunk: 'chunk_0_camp',
  /** Camp-local (build_camp.py units): north of the lake path, west of the spine path. */
  at: { x: -7.6, z: 32.6 },
  /** Faces the plaza, so you see it walking in from the gate. */
  faceToward: { x: 0, z: 18 },
  reach: 2.4,
  colors: {
    body: 0x3aa89b, bodyDark: 0x2a7f75, trim: 0xfff4e2, deck: 0x9c6b45, roof: 0xe2574c,
    curtainA: 0xd8403a, curtainB: 0xb02d28, camera: 0x3b3a44, brass: 0xd9a441, wood: 0x8a5a3a,
  },
  npc: { name: 'Mr Kodak', tag: '<Camp Photographer>', species: COUNSELOR.species, scale: COUNSELOR.scale },
};

export class PhotoBooth {
  readonly colliders: Mesh[] = [];
  /** Where you stand to use the booth (in front of the curtain). */
  readonly gatePoint = new THREE.Vector3();
  /** Camera heading that looks at the booth's front from the plaza. */
  frontHeading = 0;
  private readonly centre = new THREE.Vector3();
  private npc: CampNpc | null = null;
  private npcAt = new THREE.Vector3();
  private npcFacing = 0;
  private bang: InstanceType<typeof THREE.Sprite>;
  private bulbs: StdMat[] = [];
  private frames: StdMat[] = [];
  private frameTex: (Texture | null)[] = [];
  private frameKeys: string[] = [];
  private flash: StdMat | null = null;
  private flashT = 0;
  private alert = false;
  private bangAmt = 0;
  private t = 0;

  private constructor(private readonly root: Group) {
    this.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTexture(), transparent: true, depthWrite: false }));
  }

  static build(stageRoot: Object3D): PhotoBooth | null {
    const chunk = stageRoot.getObjectByName(PHOTO_BOOTH.chunk);
    if (!chunk) return null;
    const P = PHOTO_BOOTH;
    const g = new THREE.Group();
    g.name = 'photo_booth';
    g.position.set(P.at.x, 0, P.at.z);
    g.rotation.y = Math.atan2(P.faceToward.x - P.at.x, P.faceToward.z - P.at.z);
    chunk.add(g);
    const b = new PhotoBooth(g);
    b.assemble();
    g.updateMatrixWorld(true);

    const collider = (w: number, h: number, d: number, x: number, z: number, name: string) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      col.name = name;
      col.position.set(x, h / 2, z);
      col.visible = false;
      g.add(col);
      col.updateMatrixWorld(true);
      b.colliders.push(col);
    };
    collider(3.5, 4.2, 2.7, 0, 0, 'photo_booth_collider');
    collider(0.9, 2.4, 0.9, -2.35, 1.9, 'photo_booth_camera_collider');

    const front = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld).setY(0).normalize();
    b.centre.copy(g.localToWorld(new THREE.Vector3()));
    b.gatePoint.copy(g.localToWorld(new THREE.Vector3(0, 0, 1.4))).addScaledVector(front, 1.8);
    b.frontHeading = Math.atan2(front.x, front.z);
    b.npcAt.copy(g.localToWorld(new THREE.Vector3(2.45, 0, 1.75)));
    b.npcFacing = Math.atan2(front.x, front.z) - 0.35;
    return b;
  }

  /** Posts Mr Kodak by his camera (async: loads the character model). */
  async addCounselor(scene: Scene, container: HTMLElement, chat: ChatService): Promise<void> {
    this.npc = await CampNpc.create(scene, container, chat, {
      id: 'kodak', name: PHOTO_BOOTH.npc.name, tag: PHOTO_BOOTH.npc.tag,
      species: PHOTO_BOOTH.npc.species, scale: PHOTO_BOOTH.npc.scale, position: this.npcAt, facing: this.npcFacing,
      greetLine: 'Say cheese! 📸', greetRadius: 9, rearmRadius: 14, lookRadius: 13,
    });
  }

  /** XZ distance from `p` to the booth (0 inside its footprint). */
  distance(p: Vector3): number {
    return Math.max(0, Math.hypot(p.x - this.centre.x, p.z - this.centre.z) - 1.7);
  }

  get reach(): number { return PHOTO_BOOTH.reach; }
  get worldCentre(): Vector3 { return this.centre; }

  /** The bobbing "!" (unseen photos waiting). */
  setAlert(v: boolean): void { this.alert = v; }

  say(text: string): void { this.npc?.say(text); }

  /** Pop the camera's flash (a fresh photo just developed). */
  popFlash(): void { this.flashT = 1; }

  /** The newest photos (JPEG data URLs), shown framed on the booth's side. */
  setDisplayPhotos(images: readonly string[]): void {
    this.frames.forEach((mat, i) => {
      const src = images[i] ?? '';
      if (this.frameKeys[i] === src) return;
      this.frameKeys[i] = src;
      this.frameTex[i]?.dispose();
      this.frameTex[i] = null;
      if (!src) { mat.map = null; mat.color.set(0xfff4e2); mat.needsUpdate = true; return; }
      new THREE.TextureLoader().load(src, (tex) => {
        if (this.frameKeys[i] !== src) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        this.frameTex[i] = tex;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      });
    });
  }

  update(dt: number, camera: Camera, player: Vector3 | null, busy: boolean): void {
    this.t += dt;
    this.npc?.update(dt, camera, player, busy);
    // Marquee bulbs chase round the sign.
    this.bulbs.forEach((m, i) => { m.emissiveIntensity = ((i + Math.floor(this.t * 6)) % 3 === 0) ? 1.4 : 0.35; });
    // "!" pops in / out, bobbing.
    this.bangAmt += ((this.alert ? 1 : 0) - this.bangAmt) * (1 - Math.exp(-6 * dt));
    this.bang.visible = this.bangAmt > 0.02;
    const s = (1.2 + Math.sin(this.t * 6) * 0.06) * this.bangAmt;
    this.bang.scale.set(s, s, s);
    this.bang.position.y = 5.35 + Math.sin(this.t * 3) * 0.14;
    if (this.flash) {
      this.flashT = Math.max(0, this.flashT - dt * 2.5);
      this.flash.emissiveIntensity = 0.15 + this.flashT * 4;
    }
  }

  // ── Geometry (local frame: the curtain faces +z, ground at y = 0) ─────────────
  private assemble(): void {
    const C = PHOTO_BOOTH.colors;
    const g = this.root;
    const add = (m: Mesh, x: number, y: number, z: number, parent: Object3D = g) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const rb = (w: number, h: number, d: number, r: number, color: number) => new THREE.Mesh(roundedBox(w, h, d, r, 3), clay(color));

    const W = 3.0, D = 2.3, H = 3.1, T = 0.26, FLOOR = 0.22;
    add(rb(W + 0.7, FLOOR, D + 0.9, 0.08, C.deck), 0, FLOOR / 2, 0.2);
    // Back + side walls, roof block.
    add(rb(W, H, T, 0.1, C.body), 0, FLOOR + H / 2, -D / 2 + T / 2);
    for (const s of [-1, 1]) add(rb(T, H, D, 0.1, C.body), s * (W / 2 - T / 2), FLOOR + H / 2, 0);
    add(rb(W + 0.3, 0.55, D + 0.3, 0.14, C.roof), 0, FLOOR + H + 0.2, 0);
    // Front: a header over the doorway, a lower kick panel on the left of the curtain.
    add(rb(W, 0.7, T, 0.08, C.body), 0, FLOOR + H - 0.35, D / 2 - T / 2);
    // Cream trim bands.
    add(rb(W + 0.08, 0.14, D + 0.08, 0.05, C.trim), 0, FLOOR + 0.45, 0);
    add(rb(W + 0.08, 0.14, D + 0.08, 0.05, C.trim), 0, FLOOR + H - 0.75, 0);
    // Dark inside + a little stool.
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, H - 0.7), clay(C.bodyDark, 0.95));
    add(inside, 0, FLOOR + (H - 0.7) / 2, -D / 2 + T + 0.01);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 16), clay(C.curtainA)), 0, FLOOR + 0.62, -0.2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.56, 8), clay(C.wood)), 0, FLOOR + 0.28, -0.2);
    // Curtain rod + a half-drawn striped curtain (right side of the doorway, gently wavy).
    const rodY = FLOOR + H - 0.78;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, W - 0.3, 8).rotateZ(Math.PI / 2), clay(C.brass, 0.4));
    add(rod, 0, rodY, D / 2 - 0.05);
    const strips = 9, sw = 0.19;
    for (let i = 0; i < strips; i++) {
      const x = W / 2 - T - sw / 2 - i * sw * 0.98;
      const strip = rb(sw + 0.02, rodY - FLOOR - 0.1, 0.07, 0.03, i % 2 ? C.curtainB : C.curtainA);
      add(strip, x, FLOOR + (rodY - FLOOR) / 2 + 0.02, D / 2 - 0.06 + Math.sin(i * 1.3) * 0.06);
    }
    // Tie-back sash.
    add(rb(0.16, 0.22, 0.14, 0.05, C.brass), W / 2 - T - strips * sw * 0.5, FLOOR + 1.35, D / 2 + 0.02);

    // Marquee sign on the roof: a board, lettering, a ring of bulbs.
    const sign = new THREE.Group();
    sign.position.set(0, FLOOR + H + 0.95, D / 2 - 0.25);
    const board = new THREE.Mesh(roundedBox(3.2, 0.95, 0.2, 0.1, 3), clay(C.curtainB));
    board.castShadow = true;
    sign.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 0.72),
      new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.14 }));
    (face.material as StdMat).emissiveMap = (face.material as StdMat).map;
    face.position.z = 0.11;
    sign.add(face);
    const bulbGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const ring: [number, number][] = [];
    for (let i = 0; i <= 12; i++) { const x = -1.5 + i * 0.25; ring.push([x, 0.4], [x, -0.4]); }
    for (const y of [-0.2, 0, 0.2]) ring.push([-1.52, y], [1.52, y]);
    ring.forEach(([x, y], i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffd76a, emissiveIntensity: 0.4, roughness: 0.3 });
      this.bulbs.push(m);
      const bulb = new THREE.Mesh(bulbGeo, m);
      bulb.position.set(x, y, 0.12 + (i % 2) * 0.001);
      sign.add(bulb);
    });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), clay(C.wood));
      post.position.set(s * 1.2, -0.62, -0.02);
      sign.add(post);
    }
    g.add(sign);

    // Framed snapshots on the right side wall (your newest three).
    const side = new THREE.Group();
    side.position.set(W / 2 + 0.01, 0, 0);
    side.rotation.y = Math.PI / 2;
    g.add(side);
    const slots: [number, number, number][] = [[-0.5, 2.35, 0.06], [0.45, 2.2, -0.08], [0, 1.35, 0.04]];
    for (const [x, y, rot] of slots) {
      const frame = new THREE.Mesh(roundedBox(0.92, 0.66, 0.06, 0.03, 2), clay(C.trim));
      frame.position.set(x, FLOOR + y - 0.2, 0.04);
      frame.rotation.z = rot;
      side.add(frame);
      const mat = new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.7 });
      this.frames.push(mat);
      this.frameTex.push(null);
      this.frameKeys.push('');
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.52), mat);
      pic.position.z = 0.035;
      frame.add(pic);
    }

    // Mr Kodak's big old box camera on a wooden tripod, front-left, pointed at the plaza.
    const cam = new THREE.Group();
    cam.position.set(-2.35, 0, 1.9);
    cam.rotation.y = 0.25;
    g.add(cam);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.75, 8), clay(C.wood));
      leg.position.set(Math.cos(a) * 0.32, 0.82, Math.sin(a) * 0.32);
      leg.rotation.set(Math.sin(a) * 0.36, 0, -Math.cos(a) * 0.36);
      leg.castShadow = true;
      cam.add(leg);
    }
    add(rb(0.62, 0.52, 0.5, 0.08, C.camera), 0, 1.86, -0.05, cam);
    add(rb(0.52, 0.44, 0.34, 0.06, 0x7a4e2f), 0, 1.86, 0.36, cam); // bellows
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.2, 16).rotateX(Math.PI / 2), clay(C.brass, 0.35));
    add(lens, 0, 1.86, 0.62, cam);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.4 }));
    add(glass, 0, 1.86, 0.725, cam);
    // Flash pan on a stick.
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), clay(C.brass, 0.4)), 0.3, 2.3, -0.05, cam);
    this.flash = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.15, roughness: 0.3 });
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.1, 16), this.flash);
    add(pan, 0.3, 2.58, -0.05, cam).rotation.x = 0.5;

    // "!" over the roof.
    this.bang.center.set(0.5, 0);
    this.bang.position.set(0, 5.35, 0.2);
    g.add(this.bang);

    // Anything that changes after build must stay a live mesh (static-batch.ts would bake it).
    for (const part of [sign, side, cam]) part.traverse((o) => { o.userData.noBatch = true; });
    this.bang.userData.noBatch = true;
  }
}

/** "PHOTO BOOTH 📸" in cream on red. */
function signTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const W = 1024, H = 250;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c93a33';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "700 132px 'Fredoka', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillText('PHOTO BOOTH', W / 2 + 5, H / 2 + 9);
  ctx.fillStyle = '#fff4e2';
  ctx.fillText('PHOTO BOOTH', W / 2, H / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
