// The Bulletin Board model, built from clay primitives (no GLB): two posts, a little
// red gable roof over a "CAMP CHONKTON" plank (a smaller "COMMUNITY" sign hangs under
// it on two ropes), a wood-framed cork panel and the
// four notices, each hanging from its own push pin. Used by both the camp prop
// (bulletin/board-prop.ts) and the close-up screen's stage (bulletin/board-stage.ts).
//
// Local frame: the board faces +z, ground at y = 0, units = camp-local before scale.

import { clay, roundedBox } from '../care-package/box-model';
import { PAPER_KINDS, type PaperKind } from './papers';

type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;
type Texture = InstanceType<typeof THREE.Texture>;

export const BOARD_LAYOUT = {
  corkW: 3.0, corkH: 3.1, centerY: 2.65,
  paperW: 1.2, paperH: 1.5,
  /** Pin sits this far below the paper's top edge. */
  pinDrop: 0.12,
  /** Front face of the cork (papers sit just proud of it). */
  corkFront: 0.1,
  /** Pin positions (paper top-centre) + a little hand-pinned tilt. */
  papers: {
    map:       { x: -0.72, y: 4.08, rot: 0.035, pin: 0xe8483f },
    news:      { x: 0.74,  y: 4.1,  rot: -0.045, pin: 0x3a8fd6 },
    ranks:     { x: -0.7,  y: 2.6,  rot: -0.03, pin: 0xffc629 },
    challenge: { x: 0.72,  y: 2.58, rot: 0.05,  pin: 0x5cc25a },
  } as Record<PaperKind, { x: number; y: number; rot: number; pin: number }>,
  /** Sign copy (main plank + the small one hanging under it). */
  title: 'CAMP CHONKTON',
  subtitle: 'COMMUNITY',
  colors: { post: 0x8a5a3a, frame: 0x9c6b45, frameDark: 0x7a5234, roof: 0xe2574c, roofEdge: 0xb8403a, sign: 0xf3dfbf,
    subSign: 0x6f9a4a, rope: 0xd9c49a },
};

export interface BoardModel {
  root: Group;
  /** Hangs from the pin: rotate/move this to animate the paper. */
  pivots: Record<PaperKind, Group>;
  papers: Record<PaperKind, Mesh>;
  pins: Record<PaperKind, Group>;
}

export function buildBoardModel(textures: Record<PaperKind, Texture>): BoardModel {
  const L = BOARD_LAYOUT, C = L.colors;
  const root = new THREE.Group();
  root.name = 'bulletin_board_model';
  const add = (m: Mesh, x: number, y: number, z: number, parent: InstanceType<typeof THREE.Object3D> = root) => {
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const rb = (w: number, h: number, d: number, r: number, color: number) => new THREE.Mesh(roundedBox(w, h, d, r, 2), clay(color));

  const fw = L.corkW + 0.34, fh = L.corkH + 0.34;
  const top = L.centerY + fh / 2;
  // Posts + clay feet.
  for (const sx of [-1, 1]) {
    add(rb(0.26, top + 1.2, 0.26, 0.07, C.post), sx * (fw / 2 - 0.05), (top + 1.2) / 2, -0.12);
    add(rb(0.5, 0.18, 0.5, 0.06, 0x9a9fa8), sx * (fw / 2 - 0.05), 0.09, -0.12);
  }
  // Frame + cork.
  add(rb(fw, fh, 0.16, 0.06, C.frameDark), 0, L.centerY, -0.02);
  const cork = new THREE.Mesh(new THREE.BoxGeometry(L.corkW, L.corkH, 0.08),
    new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 0.95 }));
  add(cork, 0, L.centerY, L.corkFront - 0.04);
  for (const [w, h, x, y] of [[fw, 0.17, 0, L.centerY + fh / 2 - 0.085], [fw, 0.17, 0, L.centerY - fh / 2 + 0.085],
    [0.17, fh, -fw / 2 + 0.085, L.centerY], [0.17, fh, fw / 2 - 0.085, L.centerY]] as const) {
    add(rb(w, h, 0.24, 0.05, C.frame), x, y, 0.06);
  }
  // A little ledge along the bottom (with a stub of chalk on it).
  add(rb(fw - 0.2, 0.08, 0.3, 0.03, C.frame), 0, L.centerY - fh / 2 - 0.04, 0.14);
  add(rb(0.22, 0.06, 0.06, 0.03, 0xfff4e2), 0.9, L.centerY - fh / 2 + 0.03, 0.18);

  // Cross beam between the posts carrying the sign plank; the small sign hangs under it.
  add(rb(fw + 0.1, 0.16, 0.14, 0.05, C.frameDark), 0, top + 0.95, -0.12);
  const signY = top + 0.95, subY = top + 0.38;
  const sign = new THREE.Mesh(roundedBox(2.5, 0.5, 0.14, 0.05, 2), [
    clay(C.sign), clay(C.sign), clay(C.sign), clay(C.sign),
    new THREE.MeshStandardMaterial({ map: signTexture(L.title, '#f3dfbf', '#7a4a2a'), roughness: 0.85 }), clay(C.sign),
  ]);
  add(sign, 0, signY, 0.02);
  const sub = new THREE.Mesh(roundedBox(1.5, 0.3, 0.1, 0.04, 2), [
    clay(C.subSign), clay(C.subSign), clay(C.subSign), clay(C.subSign),
    new THREE.MeshStandardMaterial({ map: signTexture(L.subtitle, '#6f9a4a', '#fff8ea', 0.62), roughness: 0.85 }), clay(C.subSign),
  ]);
  add(sub, 0, subY, 0.04);
  for (const sx of [-0.55, 0.55]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, signY - subY - 0.3, 6), clay(C.rope, 0.9)),
      sx, (signY + subY) / 2 - 0.05, 0.06);
  }
  const roofY = top + 1.75;
  for (const sx of [-1, 1]) {
    const plank = add(rb(fw / 2 + 0.55, 0.12, 0.95, 0.05, C.roof), sx * (fw / 4 + 0.18), roofY, 0.02);
    plank.rotation.z = -sx * 0.36;
    const edge = add(rb(fw / 2 + 0.6, 0.06, 0.08, 0.03, C.roofEdge), sx * (fw / 4 + 0.18), roofY - 0.06, 0.5);
    edge.rotation.z = -sx * 0.36;
  }
  add(rb(0.22, 0.2, 1.0, 0.07, C.roofEdge), 0, roofY + 0.36, 0.02);

  // Notices on pins.
  const pivots = {} as Record<PaperKind, Group>;
  const papers = {} as Record<PaperKind, Mesh>;
  const pins = {} as Record<PaperKind, Group>;
  for (const k of PAPER_KINDS) {
    const p = L.papers[k];
    const pivot = new THREE.Group();
    pivot.name = `paper_${k}`;
    pivot.position.set(p.x, p.y - L.pinDrop, L.corkFront + 0.012);
    pivot.rotation.z = p.rot;
    root.add(pivot);
    const geo = new THREE.PlaneGeometry(L.paperW, L.paperH, 8, 10);
    // A soft curl: the bottom corners lift off the cork a touch.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (L.paperW / 2), y = pos.getY(i) / (L.paperH / 2);
      pos.setZ(i, Math.max(0, -y) ** 2 * 0.035 + (x * x) * Math.max(0, -y) * 0.03);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: textures[k], roughness: 0.92, transparent: true, alphaTest: 0.5,
      side: THREE.DoubleSide });
    const paper = new THREE.Mesh(geo, mat);
    paper.name = `paper_${k}_sheet`;
    paper.position.y = -L.paperH / 2 + L.pinDrop;
    paper.castShadow = true;
    paper.receiveShadow = true;
    paper.userData.paper = k;
    pivot.add(paper);
    const pin = new THREE.Group();
    pin.position.set(0, 0, 0.015);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), clay(p.pin, 0.4));
    head.position.z = 0.06;
    head.scale.z = 0.8;
    head.castShadow = true;
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6).rotateX(Math.PI / 2), clay(0xd0d4da, 0.3));
    needle.position.z = 0.01;
    pin.add(head, needle);
    pivot.add(pin);
    pivots[k] = pivot;
    papers[k] = paper;
    pins[k] = pin;
  }
  return { root, pivots, papers, pins };
}

function corkTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c48a55';
  ctx.fillRect(0, 0, 256, 256);
  let s = 12345;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 2600; i++) {
    const l = r();
    ctx.fillStyle = l < 0.5 ? `rgba(120,70,30,${0.25 + r() * 0.3})` : `rgba(235,190,130,${0.2 + r() * 0.3})`;
    ctx.beginPath();
    ctx.arc(r() * 256, r() * 256, 0.8 + r() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Old pin holes.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(60,30,10,0.55)';
    ctx.beginPath(); ctx.arc(r() * 256, r() * 256, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 2.4);
  return t;
}

/** Wood-grain plank face with carved lettering (`w` = plank width relative to the main sign). */
function signTexture(text: string, bg: string, ink: string, w = 1): InstanceType<typeof THREE.CanvasTexture> {
  const W = Math.round(1000 * w), H = Math.round(200 * (w < 1 ? 1.2 * w : 1));
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90,58,34,0.22)';
  ctx.lineWidth = 4;
  for (let y = 30; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + 8, W * 0.7, y - 8, W, y); ctx.stroke(); }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = H * 0.56;
  ctx.font = `700 ${size}px 'Fredoka', system-ui, sans-serif`;
  while (ctx.measureText(text).width > W * 0.9) ctx.font = `700 ${--size}px 'Fredoka', system-ui, sans-serif`;
  ctx.fillText(text, W / 2, H * 0.54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
