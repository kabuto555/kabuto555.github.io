// The Words With Friends board as it sits on the ground — what everyone sees, players and
// passers-by alike: the board with its bonus squares, every tile played (the last play
// highlighted gold, tiles the human is still arranging highlighted green), and each seat's
// rack standing at its edge, letters turned to its owner.
//
// Local space: the board is centred on the origin, lying on y = 0. Seat 0 sits on the +Z
// side looking toward −Z, and reads the board upright (row 0 is the far edge, −Z); seat 1
// sits across on −Z. Textures are drawn once and shared between every table.

import { FONT } from '../../ui/theme';
import { SIZE, LETTER_VALUES, premiumAt, type Board, type Placement, type Premium, type Tile } from './rules';

type Mesh = import('three').Mesh;
type Group = import('three').Group;
type Vector3 = import('three').Vector3;
type Material = import('three').Material;

const BASE_H = 0.07;           // board thickness
const TILE_H_K = 0.24;         // tile height, × cell
const RACK_GAP_K = 1.1;        // rack stand distance past the board edge, × cell
const POP_IN = 0.45, PACK = 0.3;
const FLY = 0.42, FLY_STAGGER = 0.09, FLY_ARC = 0.6;

const PREMIUM_STYLE: Record<Premium, { fill: string; label: string }> = {
  TW: { fill: '#f2994a', label: 'TW' },
  DW: { fill: '#e0605a', label: 'DW' },
  TL: { fill: '#55b06a', label: 'TL' },
  DL: { fill: '#4a8fd6', label: 'DL' },
};

type TileLook = 'rack' | 'pending' | 'last' | 'placed';
const LOOK_BG: Record<TileLook, string> = { rack: '#f7e9c6', placed: '#f7e9c6', pending: '#d6f5c2', last: '#ffe08a' };

// ── Shared resources (made on first use) ─────────────────────────────────

let boardMat: Material | null = null;
let woodMat: Material | null = null;
let tileSideMat: Material | null = null;
const faceMats = new Map<string, Material>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): import('three').CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function boardMaterial(): Material {
  if (boardMat) return boardMat;
  const px = 1024, [c, g] = canvas(px, px);
  g.fillStyle = '#d9c7a6';
  g.fillRect(0, 0, px, px);
  const cell = px / SIZE, pad = cell * 0.06;
  for (let r = 0; r < SIZE; r++) {
    for (let col = 0; col < SIZE; col++) {
      const p = premiumAt(r, col);
      const centre = r === (SIZE - 1) / 2 && col === (SIZE - 1) / 2;
      const x = col * cell + pad, y = r * cell + pad, s = cell - pad * 2;
      g.fillStyle = centre ? '#b48ad6' : p ? PREMIUM_STYLE[p].fill : '#f4ecdd';
      roundRect(g, x, y, s, s, cell * 0.12);
      g.fill();
      if (centre || p) {
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${Math.round(cell * (centre ? 0.62 : 0.36))}px ${FONT}`;
        g.fillText(centre ? '★' : PREMIUM_STYLE[p!].label, x + s / 2, y + s / 2 + cell * 0.02);
      }
    }
  }
  boardMat = new THREE.MeshStandardMaterial({ map: texture(c), roughness: 0.85 });
  return boardMat;
}

function wood(): Material {
  woodMat ??= new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 0.8 });
  return woodMat;
}

function tileSide(): Material {
  tileSideMat ??= new THREE.MeshStandardMaterial({ color: '#e4d0a4', roughness: 0.7 });
  return tileSideMat;
}

/** The top face of a tile reading `face` (a blank shows its letter in pink, and no value). */
function faceMaterial(face: string, blank: boolean, look: TileLook): Material {
  const key = `${face}|${blank ? 1 : 0}|${look}`;
  let m = faceMats.get(key);
  if (m) return m;
  const px = 128, [c, g] = canvas(px, px);
  g.fillStyle = '#c9b184';
  g.fillRect(0, 0, px, px);
  g.fillStyle = LOOK_BG[look];
  roundRect(g, 5, 5, px - 10, px - 10, 16);
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = blank ? '#d4507a' : '#3b2a1a';
  g.font = `700 ${face === '?' ? 70 : 80}px ${FONT}`;
  g.fillText(face === '?' ? '' : face, px / 2 - (blank ? 0 : 6), px / 2 + 6);
  if (!blank) {
    g.font = `700 30px ${FONT}`;
    g.fillText(String(LETTER_VALUES[face] ?? 0), px - 24, px - 24);
  }
  m = new THREE.MeshStandardMaterial({ map: texture(c), roughness: 0.6 });
  faceMats.set(key, m);
  return m;
}

// ── The view ─────────────────────────────────────────────────────────────

interface Flight { mesh: Mesh; from: Vector3; to: Vector3; t: number; }

export class WordsBoardView {
  readonly root: Group = new THREE.Group();
  readonly cell: number;
  private readonly tileGeo: import('three').BoxGeometry;
  private readonly tileH: number;
  private readonly board: Group = new THREE.Group();
  private readonly placed = new Map<number, Mesh>();
  private readonly pending = new Map<number, Mesh>();
  private readonly racks: [Group, Group] = [new THREE.Group(), new THREE.Group()];
  private readonly rackTiles: [Map<number, Mesh>, Map<number, Mesh>] = [new Map(), new Map()];
  private readonly flights: Flight[] = [];
  private lastIds = new Set<number>();
  private scaleT = 0;
  private packing = false;
  /** Packed away (the table can drop it). */
  done = false;

  constructor(readonly size: number) {
    this.cell = size / SIZE;
    this.tileH = this.cell * TILE_H_K;
    this.tileGeo = new THREE.BoxGeometry(this.cell * 0.9, this.tileH, this.cell * 0.9);
    this.root.name = 'words_board';
    this.root.add(this.board);
    const base = new THREE.Mesh(new THREE.BoxGeometry(size * 1.05, BASE_H, size * 1.05), wood());
    base.position.y = BASE_H / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    this.board.add(base);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), boardMaterial());
    top.position.y = BASE_H + 0.002;
    top.receiveShadow = true;
    this.board.add(top);
    // Rack stands, one per seat: seat 0 on +Z, seat 1 turned round on −Z.
    for (const seat of [0, 1] as const) {
      const rack = this.racks[seat];
      const stand = new THREE.Mesh(new THREE.BoxGeometry(this.cell * 7.8, this.cell * 0.28, this.cell * 0.55), wood());
      stand.position.y = this.cell * 0.14;
      rack.add(stand);
      rack.position.z = size / 2 + this.cell * RACK_GAP_K;
      const pivot = new THREE.Group();
      pivot.rotation.y = seat === 0 ? 0 : Math.PI;
      pivot.add(rack);
      this.board.add(pivot);
    }
    this.root.scale.setScalar(0.001);
  }

  /** Board-local centre of the top of square (r, c), where a tile's centre sits. */
  cellCenter(r: number, c: number, out = new THREE.Vector3()): Vector3 {
    const h = (SIZE - 1) / 2;
    return out.set((c - h) * this.cell, BASE_H + this.tileH / 2, (r - h) * this.cell);
  }

  /** The square under a board-local point, or null off the board. */
  cellAt(local: Vector3): [number, number] | null {
    const h = (SIZE - 1) / 2;
    const c = Math.round(local.x / this.cell + h), r = Math.round(local.z / this.cell + h);
    return r >= 0 && c >= 0 && r < SIZE && c < SIZE ? [r, c] : null;
  }

  /** Board-local top surface height (for picking). */
  get surfaceY(): number { return BASE_H; }

  /** Brings the placed tiles in line with the board; `last` = the latest play's tiles (gold). */
  syncBoard(board: Board, last: readonly Placement[] | null): void {
    const lastIds = new Set((last ?? []).map((p) => p.tile.id));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = board.get(r, c);
        if (!p) continue;
        const look: TileLook = lastIds.has(p.tile.id) ? 'last' : 'placed';
        let m = this.placed.get(p.tile.id);
        if (!m) {
          m = this.tileMesh(p.tile, p.face, look);
          this.cellCenter(r, c, m.position);
          this.board.add(m);
          this.placed.set(p.tile.id, m);
        } else if (this.lastIds.has(p.tile.id) !== lastIds.has(p.tile.id)) {
          this.setLook(m, p.tile, p.face, look);
        }
      }
    }
    this.lastIds = lastIds;
  }

  /** Tiles the human has put down but not played yet. */
  setPending(pl: readonly Placement[]): void {
    const keep = new Set(pl.map((p) => p.tile.id));
    for (const [id, m] of this.pending) if (!keep.has(id)) { m.removeFromParent(); this.pending.delete(id); }
    for (const p of pl) {
      let m = this.pending.get(p.tile.id);
      if (!m) {
        m = this.tileMesh(p.tile, p.face, 'pending');
        this.board.add(m);
        this.pending.set(p.tile.id, m);
      } else this.setLook(m, p.tile, p.face, 'pending');
      this.cellCenter(p.r, p.c, m.position);
      m.position.y += this.tileH * 0.25;
    }
  }

  /** What's on a seat's rack (tiles out on the board as pending are left off). */
  setRack(seat: 0 | 1, tiles: readonly Tile[]): void {
    const map = this.rackTiles[seat], rack = this.racks[seat];
    const keep = new Set(tiles.map((t) => t.id));
    for (const [id, m] of map) if (!keep.has(id)) { m.removeFromParent(); map.delete(id); }
    tiles.forEach((t, i) => {
      let m = map.get(t.id);
      if (!m) {
        m = this.tileMesh(t, t.letter, 'rack');
        m.rotation.x = Math.PI / 2 * 0.72; // stood up, leaning back toward its owner
        rack.add(m);
        map.set(t.id, m);
      }
      m.position.set((i - (tiles.length - 1) / 2) * this.cell * 1.02, this.cell * 0.28 + this.cell * 0.4, -this.cell * 0.05);
    });
  }

  /** A play landing: each tile flies from its seat's rack to its square, one after another. */
  flyIn(seat: 0 | 1, placements: readonly Placement[]): void {
    const from = new THREE.Vector3(0, this.cell, (seat === 0 ? 1 : -1) * (this.size / 2 + this.cell * RACK_GAP_K));
    placements.forEach((p, i) => {
      const m = this.placed.get(p.tile.id) ?? this.tileMesh(p.tile, p.face, 'last');
      if (!m.parent) { this.board.add(m); this.placed.set(p.tile.id, m); }
      const to = this.cellCenter(p.r, p.c);
      m.position.copy(from);
      m.visible = false;
      this.flights.push({ mesh: m, from: from.clone().setX(from.x + (i - placements.length / 2) * this.cell * 0.6), to, t: -i * FLY_STAGGER });
    });
  }

  packUp(): void { this.packing = true; }

  update(dt: number): void {
    // Pop in / pack away.
    if (this.packing) {
      this.scaleT = Math.max(0, this.scaleT - dt / PACK);
      if (this.scaleT === 0) this.done = true;
      this.root.scale.setScalar(Math.max(0.001, this.scaleT * this.scaleT));
    } else if (this.scaleT < 1) {
      this.scaleT = Math.min(1, this.scaleT + dt / POP_IN);
      const t = this.scaleT, k = 1.70158; // easeOutBack
      this.root.scale.setScalar(Math.max(0.001, 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2));
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt / FLY;
      if (f.t < 0) continue;
      const t = Math.min(1, f.t), e = t * t * (3 - 2 * t);
      f.mesh.visible = true;
      f.mesh.position.lerpVectors(f.from, f.to, e);
      f.mesh.position.y += Math.sin(t * Math.PI) * this.cell * FLY_ARC * 3;
      f.mesh.rotation.y = (1 - e) * Math.PI;
      if (t >= 1) { f.mesh.rotation.y = 0; this.flights.splice(i, 1); }
    }
  }

  /** Flights still landing (the table waits for them before the next turn's highlight). */
  get busy(): boolean { return this.flights.length > 0; }

  dispose(): void {
    this.root.removeFromParent();
    this.tileGeo.dispose();
    this.root.traverse((o) => { if ((o as Mesh).isMesh && (o as Mesh).geometry !== this.tileGeo) (o as Mesh).geometry.dispose(); });
  }

  private tileMesh(tile: Tile, face: string, look: TileLook): Mesh {
    const m = new THREE.Mesh(this.tileGeo, this.materials(tile, face, look));
    m.castShadow = false;
    return m;
  }

  private setLook(m: Mesh, tile: Tile, face: string, look: TileLook): void {
    m.material = this.materials(tile, face, look);
  }

  private materials(tile: Tile, face: string, look: TileLook): Material[] {
    const side = tileSide(), top = faceMaterial(face, tile.letter === '?', look);
    return [side, side, top, side, side, side]; // +x −x +y −y +z −z: the letter on top
  }
}
