// Dice With Friends as it sits on the ground — what everyone sees: a felt dice tray with the
// five dice (rolled ones tumble in from the roller's side and bounce to a stop; held ones
// line up along the roller's edge) and a paper scorecard beside it with both players'
// columns, so passers-by can follow the game.
//
// Local space (match.ts): centred on the origin, y = 0 the ground; seat 0 on +Z, seat 1 on −Z.
// The scorecard reads upright from seat 0. Textures are shared between every table.

import { FONT } from '../../ui/theme';
import { CATEGORIES, LABEL, UPPER, upperBonus, upperTotal, type Card } from './rules';
import type { Seat } from '../match';

type Mesh = import('three').Mesh;
type Group = import('three').Group;
type Vector3 = import('three').Vector3;
type Quaternion = import('three').Quaternion;
type Material = import('three').Material;

const ROLL_TIME = 0.95, ROLL_STAGGER = 0.06, SETTLE = 0.28, HOLD_TIME = 0.25;
const POP_IN = 0.45, PACK = 0.3;
/** Which value each box face shows: +x −x +y −y +z −z (opposite faces add to 7). */
const FACE_VALUES = [2, 5, 1, 6, 3, 4];

// ── Shared resources ─────────────────────────────────────────────────────

let dieMats: Material[] | null = null;
let feltMat: Material | null = null;
let woodMat: Material | null = null;

function pipFace(v: number): Material {
  const px = 128, c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d2c4';
  g.fillRect(0, 0, px, px);
  g.fillStyle = '#fbf8f1';
  g.beginPath();
  g.roundRect(4, 4, px - 8, px - 8, 22);
  g.fill();
  g.fillStyle = v === 1 ? '#d9483f' : '#2b2320';
  const at: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
  };
  for (const [x, y] of at[v]) { g.beginPath(); g.arc(x * px, y * px, v === 1 ? 15 : 11, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
}

function dieMaterials(): Material[] {
  dieMats ??= FACE_VALUES.map(pipFace);
  return dieMats;
}

/** The rotation that puts `v` on top (then a spin about the vertical). */
function restQuat(v: number, yaw: number, out: Quaternion): Quaternion {
  const e = new THREE.Euler();
  switch (v) {
    case 6: e.set(Math.PI, 0, 0); break;
    case 2: e.set(0, 0, Math.PI / 2); break;
    case 5: e.set(0, 0, -Math.PI / 2); break;
    case 3: e.set(-Math.PI / 2, 0, 0); break;
    case 4: e.set(Math.PI / 2, 0, 0); break;
    default: e.set(0, 0, 0);
  }
  out.setFromEuler(e);
  return out.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
}

// ── The view ─────────────────────────────────────────────────────────────

interface Die {
  mesh: Mesh;
  /** Where it settled after its last roll (tray-local x/z), for when it's let go of. */
  rest: Vector3;
  anim: {
    kind: 'roll' | 'slide';
    from: Vector3; to: Vector3; t: number; dur: number; delay: number;
    fromQ: Quaternion; toQ: Quaternion; spin: Vector3; spinRate: number;
  } | null;
}

export class DiceView {
  readonly root: Group = new THREE.Group();
  private readonly table: Group = new THREE.Group();
  private readonly dice: Die[] = [];
  private readonly d: number;
  private readonly trayX: number;
  private readonly inner: number;
  private readonly card: { mesh: Mesh; canvas: HTMLCanvasElement; tex: import('three').CanvasTexture };
  private scaleT = 0;
  private packing = false;
  done = false;

  constructor(readonly size: number) {
    const S = size;
    this.d = S * 0.1;
    this.inner = S * 0.6;
    this.trayX = -S * 0.17;
    this.root.name = 'dice_table';
    this.root.add(this.table);
    feltMat ??= new THREE.MeshStandardMaterial({ color: '#2f7a4a', roughness: 0.95 });
    woodMat ??= new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 0.8 });
    // The tray: a felt floor inside four low wooden walls.
    const wall = S * 0.035, wh = S * 0.07, W = this.inner;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W + wall * 2, S * 0.02, W + wall * 2), woodMat);
    floor.position.set(this.trayX, S * 0.01, 0);
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), feltMat);
    felt.position.set(this.trayX, S * 0.021, 0);
    felt.receiveShadow = true;
    this.table.add(floor, felt);
    for (const [dx, dz, w, dd] of [[0, W / 2 + wall / 2, W + wall * 2, wall], [0, -W / 2 - wall / 2, W + wall * 2, wall],
      [W / 2 + wall / 2, 0, wall, W], [-W / 2 - wall / 2, 0, wall, W]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wh, dd), woodMat);
      m.position.set(this.trayX + dx, wh / 2, dz);
      m.castShadow = true;
      this.table.add(m);
    }
    // The scorecard, on its own little clipboard.
    const cw = S * 0.3, cd = S * 0.66;
    const board = new THREE.Mesh(new THREE.BoxGeometry(cw * 1.08, S * 0.012, cd * 1.05), woodMat);
    board.position.set(S * 0.33, S * 0.006, 0);
    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 660;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    paper.position.set(S * 0.33, S * 0.0125, 0);
    this.table.add(board, paper);
    this.card = { mesh: paper, canvas, tex };
    // The dice, sat in a loose row to start.
    const geo = new THREE.BoxGeometry(this.d, this.d, this.d);
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(geo, dieMaterials());
      mesh.castShadow = true;
      const rest = new THREE.Vector3(this.trayX + (i - 2) * this.d * 1.5, this.dieY, 0);
      mesh.position.copy(rest);
      restQuat(1 + i, (i - 2) * 0.3, mesh.quaternion);
      this.table.add(mesh);
      this.dice.push({ mesh, rest, anim: null });
    }
    this.root.scale.setScalar(0.001);
  }

  private get dieY(): number { return this.size * 0.021 + this.d / 2; }

  /** Anything still tumbling or sliding. */
  get busy(): boolean { return this.dice.some((d) => d.anim); }

  /** Rolls the dice marked `rolled` in from `seat`'s side, landing on `values`. */
  roll(rolled: readonly boolean[], values: readonly number[], seat: Seat): void {
    const side = seat === 0 ? 1 : -1, W = this.inner, S = this.size;
    // Landing spots: a loose scatter over the middle of the tray, shuffled, clear of the held row.
    const spots: [number, number][] = [[-0.17, -0.1], [0, -0.16], [0.17, -0.08], [-0.09, 0.07], [0.11, 0.09]];
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    let k = 0;
    this.dice.forEach((d, i) => {
      if (!rolled[i]) return;
      const [sx, sz] = spots[k++];
      const to = new THREE.Vector3(this.trayX + sx * S + (Math.random() - 0.5) * S * 0.04, this.dieY,
        (sz * side) * S + (Math.random() - 0.5) * S * 0.04);
      d.rest.copy(to);
      const from = new THREE.Vector3(this.trayX + (Math.random() - 0.5) * W * 0.6, this.d * 3, side * (W / 2 + this.d));
      d.anim = {
        kind: 'roll', from, to, t: 0, dur: ROLL_TIME * (0.85 + Math.random() * 0.3), delay: k * ROLL_STAGGER,
        fromQ: d.mesh.quaternion.clone(), toQ: restQuat(values[i], Math.random() * Math.PI * 2, new THREE.Quaternion()),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spinRate: 14 + Math.random() * 10,
      };
    });
  }

  /** Held dice line up along `seat`'s edge of the tray; let-go ones slide back to where they landed. */
  setHeld(held: readonly boolean[], seat: Seat): void {
    const side = seat === 0 ? 1 : -1;
    this.dice.forEach((d, i) => {
      if (d.anim?.kind === 'roll') return;
      const to = held[i]
        ? new THREE.Vector3(this.trayX + (i - 2) * this.d * 1.25, this.dieY, side * (this.inner / 2 - this.d * 0.75))
        : d.rest.clone();
      if (to.distanceTo(d.mesh.position) < 1e-3) return;
      d.anim = { kind: 'slide', from: d.mesh.position.clone(), to, t: 0, dur: HOLD_TIME, delay: 0,
        fromQ: d.mesh.quaternion.clone(), toQ: d.mesh.quaternion.clone(), spin: new THREE.Vector3(0, 1, 0), spinRate: 0 };
    });
  }

  /** Redraws the scorecard: both players' boxes, bonus and totals (`turn` column highlighted). */
  setCard(names: [string, string], cards: [Card, Card], totals: [number, number], turn: Seat | null): void {
    const c = this.card.canvas, g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    g.fillStyle = '#fbf6e8';
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';
    g.fillStyle = '#d9483f';
    g.font = `700 24px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('Dice With Friends', W / 2, 26);
    const rowH = 36, top = 58, colA = 190, colB = 255;
    const row = (y: number, label: string, a: string, b: string, bold = false, shade = false) => {
      if (shade) { g.fillStyle = '#efe4c8'; g.fillRect(0, y - rowH / 2, W, rowH); }
      g.fillStyle = '#3b2a1a';
      g.font = `${bold ? 700 : 600} 19px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(label, 12, y);
      g.textAlign = 'center';
      g.font = `700 20px ${FONT}`;
      g.fillText(a, colA, y);
      g.fillText(b, colB, y);
      g.strokeStyle = '#d8c9a6';
      g.beginPath(); g.moveTo(8, y + rowH / 2); g.lineTo(W - 8, y + rowH / 2); g.stroke();
    };
    if (turn !== null) { // whose column is live
      g.fillStyle = 'rgba(255,210,63,0.35)';
      g.fillRect((turn === 0 ? colA : colB) - 30, top - rowH / 2, 60, H - top);
    }
    const short = (n: string) => (n.length > 7 ? n.slice(0, 6) + '…' : n);
    row(top, '', short(names[0]), short(names[1]), true);
    let y = top + rowH;
    const val = (card: Card, k: typeof CATEGORIES[number]) => (card[k] === undefined ? '' : String(card[k]));
    for (const k of UPPER) { row(y, LABEL[k], val(cards[0], k), val(cards[1], k)); y += rowH; }
    const bonus = (card: Card) => (upperBonus(card) ? '35' : `${upperTotal(card)}/63`);
    g.save(); row(y, 'Bonus', bonus(cards[0]), bonus(cards[1]), false, true); g.restore(); y += rowH;
    for (const k of CATEGORIES.slice(6)) { row(y, LABEL[k], val(cards[0], k), val(cards[1], k)); y += rowH; }
    row(y, 'TOTAL', String(totals[0]), String(totals[1]), true, true);
    this.card.tex.needsUpdate = true;
  }

  packUp(): void { this.packing = true; }

  update(dt: number): void {
    if (this.packing) {
      this.scaleT = Math.max(0, this.scaleT - dt / PACK);
      if (this.scaleT === 0) this.done = true;
      this.root.scale.setScalar(Math.max(0.001, this.scaleT * this.scaleT));
    } else if (this.scaleT < 1) {
      this.scaleT = Math.min(1, this.scaleT + dt / POP_IN);
      const t = this.scaleT, k = 1.70158; // easeOutBack
      this.root.scale.setScalar(Math.max(0.001, 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2));
    }
    for (const d of this.dice) {
      const a = d.anim;
      if (!a) continue;
      if (a.delay > 0) { a.delay -= dt; continue; }
      a.t = Math.min(1, a.t + dt / a.dur);
      const t = a.t, m = d.mesh;
      if (a.kind === 'slide') {
        const e = t * t * (3 - 2 * t);
        m.position.lerpVectors(a.from, a.to, e);
        m.position.y = this.dieY + Math.sin(t * Math.PI) * this.d * 0.6;
      } else {
        // Thrown in: flies across (easing out), bouncing lower each time, spinning, then settles face up.
        const e = 1 - (1 - t) * (1 - t);
        m.position.lerpVectors(a.from, a.to, e);
        const hop = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * this.d * 2.2;
        m.position.y = this.dieY + hop + Math.max(0, 1 - t * 4) * (a.from.y - this.dieY); // dropped in from above
        if (t < 1 - SETTLE) {
          m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(a.spin, a.spinRate * (1 - t) * dt));
          a.fromQ.copy(m.quaternion);
        } else {
          m.quaternion.slerpQuaternions(a.fromQ, a.toQ, (t - (1 - SETTLE)) / SETTLE);
        }
      }
      if (t >= 1) { m.position.copy(a.to); m.quaternion.copy(a.toQ); d.anim = null; }
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose(); });
    (this.card.mesh.material as Material).dispose();
    this.card.tex.dispose();
  }
}
