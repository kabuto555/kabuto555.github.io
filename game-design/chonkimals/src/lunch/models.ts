/**
 * Lunch Delivery art kit — every prop is composed from core primitives
 * (ENGINE.md "Primitives by default"), in world units at the camp's scale
 * (a campgoer is ~3.8 units tall). Forward is +z for anything that faces.
 */
import { createFlatMaterial } from '../materials';
import { asDecal } from '../materials';

type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Material = InstanceType<typeof THREE.MeshStandardMaterial>;
type Object3D = InstanceType<typeof THREE.Object3D>;

export type BugKind = 'ant' | 'wasp' | 'fly' | 'maggot';
export type ToolKind = 'swatter' | 'spray' | 'watergun';
export type DebrisKind = 'log' | 'rocks' | 'leaves';

const mat = (color: number, rough = 0.75): Material =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

function mesh(geo: import('three').BufferGeometry, m: import('three').Material, x = 0, y = 0, z = 0): Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** Red/white gingham for the cart cloth and picnic blanket. */
function ginghamTexture(color = '#e2483d'): InstanceType<typeof THREE.CanvasTexture> {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff7ec'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color; g.globalAlpha = 0.55;
  for (let i = 0; i < 4; i++) { g.fillRect(i * 16, 0, 8, 64); g.fillRect(0, i * 16, 64, 8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ── Food cart ────────────────────────────────────────────────────────────────
export interface CartModel {
  root: Group;
  /** Tilts with the slope (pitch) under the root's yaw. */
  body: Group;
  wheels: Mesh[];
  /** Lunch items, hidden in order as the lunch meter drains. */
  food: Object3D[];
  wheelRadius: number;
}

export function buildCart(): CartModel {
  const root = new THREE.Group();
  root.name = 'lunch_cart';
  const body = new THREE.Group();
  root.add(body);
  const wood = createFlatMaterial(0xb97a44);
  const woodDark = createFlatMaterial(0x7a4a28);
  const W = 2.4, L = 3.4, BED_Y = 1.0;

  // Bed + side boards.
  body.add(mesh(new THREE.BoxGeometry(W, 0.28, L), wood, 0, BED_Y, 0));
  for (const sx of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.14, 0.55, L), woodDark, sx * (W / 2 - 0.07), BED_Y + 0.4, 0));
  for (const sz of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(W, 0.55, 0.14), woodDark, 0, BED_Y + 0.4, sz * (L / 2 - 0.07)));
  // Pull handle out front.
  for (const sx of [-1, 1]) {
    const bar = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), woodDark, sx * 0.55, BED_Y + 0.2, L / 2 + 0.7);
    bar.rotation.x = Math.PI / 2 - 0.35;
    body.add(bar);
  }
  body.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 6).rotateZ(Math.PI / 2), woodDark, 0, BED_Y + 0.45, L / 2 + 1.4));

  // Wheels (spoked look from a hub + a tyre torus).
  const wheels: Mesh[] = [];
  const R = 0.6;
  const tyreMat = createFlatMaterial(0x5a3a22);
  const hubMat = createFlatMaterial(0xf2c14e);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = mesh(new THREE.TorusGeometry(R - 0.1, 0.12, 8, 16), tyreMat, sx * (W / 2 + 0.12), R, sz * (L / 2 - 0.6));
      w.rotation.y = Math.PI / 2;
      const spokes = mesh(new THREE.BoxGeometry(0.06, (R - 0.1) * 2, 0.08), hubMat);
      const spokes2 = spokes.clone(); spokes2.rotation.z = Math.PI / 2;
      w.add(spokes, spokes2, mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10).rotateX(Math.PI / 2), hubMat));
      root.add(w); // wheels stay level-ish; the body tilts
      wheels.push(w);
    }
  }

  // Gingham cloth over the load.
  const cloth = mesh(new THREE.BoxGeometry(W - 0.2, 0.06, L - 0.3), new THREE.MeshStandardMaterial({ map: ginghamTexture(), roughness: 0.9 }), 0, BED_Y + 0.2, 0);
  body.add(cloth);

  // Food: lunchboxes, paper bags, apples, sandwiches, juice boxes, a watermelon.
  const food: Object3D[] = [];
  const add = (o: Object3D) => { body.add(o); food.push(o); };
  const boxCols = [0x3aa0ff, 0xff7a59, 0x7ad35a, 0xffcf3f, 0xb07ae8, 0x4fd1c5];
  let k = 0;
  for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.1], [0.6, 0.1]]) {
    const lb = new THREE.Group();
    lb.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), createFlatMaterial(boxCols[k++ % boxCols.length]), 0, 0.25, 0));
    lb.add(mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 10, Math.PI), createFlatMaterial(0x333333), 0, 0.5, 0));
    lb.position.set(x, BED_Y + 0.23, z);
    add(lb);
  }
  const bagMat = createFlatMaterial(0xc9a26b);
  for (const [x, z] of [[-0.5, 1.1], [0.55, 1.05]]) {
    const bag = mesh(new THREE.BoxGeometry(0.6, 0.85, 0.45), bagMat, x, BED_Y + 0.65, z);
    bag.rotation.y = x * 0.4;
    add(bag);
  }
  const melon = new THREE.Group();
  melon.add(mesh(new THREE.SphereGeometry(0.42, 12, 10).scale(1.2, 1, 1), createFlatMaterial(0x3f9a3a)));
  melon.position.set(0, BED_Y + 1.0, -0.4);
  add(melon);
  const appleMat = createFlatMaterial(0xe83b3b);
  for (const [x, y, z] of [[-0.3, 0.85, 0.5], [0.15, 0.85, 0.6], [0.4, 0.8, 0.35], [-0.05, 1.1, 0.5]]) {
    add(mesh(new THREE.SphereGeometry(0.17, 10, 8), appleMat, x, BED_Y + y, z));
  }
  const sandwich = new THREE.Group();
  sandwich.add(mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), createFlatMaterial(0xf3d08a), 0, 0, 0));
  sandwich.add(mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), createFlatMaterial(0x6fcf4f), 0, 0.08, 0));
  sandwich.add(mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), createFlatMaterial(0xf3d08a), 0, 0.16, 0));
  sandwich.position.set(0.55, BED_Y + 0.85, -1.0);
  sandwich.rotation.y = 0.5;
  add(sandwich);

  // Little parasol so the cart reads from afar.
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), woodDark, -0.9, BED_Y + 1.2, -1.3);
  body.add(pole);
  const shade = mesh(new THREE.ConeGeometry(1.25, 0.55, 10, 1, true), new THREE.MeshStandardMaterial({
    map: ginghamTexture('#ffb02e'), side: THREE.DoubleSide, roughness: 0.85,
  }), -0.9, BED_Y + 2.45, -1.3);
  body.add(shade);

  return { root, body, wheels, food, wheelRadius: R };
}

// ── Bugs ─────────────────────────────────────────────────────────────────────
export interface BugModel {
  root: Group;
  /** Squash/scale + hit-flash target. */
  body: Group;
  legs: Mesh[];
  wings: Mesh[];
  /** Materials whose emissive flashes on hit. */
  flash: Material[];
}

const BUG_SCALE: Record<BugKind, number> = { ant: 1.0, wasp: 1.25, fly: 1.1, maggot: 1.35 };

export function buildBug(kind: BugKind): BugModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: Mesh[] = [];
  const wings: Mesh[] = [];
  const flash: Material[] = [];
  const m = (c: number, r = 0.6) => { const x = mat(c, r); flash.push(x); return x; };
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const eyeMat = mat(0xffffff, 0.3);
  const pupil = mat(0x111111, 0.3);

  if (kind === 'ant') {
    const c = m(0x3a1d14, 0.45);
    body.add(mesh(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.85, 1.25), c, 0, 0.36, -0.42));
    body.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), c, 0, 0.38, 0));
    body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), c, 0, 0.45, 0.32));
    for (const sx of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat, sx * 0.12, 0.53, 0.47));
      const ant = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), c, sx * 0.1, 0.7, 0.42);
      ant.rotation.set(0.6, 0, -sx * 0.4);
      body.add(ant);
      for (let i = 0; i < 3; i++) {
        const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), c, sx * 0.22, 0.2, -0.14 + i * 0.15);
        leg.rotation.z = sx * 1.0;
        body.add(leg);
        legs.push(leg);
      }
    }
  } else if (kind === 'wasp') {
    const yellow = m(0xffc21a, 0.45), black = m(0x1d1a16, 0.45);
    // Striped abdomen from stacked slices.
    for (let i = 0; i < 4; i++) {
      const r = 0.3 - Math.abs(i - 1.3) * 0.06;
      body.add(mesh(new THREE.CylinderGeometry(r, r, 0.16, 12).rotateX(Math.PI / 2), i % 2 ? black : yellow, 0, 0, -0.35 - i * 0.15));
    }
    body.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 8).rotateX(-Math.PI / 2), black, 0, 0, -1.05)); // stinger
    body.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), black, 0, 0.02, -0.08));
    body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), yellow, 0, 0.05, 0.22));
    for (const sx of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x2a1a10, 0.3), sx * 0.13, 0.1, 0.34));
      const wing = mesh(new THREE.PlaneGeometry(0.34, 0.7).translate(0, 0.35, 0), wingMat, sx * 0.1, 0.2, -0.05);
      wing.rotation.set(-1.2, 0, sx * 0.9);
      body.add(wing);
      wings.push(wing);
    }
  } else if (kind === 'fly') {
    const c = m(0x2f4a52, 0.35);
    body.add(mesh(new THREE.SphereGeometry(0.3, 10, 8).scale(0.95, 0.85, 1.2), c, 0, 0, -0.18));
    body.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), c, 0, 0.04, 0.2));
    const red = mat(0xc8263a, 0.25);
    for (const sx of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), red, sx * 0.13, 0.1, 0.3));
      const wing = mesh(new THREE.PlaneGeometry(0.4, 0.6).translate(0, 0.3, 0), wingMat, sx * 0.08, 0.2, -0.1);
      wing.rotation.set(-1.3, 0, sx * 0.7);
      body.add(wing);
      wings.push(wing);
    }
  } else {
    // Maggot: a wiggly row of pale segments with a dark face.
    const c = m(0xf2e6c4, 0.8);
    for (let i = 0; i < 5; i++) {
      const r = 0.26 - Math.abs(i - 1.5) * 0.03;
      const seg = mesh(new THREE.SphereGeometry(r, 10, 8), c, 0, r, -0.5 + i * 0.26);
      body.add(seg);
      legs.push(seg); // wiggle targets
    }
    for (const sx of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.06, 6, 6), pupil, sx * 0.1, 0.32, 0.72));
    }
  }
  root.scale.setScalar(BUG_SCALE[kind]);
  return { root, body, legs, wings, flash };
}

// ── Tools ────────────────────────────────────────────────────────────────────
/** A tool held at the character's side (child of the character root, natural units). */
export function buildTool(kind: ToolKind): Group {
  const g = new THREE.Group();
  if (kind === 'swatter') {
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), createFlatMaterial(0xf2c14e), 0, 0.45, 0));
    const head = mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xff4f6d, roughness: 0.6, transparent: true, opacity: 0.92 }), 0, 1.1, 0);
    g.add(head);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.54, 0.02), new THREE.MeshBasicMaterial({ color: 0xb8203a, wireframe: true }), 0, 1.1, 0));
  } else if (kind === 'spray') {
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 12), createFlatMaterial(0x49c46a), 0, 0.28, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), createFlatMaterial(0xf4f4f4), 0, 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), createFlatMaterial(0x222222), 0, 0.7, 0.06));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.18, 0.02), createFlatMaterial(0xffe14a), 0, 0.3, 0.16));
  } else {
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.3, 0.55), createFlatMaterial(0xff8a2a), 0, 0.3, 0.05));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8).rotateX(Math.PI / 2), createFlatMaterial(0x3a8cff), 0, 0.36, 0.5));
    g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.75, roughness: 0.1 }), 0, 0.55, -0.1));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), createFlatMaterial(0x3a8cff), 0, 0.05, -0.08));
  }
  return g;
}

// ── Debris ───────────────────────────────────────────────────────────────────
export function buildDebris(kind: DebrisKind, width: number): Group {
  const g = new THREE.Group();
  if (kind === 'log') {
    const bark = createFlatMaterial(0x7a4a28);
    const ring = createFlatMaterial(0xe0b07a);
    const log = mesh(new THREE.CylinderGeometry(0.55, 0.6, width, 10).rotateZ(Math.PI / 2), bark, 0, 0.55, 0);
    g.add(log);
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CircleGeometry(0.5, 10).rotateY(sx * Math.PI / 2), ring, sx * (width / 2 + 0.01), 0.55, 0));
    const branch = mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 6), bark, width * 0.2, 1.1, 0.1);
    branch.rotation.z = -0.7;
    g.add(branch);
    g.add(mesh(new THREE.SphereGeometry(0.45, 8, 6), createFlatMaterial(0x4f9a3a), width * 0.2 + 0.4, 1.5, 0.1));
  } else if (kind === 'rocks') {
    const rock = createFlatMaterial(0x9a9aa5);
    const n = Math.max(3, Math.round(width / 1.3));
    for (let i = 0; i < n; i++) {
      const r = 0.55 + Math.random() * 0.4;
      const o = mesh(new THREE.DodecahedronGeometry(r, 0), rock, -width / 2 + (i + 0.5) * (width / n), r * 0.7, (Math.random() - 0.5) * 0.8);
      o.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      g.add(o);
    }
  } else {
    const cols = [0xe5822e, 0xd9b23a, 0x9bbf3f, 0xc8552f];
    const n = Math.max(5, Math.round(width * 1.6));
    for (let i = 0; i < n; i++) {
      const r = 0.5 + Math.random() * 0.35;
      g.add(mesh(new THREE.SphereGeometry(r, 8, 6).scale(1.3, 0.55, 1.1), createFlatMaterial(cols[i % cols.length]),
        -width / 2 + Math.random() * width, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 1.4));
    }
  }
  return g;
}

/** Flat progress ring laid over a debris pile (fill 0..1 via setFill). */
export class ProgressRing {
  readonly root: Group;
  private readonly fill: Mesh;
  private readonly radius: number;
  private last = -1;
  constructor(radius: number) {
    this.root = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.RingGeometry(radius - 0.22, radius, 40),
      asDecal(new THREE.MeshBasicMaterial({ color: 0x3a2410, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })));
    bg.rotation.x = -Math.PI / 2;
    this.fill = new THREE.Mesh(new THREE.RingGeometry(radius - 0.2, radius - 0.02, 40, 1, 0, 0.001),
      asDecal(new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })));
    this.fill.renderOrder = 1; // over its own background ring
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.y = 0.01;
    this.root.add(bg, this.fill);
    this.radius = radius;
  }
  setFill(f: number): void {
    const q = Math.round(f * 60) / 60;
    if (q === this.last) return;
    this.last = q;
    this.fill.geometry.dispose();
    this.fill.geometry = new THREE.RingGeometry(this.radius - 0.2, this.radius - 0.02, 40, 1, Math.PI / 2, Math.max(0.001, q * Math.PI * 2));
  }
}

// ── Power-ups ────────────────────────────────────────────────────────────────
export function buildPowerup(kind: Exclude<ToolKind, 'swatter'>): Group {
  const g = new THREE.Group();
  const item = buildTool(kind);
  item.scale.setScalar(1.8);
  item.position.y = -0.4;
  item.name = 'item';
  g.add(item);
  const col = kind === 'spray' ? 0x7dff8a : 0x6fd0ff;
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 28),
    asDecal(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06; // the group sits right at the path height — lift the glow off it
  glow.name = 'glow';
  g.add(glow);
  return g;
}

// ── Checkpoint flag ──────────────────────────────────────────────────────────
export function buildFlag(): { root: Group; cloth: Mesh } {
  const root = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), createFlatMaterial(0xe8e0d0), 0, 1.6, 0));
  const cloth = mesh(new THREE.PlaneGeometry(1.1, 0.7).translate(0.55, 0, 0), new THREE.MeshStandardMaterial({ color: 0xbfbfbf, side: THREE.DoubleSide, roughness: 0.9 }), 0.04, 2.8, 0);
  root.add(cloth);
  root.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), createFlatMaterial(0xf2c14e), 0, 3.25, 0));
  return { root, cloth };
}

// ── Signs ────────────────────────────────────────────────────────────────────
export interface SignStyle { frame: string; fill: string; ink: string; }
const WOOD_SIGN: SignStyle = { frame: '#7a4a28', fill: '#f3e6c8', ink: '#5a3d1a' };

/** Wooden sign on two posts with Fredoka text baked into a CanvasTexture. */
export function buildSign(label: string, width = 4.2, style: SignStyle = WOOD_SIGN): Group {
  const cw = 768, ch = 224;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = style.frame; round(0, 0, cw, ch, 34); ctx.fill();
  ctx.fillStyle = style.fill; round(16, 16, cw - 32, ch - 32, 24); ctx.fill();
  ctx.fillStyle = style.ink;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = 92;
  ctx.font = `700 ${fs}px 'Fredoka', system-ui, sans-serif`;
  const w = ctx.measureText(label).width;
  if (w > cw - 100) { fs = Math.floor(fs * (cw - 100) / w); ctx.font = `700 ${fs}px 'Fredoka', system-ui, sans-serif`; }
  ctx.fillText(label, cw / 2, ch / 2 + 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const h = width * (ch / cw);
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 2.2;
  g.add(board);
  const post = createFlatMaterial(0x7a4a28);
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.18, 2.2 + h / 2, 0.18), post, sx * width * 0.42, (2.2 + h / 2) / 2, -0.06));
  return g;
}

// ── Beach picnic (the delivery point) ────────────────────────────────────────
export interface PicnicModel {
  root: Group;
  /** Food laid out on the tables once lunch is delivered. */
  feast: Group;
  /** Table-top points (world, relative to root) for keep-outs. */
  tables: { x: number; z: number; rot: number }[];
}

export function buildPicnic(): PicnicModel {
  const root = new THREE.Group();
  root.name = 'lunch_picnic';
  const wood = createFlatMaterial(0xc08a52);
  const woodDark = createFlatMaterial(0x8a5a34);
  const tables = [
    { x: -3.6, z: 1.5, rot: 0.25 }, { x: 3.4, z: 2.4, rot: -0.2 }, { x: 0, z: -3.4, rot: Math.PI / 2 + 0.1 },
  ];
  const feast = new THREE.Group();
  feast.visible = false;
  const foodCols = [0xe83b3b, 0xffcf3f, 0x7ad35a, 0xff7a59, 0x3aa0ff];
  for (const t of tables) {
    const tg = new THREE.Group();
    tg.position.set(t.x, 0, t.z);
    tg.rotation.y = t.rot;
    tg.add(mesh(new THREE.BoxGeometry(3.4, 0.16, 1.3), wood, 0, 1.25, 0));
    for (const sz of [-1, 1]) {
      tg.add(mesh(new THREE.BoxGeometry(3.4, 0.12, 0.45), wood, 0, 0.7, sz * 1.05));
      for (const sx of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.14, 1.35, 0.14), woodDark, sx * 1.35, 0.62, sz * 0.55);
        leg.rotation.x = sz * 0.35;
        tg.add(leg);
      }
    }
    root.add(tg);
    // Feast on this table.
    const f = new THREE.Group();
    f.position.copy(tg.position);
    f.rotation.y = t.rot;
    f.add(mesh(new THREE.BoxGeometry(3.1, 0.03, 1.1), new THREE.MeshStandardMaterial({ map: ginghamTexture(), roughness: 0.9 }), 0, 1.35, 0));
    for (let i = 0; i < 5; i++) {
      const x = -1.2 + i * 0.6;
      if (i % 2 === 0) f.add(mesh(new THREE.BoxGeometry(0.45, 0.3, 0.35), createFlatMaterial(foodCols[i]), x, 1.52, 0.1));
      else f.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), createFlatMaterial(foodCols[i]), x, 1.55, -0.15));
    }
    feast.add(f);
  }
  // Big blanket + a parasol by the water.
  const blanket = mesh(new THREE.BoxGeometry(4.4, 0.04, 3.4), new THREE.MeshStandardMaterial({ map: ginghamTexture('#3a8cff'), roughness: 0.95 }), 5.2, 0.03, -3.2);
  blanket.rotation.y = 0.35;
  blanket.receiveShadow = true;
  root.add(blanket);
  root.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), woodDark, 6.8, 1.8, -4.6));
  const shade = mesh(new THREE.ConeGeometry(2.3, 0.9, 12, 1, true), new THREE.MeshStandardMaterial({
    map: ginghamTexture('#ff5a8a'), side: THREE.DoubleSide, roughness: 0.85,
  }), 6.8, 3.7, -4.6);
  root.add(shade);
  root.add(feast);
  return { root, feast, tables };
}
