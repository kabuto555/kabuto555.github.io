// Camp Mailbox — a chunky clay mailbox in the grass corner left of the Canteen (seen
// from the plaza: between it and the lake path), angled to face the main (torii) gate. Its red flag stands up and a bobbing "!" floats over it while
// today's daily reward is waiting; walking up floats a "Check Mail" button (a gate in
// main.ts) that opens the Camp Mail screen. Built at runtime as a child of the camp
// chunk (shares WORLD_SCALE); call `Mailbox.build()` before bots sample ground heights.

import { clay, roundedBox } from './care-package/box-model';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export const MAILBOX = {
  chunk: 'chunk_0_camp',
  /** Camp-local: on the grass north of the Canteen, just right of the Bulletin Board as seen
   * from the gate (the pair read side by side and share one walk-up spot in main.ts). */
  at: { x: -18.0, z: 18.95 },
  /** The door turns to face this camp-local point — the torii gate (build_camp.py prop_entrance_gate). */
  faceToward: { x: 0, z: 7 },
  /** Shrunk to sit beside the Bulletin Board (the model is authored at 1.0). */
  scale: 0.72,
  reach: 2.2,
  colors: { box: 0x4f8fd6, boxDark: 0x346aa8, post: 0x8a5a3a, flag: 0xe8483f, door: 0x5fa0e6, knob: 0xffc93f },
};

export class Mailbox {
  readonly colliders: Mesh[] = [];
  readonly gatePoint = new THREE.Vector3();
  /** Camera heading that looks at the mailbox's door from the plaza. */
  frontHeading = 0;
  private flag: Group;
  private door: Group;
  private bang: InstanceType<typeof THREE.Sprite>;
  private flagUp = 1;       // eased 0 (down) … 1 (up)
  private want = 1;
  private t = 0;
  private open = 0;         // door swing while you're there
  private readonly centre = new THREE.Vector3();

  private constructor(private readonly root: Group) {
    this.flag = new THREE.Group();
    this.door = new THREE.Group();
    this.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTexture(), transparent: true, depthWrite: false }));
  }

  static build(stageRoot: Object3D): Mailbox | null {
    const chunk = stageRoot.getObjectByName(MAILBOX.chunk);
    if (!chunk) return null;
    const g = new THREE.Group();
    g.name = 'mailbox';
    g.position.set(MAILBOX.at.x, 0, MAILBOX.at.z);
    g.rotation.y = Math.atan2(MAILBOX.faceToward.x - MAILBOX.at.x, MAILBOX.faceToward.z - MAILBOX.at.z);
    g.scale.setScalar(MAILBOX.scale);
    chunk.add(g);
    const m = new Mailbox(g);
    m.assemble();
    g.updateMatrixWorld(true);

    const col = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.2, 1.9), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    col.name = 'mailbox_collider';
    col.position.set(0, 2.1, 0);
    col.visible = false;
    g.add(col);
    col.updateMatrixWorld(true);
    m.colliders.push(col);

    const front = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld).setY(0).normalize();
    m.centre.copy(g.localToWorld(new THREE.Vector3()));
    m.gatePoint.copy(g.localToWorld(new THREE.Vector3(0, 0, 1.0))).addScaledVector(front, 1.6);
    m.frontHeading = Math.atan2(front.x, front.z);
    return m;
  }

  distance(p: Vector3): number {
    return Math.max(0, Math.hypot(p.x - this.centre.x, p.z - this.centre.z) - 1.1 * MAILBOX.scale);
  }

  get reach(): number { return MAILBOX.reach; }

  /** Flag up + "!" while there's mail. */
  setHasMail(v: boolean): void { this.want = v ? 1 : 0; }

  update(dt: number, player: Vector3 | null): void {
    this.t += dt;
    this.flagUp += (this.want - this.flagUp) * (1 - Math.exp(-6 * dt));
    // Flag pivots from lying along the box (down) to straight up, with a little wobble when raised.
    this.flag.rotation.x = -(1 - this.flagUp) * Math.PI / 2 + Math.sin(this.t * 5) * 0.04 * this.flagUp;
    this.bang.visible = this.flagUp > 0.5;
    this.bang.position.y = 3.35 + Math.sin(this.t * 3) * 0.12;
    const s = 1.15 + Math.sin(this.t * 6) * 0.05; // (inside the scaled group)
    this.bang.scale.set(s, s, s);
    // The door eases open a crack while you stand at it.
    const near = player ? this.distance(player) < this.reach : false;
    this.open += ((near ? 1 : 0) - this.open) * (1 - Math.exp(-5 * dt));
    this.door.rotation.x = this.open * 0.55;
  }

  // Local frame: door faces +z, ground at y = 0.
  private assemble(): void {
    const C = MAILBOX.colors;
    const g = this.root;
    const add = (m: Mesh, x: number, y: number, z: number, parent: Object3D = g) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // Post + a little clay base.
    add(new THREE.Mesh(roundedBox(0.9, 0.2, 0.9, 0.08, 2), clay(0x9a9fa8)), 0, 0.1, 0);
    add(new THREE.Mesh(roundedBox(0.3, 1.7, 0.3, 0.08, 2), clay(C.post)), 0, 1.0, 0);
    add(new THREE.Mesh(roundedBox(0.8, 0.14, 0.5, 0.05, 2), clay(C.post)), 0, 1.86, 0.05);
    // Box body: a rounded block with a half-cylinder top (the classic mailbox loaf).
    const L = 1.7, Wd = 0.95, Hb = 0.6;
    add(new THREE.Mesh(roundedBox(Wd, Hb, L, 0.1, 3), clay(C.box)), 0, 1.93 + Hb / 2, 0);
    // Rounded top: a cylinder along the box, its lower half buried in the body.
    const top = new THREE.Mesh(new THREE.CylinderGeometry(Wd / 2, Wd / 2, L, 28).rotateX(Math.PI / 2), clay(C.box));
    add(top, 0, 1.93 + Hb, 0);
    // Bands.
    for (const z of [-0.55, 0.55]) {
      add(new THREE.Mesh(new THREE.TorusGeometry(Wd / 2 + 0.01, 0.035, 8, 24, Math.PI), clay(C.boxDark)), 0, 1.93 + Hb, z);
    }
    // Door on the front, hinged at the bottom.
    this.door.position.set(0, 1.97, L / 2 + 0.02);
    g.add(this.door);
    const doorMesh = new THREE.Mesh(new THREE.CircleGeometry(Wd / 2 - 0.02, 24, 0, Math.PI), clay(C.door));
    doorMesh.position.y = Hb - 0.04;
    this.door.add(doorMesh);
    const doorBottom = new THREE.Mesh(new THREE.PlaneGeometry(Wd - 0.04, Hb - 0.04), clay(C.door));
    doorBottom.position.y = (Hb - 0.04) / 2;
    this.door.add(doorBottom);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), clay(C.knob));
    knob.position.set(0, Hb + 0.1, 0.04);
    this.door.add(knob);
    // A letter peeking out of the door (visible when it opens).
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), clay(0xfff4e2, 0.9));
    letter.position.set(0, 2.25, L / 2 - 0.12);
    letter.rotation.x = -0.25;
    g.add(letter);
    // Flag on the right side: pivot at its base.
    this.flag.position.set(Wd / 2 + 0.06, 2.05, -0.3);
    g.add(this.flag);
    add(new THREE.Mesh(roundedBox(0.08, 0.95, 0.08, 0.03, 1), clay(C.flag)), 0, 0.47, 0, this.flag);
    add(new THREE.Mesh(roundedBox(0.06, 0.34, 0.5, 0.04, 2), clay(C.flag)), 0, 0.78, 0.26, this.flag);
    // "!" bubble.
    this.bang.center.set(0.5, 0);
    g.add(this.bang);
    // Moving parts must stay live meshes (static-batch.ts would bake them in place).
    for (const part of [this.flag, this.door]) part.traverse((o) => { o.userData.noBatch = true; });
  }
}

export function bangTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 160 });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(50, 110); ctx.lineTo(64, 150); ctx.lineTo(78, 110); ctx.closePath();
  ctx.fillStyle = '#ffd23f'; ctx.fill();
  ctx.fillStyle = '#5a3500';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "700 84px 'Fredoka', system-ui, sans-serif";
  ctx.fillText('!', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
