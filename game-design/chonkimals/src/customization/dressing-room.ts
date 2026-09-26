// Cabin dressing room for the Customize preview: a cosy log-cabin corner the player's chonk
// stands in while you dress it — plank floor, log walls, a window, bunting, a clothes rack,
// a hat shelf, a changing curtain and a standing mirror (PreviewStage renders a live
// reflection into `mirror`). All runtime primitives, no assets; ~90 meshes.
//
// Built in "chonk units" (1 = the character's height) and scaled by the caller, so it frames
// every species the same. The character stands at the origin facing +z (towards the camera).

type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export interface DressingRoom {
  root: Group;
  /** The mirror's glass (a plane facing its local +z) — PreviewStage maps a reflection onto it. */
  mirror: Mesh;
  /** The door's hinge: rotation.y 0 = shut, DOOR.open = swung open (into the room). */
  door: Group;
}

/** Back-wall door the chonk walks out of to its tent (room-local chonk units; z = the doorway). */
export const DOOR = { x: 1.3, z: 0, w: 0.95, h: 1.95, open: -1.9 };

/** Room + layout tuning (chonk units). */
export const ROOM = {
  halfWidth: 2.3,
  back: -1.7,
  front: 2.6,
  wallHeight: 3.6,
  log: 0.17,
};

const WOOD = [0xb07448, 0xa0673f, 0xbb8052, 0x9a5f39];
const PLANK = [0xd2a676, 0xc39465, 0xd9b183, 0xbd8d5e];
const CHINK = 0xe9d4ab;
const DARK_WOOD = 0x6e4428;
const SHIRTS = [0x4eb3f5, 0xffd23f, 0x6fe0a4, 0xff7ab6, 0xff9f5a];
const FLAGS = [0xe8483f, 0xffd23f, 0x4eb3f5, 0x6fe0a4, 0xff7ab6, 0x9b7bff];

const mat = (color: number, extra: Record<string, unknown> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

export function buildDressingRoom(): DressingRoom {
  const root = new THREE.Group();
  root.name = 'DressingRoom';
  const { halfWidth: W, back: B, front: F, wallHeight: H, log: R } = ROOM;
  DOOR.z = B + R + 0.03;
  const add = (m: Mesh, x: number, y: number, z: number, parent: Group = root): Mesh => {
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ── Floor: planks running front to back, over a dark sub-floor that fills the gaps ──
  add(new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.04, F - B), mat(0x5a3820)), 0, -0.05, (F + B) / 2);
  const plankW = (W * 2) / 12;
  for (let i = 0; i < 12; i++) {
    const p = add(new THREE.Mesh(new THREE.BoxGeometry(plankW * 0.96, 0.06, F - B), mat(PLANK[i % PLANK.length])),
      -W + plankW * (i + 0.5), -0.03, (F + B) / 2);
    p.receiveShadow = true;
  }

  // ── Log walls (back + both sides), chinking behind the gaps, corner posts ──
  const logs = Math.ceil(H / (R * 1.9));
  const backChink = add(new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), mat(CHINK)), 0, H / 2, B - R * 0.6);
  backChink.receiveShadow = true;
  for (let i = 0; i < logs; i++) {
    const y = R + i * R * 1.9;
    const lb = add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, W * 2 + R * 2, 14), mat(WOOD[i % 4])), 0, y, B);
    lb.rotation.z = Math.PI / 2;
    lb.receiveShadow = true;
    for (const s of [-1, 1]) {
      const ls = add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, F - B, 14), mat(WOOD[(i + 2) % 4])), s * W, y, (F + B) / 2);
      ls.rotation.x = Math.PI / 2;
      ls.receiveShadow = true;
    }
  }
  for (const s of [-1, 1]) {
    const c = add(new THREE.Mesh(new THREE.PlaneGeometry(F - B, H), mat(CHINK)), s * (W + R * 0.6), H / 2, (F + B) / 2);
    c.rotation.y = -s * Math.PI / 2;
    add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.35, H, 14), mat(DARK_WOOD)), s * W, H / 2, B);
  }

  // ── Window (back wall, above the chonk) with sky glow ──
  const win = new THREE.Group();
  win.position.set(0, 2.05, B + R + 0.02);
  root.add(win);
  const pane = add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xbfe7ff })), 0, 0, 0, win);
  void pane;
  const frameM = mat(DARK_WOOD);
  for (const [w, h, x, y] of [[1.28, 0.1, 0, 0.44], [1.28, 0.12, 0, -0.45], [0.1, 0.9, -0.6, 0], [0.1, 0.9, 0.6, 0],
    [1.1, 0.05, 0, 0], [0.05, 0.8, 0, 0]] as const) {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameM), x, y, 0.03, win);
  }
  // A little hill + sun in the window.
  add(new THREE.Mesh(new THREE.CircleGeometry(0.5, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8fd16a })), 0.25, -0.4, 0.005, win);
  add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })), -0.3, 0.18, 0.005, win);

  // ── Bunting across the back wall ──
  const buntY = 2.85;
  const line = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W * 1.9, 6), mat(0xf6ead2)), 0, buntY, B + R + 0.1);
  line.rotation.z = Math.PI / 2;
  const flagShape = new THREE.Shape();
  flagShape.moveTo(-0.13, 0); flagShape.lineTo(0.13, 0); flagShape.lineTo(0, -0.28); flagShape.closePath();
  const flagGeo = new THREE.ShapeGeometry(flagShape);
  const nFlags = 13;
  for (let i = 0; i < nFlags; i++) {
    const x = -W * 0.9 + (i / (nFlags - 1)) * W * 1.8;
    const sag = 0.12 * (1 - Math.pow((x / (W * 0.9)), 2)); // the string droops in the middle
    const f = add(new THREE.Mesh(flagGeo, mat(FLAGS[i % FLAGS.length], { side: THREE.DoubleSide })), x, buntY - sag, B + R + 0.12);
    f.rotation.z = (Math.random() - 0.5) * 0.12;
  }

  // ── Clothes rack (right) with shirts on hangers ──
  const rack = new THREE.Group();
  rack.position.set(1.55, 0, 0.05); // front-right, clear of the door
  rack.rotation.y = -0.95;
  root.add(rack);
  const metal = mat(0x5b3b24, { roughness: 0.5, metalness: 0.2 });
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.55, 8), metal), s * 0.6, 0.78, 0, rack);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.5), metal), s * 0.6, 0.02, 0, rack);
  }
  const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), metal), 0, 1.52, 0, rack);
  bar.rotation.z = Math.PI / 2;
  SHIRTS.forEach((c, i) => {
    const shirt = new THREE.Group();
    shirt.position.set(-0.45 + i * 0.225, 1.5, 0);
    shirt.rotation.y = 1.2 + (Math.random() - 0.5) * 0.3; // hung side-on along the bar, a bit messy
    rack.add(shirt);
    const m = mat(c);
    const hook = add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI * 1.3), metal), 0, 0.02, 0, shirt);
    hook.rotation.z = Math.PI * 0.85;
    const hanger = add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6), metal), 0, -0.04, 0, shirt);
    hanger.rotation.z = Math.PI / 2;
    const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.05), m), 0, -0.27, 0, shirt);
    body.castShadow = true;
    for (const s of [-1, 1]) {
      const sl = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.05), m), s * 0.2, -0.13, 0, shirt);
      sl.rotation.z = s * 0.6;
    }
  });

  // ── Hat shelf above the rack ──
  const shelfZ = B + R + 0.18;
  const up = 0.32; // sits above the door
  add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.34), mat(DARK_WOOD)), 1.3, 2.1 + up, shelfZ);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.2), mat(DARK_WOOD)), 1.3 + s * 0.5, 2.0 + up, shelfZ - 0.04);
  // Bucket hat, cap, beanie.
  const bucket = mat(0x8fbf5a);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.14, 16), bucket), 0.9, 2.2 + up, shelfZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 20), bucket), 0.9, 2.14 + up, shelfZ);
  const cap = mat(0xe8483f);
  const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap), 1.3, 2.13 + up, shelfZ);
  dome.scale.y = 0.8;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), cap), 1.3, 2.14 + up, shelfZ + 0.15);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), mat(0x9b7bff)), 1.7, 2.24 + up, shelfZ);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0xffffff)), 1.7, 2.39 + up, shelfZ);

  // ── Changing curtain (left back corner) on a rod ──
  const rodZ0 = B + 0.25, rodZ1 = B + 1.45, curtX = -W + 0.35;
  const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, rodZ1 - rodZ0 + 0.2, 8), metal), curtX, 2.55, (rodZ0 + rodZ1) / 2);
  rod.rotation.x = Math.PI / 2;
  const curtain = mat(0xd9534a, { roughness: 0.95 });
  const folds = 9;
  for (let i = 0; i < folds; i++) {
    const z = rodZ0 + (i / (folds - 1)) * (rodZ1 - rodZ0) * 0.7; // bunched towards the wall (pulled open)
    const f = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.45, 0.16), curtain), curtX + (i % 2 ? 0.05 : -0.03), 1.3, z);
    f.rotation.y = (i % 2 ? 0.5 : -0.5);
    f.castShadow = true;
  }

  // ── Standing mirror (left, angled towards the chonk) ──
  const mirrorG = new THREE.Group();
  mirrorG.position.set(-1.02, 0, B + 1.2); // far enough in that the whole mirror stays in frame
  mirrorG.rotation.y = 0.5;
  root.add(mirrorG);
  const frame = mat(0x7a4a2a, { roughness: 0.6 });
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 10, 40), frame), 0, 1.15, 0, mirrorG);
  ring.scale.y = 1.55;
  ring.castShadow = true;
  const glass = add(new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: 0xe6f2fa })), 0, 1.15, 0.01, mirrorG);
  glass.scale.y = 1.55;
  glass.name = 'MirrorGlass';
  // Stand: two splayed legs and a back strut.
  for (const s of [-1, 1]) {
    const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), frame), s * 0.28, 0.48, -0.02, mirrorG);
    leg.rotation.z = s * 0.2;
  }
  const strut = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), frame), 0, 0.62, -0.28, mirrorG);
  strut.rotation.x = -0.35;

  // ── Stool with a folded towel (right front) ──
  const stool = new THREE.Group();
  stool.position.set(-1.6, 0, 0.7); // beside the mirror
  root.add(stool);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 20), mat(0xc58a58)), 0, 0.46, 0, stool).castShadow = true;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 6), mat(DARK_WOOD)),
      Math.cos(a) * 0.17, 0.22, Math.sin(a) * 0.17, stool);
    leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.26), mat(0xf3e2c4)), 0, 0.53, 0, stool);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.26), mat(0x7fd3ff)), 0, 0.6, 0, stool);

  // ── Door (back wall, right): bright outdoors behind it, plank door on a hinge ──
  const doorG = new THREE.Group();
  doorG.position.set(DOOR.x, 0, DOOR.z);
  root.add(doorG);
  const outside = add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), new THREE.MeshBasicMaterial({ color: 0xcdeeff })),
    0, DOOR.h / 2, 0, doorG);
  void outside;
  add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, 0.55), new THREE.MeshBasicMaterial({ color: 0x8fd16a })), 0, 0.275, 0.003, doorG);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), new THREE.MeshBasicMaterial({ color: 0xc8a06a })), 0, 0.3, 0.005, doorG);
  const doorFrame = mat(DARK_WOOD);
  for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, DOOR.h + 0.12, 0.16), doorFrame), sx * (DOOR.w / 2 + 0.06), DOOR.h / 2, 0.02, doorG);
  add(new THREE.Mesh(new THREE.BoxGeometry(DOOR.w + 0.36, 0.14, 0.18), doorFrame), 0, DOOR.h + 0.07, 0.02, doorG);
  const hinge = new THREE.Group();
  hinge.position.set(-DOOR.w / 2, 0, 0.05);
  doorG.add(hinge);
  const doorWood = mat(0xa8683e);
  const panel = add(new THREE.Mesh(new THREE.BoxGeometry(DOOR.w, DOOR.h, 0.07), doorWood), DOOR.w / 2, DOOR.h / 2, 0, hinge);
  panel.castShadow = true;
  for (let i = 1; i < 4; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.015, DOOR.h - 0.08, 0.075), mat(0x7e4b2a)), (DOOR.w / 4) * i, DOOR.h / 2, 0.002, hinge);
  for (const y of [0.35, DOOR.h - 0.35]) add(new THREE.Mesh(new THREE.BoxGeometry(DOOR.w - 0.08, 0.1, 0.09), mat(0x8a5532)), DOOR.w / 2, y, 0.01, hinge);
  const brace = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, DOOR.h - 0.75, 0.09), mat(0x8a5532)), DOOR.w / 2, DOOR.h / 2, 0.012, hinge);
  brace.rotation.z = Math.atan2(DOOR.w - 0.2, DOOR.h - 0.7);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat(0xffd23f, { metalness: 0.4, roughness: 0.4 })), DOOR.w - 0.12, DOOR.h * 0.48, 0.07, hinge);

  // ── Hanging lamp ──
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), mat(0x3a2415)), 0, H - 0.3, 0.5);
  const shade = add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 20, 1, true), mat(0x6fa84f, { side: THREE.DoubleSide })), 0, H - 0.65, 0.5);
  void shade;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c2 })), 0, H - 0.74, 0.5);

  return { root, mirror: glass, door: hinge };
}

/** The lights that go with the room (warm lamp + cool window fill), in chonk units. */
export function dressingRoomLights(): InstanceType<typeof THREE.Group> {
  const g = new THREE.Group();
  const lamp = new THREE.PointLight(0xffd29a, 2.2, 0, 0.8);
  lamp.position.set(0, ROOM.wallHeight - 0.85, 0.6);
  g.add(lamp);
  const windowFill = new THREE.PointLight(0xbfe2ff, 0.9, 0, 0.8);
  windowFill.position.set(0, 2.0, ROOM.back + 0.8);
  g.add(windowFill);
  return g;
}
